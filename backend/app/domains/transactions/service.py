import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    DailyLimitExceededError,
    DuplicateTransactionError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType
from app.domains.transactions.repository import TransactionRepository
from app.domains.wallets.models import WalletStatus
from app.domains.wallets.repository import WalletRepository


class TransactionService:
    def __init__(self, session: AsyncSession):
        self.tx_repo = TransactionRepository(session)
        self.wallet_repo = WalletRepository(session)
        self.session = session

    async def send_money(
        self,
        sender_user_id: uuid.UUID,
        receiver_wallet_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> Transaction:
        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return existing

        sender_wallet = await self.wallet_repo.get_by_user_id(sender_user_id)
        if not sender_wallet:
            raise NotFoundError("Sender wallet not found")
        if sender_wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Sender wallet is not active")

        receiver_wallet = await self.wallet_repo.get_for_update(receiver_wallet_id)
        if not receiver_wallet:
            raise NotFoundError("Receiver wallet not found")
        if receiver_wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Receiver wallet is not active")

        # Re-lock sender wallet
        sender_wallet = await self.wallet_repo.get_for_update(sender_wallet.id)

        if sender_wallet.balance_cents < amount_cents:
            raise InsufficientFundsError("Insufficient balance")

        daily_remaining = sender_wallet.daily_send_limit_cents - sender_wallet.daily_send_used_cents
        if daily_remaining < amount_cents:
            raise DailyLimitExceededError("Daily send limit exceeded")

        fee_cents = 0
        net_amount = amount_cents - fee_cents

        tx = Transaction(
            idempotency_key=idempotency_key,
            type=TransactionType.SEND,
            status=TransactionStatus.SUCCESS,
            sender_wallet_id=sender_wallet.id,
            receiver_wallet_id=receiver_wallet.id,
            amount_cents=amount_cents,
            fee_cents=fee_cents,
            net_amount_cents=net_amount,
            description=description,
            created_by=sender_user_id,
        )
        await self.tx_repo.create(tx)

        await self.wallet_repo.update_balance(sender_wallet.id, -amount_cents)
        await self.wallet_repo.update_balance(receiver_wallet.id, net_amount)
        await self.wallet_repo.update_daily_usage(sender_wallet.id, amount_cents)

        await self.session.flush()
        return tx

    async def cash_in(
        self,
        user_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> Transaction:
        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return existing

        wallet = await self.wallet_repo.get_for_update(
            (await self.wallet_repo.get_by_user_id(user_id)).id
        )
        if not wallet:
            raise NotFoundError("Wallet not found")

        tx = Transaction(
            idempotency_key=idempotency_key,
            type=TransactionType.CASH_IN,
            status=TransactionStatus.SUCCESS,
            receiver_wallet_id=wallet.id,
            amount_cents=amount_cents,
            fee_cents=0,
            net_amount_cents=amount_cents,
            description=description,
            created_by=user_id,
        )
        await self.tx_repo.create(tx)
        await self.wallet_repo.update_balance(wallet.id, amount_cents)
        await self.session.flush()
        return tx

    async def cash_out(
        self,
        user_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> Transaction:
        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return existing

        wallet = await self.wallet_repo.get_for_update(
            (await self.wallet_repo.get_by_user_id(user_id)).id
        )
        if not wallet:
            raise NotFoundError("Wallet not found")
        if wallet.balance_cents < amount_cents:
            raise InsufficientFundsError("Insufficient balance")

        tx = Transaction(
            idempotency_key=idempotency_key,
            type=TransactionType.CASH_OUT,
            status=TransactionStatus.SUCCESS,
            sender_wallet_id=wallet.id,
            amount_cents=amount_cents,
            fee_cents=0,
            net_amount_cents=amount_cents,
            description=description,
            created_by=user_id,
        )
        await self.tx_repo.create(tx)
        await self.wallet_repo.update_balance(wallet.id, -amount_cents)
        await self.session.flush()
        return tx

    async def get_transaction(self, tx_id: uuid.UUID) -> Transaction:
        tx = await self.tx_repo.get_by_id(tx_id)
        if not tx:
            raise NotFoundError("Transaction not found")
        return tx

    async def list_transactions(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
        tx_type: str | None = None,
        status: str | None = None,
    ) -> tuple[list[Transaction], int]:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            return [], 0
        return await self.tx_repo.list_by_wallet(wallet.id, limit, offset, tx_type, status)

    async def get_statement(
        self, user_id: uuid.UUID, from_date: datetime, to_date: datetime
    ) -> list[Transaction]:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            return []
        return await self.tx_repo.get_statement(wallet.id, from_date, to_date)