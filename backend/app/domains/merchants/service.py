import re
import uuid

from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.masking import normalize_philippine_mobile
from app.core.security import generate_otp, hash_password
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.merchants.models import MerchantProfile
from app.domains.merchants.policy import generate_merchant_id_no, is_valid_merchant_id_no
from app.domains.merchants.repository import MerchantRepository
from app.tasks.notifications import send_email_notification

_MAX_ID_GENERATION_ATTEMPTS = 5


class MerchantService:
    def __init__(self, session: AsyncSession, redis: Redis):
        self.session = session
        self.redis = redis
        self.user_repo = UserRepository(session)
        self.merchant_repo = MerchantRepository(session)

    async def _resolve_merchant_id_no(self, requested: str | None) -> str:
        if requested:
            if not is_valid_merchant_id_no(requested):
                raise ValidationError("Merchant ID must be 'M' followed by 9 digits")
            if await self.merchant_repo.get_by_merchant_id_no(requested):
                raise ValidationError("Merchant ID already in use")
            return requested

        for _ in range(_MAX_ID_GENERATION_ATTEMPTS):
            candidate = generate_merchant_id_no()
            if not await self.merchant_repo.get_by_merchant_id_no(candidate):
                return candidate
        raise ValidationError("Could not generate a unique merchant ID, please try again")

    async def register(
        self,
        email: str,
        mobile_no: str,
        password: str,
        company_name: str,
        contact_person: str,
        address: str,
        tin: str,
        landline: str | None = None,
        merchant_id_no: str | None = None,
    ) -> tuple[User, MerchantProfile]:
        if not re.fullmatch(r"\d{11}", mobile_no):
            raise ValidationError("Mobile number must be exactly 11 digits (numbers only, no letters)")

        normalized_mobile = normalize_philippine_mobile(mobile_no) or mobile_no

        if await self.user_repo.get_by_email(email):
            raise ValidationError("Email already registered")
        if await self.user_repo.get_by_phone(normalized_mobile):
            raise ValidationError("Mobile number already registered")

        resolved_id_no = await self._resolve_merchant_id_no(merchant_id_no)

        password_hash = hash_password(password)
        user = User(
            email=email,
            phone=normalized_mobile,
            password_hash=password_hash,
            role=UserRole.MERCHANT,
        )
        self.session.add(user)
        await self.session.flush()

        profile = MerchantProfile(
            user_id=user.id,
            merchant_id_no=resolved_id_no,
            company_name=company_name,
            contact_person=contact_person,
            mobile_no=normalized_mobile,
            landline=landline,
            address=address,
            tin=tin,
        )
        try:
            await self.merchant_repo.create(profile)
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise ValidationError("Merchant ID, email, or mobile number already in use")

        otp = generate_otp()
        await self.redis.setex(f"otp:{email}", 300, otp)

        send_email_notification.delay(
            to_email=email,
            subject="Verify your Campe Wallet merchant account",
            body=f"Your verification code is: {otp}\n\nThis code expires in 5 minutes.",
        )

        return user, profile

    async def get_profile(self, user_id: uuid.UUID) -> MerchantProfile:
        profile = await self.merchant_repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Merchant profile not found")
        return profile

    async def list_merchants(self, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
        profiles, total = await self.merchant_repo.list_all(limit, offset)
        results = []
        for profile in profiles:
            user = await self.user_repo.get_by_id(profile.user_id)
            results.append({
                "id": str(profile.user_id),
                "merchant_id_no": profile.merchant_id_no,
                "company_name": profile.company_name,
                "contact_person": profile.contact_person,
                "mobile_no": profile.mobile_no,
                "landline": profile.landline,
                "address": profile.address,
                "tin": profile.tin,
                "email": user.email if user else "",
                "status": user.status.value if user else "",
                "created_at": profile.created_at.isoformat() if profile.created_at else "",
            })
        return results, total
