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
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.repository import UserRepository
from app.domains.wallets.repository import WalletRepository
from app.tasks.notifications import send_email_notification


def _scopes_for(user: User) -> list[str]:
    scopes = ["wallet:read", "wallet:write"]
    if user.role == UserRole.ADMIN:
        scopes.append("admin")
    return scopes


class AuthService:
    def __init__(self, session: AsyncSession, redis: Redis):
        self.repo = UserRepository(session)
        self.session = session
        self.redis = redis

    async def register(self, email: str, phone: str, password: str, first_name: str | None = None, last_name: str | None = None) -> User:
        existing = await self.repo.get_by_email(email)
        if existing:
            raise ValidationError("Email already registered")

        existing = await self.repo.get_by_phone(phone)
        if existing:
            raise ValidationError("Phone already registered")

        password_hash = hash_password(password)
        user = await self.repo.create(email, phone, password_hash, first_name, last_name)
        await self.session.commit()

        otp = generate_otp()
        await self.redis.setex(f"otp:{email}", 300, otp)

        send_email_notification.delay(
            to_email=email,
            subject="Verify your CCash account",
            body=f"Your verification code is: {otp}\n\nThis code expires in 5 minutes.",
        )

        return user

    async def setup_verify_totp(self, email: str) -> tuple[str, str]:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        secret = generate_totp_secret()
        uri = f"otpauth://totp/CCash:{email}?secret={secret}&issuer=CCash"
        await self.redis.setex(f"verify_totp_secret:{email}", 600, secret)

        return secret, uri

    async def verify_otp(self, email: str, code: str) -> bool:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        verified = False

        # Try email OTP first
        stored = await self.redis.get(f"otp:{email}")
        if stored and stored == code:
            verified = True
            await self.redis.delete(f"otp:{email}")

        # Fall back to TOTP (authenticator app)
        if not verified:
            secret = await self.redis.get(f"verify_totp_secret:{email}")
            if secret and verify_totp(secret, code):
                verified = True
                await self.redis.delete(f"verify_totp_secret:{email}")

        if not verified:
            raise ValidationError("Invalid or expired code")

        user.is_verified = True
        user.status = UserStatus.ACTIVE
        await self.repo.update(user)

        wallet_repo = WalletRepository(self.session)
        existing_wallet = await wallet_repo.get_by_user_id(user.id)
        if not existing_wallet:
            await wallet_repo.create(user.id)

        await self.session.commit()

        return True

    async def send_login_otp(self, email: str) -> bool:
        user = await self.repo.get_by_email(email)
        if not user:
            raise NotFoundError("User not found")

        otp = generate_otp()
        await self.redis.setex(f"login_otp:{email}", 300, otp)

        send_email_notification.delay(
            to_email=email,
            subject="Your CCash login code",
            body=f"Your login verification code is: {otp}\n\nThis code expires in 5 minutes.",
        )

        return True

    async def login(self, email: str, password: str, otp_code: str | None = None) -> tuple[str, str, User]:
        user = await self.repo.get_by_email(email)

        if not user:
            hash_password(password)
            raise AuthenticationError("Invalid credentials")

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")

        if user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Account is not active")

        if user.is_2fa_enabled:
            if not otp_code:
                raise ValidationError("2FA code required")

            # Try TOTP (authenticator app) first
            if user.totp_secret and verify_totp(user.totp_secret, otp_code):
                pass  # TOTP verified
            else:
                # Fall back to email OTP
                stored = await self.redis.get(f"login_otp:{email}")
                if not stored or stored != otp_code:
                    raise AuthenticationError("Invalid 2FA code")
                # Consume the OTP so it cannot be reused
                await self.redis.delete(f"login_otp:{email}")

        access_token = create_access_token(str(user.id), scopes=_scopes_for(user))
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

        user = await self._load_user_or_raise(user_id)

        stored = await self.redis.get(f"refresh:{token_id}")
        if not stored:
            raise AuthenticationError("Refresh token expired or revoked")

        await self.redis.delete(f"refresh:{token_id}")

        new_access = create_access_token(user_id, scopes=_scopes_for(user))
        new_refresh, new_token_id = create_refresh_token(user_id)
        await self.redis.setex(f"refresh:{new_token_id}", settings.refresh_token_expire_days * 86400, user_id)

        return new_access, new_refresh

    async def _load_user_or_raise(self, user_id: str) -> User:
        try:
            uid = uuid.UUID(user_id)
        except (ValueError, TypeError):
            raise AuthenticationError("Invalid refresh token")
        user = await self.repo.get_by_id(uid)
        if not user:
            raise AuthenticationError("Invalid refresh token")
        return user

    async def enable_2fa(self, user_id: uuid.UUID, secret: str, code: str) -> bool:
        if not verify_totp(secret, code):
            raise ValidationError("Invalid TOTP code")

        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        user.totp_secret = secret
        user.is_2fa_enabled = True
        await self.repo.update(user)
        await self.session.commit()

        return True

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
            token_id = payload.get("token_id")
            await self.redis.delete(f"refresh:{token_id}")
        except Exception:
            pass