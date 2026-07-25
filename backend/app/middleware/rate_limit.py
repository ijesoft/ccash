import json

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.redis import get_redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        if request.url.path == "/graphql" and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            redis = await get_redis()

            body = await request.body()

            try:
                data = json.loads(body)
                operation_name = data.get("operationName", "")
                is_auth_operation = operation_name in ("login", "register", "verifyOtp", "sendLoginOtp")
            except (json.JSONDecodeError, AttributeError):
                is_auth_operation = False

            key = f"rate:{client_ip}:{'auth' if is_auth_operation else 'graphql'}"
            limit = 5 if is_auth_operation else 60
            window = 60

            current = await redis.get(key)
            if current and int(current) >= limit:
                raise HTTPException(status_code=429, detail="Too many requests")

            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, window)
            await pipe.execute()

        response = await call_next(request)
        return response
