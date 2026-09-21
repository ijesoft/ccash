import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.master_list.models import MasterListEntry


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class MasterListRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, entry_id: uuid.UUID) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.id == entry_id,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_id_no(self, id_no: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.id_no == id_no,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_email(self, email: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.email == email,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_mobile(self, mobile_number: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.mobile_number == mobile_number,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def list_entries(
        self, limit: int = 20, offset: int = 0, q: str = ""
    ) -> tuple[list[MasterListEntry], int]:
        filters = [MasterListEntry.deleted_at.is_(None)]
        term = (q or "").strip()
        if term:
            like = f"%{_escape_like(term)}%"
            filters.append(
                or_(
                    MasterListEntry.id_no.ilike(like),
                    MasterListEntry.first_name.ilike(like),
                    MasterListEntry.last_name.ilike(like),
                    MasterListEntry.middle_name.ilike(like),
                    MasterListEntry.mobile_number.ilike(like),
                    MasterListEntry.email.ilike(like),
                )
            )
        total = (
            await self.session.execute(
                select(func.count(MasterListEntry.id)).where(*filters)
            )
        ).scalar() or 0
        result = await self.session.execute(
            select(MasterListEntry)
            .where(*filters)
            .order_by(MasterListEntry.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def create(self, entry: MasterListEntry) -> MasterListEntry:
        self.session.add(entry)
        await self.session.flush()
        return entry
