import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.users.models import KycDocument, KycDocumentStatus


class KycRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: uuid.UUID, document_type: str, file_path: str) -> KycDocument:
        doc = KycDocument(user_id=user_id, document_type=document_type, file_path=file_path)
        self.session.add(doc)
        await self.session.flush()
        return doc

    async def list_by_user(self, user_id: uuid.UUID) -> list[KycDocument]:
        result = await self.session.execute(
            select(KycDocument).where(KycDocument.user_id == user_id).order_by(KycDocument.uploaded_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, doc_id: uuid.UUID) -> KycDocument | None:
        result = await self.session.execute(select(KycDocument).where(KycDocument.id == doc_id))
        return result.scalar_one_or_none()

    async def approve(self, doc_id: uuid.UUID, reviewer_id: uuid.UUID) -> KycDocument | None:
        doc = await self.get_by_id(doc_id)
        if doc:
            doc.status = KycDocumentStatus.APPROVED
            doc.reviewed_by = reviewer_id
            self.session.add(doc)
            await self.session.flush()
        return doc

    async def reject(self, doc_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str) -> KycDocument | None:
        doc = await self.get_by_id(doc_id)
        if doc:
            doc.status = KycDocumentStatus.REJECTED
            doc.rejection_reason = reason
            doc.reviewed_by = reviewer_id
            self.session.add(doc)
            await self.session.flush()
        return doc