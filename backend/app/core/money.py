"""Money formatting helpers.

All amounts move through the system as ``_cents`` integers. These helpers exist
only for building human-readable strings (notification bodies, error messages);
never parse them back into an amount.
"""

CENTS_PER_PESO = 100


def format_php(cents: int) -> str:
    """1234567 -> '₱12,345.67'"""
    sign = "-" if cents < 0 else ""
    whole, remainder = divmod(abs(cents), CENTS_PER_PESO)
    return f"{sign}₱{whole:,}.{remainder:02d}"


def pesos(cents: int) -> int:
    """Whole pesos, for limit messages. Truncates."""
    return cents // CENTS_PER_PESO
