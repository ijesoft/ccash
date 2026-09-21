"""Master List batch upload. REST, not GraphQL — same rationale as
app/api/admin_members.py: multipart file upload streams via python-multipart
instead of inflating a base64 GraphQL payload."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.errors import ValidationError
from app.core.rest_auth import require_admin_token
from app.database import async_session_factory
from app.domains.admin.batch_import import BatchImportError, parse_member_rows
from app.domains.master_list.service import MasterListService

MAX_BATCH_ROWS = 5000

router = APIRouter()


@router.post("/master-list/batch")
async def batch_upload_master_list(
    file: UploadFile = File(...), actor_id: uuid.UUID = Depends(require_admin_token)
):
    content = await file.read()
    try:
        rows = parse_member_rows(content, file.filename or "")
    except BatchImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(rows) > MAX_BATCH_ROWS:
        raise HTTPException(
            status_code=400, detail=f"Batch upload is limited to {MAX_BATCH_ROWS} rows per file"
        )

    session = async_session_factory()
    results = []
    created = 0
    try:
        service = MasterListService(session)
        for i, row in enumerate(rows, start=2):  # row 1 is the header
            id_no = row.get("id_no", "")
            email = row.get("email", "")
            try:
                # Batch imports always land as ACTIVE; admin adjusts via
                # single-add status selector (v1 has no edit flow).
                await service.create_entry(
                    id_no=id_no,
                    first_name=row.get("first_name", ""),
                    last_name=row.get("last_name", ""),
                    middle_name=row.get("middle_name") or None,
                    mobile_number=row.get("mobile", ""),
                    email=email,
                    status="ACTIVE",
                    actor_id=actor_id,
                )
                created += 1
                results.append({"row": i, "id_no": id_no, "email": email, "status": "created", "message": None})
            except ValidationError as e:
                results.append({"row": i, "id_no": id_no, "email": email, "status": "error", "message": str(e)})
        return {"total": len(rows), "created": created, "failed": len(rows) - created, "results": results}
    finally:
        await session.close()
