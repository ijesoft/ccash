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


@pytest.mark.parametrize(
    "mobile,expected",
    [
        ("09180000003", "0918••••003"),
        # Non-digits are stripped, so an E.164 number masks from its country code.
        ("+63 918 000 0003", "6391•••••003"),
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
