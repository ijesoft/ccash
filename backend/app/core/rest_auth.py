"""Bearer-token auth dependencies for REST (non-GraphQL) endpoints.

GraphQL resolvers get their AuthContext from app.graphql.middleware.
Binary downloads (branding uploads, report exports) live outside GraphQL
instead — see app/api/branding.py for why — so they need the same JWT check
expressed as a plain FastAPI dependency.
"""

import uuid

from fastapi import HTTPException, Request

from app.core.security import decode_token


async def require_user_token(request: Request) -> uuid.UUID:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth[7:])
        return uuid.UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")


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
