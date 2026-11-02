"""GraphQL rate limiting.

Shared NAT IPs (LAN demos, mobile carriers) plus unread-count polling used to
exhaust a 60/min bucket and then blow up as HTTP 500 because BaseHTTPMiddleware
does not convert raised HTTPException into a proper response.
"""

from __future__ import annotations

import hashlib
import json

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.redis import get_redis

# Cheap read polls must not starve real money mutations on a shared demo IP.
_EXEMPT_OPERATIONS = frozenset(
    {
        "UnreadCount",
        "unreadCount",
        "Branding",
        "branding",
        "IntrospectionQuery",
    }
)

_AUTH_OPERATIONS = frozenset(
    {
        "login",
        "Login",
        "completeLogin",
        "CompleteLogin",
        "register",
        "Register",
        "registerMerchant",
        "RegisterMerchant",
        "verifyOtp",
        "VerifyOtp",
        "sendLoginOtp",
        "SendLoginOtp",
        "masterListLookup",
        "MasterListLookup",
        "requestPasswordReset",
        "RequestPasswordReset",
        "resetPasswordWithCode",
        "ResetPasswordWithCode",
    }
)

# Mutation field names, matched in the query text when operationName is absent.
_AUTH_MARKERS = frozenset(
    {
        "login(",
        "completeLogin(",
        "register(",
        "registerMerchant(",
        "verifyOtp(",
        "sendLoginOtp(",
        "masterListLookup(",
        "requestPasswordReset(",
        "resetPasswordWithCode(",
    }
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path == "/graphql" and request.method == "POST":
            limited = await self._enforce(request)
            if limited is not None:
                return limited

        return await call_next(request)

    async def _enforce(self, request: Request) -> Response | None:
        body = await request.body()
        operation_name = ""
        try:
            data = json.loads(body or b"{}")
            operation_name = data.get("operationName") or ""
        except (json.JSONDecodeError, AttributeError, TypeError):
            operation_name = ""

        if operation_name in _EXEMPT_OPERATIONS:
            return None

        client_ip = request.client.host if request.client else "unknown"
        auth = request.headers.get("authorization") or ""
        # Prefer per-user buckets when authenticated so shared NAT does not
        # block unrelated wallets during demos.
        if auth.lower().startswith("bearer ") and len(auth) > 20:
            subject = "u:" + hashlib.sha256(auth.encode()).hexdigest()[:24]
        else:
            subject = "ip:" + client_ip

        # operationName is client-supplied, so trusting it alone lets a caller
        # drop the field and skip the strict auth limit. When it is absent, fall
        # back to scanning the query text for the auth mutation field names.
        # shortcut: aliases still evade text matching; the per-account login
        # lockout in AuthService is the real defense.
        is_auth = operation_name in _AUTH_OPERATIONS
        if not is_auth and not operation_name:
            query_text = ""
            try:
                query_text = json.loads(body or b"{}").get("query") or ""
            except (json.JSONDecodeError, AttributeError, TypeError):
                query_text = ""
            is_auth = any(marker in query_text for marker in _AUTH_MARKERS)
        bucket = "auth" if is_auth else "graphql"
        key = f"rate:{subject}:{bucket}"
        limit = 10 if is_auth else 300
        window = 60

        redis = await get_redis()
        current = await redis.get(key)
        if current and int(current) >= limit:
            return JSONResponse(
                status_code=429,
                content={
                    "errors": [
                        {
                            "message": "Too many requests. Please wait a moment and try again.",
                            "extensions": {"code": "RATE_LIMITED"},
                        }
                    ]
                },
            )

        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        await pipe.execute()
        return None
