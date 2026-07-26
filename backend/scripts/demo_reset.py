import asyncio
import sys

sys.path.insert(0, str(__file__).parent.parent)

from app.config import settings
from app.core.security import hash_password
from app.database import async_session_factory, create_tables
from app.domains.auth.models import User, UserStatus
from app.domains.wallets.models import Wallet, WalletStatus
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType

SEED_USERS = [
    ("admin@ccash.ph", "Admin123!", "Admin", "User", 10_000_000),
    ("alice@ccash.ph", "Alice123!", "Alice", "Doe", 5_000_000),
    ("bob@ccash.ph", "Bob123!", "Bob", "Smith", 2_500_000),
]


async def reset():
    await create_tables()

    async with async_session_factory() as session:
        result = await session.execute("SELECT id FROM users")
        existing = result.fetchall()
        if existing:
            await session.execute("TRUNCATE notifications, transactions, favorites, kyc_documents, audit_logs, wallets, users CASCADE")
            await session.commit()

        users = []
        for email, password, first_name, last_name, balance in SEED_USERS:
            user = User(
                email=email,
                phone=f"0918{hash(password)[:10]}",
                first_name=first_name,
                last_name=last_name,
                password_hash=hash_password(password),
                status=UserStatus.ACTIVE,
                is_verified=True,
            )
            session.add(user)
            users.append(user)

        await session.flush()

        wallet_admin = Wallet(user_id=users[0].id, balance_cents=balance, status=WalletStatus.ACTIVE)
        wallet_alice = Wallet(user_id=users[1].id, balance_cents=balance, status=WalletStatus.ACTIVE)
        wallet_bob = Wallet(user_id=users[2].id, balance_cents=balance, status=WalletStatus.ACTIVE)

        session.add_all([wallet_admin, wallet_alice, wallet_bob])
        await session.flush()

        txs = [
            Transaction(
                idempotency_key=f"seed-cashin-{i}",
                type=TransactionType.CASH_IN,
                status=TransactionStatus.SUCCESS,
                receiver_wallet_id=wallet_alice.id,
                amount_cents=100_000,
                fee_cents=0,
                net_amount_cents=100_000,
                description="Initial cash in",
            )
            for i in range(1)
        ] + [
            Transaction(
                idempotency_key=f"seed-cashin-{i + 10}",
                type=TransactionType.CASH_IN,
                status=TransactionStatus.SUCCESS,
                receiver_wallet_id=wallet_bob.id,
                amount_cents=50_000,
                fee_cents=0,
                net_amount_cents=50_000,
                description="Initial cash in",
            )
            for i in range(1)
        ] + [
            Transaction(
                idempotency_key=f"seed-send-{i}",
                type=TransactionType.SEND,
                status=TransactionStatus.SUCCESS,
                sender_wallet_id=wallet_alice.id,
                receiver_wallet_id=wallet_bob.id,
                amount_cents=10_000,
                fee_cents=0,
                net_amount_cents=10_000,
                description="Payment for lunch",
            )
            for i in range(1)
        ] + [
            Transaction(
                idempotency_key=f"seed-cashout-{i}",
                type=TransactionType.CASH_OUT,
                status=TransactionStatus.SUCCESS,
                sender_wallet_id=wallet_bob.id,
                amount_cents=5_000,
                fee_cents=0,
                net_amount_cents=5_000,
                description="ATM withdrawal",
            )
            for i in range(1)
        ]

        session.add_all(txs)
        await session.commit()

        print("Demo reset complete!")
        print(f"  Admin: admin@ccash.ph / Admin123!  (₱{wallet_admin.balance_cents / 100:,.2f})")
        print(f"  Alice: alice@ccash.ph / Alice123!  (₱{wallet_alice.balance_cents / 100:,.2f})")
        print(f"  Bob:   bob@ccash.ph   / Bob123!    (₱{wallet_bob.balance_cents / 100:,.2f})")


def hash(s: str) -> str:
    from app.core.security import hash_password
    return hash_password(s)


if __name__ == "__main__":
    asyncio.run(reset())