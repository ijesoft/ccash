"""Admin-only branding upload endpoints (binary REST, not GraphQL).

Rationale: a 5MB logo as GraphQL base64 would bloat ~33%; FastAPI UploadFile
streams to disk via python-multipart. Auth mirrors require_admin semantics.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.security import decode_token
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


async def require_admin_token(request: Request) -> uuid.UUID:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth[7:])
        user_id = uuid.UUID(payload.get("sub"))
        scopes = payload.get("scopes", [])
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if "admin" not in scopes:
        raise HTTPException(status_code=403, detail="Not authorized")
    return user_id


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
