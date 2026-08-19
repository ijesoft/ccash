import uuid

import strawberry
from strawberry.types import Info

from app.database import async_session_factory
from app.domains.users.service import KycService
from app.graphql.middleware import require_admin


@strawberry.type
class KycDocumentType:
    id: str
    document_type: str
    status: str
    file_path: str
    rejection_reason: str | None
    uploaded_at: str


async def get_kyc_service(info: Info) -> KycService:
    session = async_session_factory()
    return KycService(session)


@strawberry.type
class KycQueries:
    @strawberry.field
    async def kyc_documents(self, info: Info) -> list[KycDocumentType]:
        context = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_kyc_service(info)
        try:
            docs = await service.get_documents(context.user_id)
            return [
                KycDocumentType(
                    id=str(d.id),
                    document_type=d.document_type.value,
                    status=d.status.value,
                    file_path=d.file_path,
                    rejection_reason=d.rejection_reason,
                    uploaded_at=d.uploaded_at.isoformat() if d.uploaded_at else "",
                )
                for d in docs
            ]
        finally:
            await service.session.close()


@strawberry.type
class KycMutations:
    @strawberry.mutation
    async def submit_kyc(self, info: Info, document_type: str, file_path: str) -> KycDocumentType:
        context = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_kyc_service(info)
        try:
            doc = await service.submit_document(context.user_id, document_type, file_path)
            return KycDocumentType(
                id=str(doc.id),
                document_type=doc.document_type.value,
                status=doc.status.value,
                file_path=doc.file_path,
                rejection_reason=doc.rejection_reason,
                uploaded_at=doc.uploaded_at.isoformat() if doc.uploaded_at else "",
            )
        finally:
            await service.session.close()

    @strawberry.mutation
    async def approve_kyc(self, info: Info, document_id: str) -> bool:
        context = info.context
        require_admin(context)

        service = await get_kyc_service(info)
        try:
            result = await service.approve_document(uuid.UUID(document_id), context.user_id)
            return result is not None
        finally:
            await service.session.close()

    @strawberry.mutation
    async def reject_kyc(self, info: Info, document_id: str, reason: str) -> bool:
        context = info.context
        require_admin(context)

        service = await get_kyc_service(info)
        try:
            result = await service.reject_document(uuid.UUID(document_id), context.user_id, reason)
            return result is not None
        finally:
            await service.session.close()