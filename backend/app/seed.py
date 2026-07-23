import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database import async_session_factory, create_tables
from app.domains.auth.models import User, UserStatus
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType
from app.domains.wallets.models import Wallet, WalletStatus


async def seed():
    await create_tables()

    async with async_session_factory() as session:
        admin = User(
            id=uuid.uuid4(),
            email="admin@ccash.ph",
            phone="09180000001",
            password_hash=hash_password("Admin123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        user1 = User(
            id=uuid.uuid4(),
            email="alice@ccash.ph",
            phone="09180000002",
            password_hash=hash_password("Alice123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        user2 = User(
            id=uuid.uuid4(),
            email="bob@ccash.ph",
            phone="09180000003",
            password_hash=hash_password("Bob123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
        )

        session.add_all([admin, user1, user2])
        await session.flush()

        wallet_admin = Wallet(user_id=admin.id, balance_cents=10000000)
        wallet1 = Wallet(user_id=user1.id, balance_cents=500000)
        wallet2 = Wallet(user_id=user2.id, balance_cents=250000)

        session.add_all([wallet_admin, wallet1, wallet2])
        await session.flush()

        txs = [
            Transaction(
                idempotency_key=str(uuid.uuid4()),
                type=TransactionType.CASH_IN,
                status=TransactionStatus.SUCCESS,
                receiver_wallet_id=wallet1.id,
                amount_cents=100000,
                net_amount_cents=100000,
                description="Initial cash in",
            ),
            Transaction(
                idempotency_key=str(uuid.uuid4()),
                type=TransactionType.CASH_IN,
                status=TransactionStatus.SUCCESS,
                receiver_wallet_id=wallet2.id,
                amount_cents=50000,
                net_amount_cents=50000,
                description="Initial cash in",
            ),
            Transaction(
                idempotency_key=str(uuid.uuid4()),
                type=TransactionType.SEND,
                status=TransactionStatus.SUCCESS,
                sender_wallet_id=wallet1.id,
                receiver_wallet_id=wallet2.id,
                amount_cents=10000,
                net_amount_cents=10000,
                description="Payment for lunch",
            ),
            Transaction(
                idempotency_key=str(uuid.uuid4()),
                type=TransactionType.CASH_OUT,
                status=TransactionStatus.SUCCESS,
                sender_wallet_id=wallet2.id,
                amount_cents=5000,
                net_amount_cents=5000,
                description="ATM withdrawal",
            ),
        ]

        session.add_all(txs)
        await session.commit()

        print("Seed data created successfully!")
        print(f"  Admin: admin@ccash.ph / Admin123!")
        print(f"  Alice: alice@ccash.ph / Alice123!")
        print(f"  Bob: bob@ccash.ph / Bob123!")


if __name__ == "__main__":
    asyncio.run(seed())