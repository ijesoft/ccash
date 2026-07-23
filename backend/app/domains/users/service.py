import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import KycLevel, User
from app.domains.auth.repository import UserRepository
from app.domains.users.models import KycDocument
from app.domains.users.repository import KycRepository


class KycService:
    def __init__(self, session: AsyncSession):
        self.repo = KycRepository(session)
        self.user_repo = UserRepository(session)
        self.session = session

    async def submit_document(self, user_id: uuid.UUID, document_type: str, file_path: str) -> KycDocument:
        return await self.repo.create(user_id, document_type, file_path)

    async def get_documents(self, user_id: uuid.UUID) -> list[KycDocument]:
        return await self.repo.list_by_user(user_id)

    async def approve_document(self, doc_id: uuid.UUID, reviewer_id: uuid.UUID) -> KycDocument | None:
        doc = await self.repo.approve(doc_id, reviewer_id)
        if doc:
            docs = await self.repo.list_by_user(doc.user_id)
            approved_types = {d.document_type for d in docs if d.status.value == "APPROVED"}
            user = await self.user_repo.get_by_id(doc.user_id)
            if user:
                if "ID" in approved_types:
                    user.kyc_level = KycLevel.BASIC
                if "ID" in approved_types and "SELFIE" in approved_types:
                    user.kyc_level = KycLevel.FULL
                await self.user_repo.update(user)
        return doc

    async def reject_document(self, doc_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str) -> KycDocument | None:
        return await self.repo.reject(doc_id, reviewer_id, reason)