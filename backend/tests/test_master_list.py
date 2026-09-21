import uuid

import pytest

from app.domains.master_list.service import MasterListService


def test_master_list_model_imports():
    from app.domains.master_list.models import MasterListEntry

    assert MasterListEntry.__tablename__ == "master_list_entries"


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


@pytest.mark.asyncio
async def test_list_entries_search_filters_across_fields(session):
    svc = MasterListService(session)
    await svc.create_entry(
        id_no="100000001", first_name="Liza", last_name="Dela Cruz",
        mobile_number="09170000001", email="liza@example.ph",
    )
    await svc.create_entry(
        id_no="100000002", first_name="Marco", last_name="Reyes",
        mobile_number="09170000002", email="marco@example.ph",
    )
    entries, total = await svc.list_entries(limit=20, offset=0, q="liza")
    assert total == 1
    assert entries[0].id_no == "100000001"

    entries, total = await svc.list_entries(limit=20, offset=0, q="100000002")
    assert total == 1
    assert entries[0].email == "marco@example.ph"

    entries, total = await svc.list_entries(limit=20, offset=0, q="no-such-person")
    assert total == 0
    assert entries == []


@pytest.mark.asyncio
async def test_list_entries_pagination_returns_page_and_total(session):
    svc = MasterListService(session)
    for n in range(3):
        await svc.create_entry(
            id_no=f"20000000{n}", first_name=f"Page{n}", last_name="Test",
            mobile_number=f"0917111111{n}", email=f"page{n}@example.ph",
        )
    page1, total = await svc.list_entries(limit=2, offset=0)
    assert total == 3
    assert len(page1) == 2
    page2, total2 = await svc.list_entries(limit=2, offset=2)
    assert total2 == 3
    assert len(page2) == 1
    assert {e.id for e in page1}.isdisjoint({e.id for e in page2})


def test_import_template_headers_parse_cleanly():
    from io import BytesIO

    from openpyxl import load_workbook

    from app.domains.admin.batch_import import parse_member_rows
    from app.domains.master_list.template import TEMPLATE_FILENAME, build_template_bytes

    assert TEMPLATE_FILENAME == "master_list_import_template.xlsx"
    raw = build_template_bytes()
    wb = load_workbook(filename=BytesIO(raw))
    headers = [c.value for c in wb["Master List"][1]]
    assert headers == [
        "9-DIGIT ID NO.",
        "Last Name",
        "First Name",
        "Middle Name",
        "Mobile Number",
        "Email Address",
    ]
    assert parse_member_rows(raw, TEMPLATE_FILENAME) == []
