import time

from fastapi import Request, HTTPException
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis: Redis):
        super().__init__(app)
        self.redis = redis

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/graphql",) and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            key = f"rate:{client_ip}:{request.url.path}"

            current = await self.redis.get(key)
            if current and int(current) > 30:
                raise HTTPException(status_code=429, detail="Too many requests")

            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, 60)
            await pipe.execute()

        response = await call_next(request)
        return response