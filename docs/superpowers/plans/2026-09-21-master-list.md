# Master List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only Master List roster (standalone table + page + Excel import) with 9-digit ID, names, mobile, email, and status (ACTIVE/INACTIVE).

**Architecture:** New `master_list` domain following the existing per-domain pattern (`models.py → repository.py → service.py → graphql.py`); GraphQL for list + single-add, REST multipart endpoint for Excel/CSV batch upload (reusing `parse_member_rows`); new admin-only frontend page at `/master-list` with nav entry immediately after History.

**Tech Stack:** Python 3.13 / FastAPI / Strawberry GraphQL / SQLModel / Alembic / openpyxl (already in requirements) — React 19 / Apollo Client / MUI DataGrid.

---

## File structure (what gets created / modified and why)

- Create: `backend/app/domains/master_list/__init__.py` — empty package marker (matches every other domain).
- Create: `backend/app/domains/master_list/models.py` — `MasterListEntry` SQLModel + `MasterListStatus` enum (ACTIVE/INACTIVE), one responsibility: table shape.
- Create: `backend/app/domains/master_list/repository.py` — DB access only (get by id/id_no/email/mobile, list paginated, create). Filters `deleted_at.is_(None)`.
- Create: `backend/app/domains/master_list/service.py` — validation (9-digit ID, 11-digit mobile, email, status ACTIVE/INACTIVE) + uniqueness checks + `session.commit()`.
- Create: `backend/app/domains/master_list/graphql.py` — `MasterListType`, `MasterListQueries`, `MasterListMutations`, all gated by `require_admin`.
- Modify: `backend/app/graphql/schema.py` — add `MasterListQueries` / `MasterListMutations` to `Query` / `Mutation` inheritance.
- Create: `backend/migrations/versions/007_master_list.py` — `master_list_entries` table + unique indexes. Keeps Alembic in sync with `create_tables()`.
- Create: `backend/app/api/master_list.py` — REST `POST /master-list/batch` for `.csv`/`.xlsx` upload (multipart, same rationale as `admin_members.py`).
- Modify: `backend/app/main.py` — include new router with prefix `/admin`.
- Create: `backend/tests/test_master_list.py` — service validation, uniqueness, list pagination, soft-delete filter.
- Create: `frontend/src/graphql/queries/masterList.ts` — `GET_MASTER_LIST`, `MASTER_LIST_CREATE_ENTRY`.
- Create: `frontend/src/pages/MasterList.tsx` — admin page: DataGrid table + Add button + Import button.
- Create: `frontend/src/components/MasterListAddDialog.tsx` — single-add form (copy of `AddMemberDialog` shape, no temp password).
- Create: `frontend/src/components/MasterListImportDialog.tsx` — Excel import dialog (copy of `BatchUploadDialog` shape, posts to new URL).
- Modify: `frontend/src/App.tsx` — add `/master-list` route behind `AdminRoute`.
- Modify: `frontend/src/components/Layout.tsx` — add Master List nav immediately after History, admin-only.

---

### Task 1: MasterList model + repository

**Files:**
- Create: `backend/app/domains/master_list/__init__.py`
- Create: `backend/app/domains/master_list/models.py`
- Create: `backend/app/domains/master_list/repository.py`
- Test: `backend/tests/test_master_list.py`

- [ ] **Step 1: Write the failing model import test**

```python
def test_master_list_model_imports():
    from app.domains.master_list.models import MasterListEntry

    assert MasterListEntry.__tablename__ == "master_list_entries"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py::test_master_list_model_imports -v`
Expected: FAIL with "No module named 'app.domains.master_list'" (module does not exist yet).

- [ ] **Step 3: Create package marker**

File `backend/app/domains/master_list/__init__.py`:
```python
```

- [ ] **Step 4: Create the model**

File `backend/app/domains/master_list/models.py`:
```python
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, func
from sqlmodel import Field, SQLModel


class MasterListStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class MasterListEntry(SQLModel, table=True):
    """Standalone admin roster row. Not a login account: no password, no
    wallet, no role. Uniqueness mirrors Member rules (id_no, email, mobile)."""

    __tablename__ = "master_list_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    id_no: str = Field(unique=True, index=True, max_length=9)
    last_name: str = Field(max_length=100)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    mobile_number: str = Field(unique=True, index=True, max_length=20)
    email: str = Field(unique=True, index=True, max_length=255)
    status: MasterListStatus = Field(default=MasterListStatus.ACTIVE, sa_type=Enum(MasterListStatus))

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": func.now()},
    )
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    version: int = Field(default=1)

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
```

- [ ] **Step 5: Create the repository**

File `backend/app/domains/master_list/repository.py`:
```python
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.master_list.models import MasterListEntry


class MasterListRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, entry_id: uuid.UUID) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.id == entry_id,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_id_no(self, id_no: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.id_no == id_no,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_email(self, email: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.email == email,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get_by_mobile(self, mobile_number: str) -> MasterListEntry | None:
        result = await self.session.execute(
            select(MasterListEntry).where(
                MasterListEntry.mobile_number == mobile_number,
                MasterListEntry.deleted_at.is_(None),
            )
        )
        return result.scalars().first()

    async def list_entries(self, limit: int = 20, offset: int = 0) -> tuple[list[MasterListEntry], int]:
        total = (
            await self.session.execute(
                select(func.count(MasterListEntry.id)).where(MasterListEntry.deleted_at.is_(None))
            )
        ).scalar() or 0
        result = await self.session.execute(
            select(MasterListEntry)
            .where(MasterListEntry.deleted_at.is_(None))
            .order_by(MasterListEntry.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def create(self, entry: MasterListEntry) -> MasterListEntry:
        self.session.add(entry)
        await self.session.flush()
        return entry
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py::test_master_list_model_imports -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/domains/master_list/__init__.py backend/app/domains/master_list/models.py backend/app/domains/master_list/repository.py backend/tests/test_master_list.py
git commit -m "feat(master-list): add MasterListEntry model and repository"
```

---

### Task 2: MasterList service (validation mirrors AdminService.create_member)

**Files:**
- Create: `backend/app/domains/master_list/service.py`
- Test: `backend/tests/test_master_list.py`

- [ ] **Step 1: Write the failing validation test**

Append to `backend/tests/test_master_list.py`:
```python
import pytest
import uuid

from app.domains.master_list.service import MasterListService


@pytest.mark.asyncio
async def test_create_master_list_entry_rejects_bad_id_no(session):
    svc = MasterListService(session)
    with pytest.raises(Exception, match="9 digits"):
        await svc.create_entry(
            id_no="123",
            first_name="Juan",
            last_name="Cruz",
            mobile_number="09171234567",
            email="juan@example.ph",
            actor_id=uuid.uuid4(),
        )
```

Note: `session` fixture already exists in `backend/tests/conftest.py` (real `ccash_test` DB, Alembic-migrated, truncated between tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py::test_create_master_list_entry_rejects_bad_id_no -v`
Expected: FAIL with "No module named 'app.domains.master_list.service'".

- [ ] **Step 3: Write minimal service implementation**

File `backend/app/domains/master_list/service.py`:
```python
import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.core.masking import normalize_philippine_mobile
from app.domains.master_list.models import MasterListEntry, MasterListStatus
from app.domains.master_list.repository import MasterListRepository


class MasterListService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = MasterListRepository(session)

    async def create_entry(
        self,
        id_no: str,
        first_name: str,
        last_name: str,
        mobile_number: str,
        email: str,
        middle_name: str | None = None,
        status: str | MasterListStatus = MasterListStatus.ACTIVE,
        actor_id: uuid.UUID | None = None,
    ) -> MasterListEntry:
        id_no = (id_no or "").strip()
        first_name = (first_name or "").strip()
        last_name = (last_name or "").strip()
        middle_name = (middle_name or "").strip() or None
        mobile_number = (mobile_number or "").strip()
        email = (email or "").strip()

        if not re.fullmatch(r"\d{9}", id_no):
            raise ValidationError(f"ID No. must be exactly 9 digits: got '{id_no}'")
        if not first_name or not last_name:
            raise ValidationError("First name and last name are required")
        if not re.fullmatch(r"\d{11}", mobile_number):
            raise ValidationError(f"Mobile number must be exactly 11 digits: got '{mobile_number}'")
        if not email or "@" not in email:
            raise ValidationError(f"Invalid email address: '{email}'")
        try:
            status_enum = status if isinstance(status, MasterListStatus) else MasterListStatus(str(status).strip().upper())
        except ValueError:
            raise ValidationError(f"Status must be ACTIVE or INACTIVE: got '{status}'")

        normalized_mobile = normalize_philippine_mobile(mobile_number) or mobile_number

        if await self.repo.get_by_id_no(id_no):
            raise ValidationError(f"ID No. already registered: {id_no}")
        if await self.repo.get_by_email(email):
            raise ValidationError(f"Email already registered: {email}")
        if await self.repo.get_by_mobile(normalized_mobile):
            raise ValidationError(f"Mobile number already registered: {mobile_number}")

        entry = MasterListEntry(
            id_no=id_no,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            mobile_number=normalized_mobile,
            email=email,
            status=status_enum,
            created_by=actor_id,
        )
        await self.repo.create(entry)
        await self.session.commit()
        return entry

    async def list_entries(self, limit: int = 20, offset: int = 0):
        return await self.repo.list_entries(limit, offset)

    async def update_entry(
        self,
        entry_id: uuid.UUID,
        first_name: str | None = None,
        last_name: str | None = None,
        middle_name: str | None = None,
        mobile_number: str | None = None,
        email: str | None = None,
        status: str | MasterListStatus | None = None,
    ) -> MasterListEntry:
        """Admin-only update. Only provided fields change; id_no is immutable
        (it is the stable roster key). Uniqueness re-checked for email/mobile."""
        from app.core.errors import NotFoundError

        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise NotFoundError("Master List entry not found")

        if first_name is not None:
            first_name = first_name.strip()
            if not first_name:
                raise ValidationError("First name cannot be empty")
            entry.first_name = first_name
        if last_name is not None:
            last_name = last_name.strip()
            if not last_name:
                raise ValidationError("Last name cannot be empty")
            entry.last_name = last_name
        if middle_name is not None:
            entry.middle_name = middle_name.strip() or None
        if mobile_number is not None:
            mobile_number = mobile_number.strip()
            if not re.fullmatch(r"\d{11}", mobile_number):
                raise ValidationError(f"Mobile number must be exactly 11 digits: got '{mobile_number}'")
            normalized = normalize_philippine_mobile(mobile_number) or mobile_number
            existing = await self.repo.get_by_mobile(normalized)
            if existing and existing.id != entry.id:
                raise ValidationError(f"Mobile number already registered: {mobile_number}")
            entry.mobile_number = normalized
        if email is not None:
            email = email.strip()
            if not email or "@" not in email:
                raise ValidationError(f"Invalid email address: '{email}'")
            existing = await self.repo.get_by_email(email)
            if existing and existing.id != entry.id:
                raise ValidationError(f"Email already registered: {email}")
            entry.email = email
        if status is not None:
            try:
                entry.status = status if isinstance(status, MasterListStatus) else MasterListStatus(str(status).strip().upper())
            except ValueError:
                raise ValidationError(f"Status must be ACTIVE or INACTIVE: got '{status}'")

        entry.version += 1
        self.session.add(entry)
        await self.session.commit()
        return entry
```

Validation intentionally lives in the service layer: `Field(ge=...)` on a SQLModel table model is column metadata and is never validated at runtime (per AGENTS.md). DB unique indexes (migration 007) are the backstop.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Add uniqueness + happy-path tests**

Append to `backend/tests/test_master_list.py`:
```python
@pytest.mark.asyncio
async def test_create_master_list_entry_happy_path(session):
    svc = MasterListService(session)
    entry = await svc.create_entry(
        id_no="111222333",
        first_name="Maria",
        last_name="Santos",
        middle_name="Reyes",
        mobile_number="09171234567",
        email="maria@example.ph",
        actor_id=None,
    )
    assert entry.id_no == "111222333"
    assert entry.mobile_number == "09171234567"
    assert entry.status.value == "ACTIVE"


@pytest.mark.asyncio
async def test_create_master_list_entry_inactive_and_rejects_bad_status(session):
    from app.domains.master_list.models import MasterListStatus

    svc = MasterListService(session)
    entry = await svc.create_entry(
        id_no="777888999",
        first_name="Jose",
        last_name="Rizal",
        mobile_number="09173333333",
        email="jose@example.ph",
        status="INACTIVE",
    )
    assert entry.status == MasterListStatus.INACTIVE
    with pytest.raises(Exception, match="ACTIVE or INACTIVE"):
        await svc.create_entry(
            id_no="000111222",
            first_name="X",
            last_name="Y",
            mobile_number="09174444444",
            email="x@example.ph",
            status="UNKNOWN",
        )


@pytest.mark.asyncio
async def test_create_master_list_entry_rejects_duplicate_id_no(session):
    svc = MasterListService(session)
    await svc.create_entry(
        id_no="444555666",
        first_name="A",
        last_name="B",
        mobile_number="09171111111",
        email="a@example.ph",
    )
    with pytest.raises(Exception, match="already registered"):
        await svc.create_entry(
            id_no="444555666",
            first_name="C",
            last_name="D",
            mobile_number="09172222222",
            email="c@example.ph",
        )
```

- [ ] **Step 6: Run tests**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py -v`
Expected: all PASS.

- [ ] **Step 6b: Add update test (admin-only path)**

Append to `backend/tests/test_master_list.py`:
```python
@pytest.mark.asyncio
async def test_update_master_list_entry_changes_status_and_mobile(session):
    svc = MasterListService(session)
    entry = await svc.create_entry(
        id_no="999888777",
        first_name="Ana",
        last_name="Cruz",
        mobile_number="09175555555",
        email="ana@example.ph",
    )
    updated = await svc.update_entry(entry.id, status="INACTIVE", mobile_number="09176666666")
    assert updated.status.value == "INACTIVE"
    assert updated.mobile_number == "09176666666"
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/domains/master_list/service.py backend/tests/test_master_list.py
git commit -m "feat(master-list): add service with member-parity validation"
```

---

### Task 3: GraphQL types, queries, mutations (all admin-only) + schema wiring

**Files:**
- Create: `backend/app/domains/master_list/graphql.py`
- Modify: `backend/app/graphql/schema.py`

- [ ] **Step 1: Create GraphQL module**

File `backend/app/domains/master_list/graphql.py`:
```python
import enum

import strawberry
from strawberry.types import Info

from app.core.errors import ValidationError
from app.database import async_session_factory
from app.domains.master_list.models import MasterListEntry, MasterListStatus
from app.domains.master_list.service import MasterListService
from app.graphql.middleware import require_admin


@strawberry.enum
class MasterListStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


@strawberry.type
class MasterListType:
    id: str
    id_no: str
    last_name: str
    first_name: str
    middle_name: str | None
    mobile_number: str
    email: str
    status: str
    created_at: str

    @classmethod
    def from_model(cls, e: MasterListEntry) -> "MasterListType":
        return cls(
            id=str(e.id),
            id_no=e.id_no,
            last_name=e.last_name,
            first_name=e.first_name,
            middle_name=e.middle_name,
            mobile_number=e.mobile_number,
            email=e.email,
            status=e.status.value if isinstance(e.status, MasterListStatus) else str(e.status),
            created_at=e.created_at.isoformat() if e.created_at else "",
        )


@strawberry.input
class MasterListCreateInput:
    id_no: str
    last_name: str
    first_name: str
    middle_name: str | None = None
    mobile_number: str
    email: str
    status: MasterListStatusEnum = MasterListStatusEnum.ACTIVE


@strawberry.input
class MasterListUpdateInput:
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    mobile_number: str | None = None
    email: str | None = None
    status: MasterListStatusEnum | None = None


@strawberry.type
class MasterListQueries:
    @strawberry.field
    async def master_list_entries(
        self, info: Info, limit: int = 20, offset: int = 0
    ) -> list[MasterListType]:
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entries, _ = await service.list_entries(limit, offset)
            return [MasterListType.from_model(e) for e in entries]
        finally:
            await session.close()


@strawberry.type
class MasterListMutations:
    @strawberry.mutation
    async def master_list_create_entry(self, info: Info, input: MasterListCreateInput) -> MasterListType:
        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entry = await service.create_entry(
                id_no=input.id_no,
                first_name=input.first_name,
                last_name=input.last_name,
                middle_name=input.middle_name,
                mobile_number=input.mobile_number,
                email=input.email,
                status=input.status.value,
                actor_id=info.context.user_id,
            )
            return MasterListType.from_model(entry)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await session.close()

    @strawberry.mutation
    async def master_list_update_entry(
        self, info: Info, entry_id: str, input: MasterListUpdateInput
    ) -> MasterListType:
        """Admin-only update (names, mobile, email, status). id_no is immutable."""
        import uuid

        from app.core.errors import NotFoundError

        require_admin(info.context)
        session = async_session_factory()
        try:
            service = MasterListService(session)
            entry = await service.update_entry(
                uuid.UUID(entry_id),
                first_name=input.first_name,
                last_name=input.last_name,
                middle_name=input.middle_name,
                mobile_number=input.mobile_number,
                email=input.email,
                status=input.status.value if input.status else None,
            )
            return MasterListType.from_model(entry)
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await session.close()
```

Admin-only enforcement (defense in depth, same as existing admin domain):
- `master_list_entries`, `master_list_create_entry`, `master_list_update_entry` each call `require_admin(info.context)` first (from `app.graphql.middleware`, same gate as `platform_stats`/`admin_users`).
- REST `POST /admin/master-list/batch` uses `Depends(require_admin_token)` (same gate as `/admin/members/batch`).
- Frontend `/master-list` route is behind `AdminRoute`, nav entry is `adminOnly` + filtered by `isAdmin` — non-admins never see the buttons, and the backend rejects them anyway.

Pattern notes: per-request session via `async_session_factory()`, `try/finally` with `session.close()`, errors from `app.core.errors` mapped to `Exception(str(e))`, every field gated by `require_admin(info.context)`.

- [ ] **Step 2: Wire into root schema**

Edit `backend/app/graphql/schema.py`:
```python
import strawberry

from app.domains.admin.graphql import AdminMutations, AdminQueries
from app.domains.auth.graphql import AuthMutations, AuthQueries
from app.domains.master_list.graphql import MasterListMutations, MasterListQueries
from app.domains.merchants.graphql import MerchantMutations, MerchantQueries
from app.domains.notifications.graphql import NotificationMutations, NotificationQueries
from app.domains.transactions.graphql import TransactionMutations, TransactionQueries
from app.domains.users.graphql import KycMutations, KycQueries
from app.domains.wallets.graphql import WalletMutations, WalletQueries


@strawberry.type
class Query(
    AdminQueries,
    AuthQueries,
    KycQueries,
    MasterListQueries,
    MerchantQueries,
    NotificationQueries,
    TransactionQueries,
    WalletQueries,
):
    pass


@strawberry.type
class Mutation(
    AdminMutations,
    AuthMutations,
    KycMutations,
    MasterListMutations,
    MerchantMutations,
    NotificationMutations,
    TransactionMutations,
    WalletMutations,
):
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation)
```

- [ ] **Step 3: Verify schema builds**

Run: `cd backend && ./.venv/bin/python -c "from app.graphql.schema import schema; print(str(schema)[:200])"`
Expected: prints SDL fragment with no import error, containing `masterListEntries`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/domains/master_list/graphql.py backend/app/graphql/schema.py
git commit -m "feat(master-list): add admin-only GraphQL queries and mutations"
```

---

### Task 4: Alembic migration 007 + create_tables sync check

**Files:**
- Create: `backend/migrations/versions/007_master_list.py`

- [ ] **Step 1: Write migration**

File `backend/migrations/versions/007_master_list.py`:
```python
"""master list roster: standalone admin table with unique 9-digit ID.

Revision ID: 007
Revises: 006
Create Date: 2026-09-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "master_list_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("id_no", sa.String(length=9), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("middle_name", sa.String(length=100), nullable=True),
        sa.Column("mobile_number", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.Enum("ACTIVE", "INACTIVE", name="masterliststatus"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_master_list_entries_id_no", "master_list_entries", ["id_no"], unique=True)
    op.create_index("ix_master_list_entries_email", "master_list_entries", ["email"], unique=True)
    op.create_index(
        "ix_master_list_entries_mobile_number", "master_list_entries", ["mobile_number"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_master_list_entries_mobile_number", table_name="master_list_entries")
    op.drop_index("ix_master_list_entries_email", table_name="master_list_entries")
    op.drop_index("ix_master_list_entries_id_no", table_name="master_list_entries")
    op.drop_table("master_list_entries")
    # masterliststatus enum type is left defined (same as MERCHANT in 006):
    # Postgres cannot drop an enum value inside a downgrade cleanly, and no
    # other table uses it, so leaving it is harmless.
```

`id` is the UUID primary key; `id_no` is the unique 9-digit member number. `mobile_number`/`email` are unique to match Member parity. `status` follows the Wallet/User pattern exactly: Python `class MasterListStatus(str, enum.Enum)` with ACTIVE/INACTIVE values, model field `status: MasterListStatus = Field(default=MasterListStatus.ACTIVE, sa_type=Enum(MasterListStatus))`, migration `sa.Enum("ACTIVE", "INACTIVE", name="masterliststatus")` non-nullable with no `server_default` (same as `walletstatus`/`userstatus` in 001 — default lives Python-side). Soft-delete (`deleted_at` + `version`) matches every other table.

- [ ] **Step 2: Run migration on dev DB**

Run: `cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head`
Expected: `Running upgrade 006 -> 007` with no error.

- [ ] **Step 3: Verify create_tables() and Alembic stay in sync**

Per AGENTS.md both are sources of truth. Diff a `create_all` DB against an `alembic upgrade head` DB (same procedure the repo used before); at minimum run:
Run: `cd backend && ./.venv/bin/python -m pytest tests/test_master_list.py -v`
Expected: PASS against the Alembic-migrated `ccash_test` DB (conftest migrates with Alembic, so this proves the migration produces a table the model can use).

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/007_master_list.py
git commit -m "feat(master-list): add 007 migration for master_list_entries"
```

---

### Task 5: REST batch upload (Excel) endpoint

**Files:**
- Create: `backend/app/api/master_list.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create REST router (reuses parse_member_rows)**

File `backend/app/api/master_list.py`:
```python
"""Master List batch upload. REST, not GraphQL — same rationale as
app/api/admin_members.py: multipart file upload streams via python-multipart
instead of inflating a base64 GraphQL payload."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.errors import ValidationError
from app.core.rest_auth import require_admin_token
from app.database import async_session_factory
from app.domains.admin.batch_import import BatchImportError, parse_member_rows
from app.domains.master_list.service import MasterListService

MAX_BATCH_ROWS = 5000

router = APIRouter()


@router.post("/master-list/batch")
async def batch_upload_master_list(
    file: UploadFile = File(...), actor_id: uuid.UUID = Depends(require_admin_token)
):
    content = await file.read()
    try:
        rows = parse_member_rows(content, file.filename or "")
    except BatchImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(rows) > MAX_BATCH_ROWS:
        raise HTTPException(
            status_code=400, detail=f"Batch upload is limited to {MAX_BATCH_ROWS} rows per file"
        )

    session = async_session_factory()
    results = []
    created = 0
    try:
        service = MasterListService(session)
        for i, row in enumerate(rows, start=2):  # row 1 is the header
            id_no = row.get("id_no", "")
            email = row.get("email", "")
            try:
                # Batch imports always land as ACTIVE; admin adjusts via
                # single-add status selector (v1 has no edit flow).
                await service.create_entry(
                    id_no=id_no,
                    first_name=row.get("first_name", ""),
                    last_name=row.get("last_name", ""),
                    middle_name=row.get("middle_name") or None,
                    mobile_number=row.get("mobile", ""),
                    email=email,
                    status="ACTIVE",
                    actor_id=actor_id,
                )
                created += 1
                results.append({"row": i, "id_no": id_no, "email": email, "status": "created", "message": None})
            except ValidationError as e:
                results.append({"row": i, "id_no": id_no, "email": email, "status": "error", "message": str(e)})
        return {"total": len(rows), "created": created, "failed": len(rows) - created, "results": results}
    finally:
        await session.close()
```

`parse_member_rows` already accepts the exact requested headers (`9-DIGIT ID NO.`, `Last Name`, `First Name`, `Middle Name`, `Mobile Number`, `Email Address`) via `_HEADER_ALIASES` — no parser change needed. `openpyxl` is already in `backend/requirements.txt`.

- [ ] **Step 2: Register router in main.py**

Edit `backend/app/main.py`, add import + include:
```python
from app.api.master_list import router as master_list_router
```
and after `app.include_router(admin_members_router, prefix="/admin")` add:
```python
app.include_router(master_list_router, prefix="/admin")
```

Result: `POST /admin/master-list/batch`, reachable from the browser as `/api/admin/master-list/batch` via the vite preview proxy (`/api` → 8831).

- [ ] **Step 3: Restart backend and smoke-test route registration**

Run: `pm2 restart ccash-backend && sleep 3 && pm2 logs ccash-backend --lines 20 --nostream`
Expected: backend online, no import traceback. Then:
Run: `curl -s http://localhost:8831/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); print([p for p in d['paths'] if 'master-list' in p])"`
Expected: `['/admin/master-list/batch']`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/master_list.py backend/app/main.py
git commit -m "feat(master-list): add REST Excel batch upload endpoint"
```

---

### Task 6: Backend verification (full suite)

- [ ] **Step 1: Run full pytest suite**

Run: `cd backend && ./.venv/bin/python -m pytest -v`
Expected: all tests PASS (88 pre-existing + new master-list tests).

- [ ] **Step 2: Commit test fixes if any (only if failures)**

```bash
git add -A
git commit -m "fix(master-list): address test failures"
```

---

### Task 7: Frontend — queries, page, dialogs

**Files:**
- Create: `frontend/src/graphql/queries/masterList.ts`
- Create: `frontend/src/pages/MasterList.tsx`
- Create: `frontend/src/components/MasterListAddDialog.tsx`
- Create: `frontend/src/components/MasterListImportDialog.tsx`

- [ ] **Step 1: Create GraphQL operations**

File `frontend/src/graphql/queries/masterList.ts`:
```ts
import { gql } from "@apollo/client";

export const GET_MASTER_LIST = gql`
  query MasterListEntries($limit: Int, $offset: Int) {
    masterListEntries(limit: $limit, offset: $offset) {
      id
      idNo
      lastName
      firstName
      middleName
      mobileNumber
      email
      status
      createdAt
    }
  }
`;

export const MASTER_LIST_CREATE_ENTRY = gql`
  mutation MasterListCreateEntry($input: MasterListCreateInput!) {
    masterListCreateEntry(input: $input) {
      id
      idNo
      lastName
      firstName
      email
      status
    }
  }
`;

export const MASTER_LIST_UPDATE_ENTRY = gql`
  mutation MasterListUpdateEntry($entryId: String!, $input: MasterListUpdateInput!) {
    masterListUpdateEntry(entryId: $entryId, input: $input) {
      id
      idNo
      status
    }
  }
`;
```

- [ ] **Step 2: Create Add dialog (no temp password — roster only)**

File `frontend/src/components/MasterListAddDialog.tsx`:
```tsx
import { useState } from "react";
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert, FormControl, InputLabel, Select, MenuItem,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import { GET_MASTER_LIST, MASTER_LIST_CREATE_ENTRY } from "../graphql/queries/masterList";

interface Props { open: boolean; onClose: () => void; }

export default function MasterListAddDialog({ open, onClose }: Props) {
  const [idNo, setIdNo] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [error, setError] = useState("");
  const [createEntry, { loading }] = useMutation(MASTER_LIST_CREATE_ENTRY, {
    refetchQueries: [{ query: GET_MASTER_LIST }],
  });

  const reset = () => {
    setIdNo(""); setLastName(""); setFirstName(""); setMiddleName("");
    setMobileNumber(""); setEmail(""); setStatus("ACTIVE"); setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createEntry({
        variables: {
          input: {
            idNo, lastName, firstName,
            middleName: middleName || null,
            mobileNumber, email, status,
          },
        },
      });
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Add Master List Member</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField label="9-Digit ID No." value={idNo}
              onChange={(e) => setIdNo(e.target.value.replace(/\D/g, "").slice(0, 9))}
              required fullWidth placeholder="123456789"
              inputProps={{ inputMode: "numeric", maxLength: 9 }} />
            <Stack direction="row" spacing={1.5}>
              <TextField label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required fullWidth />
              <TextField label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required fullWidth />
            </Stack>
            <TextField label="Middle Name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} fullWidth />
            <TextField label="Mobile Number" value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              required fullWidth placeholder="09171234567"
              inputProps={{ inputMode: "numeric", maxLength: 11 }} />
            <TextField label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? "Adding..." : "Add Member"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
```

Strict TS: no unused locals/params (`noUnusedLocals`, `noUnusedParameters` are enforced).

- [ ] **Step 3: Create Import dialog (posts to new endpoint)**

File `frontend/src/components/MasterListImportDialog.tsx`: identical structure to `BatchUploadDialog.tsx` except:
- `DialogTitle`: `Import Master List`
- helper text: `Upload a .csv or .xlsx file with columns: 9-Digit ID No., Last Name, First Name, Middle Name (optional), Mobile Number, Email Address. All imported rows are created as ACTIVE.`
- fetch URL: `/api/admin/master-list/batch` (vite proxy strips `/api` → backend `/admin/master-list/batch`)
- props and result table identical (`RowResult`, `BatchResponse`, Total/Created/Failed chips).

Copy `frontend/src/components/BatchUploadDialog.tsx` to the new file and apply exactly those three string changes.

- [ ] **Step 4: Create the page**

File `frontend/src/pages/MasterList.tsx`:
```tsx
import { useState } from "react";
import { Box, Typography, Button, Stack, Snackbar, Alert, Chip } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { GET_MASTER_LIST } from "../graphql/queries/masterList";
import MasterListAddDialog from "../components/MasterListAddDialog";
import MasterListImportDialog from "../components/MasterListImportDialog";

export default function MasterList() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });

  const { data, loading, refetch } = useQuery(GET_MASTER_LIST, {
    variables: { limit: paginationModel.pageSize, offset: paginationModel.page * paginationModel.pageSize },
  });
  const rows = data?.masterListEntries ?? [];

  const columns: GridColDef[] = [
    { field: "idNo", headerName: "9-Digit ID No.", width: 130 },
    { field: "lastName", headerName: "Last Name", flex: 1, minWidth: 140 },
    { field: "firstName", headerName: "First Name", flex: 1, minWidth: 140 },
    { field: "middleName", headerName: "Middle Name", flex: 1, minWidth: 120 },
    { field: "mobileNumber", headerName: "Mobile Number", width: 150 },
    { field: "email", headerName: "Email Address", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === "ACTIVE" ? "success" : "default"}
          variant={params.value === "ACTIVE" ? "filled" : "outlined"}
        />
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" rowGap={1}>
        <Typography variant="h5" fontWeight="bold">Master List</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
            Add Member
          </Button>
          <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import Excel
          </Button>
        </Stack>
      </Stack>
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid rows={rows} columns={columns} loading={loading}
          paginationModel={paginationModel} onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[5, 10, 25]} disableRowSelectionOnClick
          sx={{ border: 1, borderColor: "divider", borderRadius: 2 }} />
      </Box>
      <MasterListAddDialog open={addOpen} onClose={() => { setAddOpen(false); refetch(); }} />
      <MasterListImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onUploaded={() => { refetch(); setSnackbar({ open: true, message: "Import complete" }); }}
      />
      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="success" variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
```

Scope per your answers: list + add + import only (no edit/delete/search in v1).

- [ ] **Step 5: Typecheck the new frontend files**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/graphql/queries/masterList.ts frontend/src/pages/MasterList.tsx frontend/src/components/MasterListAddDialog.tsx frontend/src/components/MasterListImportDialog.tsx
git commit -m "feat(master-list): add Master List page with add and Excel import"
```

---

### Task 8: Routing + navigation (After History, admin-only)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add route behind AdminRoute**

Edit `frontend/src/App.tsx`: add import
```tsx
import MasterList from "./pages/MasterList";
```
and inside the protected `<Route element={...}>` block, after the transactions route:
```tsx
<Route path="/master-list" element={<AdminRoute><MasterList /></AdminRoute>} />
```
Full block order: `/` → `/wallet` → `/send` → `/qr-payment` → `/transactions` → `/master-list` → `/profile` … (`AdminRoute` matches the existing `/admin` and `/wallet-balances` pattern).

- [ ] **Step 2: Add nav entry immediately after History, admin-only**

In `frontend/src/components/Layout.tsx`, add the icon import:
```tsx
import ListAltIcon from "@mui/icons-material/ListAlt";
```
Change `primaryNav` to carry an admin flag and insert the entry right after History:
```tsx
const primaryNav = [
  { label: "Home", icon: <HomeIcon />, path: "/" },
  { label: "Wallet", icon: <AccountBalanceWalletIcon />, path: "/wallet" },
  { label: "Send", icon: <SendIcon />, path: "/send" },
  { label: "QR", icon: <QrCodeIcon />, path: "/qr-payment" },
  { label: "History", icon: <ReceiptIcon />, path: "/transactions" },
  { label: "Master List", icon: <ListAltIcon />, path: "/master-list", adminOnly: true },
];
```
Then filter where both navs render. In the drawer list replace `primaryNav.map` with `primaryNav.filter((i) => !("adminOnly" in i && i.adminOnly) || isAdmin).map`, and in the mobile `BottomNavigation` replace `primaryNav.map` the same way (so non-admins never see it on desktop or mobile, and it sits directly after History for admins).

`isAdmin` comes from the existing `useAuth()` in the same file — no new context needed.

- [ ] **Step 3: Rebuild frontend and restart**

Run: `cd frontend && npm run build && pm2 restart ccash-frontend`
Expected: `vite build` succeeds (`✓ built in ...`), pm2 shows `ccash-frontend` online.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(master-list): add Master List route and nav after History"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Run backend suite once more**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: all PASS.

- [ ] **Step 2: Manual check as admin (admin@ccash.ph)**

1. Log in as admin, open sidebar → Master List appears directly after History.
2. Add Member with ID `123456789`, Status ACTIVE → row appears in grid with green ACTIVE chip. Add another as INACTIVE → grey chip.
3. Import Excel with the 6 headers (`9-DIGIT ID NO.`, `Last Name`, `First Name`, `Middle Name`, `Mobile Number`, `Email Address`) → per-row Created/Error report; imported rows show ACTIVE.
4. Non-admin login (alice@ccash.ph) → `/master-list` redirects (AdminRoute) and no nav entry. Direct GraphQL `masterListEntries` / `masterListCreateEntry` / `masterListUpdateEntry` with a non-admin token returns "Not authorized", and `POST /api/admin/master-list/batch` without an admin token returns 401/403 (backend gates, not just hidden buttons).

- [ ] **Step 3: Check backend logs**

Run: `pm2 logs ccash-backend --lines 50 --nostream`
Expected: no traceback on list/create/import.

---

## Self-review

1. **Spec coverage:** new table with `id` PK + unique 9-digit ID + 4 name/mobile/email columns + status ACTIVE/INACTIVE (Task 1/4); admin-only single-add and admin-only update with status selector (Tasks 2/3/7); Excel import defaulting to ACTIVE behind admin token (Task 5/7); new page with status chip column behind AdminRoute + adminOnly nav (Tasks 7/8). All covered.
2. **Placeholder scan:** no TBD/TODO; every file has complete code; every command has expected output.
3. **Type consistency:** model fields (`id_no`, `mobile_number`, `status`) match GraphQL `MasterListType`/`MasterListCreateInput`/`MasterListStatusEnum`, frontend queries, and REST `parse_member_rows` mapping (`mobile` → `mobile_number`). `created_by` FK matches `users.id`. Strawberry enum inherits from `str, enum.Enum` per AGENTS.md.
