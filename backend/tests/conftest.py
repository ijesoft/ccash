"""Test fixtures.

Tests run against a real PostgreSQL database (``ccash_test`` by default, or
``TEST_DATABASE_URL``) built by Alembic, not by ``SQLModel.metadata.create_all``.
That matters: the DB CHECK constraints from migration 002 are part of what these
tests assert, and ``create_all`` would not produce them.
"""

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.security import hash_password
from app.domains.auth.models import User, UserStatus
from app.domains.wallets.models import Wallet

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = "migrations/alembic.ini"
TEST_DB_NAME = "ccash_test"

# Migrations are expensive and idempotent; run them once per process.
_migrated: set[str] = set()


def test_database_url() -> str:
    if url := os.environ.get("TEST_DATABASE_URL"):
        return url
    base, _, _ = settings.database_url.rpartition("/")
    return f"{base}/{TEST_DB_NAME}"


async def _create_database_if_missing(url: str) -> None:
    raw = url.replace("+asyncpg", "")
    database = urlparse(raw).path.lstrip("/")
    admin_url = raw[: raw.rindex("/")] + "/postgres"

    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", database)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{database}"')
    finally:
        await conn.close()


def _run_migrations(url: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", ALEMBIC_INI, "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env={**os.environ, "DATABASE_URL": url},
        check=True,
        capture_output=True,
    )


async def _ensure_migrated(url: str) -> None:
    if url in _migrated:
        return
    await _create_database_if_missing(url)
    _run_migrations(url)
    _migrated.add(url)


@pytest_asyncio.fixture
async def session() -> AsyncSession:
    url = test_database_url()
    await _ensure_migrated(url)

    engine = create_async_engine(url, poolclass=NullPool)
    try:
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db_session:
            yield db_session

        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE notifications, transactions, favorites, "
                    "kyc_documents, audit_logs, wallets, users CASCADE"
                )
            )
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def make_account(session: AsyncSession):
    """Create a verified user with an active wallet at a given balance."""

    counter = {"n": 0}

    async def _make(balance_cents: int = 100_000, **wallet_kwargs) -> tuple[User, Wallet]:
        counter["n"] += 1
        n = counter["n"]

        user = User(
            email=f"user{n}@ccash.test",
            phone=f"0918000{n:04d}",
            password_hash=hash_password("Test123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        session.add(user)
        await session.flush()

        wallet = Wallet(user_id=user.id, balance_cents=balance_cents, **wallet_kwargs)
        session.add(wallet)
        await session.flush()
        await session.commit()

        return user, wallet

    return _make
