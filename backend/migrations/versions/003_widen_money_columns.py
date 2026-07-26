"""widen money columns from integer to bigint

The live schema was created by ``SQLModel.metadata.create_all`` rather than by
Alembic, and the models declared plain ``int`` fields. That produced INTEGER
columns, capping any balance at 2,147,483,647 cents (PHP 21,474,836.47), where
the design spec calls for BIGINT. The models now pin BigInteger; this migration
brings already-deployed databases in line.

Revision ID: 003
Revises: 002
Create Date: 2026-07-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MONEY_COLUMNS = (
    ("transactions", "amount_cents"),
    ("transactions", "fee_cents"),
    ("transactions", "net_amount_cents"),
    ("wallets", "balance_cents"),
    ("wallets", "daily_send_limit_cents"),
    ("wallets", "daily_send_used_cents"),
)


def upgrade() -> None:
    for table, column in MONEY_COLUMNS:
        op.alter_column(
            table, column, existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False
        )


def downgrade() -> None:
    # Narrowing can overflow. Only safe while every stored value fits in INTEGER.
    for table, column in MONEY_COLUMNS:
        op.alter_column(
            table, column, existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False
        )
