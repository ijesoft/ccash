import uuid

from fastapi import Request
from strawberry.fastapi import BaseContext
from strawberry.permission import PermissionExtension

from app.core.security import decode_token


class AuthContext(BaseContext):
    user_id: uuid.UUID | None = None
    scopes: list[str] = []
    role: str | None = None


async def get_context(request: Request) -> AuthContext:
    context = AuthContext()
    auth_header = request.headers.get("Authorization")

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = decode_token(token)
            context.user_id = uuid.UUID(payload.get("sub"))
            context.scopes = payload.get("scopes", [])
            context.role = payload.get("role")
        except Exception:
            pass

    return context


def login_required(permissions: list[str] | None = None):
    return PermissionExtension(permissions=permissions or [])


def require_perms(context: AuthContext, *perms: str) -> None:
    """Allow if any requested permission string is in scopes."""
    wants = {p.value if hasattr(p, "value") else str(p) for p in perms}
    if not context.user_id or not wants.intersection(set(context.scopes)):
        raise Exception("Not authorized")


def require_roles(context: AuthContext, *roles: str) -> None:
    """Allow if context.role matches any requested role."""
    want_values = {r.value if hasattr(r, "value") else str(r) for r in roles}
    if not context.user_id or (context.role not in want_values):
        raise Exception("Not authorized")


def require_admin(context: AuthContext) -> None:
    """Legacy shim — do not use in new code, use require_perms instead."""
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")
