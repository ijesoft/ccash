"""Per-viewer projections of a transaction.

A transfer is stored as a single row. Whether it is money in or money out is a
property of *who is looking*, not of the row, so direction and counterparty are
resolved per viewer here rather than being read off ``Transaction.type``.
"""

import enum
import uuid
from dataclasses import dataclass

from app.domains.transactions.models import Transaction


class TransactionDirection(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"


@dataclass(frozen=True)
class Counterparty:
    """The other side of a transaction, as shown to the viewer.

    ``name`` is always None until the User model gains name fields (Phase 1);
    clients should fall back to ``masked_mobile``.
    """

    wallet_id: uuid.UUID
    name: str | None
    masked_mobile: str


@dataclass(frozen=True)
class TransactionView:
    transaction: Transaction
    direction: TransactionDirection
    counterparty: Counterparty | None
