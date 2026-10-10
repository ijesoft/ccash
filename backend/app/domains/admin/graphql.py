import enum
import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import NotFoundError, ValidationError
from app.database import async_session_factory
from app.domains.admin.branding_service import BASE_DIR, read_branding
from app.domains.admin.service import AdminService
from app.domains.admin.role_permissions import RolePermissionService
from app.domains.auth.graphql import UserType
from app.domains.auth.models import UserRole
from app.domains.merchants.graphql import MerchantProfileType
from app.domains.transactions.graphql import TransactionType
from app.domains.transactions.service import TransactionService
from app.core.rbac import Permission
from app.graphql.middleware import require_perms, require_roles


@strawberry.enum
class UserRoleEnum(str, enum.Enum):
    MEMBER = "MEMBER"
    MERCHANT = "MERCHANT"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    AUDITOR = "AUDITOR"


@strawberry.type
class PlatformStats:
    total_users: int
    active_wallets: int
    total_transactions: int
    transaction_volume_cents: int
    total_wallet_balance_cents: int
    member_count: int
    merchant_count: int
    admin_count: int
    member_balance_cents: int
    merchant_balance_cents: int
    admin_balance_cents: int


@strawberry.type
class AuditLogType:
    id: str
    actor_email: str | None
    action: str
    resource_type: str
    resource_id: str | None
    summary: str
    created_at: str


@strawberry.type
class AdminMemberType:
    id: str
    email: str
    phone: str
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
class AdminLedgerRow:
    id: str
    created_at: str
    reference: str | None
    type: str
    status: str
    sender: str | None = None
    receiver: str | None = None
    amount_cents: int = 0
    fee_cents: int = 0
    net_amount_cents: int = 0
    description: str | None = None


@strawberry.type
class AdminLedgerConnection:
    items: list[AdminLedgerRow]
    total: int


@strawberry.type
class BrandingType:
    logo_url: str
    version: int
    updated_at: str


@strawberry.type
class RolePermissionsType:
    role: str
    permissions: list[str]


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
class RecoveryRequestType:
    id: str
    email: str | None
    status: str
    requested_at: str
    decided_at: str | None
    decided_by: str | None
    expires_at: str | None


@strawberry.type
class ApproveRecoveryResult:
    request: RecoveryRequestType
    recovery_code: str


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
        require_perms(info.context, Permission.PLATFORM_STATS)
        service = await get_admin_service(info)
        try:
            stats = await service.get_platform_stats()
            return PlatformStats(**stats)
        finally:
            await service.session.close()

    @strawberry.field
    async def audit_logs(
        self,
        info: Info,
        limit: int = 20,
        offset: int = 0,
        action: str | None = None,
        search: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[AuditLogType]:
        """Audit trail (money movements + admin actions). Requires audit:read (SUPER_ADMIN + AUDITOR)."""
        require_perms(info.context, Permission.AUDIT_READ)
        service = await get_admin_service(info)
        try:
            items, _ = await service.list_audit_logs(
                limit, offset, action, search, from_date, to_date
            )
            return [AuditLogType(**item) for item in items]
        finally:
            await service.session.close()

    @strawberry.field
    async def audit_logs_count(
        self,
        info: Info,
        action: str | None = None,
        search: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> int:
        require_perms(info.context, Permission.AUDIT_READ)
        service = await get_admin_service(info)
        try:
            _, total = await service.list_audit_logs(1, 0, action, search, from_date, to_date)
            return total
        finally:
            await service.session.close()

    @strawberry.field
    async def role_permissions(self, info: Info) -> list[RolePermissionsType]:
        """Super-admin-only role → permission matrix for the Roles page."""
        require_roles(info.context, UserRole.SUPER_ADMIN)
        session = async_session_factory()
        try:
            matrix = await RolePermissionService(session).get_matrix()
            return [
                RolePermissionsType(role=role, permissions=perms)
                for role, perms in sorted(matrix.items())
            ]
        finally:
            await session.close()

    @strawberry.field
    async def admin_users_count(
        self, info: Info, role: UserRoleEnum | None = None, search: str | None = None
    ) -> int:
        require_perms(info.context, Permission.USERS_READ)
        service = await get_admin_service(info)
        try:
            role_filter = UserRole(role.value) if role else None
            _, total = await service.list_users(1, 0, role_filter, search)
            return total
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_users(
        self,
        info: Info,
        limit: int = 20,
        offset: int = 0,
        role: UserRoleEnum | None = None,
        search: str | None = None,
    ) -> list[AdminMemberType]:
        require_perms(info.context, Permission.USERS_READ)
        service = await get_admin_service(info)
        try:
            role_filter = UserRole(role.value) if role else None
            members, _ = await service.list_users(limit, offset, role_filter, search)
            return [AdminMemberType(**m) for m in members]
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_user_transactions(
        self, info: Info, user_id: str, limit: int = 20, offset: int = 0
    ) -> list[TransactionType]:
        """Admin view of one user's history, from that user's perspective."""
        require_perms(info.context, Permission.USERS_READ)
        require_perms(info.context, Permission.TX_READ_ALL)
        session = async_session_factory()
        try:
            service = TransactionService(session)
            views, _ = await service.list_transactions(uuid.UUID(user_id), limit=limit, offset=offset)
            return [TransactionType.from_view(v) for v in views]
        finally:
            await session.close()

    @strawberry.field
    async def admin_all_transactions(
        self,
        info: Info,
        limit: int = 20,
        offset: int = 0,
        tx_type: str | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> AdminLedgerConnection:
        """Platform-wide ledger feed for auditors. Requires transactions:read-all."""
        require_perms(info.context, Permission.TX_READ_ALL)
        service = await get_admin_service(info)
        try:
            rows, total = await service.list_all_transactions_paginated(limit, offset, tx_type, status, search)
            return AdminLedgerConnection(
                items=[
                    AdminLedgerRow(
                        id=r["id"],
                        created_at=r["created_at"],
                        reference=r["reference"],
                        type=r["type"],
                        status=r["status"],
                        sender=r["from"],
                        receiver=r["to"],
                        amount_cents=r["amount_cents"],
                        fee_cents=r["fee_cents"],
                        net_amount_cents=r["net_amount_cents"],
                        description=r["description"],
                    )
                    for r in rows
                ],
                total=total,
            )
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_account_detail(self, info: Info, user_id: str) -> AdminAccountDetailType:
        require_perms(info.context, Permission.USERS_READ)
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

    @strawberry.field
    async def password_recovery_requests(
        self,
        info: Info,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
        search: str | None = None,
    ) -> list[RecoveryRequestType]:
        require_perms(info.context, Permission.USERS_RECOVER_PASSWORD)
        service = await get_admin_service(info)
        try:
            rows, _ = await service.list_recovery_requests(limit, offset, status, search)
            return [
                RecoveryRequestType(
                    id=r["id"],
                    email=r["email"],
                    status=r["status"],
                    requested_at=r["requested_at"],
                    decided_at=r["decided_at"] or None,
                    decided_by=r["decided_by"],
                    expires_at=r["expires_at"] or None,
                )
                for r in rows
            ]
        finally:
            await service.session.close()

    @strawberry.field
    async def password_recovery_requests_count(
        self,
        info: Info,
        status: str | None = None,
        search: str | None = None,
    ) -> int:
        require_perms(info.context, Permission.USERS_RECOVER_PASSWORD)
        service = await get_admin_service(info)
        try:
            _, total = await service.list_recovery_requests(1, 0, status, search)
            return total
        finally:
            await service.session.close()


@strawberry.type
class AdminMutations:
    @strawberry.mutation
    async def admin_create_member(self, info: Info, input: AdminCreateMemberInput) -> AdminCreateMemberResult:
        """Individual add (one row at a time). See app/api/admin_members.py
        for the batch-upload counterpart used for the initial ~3000-member roll."""
        require_perms(info.context, Permission.USERS_CREATE)
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
        require_perms(info.context, Permission.USERS_SET_ID)
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
        require_perms(info.context, Permission.MERCHANTS_SET_ID)
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
        require_perms(info.context, Permission.USERS_RESET_PASSWORD)
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
        require_perms(info.context, Permission.USERS_UPDATE)
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
        require_perms(info.context, Permission.MERCHANTS_UPDATE)
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
        require_perms(info.context, Permission.USERS_DELETE)
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
        require_perms(info.context, Permission.USERS_SUSPEND)
        service = await get_admin_service(info)
        try:
            user = await service.suspend_user_as(uuid.UUID(user_id), info.context.user_id)
            return UserType.from_model(user) if user else None
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def activate_user(self, info: Info, user_id: str) -> UserType | None:
        require_perms(info.context, Permission.USERS_SUSPEND)
        service = await get_admin_service(info)
        try:
            user = await service.activate_user_as(uuid.UUID(user_id), info.context.user_id)
            return UserType.from_model(user) if user else None
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def update_user_role(
        self, info: Info, user_id: str, role: UserRoleEnum
    ) -> UserType | None:
        require_perms(info.context, Permission.USERS_CHANGE_ROLE)
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

    @strawberry.mutation
    async def approve_password_recovery_request(self, info: Info, request_id: str) -> ApproveRecoveryResult:
        require_perms(info.context, Permission.USERS_RECOVER_PASSWORD)
        service = await get_admin_service(info)
        try:
            row, code = await service.approve_recovery_request(
                uuid.UUID(request_id), info.context.user_id
            )
            return ApproveRecoveryResult(
                request=RecoveryRequestType(
                    id=row["id"],
                    email=row.get("email"),
                    status=row["status"],
                    requested_at=row.get("requested_at") or "",
                    decided_at=row.get("decided_at") or None,
                    decided_by=row.get("decided_by"),
                    expires_at=row.get("expires_at") or None,
                ),
                recovery_code=code,
            )
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cancel_password_recovery_request(self, info: Info, request_id: str) -> RecoveryRequestType:
        require_perms(info.context, Permission.USERS_RECOVER_PASSWORD)
        service = await get_admin_service(info)
        try:
            row = await service.cancel_recovery_request(
                uuid.UUID(request_id), info.context.user_id
            )
            return RecoveryRequestType(
                id=row["id"],
                email=row.get("email"),
                status=row["status"],
                requested_at=row.get("requested_at") or "",
                decided_at=row.get("decided_at") or None,
                decided_by=row.get("decided_by"),
                expires_at=row.get("expires_at") or None,
            )
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def update_role_permissions(
        self, info: Info, role: UserRoleEnum, permissions: list[str]
    ) -> list[str]:
        """Replace a role's permission set (SUPER_ADMIN itself is locked)."""
        require_roles(info.context, UserRole.SUPER_ADMIN)
        session = async_session_factory()
        try:
            actor_role = (
                UserRole(info.context.role) if info.context.role else None
            )
            return await RolePermissionService(session).set_role_permissions(
                UserRole(role.value),
                permissions,
                info.context.user_id,
                actor_role,
            )
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await session.close()