import enum
import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import NotFoundError, ValidationError
from app.database import async_session_factory
from app.domains.master_list.models import MasterListEntry, MasterListStatus
from app.domains.master_list.service import MasterListService
from app.graphql.middleware import require_admin


@strawberry.enum
class MasterListStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


@strawberry.type
class MasterListType:
    id: str
    id_no: str
    last_name: str
    first_name: str
    middle_name: str | None
    mobile_number: str
    email: str
    status: str
    created_at: str

    @classmethod
    def from_model(cls, e: MasterListEntry) -> "MasterListType":
        return cls(
            id=str(e.id),
            id_no=e.id_no,
            last_name=e.last_name,
            first_name=e.first_name,
            middle_name=e.middle_name,
            mobile_number=e.mobile_number,
            email=e.email,
            status=e.status.value if isinstance(e.status, MasterListStatus) else str(e.status),
            created_at=e.created_at.isoformat() if e.created_at else "",
        )


@strawberry.input
class MasterListCreateInput:
    id_no: str
    last_name: str
    first_name: str
    middle_name: str | None = None
    mobile_number: str
    email: str
    status: MasterListStatusEnum = MasterListStatusEnum.ACTIVE


@strawberry.input
class MasterListUpdateInput:
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    mobile_number: str | None = None
    email: str | None = None
    status: MasterListStatusEnum | None = None


@strawberry.type
class MasterListQueries:
    @strawberry.field
    async def master_list_entries(
        self, info: Info, limit: int = 20, offset: int = 0
    ) -> list[MasterListType]:
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entries, _ = await service.list_entries(limit, offset)
            return [MasterListType.from_model(e) for e in entries]
        finally:
            await session.close()


@strawberry.type
class MasterListMutations:
    @strawberry.mutation
    async def master_list_create_entry(self, info: Info, input: MasterListCreateInput) -> MasterListType:
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entry = await service.create_entry(
                id_no=input.id_no,
                first_name=input.first_name,
                last_name=input.last_name,
                middle_name=input.middle_name,
                mobile_number=input.mobile_number,
                email=input.email,
                status=input.status.value,
                actor_id=info.context.user_id,
            )
            return MasterListType.from_model(entry)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await session.close()

    @strawberry.mutation
    async def master_list_update_entry(
        self, info: Info, entry_id: str, input: MasterListUpdateInput
    ) -> MasterListType:
        """Admin-only update (names, mobile, email, status). id_no is immutable."""
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entry = await service.update_entry(
                uuid.UUID(entry_id),
                first_name=input.first_name,
                last_name=input.last_name,
                middle_name=input.middle_name,
                mobile_number=input.mobile_number,
                email=input.email,
                status=input.status.value if input.status else None,
            )
            return MasterListType.from_model(entry)
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await session.close()
