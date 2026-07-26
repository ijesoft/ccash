import strawberry
from strawberry.types import Info

from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.redis import get_redis
from app.core.security import generate_totp_secret
from app.database import async_session_factory
from app.domains.auth.models import User, UserStatus
from app.domains.auth.service import AuthService
from app.graphql.middleware import AuthContext


@strawberry.type
class UserType:
    id: str
    email: str
    phone: str
    first_name: str | None
    last_name: str | None
    status: str
    kyc_level: str
    is_2fa_enabled: bool
    is_verified: bool
    created_at: str

    @classmethod
    def from_model(cls, user: User) -> "UserType":
        return cls(
            id=str(user.id),
            email=user.email,
            phone=user.phone,
            first_name=user.first_name,
            last_name=user.last_name,
            status=user.status.value,
            kyc_level=user.kyc_level.value,
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
    async def register(self, info: Info, email: str, phone: str, password: str) -> UserType:
        service = await get_auth_service(info)
        try:
            user = await service.register(email, phone, password)
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
    async def login(self, info: Info, email: str, password: str, otp_code: str | None = None) -> AuthPayload:
        service = await get_auth_service(info)
        try:
            access_token, refresh_token, user = await service.login(email, password, otp_code)
            return AuthPayload(
                access_token=access_token,
                refresh_token=refresh_token,
                user=UserType.from_model(user),
            )
        except (AuthenticationError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def refresh_token(self, info: Info, refresh_token: str) -> AuthPayload:
        service = await get_auth_service(info)
        try:
            access, new_refresh = await service.refresh_token(refresh_token)
            return AuthPayload(
                access_token=access,
                refresh_token=new_refresh,
                user=UserType(id="", email="", phone="", status="", kyc_level="", is_2fa_enabled=False, is_verified=False, created_at=""),
            )
        except AuthenticationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def setup_2fa(self, info: Info) -> TwoFactorSetup:
        secret = generate_totp_secret()
        uri = f"otpauth://totp/CCash:{info.context.user_id}?secret={secret}&issuer=CCash"
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