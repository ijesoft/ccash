import strawberry
from strawberry.types import Info

from app.core.errors import NotFoundError, ValidationError
from app.core.redis import get_redis
from app.database import async_session_factory
from app.domains.merchants.service import MerchantService
from app.graphql.middleware import AuthContext, require_admin


@strawberry.type
class MerchantProfileType:
    merchant_id_no: str
    company_name: str
    contact_person: str
    mobile_no: str
    landline: str | None
    address: str
    tin: str


@strawberry.type
class AdminMerchantType:
    id: str
    merchant_id_no: str
    company_name: str
    contact_person: str
    mobile_no: str
    landline: str | None
    address: str
    tin: str
    email: str
    status: str
    created_at: str


@strawberry.input
class RegisterMerchantInput:
    email: str
    mobile_no: str
    password: str
    company_name: str
    contact_person: str
    address: str
    tin: str
    landline: str | None = None
    # Left blank for outsider/new merchants: the system generates "M" + 9 digits.
    merchant_id_no: str | None = None


async def get_merchant_service(info: Info) -> MerchantService:
    redis = await get_redis()
    session = async_session_factory()
    return MerchantService(session, redis)


@strawberry.type
class MerchantMutations:
    @strawberry.mutation
    async def register_merchant(self, info: Info, input: RegisterMerchantInput) -> MerchantProfileType:
        service = await get_merchant_service(info)
        try:
            _user, profile = await service.register(
                email=input.email,
                mobile_no=input.mobile_no,
                password=input.password,
                company_name=input.company_name,
                contact_person=input.contact_person,
                address=input.address,
                tin=input.tin,
                landline=input.landline,
                merchant_id_no=input.merchant_id_no,
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
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()


@strawberry.type
class MerchantQueries:
    @strawberry.field
    async def merchant_profile(self, info: Info) -> MerchantProfileType | None:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_merchant_service(info)
        try:
            profile = await service.get_profile(context.user_id)
            return MerchantProfileType(
                merchant_id_no=profile.merchant_id_no,
                company_name=profile.company_name,
                contact_person=profile.contact_person,
                mobile_no=profile.mobile_no,
                landline=profile.landline,
                address=profile.address,
                tin=profile.tin,
            )
        except NotFoundError:
            return None
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_merchants(self, info: Info, limit: int = 20, offset: int = 0) -> list[AdminMerchantType]:
        require_admin(info.context)
        service = await get_merchant_service(info)
        try:
            merchants, _total = await service.list_merchants(limit, offset)
            return [
                AdminMerchantType(
                    id=m["id"],
                    merchant_id_no=m["merchant_id_no"],
                    company_name=m["company_name"],
                    contact_person=m["contact_person"],
                    mobile_no=m["mobile_no"],
                    landline=m["landline"],
                    address=m["address"],
                    tin=m["tin"],
                    email=m["email"],
                    status=m["status"],
                    created_at=m["created_at"],
                )
                for m in merchants
            ]
        finally:
            await service.session.close()
