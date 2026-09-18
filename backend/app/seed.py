import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database import async_session_factory, create_tables
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.merchants.models import MerchantProfile
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType
from app.domains.wallets.models import Wallet, WalletStatus


async def seed():
    await create_tables()

    async with async_session_factory() as session:
        admin = User(
            id=uuid.uuid4(),
            email="admin@ccash.ph",
            phone="09180000001",
            id_no="000000001",
            first_name="Admin",
            last_name="User",
            password_hash=hash_password("Admin123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.ADMIN,
        )
        user1 = User(
            id=uuid.uuid4(),
            email="alice@ccash.ph",
            phone="09180000002",
            id_no="000000002",
            first_name="Alice",
            middle_name="Reyes",
            last_name="Doe",
            password_hash=hash_password("Alice123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.MEMBER,
        )
        user2 = User(
            id=uuid.uuid4(),
            email="bob@ccash.ph",
            phone="09180000003",
            id_no="000000003",
            first_name="Bob",
            middle_name="Cruz",
            last_name="Smith",
            password_hash=hash_password("Bob123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.MEMBER,
        )
        merchant_user = User(
            id=uuid.uuid4(),
            email="merchant@ccash.ph",
            phone="09180000004",
            password_hash=hash_password("Merchant123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.MERCHANT,
        )

        session.add_all([admin, user1, user2, merchant_user])
        await session.flush()

        merchant_profile = MerchantProfile(
            user_id=merchant_user.id,
            merchant_id_no="M000000001",
            company_name="Sample Sari-Sari Store",
            contact_person="Juana Dela Cruz",
            mobile_no="09180000004",
            landline=None,
            address="123 Rizal St., Quezon City",
            tin="123-456-789-000",
        )
        session.add(merchant_profile)
        await session.flush()

        wallet_admin = Wallet(user_id=admin.id, balance_cents=10000000)
        wallet1 = Wallet(user_id=user1.id, balance_cents=500000)
        wallet2 = Wallet(user_id=user2.id, balance_cents=250000)
        wallet_merchant = Wallet(user_id=merchant_user.id, balance_cents=0)

        session.add_all([wallet_admin, wallet1, wallet2, wallet_merchant])
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
        print(f"  Alice (member): alice@ccash.ph / Alice123!")
        print(f"  Bob (member): bob@ccash.ph / Bob123!")
        print(f"  Merchant: merchant@ccash.ph / Merchant123!")


if __name__ == "__main__":
    asyncio.run(seed())