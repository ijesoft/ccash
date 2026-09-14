"""Session inactivity timeout: idle refresh rejected, touch resets clock."""

import time

import pytest

from app.core.errors import AuthenticationError


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = value

    async def set(self, key: str, value: str) -> None:
        self.store[key] = value

    async def get(self, key: str):
        return self.store.get(key)

    async def delete(self, *keys: str) -> None:
        for key in keys:
            self.store.pop(key, None)


async def test_refresh_rejected_after_idle_timeout(session, make_account, monkeypatch):
    from app.config import settings
    from app.core.security import decode_token
    from app.domains.auth.service import AuthService

    monkeypatch.setattr(settings, "inactivity_timeout_minutes", 5)
    user, _ = await make_account()
    redis = FakeRedis()
    svc = AuthService(session, redis)
    _access, refresh, _u = await svc.login(user.email, "Test123!")

    payload = decode_token(refresh)
    user_id = payload["sub"]
    redis.store[f"activity:user:{user_id}"] = str(int(time.time()) - 360)
    redis.store[f"activity:{payload['token_id']}"] = str(int(time.time()) - 360)

    with pytest.raises(AuthenticationError, match="inactivity"):
        await svc.refresh_token(refresh)


async def test_touch_resets_idle_clock(session, make_account, monkeypatch):
    from app.config import settings
    from app.core.security import decode_token
    from app.domains.auth.service import AuthService

    monkeypatch.setattr(settings, "inactivity_timeout_minutes", 5)
    user, _ = await make_account()
    redis = FakeRedis()
    svc = AuthService(session, redis)
    _access, refresh, _u = await svc.login(user.email, "Test123!")

    payload = decode_token(refresh)
    user_id = payload["sub"]
    assert await svc.touch(user_id) is True
    new_access, _new_refresh = await svc.refresh_token(refresh)
    assert new_access


async def test_active_refresh_still_rotates(session, make_account, monkeypatch):
    from app.config import settings
    from app.domains.auth.service import AuthService

    monkeypatch.setattr(settings, "inactivity_timeout_minutes", 5)
    user, _ = await make_account()
    svc = AuthService(session, FakeRedis())
    _access, refresh, _u = await svc.login(user.email, "Test123!")
    new_access, new_refresh = await svc.refresh_token(refresh)
    assert new_access and new_refresh and new_refresh != refresh
