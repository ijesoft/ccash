import uuid

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    generate_totp_secret,
    hash_password,
    verify_password,
    verify_totp,
)
from app.domains.auth.models import User, UserStatus
from app.domains.auth.repository import UserRepository


class AuthService:
    def __init__(self, session: AsyncSession, redis: Redis):
        self.repo = UserRepository(session)
        self.session = session
        self.redis = redis

    async def register(self, email: str, phone: str, password: str) -> User:
        existing = await self.repo.get_by_email(email)
        if existing:
            raise ValidationError("Email already registered")

        existing = await self.repo.get_by_phone(phone)
        if existing:
            raise ValidationError("Phone already registered")

        password_hash = hash_password(password)
        user = await self.repo.create(email, phone, password_hash)

        otp = generate_otp()
        await self.redis.setex(f"otp:{email}", 300, otp)

        return user

    async def verify_otp(self, email: str, code: str) -> bool:
        stored = await self.redis.get(f"otp:{email}")
        if not stored or stored.decode() != code:
            raise ValidationError("Invalid or expired OTP")

        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        user.is_verified = True
        user.status = UserStatus.ACTIVE
        await self.repo.update(user)
        await self.redis.delete(f"otp:{email}")

        return True

    async def login(self, email: str, password: str, otp_code: str | None = None) -> tuple[str, str, User]:
        user = await self.repo.get_by_email(email)
        if not user:
            raise AuthenticationError("Invalid credentials")

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")

        if user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Account is not active")

        if user.is_2fa_enabled:
            if not otp_code:
                raise ValidationError("2FA code required")
            if not user.totp_secret or not verify_totp(user.totp_secret, otp_code):
                raise AuthenticationError("Invalid 2FA code")

        access_token = create_access_token(str(user.id), scopes=["wallet:read", "wallet:write"])
        refresh_token, token_id = create_refresh_token(str(user.id))

        await self.redis.setex(f"refresh:{token_id}", settings.refresh_token_expire_days * 86400, str(user.id))

        return access_token, refresh_token, user

    async def refresh_token(self, refresh_token: str) -> tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except Exception:
            raise AuthenticationError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type")

        token_id = payload.get("token_id")
        user_id = payload.get("sub")

        stored = await self.redis.get(f"refresh:{token_id}")
        if not stored:
            raise AuthenticationError("Refresh token expired or revoked")

        await self.redis.delete(f"refresh:{token_id}")

        new_access = create_access_token(user_id, scopes=["wallet:read", "wallet:write"])
        new_refresh, new_token_id = create_refresh_token(user_id)
        await self.redis.setex(f"refresh:{new_token_id}", settings.refresh_token_expire_days * 86400, user_id)

        return new_access, new_refresh

    async def enable_2fa(self, user_id: uuid.UUID, secret: str, code: str) -> bool:
        if not verify_totp(secret, code):
            raise ValidationError("Invalid TOTP code")

        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        user.totp_secret = secret
        user.is_2fa_enabled = True
        await self.repo.update(user)

        return True

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
            token_id = payload.get("token_id")
            await self.redis.delete(f"refresh:{token_id}")
        except Exception:
            pass