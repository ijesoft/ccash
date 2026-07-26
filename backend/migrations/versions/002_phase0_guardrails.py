"""phase 0 guardrails: amount/balance checks and unique transaction reference

These are backstops, not the primary guard. Amounts are validated in
app.domains.transactions.policy; these constraints exist so that a future code
path that forgets to validate cannot corrupt balances silently.

Revision ID: 002
Revises: 001
Create Date: 2026-07-26

"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A negative amount would make update_balance() credit the sender and debit
    # the recipient, i.e. run the transfer backwards.
    op.create_check_constraint("ck_transactions_amount_positive", "transactions", "amount_cents > 0")
    op.create_check_constraint("ck_transactions_fee_non_negative", "transactions", "fee_cents >= 0")
    op.create_check_constraint(
        "ck_transactions_net_amount_positive", "transactions", "net_amount_cents > 0"
    )

    # Self-transfer: balance-neutral, but it burns the daily limit and pollutes
    # history with a phantom row. One-sided rows (cash in/out) stay legal.
    op.create_check_constraint(
        "ck_transactions_distinct_wallets",
        "transactions",
        "sender_wallet_id IS NULL OR receiver_wallet_id IS NULL "
        "OR sender_wallet_id <> receiver_wallet_id",
    )

    # A wallet must never go negative, whatever path wrote to it.
    op.create_check_constraint("ck_wallets_balance_non_negative", "wallets", "balance_cents >= 0")

    # Customer-facing reference must identify exactly one transaction. NULLs are
    # permitted so rows created before Phase 0 remain valid.
    op.create_index(
        "ix_transactions_reference", "transactions", ["reference"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_reference", table_name="transactions")
    op.drop_constraint("ck_wallets_balance_non_negative", "wallets", type_="check")
    op.drop_constraint("ck_transactions_distinct_wallets", "transactions", type_="check")
    op.drop_constraint("ck_transactions_net_amount_positive", "transactions", type_="check")
    op.drop_constraint("ck_transactions_fee_non_negative", "transactions", type_="check")
    op.drop_constraint("ck_transactions_amount_positive", "transactions", type_="check")
