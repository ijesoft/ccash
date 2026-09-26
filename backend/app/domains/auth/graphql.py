import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.redis import get_redis
from app.core.security import decode_token, generate_totp_secret
from app.database import async_session_factory
from app.domains.auth.models import User, UserStatus
from app.domains.auth.service import AuthService
from app.graphql.middleware import AuthContext


@strawberry.type
class UserType:
    id: str
    email: str
    phone: str
    id_no: str | None
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    status: str
    kyc_level: str
    role: str
    is_2fa_enabled: bool
    is_verified: bool
    created_at: str

    @classmethod
    def from_model(cls, user: User) -> "UserType":
        return cls(
            id=str(user.id),
            email=user.email,
            phone=user.phone,
            id_no=user.id_no,
            first_name=user.first_name,
            middle_name=user.middle_name,
            last_name=user.last_name,
            status=user.status.value,
            kyc_level=user.kyc_level.value,
            role=user.role.value,
            is_2fa_enabled=user.is_2fa_enabled,
            is_verified=user.is_verified,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )


@strawberry.type
class AuthPayload:
    access_token: str
    refresh_token: str
    user: UserType


@strawberry.type
class LoginChallenge:
    """Password (+2FA) succeeded; login is not complete until completeLogin
    confirms the account's ID No. `has_existing_id` tells the client whether
    to prompt "enter your ID No." or "set your ID No." (first login since
    this account gained the requirement)."""

    email: str
    has_existing_id: bool


@strawberry.type
class TwoFactorSetup:
    secret: str
    uri: str


async def get_auth_service(info: Info) -> AuthService:
    redis = await get_redis()
    session = async_session_factory()
    return AuthService(session, redis)


@strawberry.type
class AuthMutations:
    @strawberry.mutation
    async def register(
        self,
        info: Info,
        email: str,
        phone: str,
        password: str,
        id_no: str,
        first_name: str,
        last_name: str,
        middle_name: str | None = None,
    ) -> UserType:
        service = await get_auth_service(info)
        try:
            user = await service.register(
                email, phone, password, id_no, first_name, last_name, middle_name
            )
            return UserType.from_model(user)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def setup_verify_totp(self, info: Info, email: str) -> TwoFactorSetup:
        service = await get_auth_service(info)
        try:
            secret, uri = await service.setup_verify_totp(email)
            return TwoFactorSetup(secret=secret, uri=uri)
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def verify_otp(self, info: Info, email: str, code: str) -> bool:
        service = await get_auth_service(info)
        try:
            return await service.verify_otp(email, code)
        except (ValidationError, NotFoundError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def send_login_otp(self, info: Info, email: str) -> bool:
        service = await get_auth_service(info)
        try:
            return await service.send_login_otp(email)
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def login(self, info: Info, email: str, password: str, otp_code: str | None = None) -> LoginChallenge:
        service = await get_auth_service(info)
        try:
            challenge_email, has_existing_id = await service.login(email, password, otp_code)
            return LoginChallenge(email=challenge_email, has_existing_id=has_existing_id)
        except (AuthenticationError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def complete_login(self, info: Info, email: str, id_no: str) -> AuthPayload:
        service = await get_auth_service(info)
        try:
            access_token, refresh_token, user = await service.complete_login(email, id_no)
            return AuthPayload(
                access_token=access_token,
                refresh_token=refresh_token,
                user=UserType.from_model(user),
            )
        except (AuthenticationError, ValidationError, NotFoundError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def refresh_token(self, info: Info, refresh_token: str) -> AuthPayload:
        service = await get_auth_service(info)
        try:
            access, new_refresh = await service.refresh_token(refresh_token)
            user_id = decode_token(new_refresh).get("sub")
            user = await service.repo.get_by_id(uuid.UUID(user_id))
            return AuthPayload(
                access_token=access,
                refresh_token=new_refresh,
                user=UserType.from_model(user) if user else UserType(id="", email="", phone="", first_name=None, last_name=None, status="", kyc_level="", role="", is_2fa_enabled=False, is_verified=False, created_at=""),
            )
        except AuthenticationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def setup_2fa(self, info: Info) -> TwoFactorSetup:
        secret = generate_totp_secret()
        uri = f"otpauth://totp/Campe Wallet:{info.context.user_id}?secret={secret}&issuer=Campe Wallet"
        return TwoFactorSetup(secret=secret, uri=uri)

    @strawberry.mutation
    async def enable_2fa(self, info: Info, secret: str, code: str) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_auth_service(info)
        try:
            return await service.enable_2fa(context.user_id, secret, code)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def logout(self, info: Info, refresh_token: str) -> bool:
        service = await get_auth_service(info)
        try:
            await service.logout(refresh_token)
            return True
        finally:
            await service.session.close()

    @strawberry.mutation
    async def touch_session(self, info: Info) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")
        service = await get_auth_service(info)
        try:
            return await service.touch(str(context.user_id))
        except AuthenticationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()


@strawberry.type
class AuthQueries:
    @strawberry.field
    async def me(self, info: Info) -> UserType | None:
        context: AuthContext = info.context
        if not context.user_id:
            return None

        service = await get_auth_service(info)
        try:
            user = await service.repo.get_by_id(context.user_id)
            return UserType.from_model(user) if user else None
        finally:
            await service.session.close()