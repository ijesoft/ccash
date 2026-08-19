import uuid

from fastapi import Request
from strawberry.fastapi import BaseContext
from strawberry.permission import PermissionExtension

from app.core.security import decode_token


class AuthContext(BaseContext):
    user_id: uuid.UUID | None = None
    scopes: list[str] = []


async def get_context(request: Request) -> AuthContext:
    context = AuthContext()
    auth_header = request.headers.get("Authorization")

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = decode_token(token)
            context.user_id = uuid.UUID(payload.get("sub"))
            context.scopes = payload.get("scopes", [])
        except Exception:
            pass

    return context


def login_required(permissions: list[str] | None = None):
    return PermissionExtension(permissions=permissions or [])


def require_admin(context: AuthContext) -> None:
    """Raise for any context that is not an authenticated admin.

    Single home for the admin check; every domain imports this instead of
    inlining it, so the guard cannot drift between resolvers.
    """
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")