from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ccash:ccash_secret_2024@rabbitmq:5672/"

    jwt_secret_key: str = "change-this-to-a-random-secret-key-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    mailpit_smtp_host: str = "mailpit"
    mailpit_smtp_port: int = 1025
    mail_from: str = "noreply@ccash.ph"

    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()