"""Admin batch member upload (~3000 rows). REST, not GraphQL — same rationale
as app/api/branding.py: a multipart file upload streams via python-multipart
instead of inflating a base64 GraphQL payload.

Individual "add one member" lives in GraphQL instead (app/domains/admin/graphql.py
adminCreateMember) since it is a normal small mutation, not a binary upload.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.errors import ValidationError
from app.core.rest_auth import require_admin_token
from app.database import async_session_factory
from app.domains.admin.batch_import import BatchImportError, parse_member_rows
from app.domains.admin.service import AdminService

MAX_BATCH_ROWS = 5000

router = APIRouter()


@router.post("/members/batch")
async def batch_upload_members(file: UploadFile = File(...), _actor: uuid.UUID = Depends(require_admin_token)):
    content = await file.read()
    try:
        rows = parse_member_rows(content, file.filename or "")
    except BatchImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(rows) > MAX_BATCH_ROWS:
        raise HTTPException(status_code=400, detail=f"Batch upload is limited to {MAX_BATCH_ROWS} rows per file")

    session = async_session_factory()
    results = []
    created = 0
    try:
        service = AdminService(session)
        for i, row in enumerate(rows, start=2):  # row 1 is the header
            id_no = row.get("id_no", "")
            email = row.get("email", "")
            try:
                await service.create_member(
                    id_no=id_no,
                    first_name=row.get("first_name", ""),
                    last_name=row.get("last_name", ""),
                    email=email,
                    phone=row.get("mobile", ""),
                    middle_name=row.get("middle_name") or None,
                )
                created += 1
                results.append({"row": i, "id_no": id_no, "email": email, "status": "created", "message": None})
            except ValidationError as e:
                results.append({"row": i, "id_no": id_no, "email": email, "status": "error", "message": str(e)})

        return {"total": len(rows), "created": created, "failed": len(rows) - created, "results": results}
    finally:
        await session.close()
