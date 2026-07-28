from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    rabbitmq_url: str

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    resend_api_key: str | None = None

    mailpit_smtp_host: str = "mailpit"
    mailpit_smtp_port: int = 1025
    mail_from: str = "noreply@ccash.ph"

    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


def validate_settings(settings: Settings) -> None:
    if settings.jwt_secret_key == "change-this-to-a-random-secret-key-in-production":
        raise RuntimeError("JWT_SECRET_KEY must be set to a secure random value. Generate with: python -c 'import secrets; print(secrets.token_hex(32))'")


settings = Settings()
validate_settings(settings)