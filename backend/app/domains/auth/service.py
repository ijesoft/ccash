import time
import uuid

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    generate_totp_secret,
    hash_password,
    verify_password,
    verify_totp,
)
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.repository import UserRepository
from app.domains.merchants.repository import MerchantRepository
from app.domains.wallets.repository import WalletRepository
from app.tasks.notifications import send_email_notification

# Password (+2FA) success does not issue tokens by itself; it only opens a
# short window for the ID No. step to complete the login. See login()/
# complete_login() below.
_LOGIN_PENDING_TTL_SECONDS = 300

# Shown instead of "Invalid credentials" when the account exists but is not
# ACTIVE (PENDING signup or SUSPENDED), so users know to contact an admin
# rather than retrying their password.
INACTIVE_ACCOUNT_MESSAGE = "Account is inactive, please contact administrator."


def _scopes_for(user: User) -> list[str]:
    scopes = ["wallet:read", "wallet:write"]
    if user.role == UserRole.ADMIN:
        scopes.append("admin")
    return scopes


class AuthService:
    def __init__(self, session: AsyncSession, redis: Redis):
        self.repo = UserRepository(session)
        self.merchant_repo = MerchantRepository(session)
        self.session = session
        self.redis = redis

    async def register(
        self,
        email: str,
        phone: str,
        password: str,
        id_no: str,
        first_name: str,
        last_name: str,
        middle_name: str | None = None,
    ) -> User:
        import re

        # Strict 11-digit numeric check - no letters/symbols allowed
        if not re.fullmatch(r"\d{11}", phone):
            raise ValidationError("Phone must be exactly 11 digits (numbers only, no letters)")

        if not re.fullmatch(r"\d{9}", id_no):
            raise ValidationError("ID No. must be exactly 9 digits (numbers only)")

        if not first_name.strip() or not last_name.strip():
            raise ValidationError("First name and last name are required")

        from app.core.masking import normalize_philippine_mobile

        normalized_phone = normalize_philippine_mobile(phone) or phone

        existing = await self.repo.get_by_email(email)
        if existing:
            raise ValidationError("Email already registered")

        existing = await self.repo.get_by_phone(normalized_phone)
        if existing:
            raise ValidationError("Phone already registered")

        existing = await self.repo.get_by_id_no(id_no)
        if existing:
            raise ValidationError("ID No. already registered")

        password_hash = hash_password(password)
        user = await self.repo.create(
            email,
            normalized_phone,
            password_hash,
            first_name=first_name,
            last_name=last_name,
            id_no=id_no,
            middle_name=middle_name,
        )
        await self.session.commit()

        otp = generate_otp()
        await self.redis.setex(f"otp:{email}", 300, otp)

        send_email_notification.delay(
            to_email=email,
            subject="Verify your Campe Wallet account",
            body=f"Your verification code is: {otp}\n\nThis code expires in 5 minutes.",
        )

        return user

    async def setup_verify_totp(self, email: str) -> tuple[str, str]:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        secret = generate_totp_secret()
        uri = f"otpauth://totp/Campe Wallet:{email}?secret={secret}&issuer=Campe Wallet"
        await self.redis.setex(f"verify_totp_secret:{email}", 600, secret)

        return secret, uri

    async def verify_otp(self, email: str, code: str) -> bool:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        verified = False

        # Try email OTP first
        stored = await self.redis.get(f"otp:{email}")
        if stored and stored == code:
            verified = True
            await self.redis.delete(f"otp:{email}")

        # Fall back to TOTP (authenticator app)
        if not verified:
            secret = await self.redis.get(f"verify_totp_secret:{email}")
            if secret and verify_totp(secret, code):
                verified = True
                await self.redis.delete(f"verify_totp_secret:{email}")

        if not verified:
            raise ValidationError("Invalid or expired code")

        user.is_verified = True
        user.status = UserStatus.ACTIVE
        await self.repo.update(user)

        wallet_repo = WalletRepository(self.session)
        existing_wallet = await wallet_repo.get_by_user_id(user.id)
        if not existing_wallet:
            await wallet_repo.create(user.id)

        await self.session.commit()

        return True

    async def send_login_otp(self, email: str) -> bool:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        otp = generate_otp()
        await self.redis.setex(f"login_otp:{email}", 300, otp)

        send_email_notification.delay(
            to_email=email,
            subject="Your Campe Wallet login code",
            body=f"Your login verification code is: {otp}\n\nThis code expires in 5 minutes.",
        )

        return True

    async def login(self, email: str, password: str, otp_code: str | None = None) -> tuple[str, bool]:
        """Password (+2FA, if enabled) check only. Does **not** issue tokens.

        A successful call opens a short window (see _LOGIN_PENDING_TTL_SECONDS)
        during which complete_login() will accept the account's ID No. and
        finish authentication. Splitting it this way means the ID No. gate
        applies uniformly, regardless of whether 2FA is enabled.

        Returns (email, has_existing_id) so the client knows whether to prompt
        "enter your ID No." or "set your ID No." (first login since this
        account predates the ID No. requirement).
        """
        user = await self.repo.get_by_email(email)

        if not user:
            hash_password(password)
            raise AuthenticationError("Invalid credentials")

        if user.status != UserStatus.ACTIVE:
            raise AuthenticationError(INACTIVE_ACCOUNT_MESSAGE)

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")

        if user.is_2fa_enabled:
            if not otp_code:
                raise ValidationError("2FA code required")

            # Try TOTP (authenticator app) first
            if user.totp_secret and verify_totp(user.totp_secret, otp_code):
                pass  # TOTP verified
            else:
                # Fall back to email OTP
                stored = await self.redis.get(f"login_otp:{email}")
                if not stored or stored != otp_code:
                    raise AuthenticationError("Invalid 2FA code")
                # Consume the OTP so it cannot be reused
                await self.redis.delete(f"login_otp:{email}")

        has_existing_id = await self._expected_id_no(user) is not None

        await self.redis.setex(f"login_pending:{email}", _LOGIN_PENDING_TTL_SECONDS, "1")

        return email, has_existing_id

    async def _expected_id_no(self, user: User) -> str | None:
        """The ID No. this account must be confirmed with, or None if the
        account predates the requirement and has not set one yet.

        Merchants always have one (assigned at registration); Members/Admins
        may not, for accounts created before this gate existed.
        """
        if user.role == UserRole.MERCHANT:
            profile = await self.merchant_repo.get_by_user_id(user.id)
            if not profile:
                raise NotFoundError("Merchant profile not found")
            return profile.merchant_id_no
        return user.id_no or None

    async def complete_login(self, email: str, id_no: str) -> tuple[str, str, User]:
        """Second half of login(): confirms (or, for a legacy account with none
        on file, sets) the account's ID No., then issues tokens.

        Requires a pending marker from a just-completed login() call, so this
        cannot be reached by knowing an ID No. alone — password (+2FA) must
        have already succeeded for this email.
        """
        import re

        user = await self.repo.get_by_email(email)
        if not user:
            raise AuthenticationError("Invalid credentials")

        if user.status != UserStatus.ACTIVE:
            raise AuthenticationError(INACTIVE_ACCOUNT_MESSAGE)

        pending = await self.redis.get(f"login_pending:{email}")
        if not pending:
            raise AuthenticationError("Session expired, please sign in again")

        id_no = (id_no or "").strip()
        expected = await self._expected_id_no(user)

        if expected is None:
            # First login since this account gained the ID No. requirement:
            # the member sets their own permanent ID No. here.
            if not re.fullmatch(r"\d{9}", id_no):
                raise ValidationError("ID No. must be exactly 9 digits (numbers only)")
            existing = await self.repo.get_by_id_no(id_no)
            if existing and existing.id != user.id:
                raise ValidationError("ID No. already in use")
            user.id_no = id_no
            await self.repo.update(user)
            await self.session.commit()
        elif id_no != expected:
            raise AuthenticationError("Invalid credentials")

        await self.redis.delete(f"login_pending:{email}")

        access_token = create_access_token(str(user.id), scopes=_scopes_for(user))
        refresh_token, token_id = create_refresh_token(str(user.id))

        await self.redis.setex(f"refresh:{token_id}", settings.refresh_token_expire_days * 86400, str(user.id))
        await self._stamp_activity(token_id, str(user.id))

        return access_token, refresh_token, user

    async def refresh_token(self, refresh_token: str) -> tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except Exception:
            raise AuthenticationError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type")

        token_id = payload.get("token_id")
        user_id = payload.get("sub")

        user = await self._load_user_or_raise(user_id)

        stored = await self.redis.get(f"refresh:{token_id}")
        if not stored:
            raise AuthenticationError("Refresh token expired or revoked")

        await self._check_idle(token_id, user_id)

        await self.redis.delete(f"refresh:{token_id}", self._activity_key(token_id))

        new_access = create_access_token(user_id, scopes=_scopes_for(user))
        new_refresh, new_token_id = create_refresh_token(user_id)
        await self.redis.setex(f"refresh:{new_token_id}", settings.refresh_token_expire_days * 86400, user_id)
        await self._stamp_activity(new_token_id, user_id)

        return new_access, new_refresh

    async def touch(self, user_id: str) -> bool:
        await self._check_idle(None, user_id)
        await self.redis.setex(
            self._user_activity_key(user_id),
            settings.refresh_token_expire_days * 86400,
            str(int(time.time())),
        )
        return True

    def _activity_key(self, token_id: str) -> str:
        return f"activity:{token_id}"

    def _user_activity_key(self, user_id: str) -> str:
        return f"activity:user:{user_id}"

    async def _stamp_activity(self, token_id: str, user_id: str) -> None:
        now = str(int(time.time()))
        ttl = settings.refresh_token_expire_days * 86400
        await self.redis.setex(self._activity_key(token_id), ttl, now)
        await self.redis.setex(self._user_activity_key(user_id), ttl, now)

    async def _check_idle(self, token_id: str | None, user_id: str) -> None:
        raw = await self.redis.get(self._user_activity_key(user_id))
        if raw is None:
            raw = await self.redis.get(self._activity_key(token_id)) if token_id else None
        if raw is None:
            return
        try:
            idle_seconds = int(time.time()) - int(raw)
        except (ValueError, TypeError):
            return
        if idle_seconds > settings.inactivity_timeout_minutes * 60:
            keys = [self._user_activity_key(user_id)]
            if token_id:
                keys += [f"refresh:{token_id}", self._activity_key(token_id)]
            await self.redis.delete(*keys)
            raise AuthenticationError("Session expired due to inactivity")

    async def _load_user_or_raise(self, user_id: str) -> User:
        try:
            uid = uuid.UUID(user_id)
        except (ValueError, TypeError):
            raise AuthenticationError("Invalid refresh token")
        user = await self.repo.get_by_id(uid)
        if not user:
            raise AuthenticationError("Invalid refresh token")
        return user

    async def enable_2fa(self, user_id: uuid.UUID, secret: str, code: str) -> bool:
        if not verify_totp(secret, code):
            raise ValidationError("Invalid TOTP code")

        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        user.totp_secret = secret
        user.is_2fa_enabled = True
        await self.repo.update(user)
        await self.session.commit()

        return True

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
            token_id = payload.get("token_id")
            user_id = payload.get("sub")
            keys = [f"refresh:{token_id}", f"activity:{token_id}"]
            if user_id:
                keys.append(f"activity:user:{user_id}")
            await self.redis.delete(*keys)
        except Exception:
            pass
