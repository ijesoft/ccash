import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
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
