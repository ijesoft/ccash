"""Unit tests for amount policy, reference generation and masking. No DB."""

import re

import pytest

from app.core.errors import ValidationError
from app.core.masking import mask_mobile
from app.core.money import format_php
from app.domains.transactions.policy import (
    MAX_TRANSACTION_CENTS,
    MIN_TRANSACTION_CENTS,
    generate_reference,
    validate_amount,
)


@pytest.mark.parametrize(
    "amount", [MIN_TRANSACTION_CENTS, 5_000, MAX_TRANSACTION_CENTS - 1, MAX_TRANSACTION_CENTS]
)
def test_validate_amount_accepts_in_range(amount):
    validate_amount(amount)


@pytest.mark.parametrize(
    "amount", [-1_000_000, -1, 0, MIN_TRANSACTION_CENTS - 1, MAX_TRANSACTION_CENTS + 1]
)
def test_validate_amount_rejects_out_of_range(amount):
    with pytest.raises(ValidationError):
        validate_amount(amount)


@pytest.mark.parametrize("amount", [5_000.5, "5000", None, True])
def test_validate_amount_rejects_non_integers(amount):
    """`True` is an int subclass in Python; a bool must not pass as an amount."""
    with pytest.raises(ValidationError):
        validate_amount(amount)


def test_reference_format_is_stable_and_unambiguous():
    reference = generate_reference()
    assert re.fullmatch(r"CC\d{6}[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}", reference)
    # No characters that are ambiguous when read aloud or retyped.
    assert not set("ILOU") & set(reference[8:])


def test_references_do_not_repeat():
    assert len({generate_reference() for _ in range(1_000)}) == 1_000


from app.core.masking import mask_mobile, normalize_philippine_mobile


@pytest.mark.parametrize(
    "mobile,expected",
    [
        ("09180000003", "09180000003"),
        ("+639180000003", "09180000003"),
        ("639180000003", "09180000003"),
        ("9180000003", "09180000003"),
        ("0918-000-0003", "09180000003"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_philippine_mobile(mobile, expected):
    assert normalize_philippine_mobile(mobile) == expected


@pytest.mark.parametrize(
    "mobile,expected",
    [
        ("09180000003", "0918••••003"),
        ("+63 918 000 0003", "0918••••003"),
        ("0918000", "•••••••"),
        ("", ""),
        (None, ""),
    ],
)
def test_mask_mobile(mobile, expected):
    assert mask_mobile(mobile) == expected


@pytest.mark.parametrize(
    "cents,expected",
    [(0, "₱0.00"), (5, "₱0.05"), (5_000, "₱50.00"), (123_456_789, "₱1,234,567.89"), (-5_000, "-₱50.00")],
)
def test_format_php(cents, expected):
    assert format_php(cents) == expected


def test_generate_otp_is_six_digits_and_varies():
    from app.core.security import generate_otp

    seen = {generate_otp() for _ in range(200)}
    assert len(seen) > 190
    assert all(re.fullmatch(r"\d{6}", code) for code in seen)


def test_decode_access_token_rejects_refresh_tokens():
    from app.core.security import (
        create_access_token,
        create_refresh_token,
        decode_access_token,
    )

    user_id = "11111111-1111-1111-1111-111111111111"
    assert decode_access_token(create_access_token(user_id))["type"] == "access"
    refresh, _ = create_refresh_token(user_id)
    with pytest.raises(Exception):
        decode_access_token(refresh)


def test_graphql_context_rejects_refresh_token():
    import asyncio

    from starlette.requests import Request

    from app.core.security import create_refresh_token
    from app.graphql.middleware import get_context

    refresh, _ = create_refresh_token("11111111-1111-1111-1111-111111111111")
    scope = {"type": "http", "headers": [(b"authorization", f"Bearer {refresh}".encode())]}
    context = asyncio.run(get_context(Request(scope)))
    assert context.user_id is None
