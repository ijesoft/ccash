"""Credit memo validation and reference generation."""

import secrets
from datetime import datetime, timezone

from app.core.errors import ValidationError
from app.core.money import format_php
from app.domains.transactions.policy import validate_amount

OPEN_STATUSES = ("FOR_REVIEW", "APPROVED")
MAX_REASON_LENGTH = 1000

_REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_REFERENCE_PREFIX = "CM"


def generate_credit_memo_reference() -> str:
    stamp = datetime.now(timezone.utc).strftime("%y%m%d")
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(8))
    return f"{_REFERENCE_PREFIX}{stamp}{suffix}"


def validate_reason(reason: str | None, *, field: str = "Reason") -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValidationError(f"{field} is required")
    if len(cleaned) > MAX_REASON_LENGTH:
        raise ValidationError(f"{field} must be at most {MAX_REASON_LENGTH} characters")
    return cleaned


def validate_credit_memo_amount(
    amount_cents: int,
    transaction_amount_cents: int,
    already_credited_cents: int,
) -> None:
    validate_amount(amount_cents)
    remaining = transaction_amount_cents - already_credited_cents
    if amount_cents > transaction_amount_cents:
        raise ValidationError(
            f"Disputed amount cannot exceed the transaction amount of "
            f"{format_php(transaction_amount_cents)}"
        )
    if amount_cents > remaining:
        raise ValidationError(
            f"Disputed amount exceeds the remaining creditable amount of "
            f"{format_php(max(remaining, 0))}"
        )
