"""Admin-only branding upload endpoints (binary REST, not GraphQL).

Rationale: a 5MB logo as GraphQL base64 would bloat ~33%; FastAPI UploadFile
streams to disk via python-multipart. Auth mirrors require_admin semantics.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.rest_auth import require_admin_token
from app.domains.admin.branding_service import (
    BASE_DIR,
    BrandingError,
    generate_variants,
    load_square_image,
    read_branding,
    reset_branding,
    save_branding,
    validate_upload,
)

router = APIRouter()


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...), actor_id: uuid.UUID = Depends(require_admin_token)):
    content = await file.read()
    try:
        validate_upload(content, file.content_type, file.filename or "")
        img = load_square_image(content)
        variants = generate_variants(img)
    except BrandingError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": str(e)})
    return save_branding(variants, actor_id=str(actor_id), base_dir=BASE_DIR)


@router.delete("/logo")
async def reset_logo(actor_id: uuid.UUID = Depends(require_admin_token)):
    _ = actor_id
    return reset_branding(base_dir=BASE_DIR)
