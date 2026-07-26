"""Masking of identifiers shown to a counterparty.

A user should be able to recognise who they are transacting with without the
platform disclosing a full mobile number to anyone who happens to receive money
from them.
"""

MASK_CHAR = "•"
_VISIBLE_PREFIX = 4
_VISIBLE_SUFFIX = 3


def mask_mobile(mobile: str | None) -> str:
    """'09180000003' -> '0918••••003'. Short or missing numbers mask entirely."""
    if not mobile:
        return ""

    digits = "".join(char for char in mobile if char.isdigit())
    if len(digits) <= _VISIBLE_PREFIX + _VISIBLE_SUFFIX:
        return MASK_CHAR * len(digits)

    hidden = len(digits) - _VISIBLE_PREFIX - _VISIBLE_SUFFIX
    return f"{digits[:_VISIBLE_PREFIX]}{MASK_CHAR * hidden}{digits[-_VISIBLE_SUFFIX:]}"
