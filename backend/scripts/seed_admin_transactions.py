"""Seed admin transaction history mirroring the production screenshot.

Replicates the amounts, types (Transfer=SEND, QR Payment=QR_PAYMENT),
directions and dates seen on the deployed Transaction History page, with
alice/bob as the local counterparties. Replaces the earlier `seed-admin-*`
demo rows. Idempotent: rows are keyed by `seed-tx-*` idempotency keys and
skipped when already present. Wallet balances are left untouched.

Run against the live docker DB:
    docker exec -i ccash-backend python - < backend/scripts/seed_admin_transactions.py
"""

import asyncio
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "backend")

from sqlalchemy import delete, select

from app.database import async_session_factory
from app.domains.auth.models import User
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType
from app.domains.wallets.models import Wallet

PHT = timezone(timedelta(hours=8))
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _ref_for(dt_pht: datetime) -> str:
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"CC{dt_pht.strftime('%y%m%d')}{suffix}"


# (key, type, sender_email, receiver_email, cents, Manila datetime, description)
SPECS = [
    ("seed-tx-01", TransactionType.SEND, "admin@ccash.ph", "alice@ccash.ph",
     3_000_000, datetime(2026, 9, 11, 11, 44), "Fund transfer"),
    ("seed-tx-02", TransactionType.QR_PAYMENT, "admin@ccash.ph", "bob@ccash.ph",
     50_000, datetime(2026, 9, 11, 11, 37), "QR payment"),
    ("seed-tx-03", TransactionType.QR_PAYMENT, "alice@ccash.ph", "admin@ccash.ph",
     250_000, datetime(2026, 9, 10, 22, 48), "QR payment"),
    ("seed-tx-04", TransactionType.QR_PAYMENT, "alice@ccash.ph", "admin@ccash.ph",
     71_300, datetime(2026, 9, 10, 15, 16), "QR payment"),
    ("seed-tx-05", TransactionType.QR_PAYMENT, "admin@ccash.ph", "alice@ccash.ph",
     375_000, datetime(2026, 9, 10, 15, 11), "QR payment"),
    ("seed-tx-06", TransactionType.QR_PAYMENT, "admin@ccash.ph", "bob@ccash.ph",
     50_000, datetime(2026, 9, 10, 15, 1), "QR payment"),
    ("seed-tx-07", TransactionType.SEND, "bob@ccash.ph", "admin@ccash.ph",
     150_000, datetime(2026, 8, 25, 20, 46), "Fund transfer"),
    ("seed-tx-08", TransactionType.SEND, "admin@ccash.ph", "bob@ccash.ph",
     500_000, datetime(2026, 8, 25, 20, 43), "Fund transfer"),
    ("seed-tx-09", TransactionType.SEND, "admin@ccash.ph", "alice@ccash.ph",
     500_000, datetime(2026, 8, 25, 20, 40), "Fund transfer"),
]


async def main() -> None:
    async with async_session_factory() as session:
        wallets = {}
        for email in ("admin@ccash.ph", "alice@ccash.ph", "bob@ccash.ph"):
            row = await session.execute(
                select(Wallet.id).join(User, User.id == Wallet.user_id).where(User.email == email)
            )
            wallets[email] = row.scalar_one_or_none()
        if wallets["admin@ccash.ph"] is None:
            print("admin wallet not found, nothing to do")
            return
        admin = (
            await session.execute(select(User).where(User.email == "admin@ccash.ph"))
        ).scalar_one()

        # Replace the earlier placeholder demo rows with the mirrored history.
        old = await session.execute(
            delete(Transaction).where(Transaction.idempotency_key.like("seed-admin-%"))
        )
        print(f"removed {old.rowcount} placeholder row(s)")

        created = 0
        for key, tx_type, sender_email, receiver_email, cents, dt_pht, desc in SPECS:
            sender = wallets.get(sender_email)
            receiver = wallets.get(receiver_email)
            if sender is None or receiver is None:
                print(f"skip {key} (missing wallet)")
                continue
            exists = (
                await session.execute(
                    select(Transaction.id).where(Transaction.idempotency_key == key)
                )
            ).scalar_one_or_none()
            if exists:
                print(f"skip {key} (already seeded)")
                continue
            created_at = dt_pht.replace(tzinfo=PHT).astimezone(timezone.utc)
            session.add(
                Transaction(
                    id=uuid.uuid4(),
                    idempotency_key=key,
                    type=tx_type,
                    status=TransactionStatus.SUCCESS,
                    sender_wallet_id=sender,
                    receiver_wallet_id=receiver,
                    amount_cents=cents,
                    fee_cents=0,
                    net_amount_cents=cents,
                    reference=_ref_for(dt_pht),
                    description=desc,
                    created_at=created_at,
                    created_by=admin.id,
                )
            )
            created += 1
            print(f"seed {key}")

        await session.commit()
        print(f"done, created {created} transaction(s)")


if __name__ == "__main__":
    asyncio.run(main())
