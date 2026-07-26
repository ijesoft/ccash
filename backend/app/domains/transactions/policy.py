"""Transaction amount policy and reference-number generation.

Amount bounds are enforced here, in the service layer, because Pydantic field
constraints on SQLModel ``table=True`` models (``Field(ge=0)``) are treated as
column metadata and are never validated at runtime. The matching DB CHECK
constraints in migration 002 are the backstop, not the primary guard.
"""

import secrets
from datetime import datetime, timezone

from app.core.errors import ValidationError
from app.core.money import pesos

MIN_TRANSACTION_CENTS = 100  # ₱1.00
MAX_TRANSACTION_CENTS = 10_000_000  # ₱100,000.00

# Crockford-style alphabet: no I, L, O or U, so a reference read over the phone
# or retyped from a screenshot is unambiguous.
_REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_REFERENCE_RANDOM_LEN = 8
_REFERENCE_PREFIX = "CC"


def validate_amount(amount_cents: int) -> None:
    """Reject anything that is not a positive, in-range whole number of centavos.

    Guards against the negative-amount case, where ``update_balance(sender,
    -amount)`` would credit the sender and debit the recipient.
    """
    if isinstance(amount_cents, bool) or not isinstance(amount_cents, int):
        raise ValidationError("Amount must be a whole number of centavos")
    if amount_cents < MIN_TRANSACTION_CENTS:
        raise ValidationError(f"Minimum amount is PHP {pesos(MIN_TRANSACTION_CENTS):,}")
    if amount_cents > MAX_TRANSACTION_CENTS:
        raise ValidationError(
            f"Maximum amount per transaction is PHP {pesos(MAX_TRANSACTION_CENTS):,}"
        )


def generate_reference() -> str:
    """Customer-facing reference, e.g. 'CC260726H7K2QP3M'.

    Date prefix so support can bucket by day; random suffix so references are
    not guessable or enumerable. Uniqueness is enforced by a DB index.
    """
    stamp = datetime.now(timezone.utc).strftime("%y%m%d")
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(_REFERENCE_RANDOM_LEN))
    return f"{_REFERENCE_PREFIX}{stamp}{suffix}"
