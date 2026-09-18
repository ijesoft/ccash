import uuid
from collections.abc import Collection

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.merchants.models import MerchantProfile


class MerchantRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_user_id(self, user_id: uuid.UUID) -> MerchantProfile | None:
        result = await self.session.execute(
            select(MerchantProfile).where(
                MerchantProfile.user_id == user_id, MerchantProfile.deleted_at.is_(None)
            )
        )
        return result.scalar_one_or_none()

    async def get_by_user_ids(self, user_ids: Collection[uuid.UUID]) -> dict[uuid.UUID, MerchantProfile]:
        """Batch-resolve user_id -> profile, for building report rows in one query."""
        if not user_ids:
            return {}
        result = await self.session.execute(
            select(MerchantProfile).where(
                MerchantProfile.user_id.in_(user_ids), MerchantProfile.deleted_at.is_(None)
            )
        )
        return {profile.user_id: profile for profile in result.scalars().all()}

    async def get_by_merchant_id_no(self, merchant_id_no: str) -> MerchantProfile | None:
        result = await self.session.execute(
            select(MerchantProfile).where(
                MerchantProfile.merchant_id_no == merchant_id_no,
                MerchantProfile.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, profile: MerchantProfile) -> MerchantProfile:
        self.session.add(profile)
        await self.session.flush()
        return profile

    async def list_all(self, limit: int = 20, offset: int = 0) -> tuple[list[MerchantProfile], int]:
        total_result = await self.session.execute(
            select(func.count(MerchantProfile.id)).where(MerchantProfile.deleted_at.is_(None))
        )
        total = total_result.scalar() or 0

        result = await self.session.execute(
            select(MerchantProfile)
            .where(MerchantProfile.deleted_at.is_(None))
            .order_by(MerchantProfile.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total
