import enum
import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import NotFoundError, ValidationError
from app.database import async_session_factory
from app.domains.admin.branding_service import BASE_DIR, read_branding
from app.domains.admin.service import AdminService
from app.domains.auth.graphql import UserType
from app.domains.auth.models import UserRole
from app.domains.merchants.graphql import MerchantProfileType
from app.domains.transactions.graphql import TransactionType
from app.domains.transactions.service import TransactionService
from app.graphql.middleware import require_admin


@strawberry.enum
class UserRoleEnum(str, enum.Enum):
    MEMBER = "MEMBER"
    MERCHANT = "MERCHANT"
    ADMIN = "ADMIN"


@strawberry.type
class PlatformStats:
    total_users: int
    active_wallets: int
    total_transactions: int
    transaction_volume_cents: int
    total_wallet_balance_cents: int


@strawberry.type
class AdminMemberType:
    id: str
    email: str
    id_no: str | None
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    role: str
    status: str
    wallet_balance_cents: int
    wallet_status: str
    created_at: str


@strawberry.type
class BrandingType:
    logo_url: str
    version: int
    updated_at: str


@strawberry.input
class AdminCreateMemberInput:
    id_no: str
    first_name: str
    last_name: str
    email: str
    mobile: str
    middle_name: str | None = None


@strawberry.type
class AdminCreateMemberResult:
    user: UserType
    # Shown once so the admin can hand it to the member; also emailed to them.
    temporary_password: str


@strawberry.type
class AdminResetPasswordResult:
    user: UserType
    # Shown once so the admin can hand it to the account holder; also emailed.
    temporary_password: str


@strawberry.type
class AdminAccountDetailType:
    id: str
    email: str
    phone: str
    id_no: str | None
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    role: str
    status: str
    kyc_level: str
    created_at: str
    wallet_balance_cents: int
    wallet_status: str
    merchant: MerchantProfileType | None


@strawberry.input
class AdminUpdateMemberProfileInput:
    first_name: str
    last_name: str
    email: str
    mobile: str
    middle_name: str | None = None


@strawberry.input
class AdminUpdateMerchantProfileInput:
    company_name: str
    contact_person: str
    mobile_no: str
    address: str
    tin: str
    email: str
    landline: str | None = None


async def get_admin_service(info: Info) -> AdminService:
    session = async_session_factory()
    return AdminService(session)


@strawberry.type
class AdminQueries:
    @strawberry.field
    async def platform_stats(self, info: Info) -> PlatformStats:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            stats = await service.get_platform_stats()
            return PlatformStats(**stats)
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_users(
        self, info: Info, limit: int = 20, offset: int = 0, role: UserRoleEnum | None = None
    ) -> list[AdminMemberType]:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            role_filter = UserRole(role.value) if role else None
            members, _ = await service.list_users(limit, offset, role_filter)
            return [AdminMemberType(**m) for m in members]
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_user_transactions(
        self, info: Info, user_id: str, limit: int = 20, offset: int = 0
    ) -> list[TransactionType]:
        """Admin view of one user's history, from that user's perspective."""
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = TransactionService(session)
            views, _ = await service.list_transactions(uuid.UUID(user_id), limit=limit, offset=offset)
            return [TransactionType.from_view(v) for v in views]
        finally:
            await session.close()

    @strawberry.field
    async def admin_account_detail(self, info: Info, user_id: str) -> AdminAccountDetailType:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            detail = await service.get_account_detail(uuid.UUID(user_id))
            merchant = detail.pop("merchant")
            return AdminAccountDetailType(
                **detail,
                merchant=MerchantProfileType(**merchant) if merchant else None,
            )
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.field
    async def branding(self, info: Info) -> BrandingType:
        # Public read: every client needs the logo URL. No session held, so no
        # session.close() needed (unlike the DB-backed fields above).
        data = read_branding(base_dir=BASE_DIR)
        return BrandingType(**data)


@strawberry.type
class AdminMutations:
    @strawberry.mutation
    async def admin_create_member(self, info: Info, input: AdminCreateMemberInput) -> AdminCreateMemberResult:
        """Individual add (one row at a time). See app/api/admin_members.py
        for the batch-upload counterpart used for the initial ~3000-member roll."""
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user, temp_password = await service.create_member(
                id_no=input.id_no,
                first_name=input.first_name,
                last_name=input.last_name,
                email=input.email,
                phone=input.mobile,
                middle_name=input.middle_name,
            )
            return AdminCreateMemberResult(user=UserType.from_model(user), temporary_password=temp_password)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_set_member_id(self, info: Info, user_id: str, id_no: str) -> UserType:
        """Assign or reassign a Member/Admin's login ID No."""
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.set_member_id(uuid.UUID(user_id), id_no)
            return UserType.from_model(user)
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_set_merchant_id(self, info: Info, user_id: str, merchant_id_no: str) -> MerchantProfileType:
        """Assign or reassign a Merchant's login ID (the 'M' + 9-digit number)."""
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            profile = await service.set_merchant_id(uuid.UUID(user_id), merchant_id_no)
            return MerchantProfileType(
                merchant_id_no=profile.merchant_id_no,
                company_name=profile.company_name,
                contact_person=profile.contact_person,
                mobile_no=profile.mobile_no,
                landline=profile.landline,
                address=profile.address,
                tin=profile.tin,
            )
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_reset_password(self, info: Info, user_id: str) -> AdminResetPasswordResult:
        """Generate a new temporary password for an account and email it —
        there is no self-service "forgot password" flow, so this is how a
        Member/Merchant recovers access."""
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user, temp_password = await service.reset_password(uuid.UUID(user_id))
            return AdminResetPasswordResult(user=UserType.from_model(user), temporary_password=temp_password)
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_update_member_profile(
        self, info: Info, user_id: str, input: AdminUpdateMemberProfileInput
    ) -> UserType:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.update_member_profile(
                uuid.UUID(user_id),
                first_name=input.first_name,
                last_name=input.last_name,
                email=input.email,
                phone=input.mobile,
                middle_name=input.middle_name,
            )
            return UserType.from_model(user)
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_update_merchant_profile(
        self, info: Info, user_id: str, input: AdminUpdateMerchantProfileInput
    ) -> MerchantProfileType:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            _user, profile = await service.update_merchant_profile(
                uuid.UUID(user_id),
                company_name=input.company_name,
                contact_person=input.contact_person,
                mobile_no=input.mobile_no,
                address=input.address,
                tin=input.tin,
                email=input.email,
                landline=input.landline,
            )
            return MerchantProfileType(
                merchant_id_no=profile.merchant_id_no,
                company_name=profile.company_name,
                contact_person=profile.contact_person,
                mobile_no=profile.mobile_no,
                landline=profile.landline,
                address=profile.address,
                tin=profile.tin,
            )
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def admin_delete_account(self, info: Info, user_id: str) -> bool:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            await service.delete_account(uuid.UUID(user_id), info.context.user_id)
            return True
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def suspend_user(self, info: Info, user_id: str) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.suspend_user(uuid.UUID(user_id))
            return UserType.from_model(user) if user else None
        finally:
            await service.session.close()

    @strawberry.mutation
    async def activate_user(self, info: Info, user_id: str) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.activate_user(uuid.UUID(user_id))
            return UserType.from_model(user) if user else None
        finally:
            await service.session.close()

    @strawberry.mutation
    async def update_user_role(
        self, info: Info, user_id: str, role: UserRoleEnum
    ) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.update_user_role(
                uuid.UUID(user_id), UserRole(role.value), info.context.user_id
            )
            return UserType.from_model(user) if user else None
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()