"""Merchant ID generation.

'M' + 9 digits. Random, not sequential (see transactions/policy.py for the
same rationale) — uniqueness is enforced by the DB index and the service
layer retries a handful of times on collision.
"""

import re
import secrets

MERCHANT_ID_PREFIX = "M"
MERCHANT_ID_DIGITS = 9
MERCHANT_ID_PATTERN = re.compile(rf"^{MERCHANT_ID_PREFIX}\d{{{MERCHANT_ID_DIGITS}}}$")


def generate_merchant_id_no() -> str:
    digits = "".join(secrets.choice("0123456789") for _ in range(MERCHANT_ID_DIGITS))
    return f"{MERCHANT_ID_PREFIX}{digits}"


def is_valid_merchant_id_no(value: str) -> bool:
    return bool(MERCHANT_ID_PATTERN.fullmatch(value))
