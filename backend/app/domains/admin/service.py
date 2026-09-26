import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.errors import NotFoundError, ValidationError
from app.core.masking import mask_mobile, normalize_philippine_mobile
from app.core.money import format_php
from app.core.security import generate_temp_password, hash_password
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.repository import UserRepository
from app.domains.merchants.models import MerchantProfile
from app.domains.merchants.policy import is_valid_merchant_id_no
from app.domains.merchants.repository import MerchantRepository
from app.domains.transactions.models import Transaction, TransactionStatus
from app.domains.wallets.models import Wallet, WalletStatus
from app.domains.wallets.repository import WalletRepository
from app.tasks.notifications import send_email_notification

# Report exports pull the full ledger, unpaginated.
REPORT_ROW_LIMIT = 100_000


def display_name_for(user: User, merchant_profile=None) -> str:
    """Best label for a user across the report/admin UI: company name for a
    Merchant, full name for a Member/Admin, email as the final fallback."""
    if merchant_profile is not None:
        return merchant_profile.company_name
    full_name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
    return full_name or user.email


class AdminService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.wallet_repo = WalletRepository(session)
        self.merchant_repo = MerchantRepository(session)

    async def get_platform_stats(self) -> dict:
        user_count_result = await self.session.execute(select(func.count(User.id)))
        user_count = user_count_result.scalar() or 0

        wallet_count_result = await self.session.execute(select(func.count(Wallet.id)))
        wallet_count = wallet_count_result.scalar() or 0

        tx_count_result = await self.session.execute(select(func.count(Transaction.id)))
        tx_count = tx_count_result.scalar() or 0

        volume_result = await self.session.execute(
            select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(Transaction.status == TransactionStatus.SUCCESS)
        )
        volume = volume_result.scalar() or 0

        balance_result = await self.session.execute(
            select(func.coalesce(func.sum(Wallet.balance_cents), 0)).where(
                Wallet.status == WalletStatus.ACTIVE,
                Wallet.deleted_at.is_(None),
            )
        )
        total_balance = balance_result.scalar() or 0

        return {
            "total_users": user_count,
            "active_wallets": wallet_count,
            "total_transactions": tx_count,
            "transaction_volume_cents": volume,
            "total_wallet_balance_cents": total_balance,
        }

    async def list_users(
        self, limit: int = 20, offset: int = 0, role: UserRole | None = None
    ) -> tuple[list[dict], int]:
        base_filter = [User.role == role] if role else []

        total_result = await self.session.execute(select(func.count(User.id)).where(*base_filter))
        total = total_result.scalar() or 0

        result = await self.session.execute(
            select(User, Wallet)
            .outerjoin(Wallet, User.id == Wallet.user_id)
            .where(*base_filter)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = result.all()
        members = []
        for user, wallet in rows:
            members.append({
                "id": str(user.id),
                "email": user.email,
                "id_no": user.id_no,
                "first_name": user.first_name,
                "middle_name": user.middle_name,
                "last_name": user.last_name,
                "role": user.role.value,
                "status": user.status.value,
                "wallet_balance_cents": wallet.balance_cents if wallet else 0,
                "wallet_status": wallet.status.value if wallet else "NONE",
                "created_at": user.created_at.isoformat() if user.created_at else "",
            })
        return members, total

    async def get_account_report_context(self, user_id: uuid.UUID) -> tuple[str, list[tuple[str, str]]]:
        """(account_label, meta pairs) for the report header of one account."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")

        merchant_profile = await self.merchant_repo.get_by_user_id(user_id)
        label = display_name_for(user, merchant_profile)

        meta = [("Email", user.email), ("Mobile", mask_mobile(user.phone))]
        if merchant_profile:
            meta.insert(0, ("Merchant ID", merchant_profile.merchant_id_no))
            meta.append(("Contact Person", merchant_profile.contact_person))
        elif user.id_no:
            meta.insert(0, ("ID No.", user.id_no))
        return label, meta

    async def list_all_transactions_for_report(self, limit: int = REPORT_ROW_LIMIT) -> list[dict]:
        """Flat, platform-wide ledger: both sides of every transfer, for
        reconciliation across every Member and Merchant account."""
        result = await self.session.execute(
            select(Transaction).order_by(Transaction.created_at.desc()).limit(limit)
        )
        txs = list(result.scalars().all())

        wallet_ids = {w for tx in txs for w in (tx.sender_wallet_id, tx.receiver_wallet_id) if w}
        owners = await self.wallet_repo.get_owners_by_wallet_ids(wallet_ids)
        merchant_profiles = await self.merchant_repo.get_by_user_ids(
            {u.id for u in owners.values() if u.role == UserRole.MERCHANT}
        )

        def label_for(wallet_id: uuid.UUID | None) -> str | None:
            user = owners.get(wallet_id) if wallet_id else None
            if not user:
                return None
            return display_name_for(user, merchant_profiles.get(user.id))

        rows = []
        for tx in txs:
            rows.append({
                "created_at": tx.created_at.strftime("%Y-%m-%d %H:%M") if tx.created_at else "",
                "reference": tx.reference,
                "type": tx.type.value,
                "status": tx.status.value,
                "from": label_for(tx.sender_wallet_id) or ("Cash" if tx.sender_wallet_id is None else None),
                "to": label_for(tx.receiver_wallet_id) or ("Cash" if tx.receiver_wallet_id is None else None),
                "amount_cents": tx.amount_cents,
                "fee_cents": tx.fee_cents,
                "net_amount_cents": tx.net_amount_cents,
                "description": tx.description,
            })
        return rows

    async def suspend_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = UserStatus.SUSPENDED
            await self.user_repo.update(user)
            await self.session.commit()
        return user

    async def activate_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = UserStatus.ACTIVE
            await self.user_repo.update(user)
            await self.session.commit()
        return user

    async def update_user_role(
        self, user_id: uuid.UUID, new_role: UserRole, actor_id: uuid.UUID
    ) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Lockout prevention: never allow the organization's last admin to be
        # demoted. SUSPENDED admins still count — they can be reactivated.
        if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
            other_admins = (
                await self.session.execute(
                    select(func.count(User.id)).where(
                        User.role == UserRole.ADMIN,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar() or 0
            if other_admins == 0:
                raise ValidationError("Cannot demote the last admin")

        old_role = user.role.value
        user.role = new_role
        user.updated_by = actor_id
        self.session.add(
            AuditLog(
                user_id=actor_id,
                action="role.change",
                resource_type="user",
                resource_id=str(user_id),
                old_values={"role": old_role},
                new_values={"role": new_role.value},
            )
        )
        await self.user_repo.update(user)
        await self.session.commit()
        return user

    async def create_member(
        self,
        id_no: str,
        first_name: str,
        last_name: str,
        email: str,
        phone: str,
        middle_name: str | None = None,
    ) -> tuple[User, str]:
        """Admin-vouched member creation (individual add or one row of a
        batch upload): skips the self-service OTP flow — the account is
        ACTIVE and verified immediately, with a system-generated password the
        admin can hand to the member (also emailed, when the address works)."""
        id_no = (id_no or "").strip()
        phone = (phone or "").strip()
        email = (email or "").strip()
        first_name = (first_name or "").strip()
        last_name = (last_name or "").strip()
        middle_name = (middle_name or "").strip() or None

        if not re.fullmatch(r"\d{9}", id_no):
            raise ValidationError(f"ID No. must be exactly 9 digits: got '{id_no}'")
        if not re.fullmatch(r"\d{11}", phone):
            raise ValidationError(f"Mobile number must be exactly 11 digits: got '{phone}'")
        if not first_name or not last_name:
            raise ValidationError("First name and last name are required")
        if not email or "@" not in email:
            raise ValidationError(f"Invalid email address: '{email}'")

        normalized_phone = normalize_philippine_mobile(phone) or phone

        if await self.user_repo.get_by_email(email):
            raise ValidationError(f"Email already registered: {email}")
        if await self.user_repo.get_by_phone(normalized_phone):
            raise ValidationError(f"Mobile number already registered: {phone}")
        if await self.user_repo.get_by_id_no(id_no):
            raise ValidationError(f"ID No. already registered: {id_no}")

        temp_password = generate_temp_password()
        user = await self.user_repo.create(
            email,
            normalized_phone,
            hash_password(temp_password),
            first_name=first_name,
            last_name=last_name,
            id_no=id_no,
            middle_name=middle_name,
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.MEMBER,
        )
        await self.wallet_repo.create(user.id)
        await self.session.commit()

        send_email_notification.delay(
            to_email=email,
            subject="Your Campe Wallet account has been created",
            body=(
                f"Hi {first_name},\n\n"
                "An account has been created for you on Campe Wallet.\n\n"
                f"Email: {email}\n"
                f"Temporary password: {temp_password}\n\n"
                "Please log in and change your password as soon as possible."
            ),
        )

        return user, temp_password

    async def set_member_id(self, user_id: uuid.UUID, id_no: str) -> User:
        """Assign or overwrite a Member/Admin's login ID No.

        Covers both the "this account never set one" case (see login()'s
        force-set step) and correcting/reassigning an existing one — e.g. a
        member forgot theirs, or the admin is backfilling real CAMPE employee
        numbers for the pre-existing roster.
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")
        if user.role == UserRole.MERCHANT:
            raise ValidationError("Merchant accounts use a Merchant ID — see set_merchant_id")

        id_no = (id_no or "").strip()
        if not re.fullmatch(r"\d{9}", id_no):
            raise ValidationError("ID No. must be exactly 9 digits")

        existing = await self.user_repo.get_by_id_no(id_no)
        if existing and existing.id != user.id:
            raise ValidationError("ID No. already in use")

        user.id_no = id_no
        await self.user_repo.update(user)
        await self.session.commit()
        return user

    async def set_merchant_id(self, user_id: uuid.UUID, merchant_id_no: str) -> MerchantProfile:
        """Assign or overwrite a Merchant's login ID (the 'M' + 9-digit number)."""
        profile = await self.merchant_repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Merchant profile not found")

        merchant_id_no = (merchant_id_no or "").strip().upper()
        if not is_valid_merchant_id_no(merchant_id_no):
            raise ValidationError("Merchant ID must be 'M' followed by 9 digits")

        existing = await self.merchant_repo.get_by_merchant_id_no(merchant_id_no)
        if existing and existing.user_id != profile.user_id:
            raise ValidationError("Merchant ID already in use")

        profile.merchant_id_no = merchant_id_no
        profile.version += 1
        self.session.add(profile)
        await self.session.commit()
        return profile

    async def reset_password(self, user_id: uuid.UUID) -> tuple[User, str]:
        """Generate a new temporary password for an account (forgot-password,
        admin-mediated — there is no self-service reset flow) and email it.

        Intentionally does not touch id_no/merchant_id_no: a password reset
        does not bypass the ID No. login gate.
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")

        temp_password = generate_temp_password()
        user.password_hash = hash_password(temp_password)
        await self.user_repo.update(user)
        await self.session.commit()

        send_email_notification.delay(
            to_email=user.email,
            subject="Your Campe Wallet password has been reset",
            body=(
                "An administrator has reset your Campe Wallet account password.\n\n"
                f"Temporary password: {temp_password}\n\n"
                "Please log in and change it as soon as possible. You will "
                "still need your ID No. to finish signing in."
            ),
        )

        return user, temp_password

    async def get_account_detail(self, user_id: uuid.UUID) -> dict:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")

        wallet = await self.wallet_repo.get_by_user_id(user_id)
        merchant_profile = (
            await self.merchant_repo.get_by_user_id(user_id) if user.role == UserRole.MERCHANT else None
        )

        return {
            "id": str(user.id),
            "email": user.email,
            "phone": user.phone,
            "id_no": user.id_no,
            "first_name": user.first_name,
            "middle_name": user.middle_name,
            "last_name": user.last_name,
            "role": user.role.value,
            "status": user.status.value,
            "kyc_level": user.kyc_level.value,
            "created_at": user.created_at.isoformat() if user.created_at else "",
            "wallet_balance_cents": wallet.balance_cents if wallet else 0,
            "wallet_status": wallet.status.value if wallet else "NONE",
            "merchant": (
                {
                    "merchant_id_no": merchant_profile.merchant_id_no,
                    "company_name": merchant_profile.company_name,
                    "contact_person": merchant_profile.contact_person,
                    "mobile_no": merchant_profile.mobile_no,
                    "landline": merchant_profile.landline,
                    "address": merchant_profile.address,
                    "tin": merchant_profile.tin,
                }
                if merchant_profile
                else None
            ),
        }

    async def _check_email_phone_available(self, user: User, email: str, normalized_phone: str) -> None:
        existing_email = await self.user_repo.get_by_email(email)
        if existing_email and existing_email.id != user.id:
            raise ValidationError(f"Email already registered: {email}")
        existing_phone = await self.user_repo.get_by_phone(normalized_phone)
        if existing_phone and existing_phone.id != user.id:
            raise ValidationError(f"Mobile number already registered: {normalized_phone}")

    async def update_member_profile(
        self,
        user_id: uuid.UUID,
        first_name: str,
        last_name: str,
        email: str,
        phone: str,
        middle_name: str | None = None,
    ) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")
        if user.role == UserRole.MERCHANT:
            raise ValidationError("Merchant accounts use update_merchant_profile")

        first_name = (first_name or "").strip()
        last_name = (last_name or "").strip()
        middle_name = (middle_name or "").strip() or None
        email = (email or "").strip()
        phone = (phone or "").strip()

        if not first_name or not last_name:
            raise ValidationError("First name and last name are required")
        if not email or "@" not in email:
            raise ValidationError(f"Invalid email address: '{email}'")
        if not re.fullmatch(r"\d{11}", phone):
            raise ValidationError("Mobile number must be exactly 11 digits")

        normalized_phone = normalize_philippine_mobile(phone) or phone
        await self._check_email_phone_available(user, email, normalized_phone)

        user.first_name = first_name
        user.middle_name = middle_name
        user.last_name = last_name
        user.email = email
        user.phone = normalized_phone
        await self.user_repo.update(user)
        await self.session.commit()
        return user

    async def update_merchant_profile(
        self,
        user_id: uuid.UUID,
        company_name: str,
        contact_person: str,
        mobile_no: str,
        address: str,
        tin: str,
        email: str,
        landline: str | None = None,
    ) -> tuple[User, MerchantProfile]:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")
        profile = await self.merchant_repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Merchant profile not found")

        company_name = (company_name or "").strip()
        contact_person = (contact_person or "").strip()
        address = (address or "").strip()
        tin = (tin or "").strip()
        email = (email or "").strip()
        mobile_no = (mobile_no or "").strip()
        landline = (landline or "").strip() or None

        if not company_name or not contact_person or not address or not tin:
            raise ValidationError("Company name, contact person, address, and TIN are required")
        if not email or "@" not in email:
            raise ValidationError(f"Invalid email address: '{email}'")
        if not re.fullmatch(r"\d{11}", mobile_no):
            raise ValidationError("Mobile number must be exactly 11 digits")

        normalized_mobile = normalize_philippine_mobile(mobile_no) or mobile_no
        await self._check_email_phone_available(user, email, normalized_mobile)

        user.email = email
        user.phone = normalized_mobile
        await self.user_repo.update(user)

        profile.company_name = company_name
        profile.contact_person = contact_person
        profile.mobile_no = normalized_mobile
        profile.landline = landline
        profile.address = address
        profile.tin = tin
        profile.version += 1
        self.session.add(profile)

        await self.session.commit()
        return user, profile

    async def delete_account(self, user_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        """Soft-delete an account (and its wallet / merchant profile).

        Transactions and audit history are never touched — only ``deleted_at``
        is set, matching the soft-delete convention used everywhere else in
        this app. A non-zero wallet balance blocks deletion so money never
        silently disappears from the platform totals; cash it out first.
        """
        if user_id == actor_id:
            raise ValidationError("You cannot delete your own account")

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Account not found")

        if user.role == UserRole.ADMIN:
            other_admins = (
                await self.session.execute(
                    select(func.count(User.id)).where(
                        User.role == UserRole.ADMIN,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar() or 0
            if other_admins == 0:
                raise ValidationError("Cannot delete the last admin")

        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if wallet and wallet.balance_cents != 0:
            raise ValidationError(
                f"Cannot delete: wallet balance is {format_php(wallet.balance_cents)}. "
                "Cash out or transfer the balance to zero first."
            )

        now = datetime.now(timezone.utc)

        user.deleted_at = now
        await self.user_repo.update(user)

        if wallet:
            wallet.deleted_at = now
            wallet.status = WalletStatus.CLOSED
            await self.wallet_repo.update(wallet)

        if user.role == UserRole.MERCHANT:
            profile = await self.merchant_repo.get_by_user_id(user_id)
            if profile:
                profile.deleted_at = now
                profile.version += 1
                self.session.add(profile)

        await self.session.commit()