import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    AuthorizationError,
    DailyLimitExceededError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.core.masking import mask_mobile, normalize_philippine_mobile
from app.core.money import format_php
from app.domains.auth.models import User
from app.domains.auth.repository import UserRepository
from app.domains.notifications.models import NotificationType
from app.domains.notifications.repository import NotificationRepository
from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType
from app.domains.transactions.policy import generate_reference, validate_amount
from app.domains.transactions.repository import TransactionRepository
from app.domains.transactions.views import Counterparty, TransactionDirection, TransactionView
from app.domains.wallets.models import Wallet, WalletStatus
from app.domains.wallets.repository import WalletRepository
from app.websocket.manager import manager


class TransactionService:
    def __init__(self, session: AsyncSession):
        self.tx_repo = TransactionRepository(session)
        self.wallet_repo = WalletRepository(session)
        self.notif_repo = NotificationRepository(session)
        self.session = session
        # WebSocket pushes are buffered until the DB transaction commits, so a
        # client is never told about money that a rollback then un-moves.
        self._pending_pushes: list[tuple[str, dict]] = []

    # ------------------------------------------------------------------ writes

    async def send_money(
        self,
        sender_user_id: uuid.UUID,
        receiver_wallet_id: uuid.UUID | None,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
        receiver_mobile: str | None = None,
        pin: str | None = None,
        transaction_type: TransactionType = TransactionType.SEND,
    ) -> TransactionView:
        import re as _re

        # Best-practice: never trust client - normalize then enforce 11-digit form.
        if receiver_mobile is not None:
            normalized = normalize_philippine_mobile(receiver_mobile)
            if not normalized or not _re.fullmatch(r"\d{11}", normalized):
                raise ValidationError("Mobile number must be exactly 11 digits (e.g. 09171234567)")
            receiver_mobile = normalized

        validate_amount(amount_cents)

        if pin is not None:
            sender_wallet_pre = await self.wallet_repo.get_by_user_id(sender_user_id)
            if not sender_wallet_pre:
                raise NotFoundError("Sender wallet not found")
            if not sender_wallet_pre.pin_hash:
                raise ValidationError(
                    "MPIN not set. Please set your MPIN in Wallet settings first."
                )
            if not await self.wallet_repo.verify_pin_for_user(sender_wallet_pre.id, pin):
                raise ValidationError("Invalid PIN")

        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return await self._view_for_user(existing, sender_user_id)

        sender_wallet = await self.wallet_repo.get_by_user_id(sender_user_id)
        if not sender_wallet:
            raise NotFoundError("Sender wallet not found")

        resolved_receiver_wallet_id = receiver_wallet_id
        if receiver_mobile and not resolved_receiver_wallet_id:
            user = await self._find_user_by_mobile(receiver_mobile)
            if not user:
                raise NotFoundError("Recipient not found")
            receiver_wallet = await self.wallet_repo.get_by_user_id(user.id)
            if not receiver_wallet:
                receiver_wallet = await self.wallet_repo.create(user.id)
            resolved_receiver_wallet_id = receiver_wallet.id

        if resolved_receiver_wallet_id is None:
            raise ValidationError("Recipient is required")

        if sender_wallet.id == resolved_receiver_wallet_id:
            raise ValidationError("Cannot send money to your own wallet")

        sender_wallet, receiver_wallet = await self._lock_pair(sender_wallet.id, resolved_receiver_wallet_id)
        if not sender_wallet:
            raise NotFoundError("Sender wallet not found")
        if not receiver_wallet:
            raise NotFoundError("Receiver wallet not found")
        if sender_wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Sender wallet is not active")
        if receiver_wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Receiver wallet is not active")
        if sender_wallet.balance_cents < amount_cents:
            raise InsufficientFundsError("Insufficient balance")

        daily_remaining = sender_wallet.daily_send_limit_cents - sender_wallet.daily_send_used_cents
        if daily_remaining < amount_cents:
            raise DailyLimitExceededError("Daily send limit exceeded")

        fee_cents = 0
        net_amount = amount_cents - fee_cents

        if transaction_type not in (TransactionType.SEND, TransactionType.QR_PAYMENT):
            raise ValidationError("Unsupported transfer type")

        is_qr = transaction_type is TransactionType.QR_PAYMENT
        tx = Transaction(
            idempotency_key=idempotency_key,
            reference=generate_reference(),
            type=transaction_type,
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

        owners = await self.wallet_repo.get_owners_by_wallet_ids(
            [sender_wallet.id, receiver_wallet.id]
        )
        await self._queue_notification(
            receiver_wallet.user_id,
            NotificationType.QR_PAYMENT if is_qr else NotificationType.TRANSFER_RECEIVED,
            "QR payment received" if is_qr else "Money received",
            f"You received {format_php(net_amount)} from "
            f"{self._label_for(owners.get(sender_wallet.id))}.",
            tx,
        )
        await self._queue_notification(
            sender_wallet.user_id,
            NotificationType.QR_PAYMENT if is_qr else NotificationType.SENT,
            "QR payment sent" if is_qr else "Money sent",
            f"You sent {format_php(amount_cents)} to "
            f"{self._label_for(owners.get(receiver_wallet.id))}.",
            tx,
        )

        winner = await self._commit(idempotency_key)
        return await self._view_for_user(winner or tx, sender_user_id)

    async def scan_qr_payment(
        self,
        sender_user_id: uuid.UUID,
        payload: str,
        idempotency_key: str,
        amount_cents: int | None = None,
        description: str | None = None,
        pin: str | None = None,
    ) -> TransactionView:
        """Pay via QR by parsing payload, then reusing the transfer path.

        Payload contract (CCASH_PAY):
        - wallet_id: preferred stable recipient UUID
        - to / mobile / receiver: phone or wallet UUID fallback
        - amount_cents: dynamic amount in cents (preferred)
        - amount: pesos (major units). 0 / omitted = static QR (payer enters amount)
        """
        receiver_wallet_id, receiver_mobile, payload_amount_cents, payload_desc = (
            self._parse_qr_payload(payload)
        )

        effective_amount = amount_cents if amount_cents is not None else payload_amount_cents
        if effective_amount is None or effective_amount <= 0:
            raise ValidationError("Please enter an amount to pay")

        if not description and payload_desc:
            description = payload_desc

        if pin is None or not str(pin).strip():
            raise ValidationError("MPIN is required for QR payments")

        return await self.send_money(
            sender_user_id,
            receiver_wallet_id,
            effective_amount,
            idempotency_key,
            description=description,
            receiver_mobile=receiver_mobile,
            pin=pin,
            transaction_type=TransactionType.QR_PAYMENT,
        )

    def _parse_qr_payload(
        self, payload: str
    ) -> tuple[uuid.UUID | None, str | None, int | None, str | None]:
        import json as _json

        raw = (payload or "").strip()
        if not raw:
            raise ValidationError("Invalid QR payload: missing recipient")

        data: dict | None = None
        try:
            parsed = _json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except (_json.JSONDecodeError, TypeError):
            data = None

        receiver_wallet_id: uuid.UUID | None = None
        receiver_mobile: str | None = None
        payload_amount_cents: int | None = None
        payload_desc: str | None = None

        if data is None:
            try:
                receiver_wallet_id = uuid.UUID(raw)
            except (ValueError, AttributeError, TypeError):
                receiver_mobile = normalize_philippine_mobile(raw) or raw
            return receiver_wallet_id, receiver_mobile, None, None

        for key in ("wallet_id", "walletId", "to", "receiver", "mobile"):
            value = data.get(key)
            if value is None or value == "":
                continue
            text_value = str(value).strip()
            if not text_value:
                continue
            if receiver_wallet_id is None:
                try:
                    receiver_wallet_id = uuid.UUID(text_value)
                    continue
                except (ValueError, AttributeError, TypeError):
                    pass
            if receiver_mobile is None:
                normalized = normalize_philippine_mobile(text_value)
                if normalized:
                    receiver_mobile = normalized

        if receiver_wallet_id is None and receiver_mobile is None:
            raise ValidationError("Invalid QR payload: missing recipient")

        if "amount_cents" in data and data.get("amount_cents") is not None:
            try:
                cents = int(data.get("amount_cents"))
            except (TypeError, ValueError):
                raise ValidationError("Invalid QR amount_cents") from None
            if cents > 0:
                payload_amount_cents = cents
        elif "amount" in data and data.get("amount") is not None:
            val = data.get("amount")
            try:
                if isinstance(val, bool):
                    raise ValueError
                pesos = float(val)
            except (TypeError, ValueError):
                raise ValidationError("Invalid QR amount") from None
            if pesos > 0:
                payload_amount_cents = round(pesos * 100)

        payload_desc = data.get("description") or data.get("note")
        if payload_desc is not None:
            payload_desc = str(payload_desc).strip() or None

        return receiver_wallet_id, receiver_mobile, payload_amount_cents, payload_desc

    async def cash_in(
        self,
        user_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> TransactionView:
        validate_amount(amount_cents)

        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return await self._view_for_user(existing, user_id)

        wallet = await self._lock_own_wallet(user_id)
        if wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Wallet is not active")

        tx = Transaction(
            idempotency_key=idempotency_key,
            reference=generate_reference(),
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

        await self._queue_notification(
            wallet.user_id,
            NotificationType.CASH_IN,
            "Cash in successful",
            f"{format_php(amount_cents)} has been added to your wallet.",
            tx,
        )

        winner = await self._commit(idempotency_key)
        return await self._view_for_user(winner or tx, user_id)

    async def cash_out(
        self,
        user_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> TransactionView:
        validate_amount(amount_cents)

        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return await self._view_for_user(existing, user_id)

        wallet = await self._lock_own_wallet(user_id)
        if wallet.status != WalletStatus.ACTIVE:
            raise WalletNotActiveError("Wallet is not active")
        if wallet.balance_cents < amount_cents:
            raise InsufficientFundsError("Insufficient balance")

        tx = Transaction(
            idempotency_key=idempotency_key,
            reference=generate_reference(),
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

        await self._queue_notification(
            wallet.user_id,
            NotificationType.CASH_OUT,
            "Cash out successful",
            f"{format_php(amount_cents)} has been withdrawn from your wallet.",
            tx,
        )

        winner = await self._commit(idempotency_key)
        return await self._view_for_user(winner or tx, user_id)

    # ------------------------------------------------------------------- reads

    async def get_transaction(self, tx_id: uuid.UUID, user_id: uuid.UUID) -> TransactionView:
        tx = await self.tx_repo.get_by_id(tx_id)
        if not tx:
            raise NotFoundError("Transaction not found")

        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet or wallet.id not in (tx.sender_wallet_id, tx.receiver_wallet_id):
            raise AuthorizationError("Transaction does not belong to this account")

        return (await self._build_views([tx], wallet.id))[0]

    async def list_transactions(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
        tx_type: str | None = None,
        status: str | None = None,
    ) -> tuple[list[TransactionView], int]:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            return [], 0

        items, total = await self.tx_repo.list_by_wallet(wallet.id, limit, offset, tx_type, status)
        return await self._build_views(items, wallet.id), total

    async def get_statement(
        self, user_id: uuid.UUID, from_date: datetime, to_date: datetime
    ) -> list[TransactionView]:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            return []

        txs = await self.tx_repo.get_statement(wallet.id, from_date, to_date)
        return await self._build_views(txs, wallet.id)

    # Report generation (PDF/Excel export) wants the full history, unpaginated.
    REPORT_ROW_LIMIT = 100_000

    async def list_for_report(self, user_id: uuid.UUID) -> list[TransactionView]:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            return []

        items, _total = await self.tx_repo.list_by_wallet(wallet.id, limit=self.REPORT_ROW_LIMIT, offset=0)
        return await self._build_views(items, wallet.id)

    # --------------------------------------------------------------- internals

    async def _lock_pair(
        self, sender_wallet_id: uuid.UUID, receiver_wallet_id: uuid.UUID
    ) -> tuple[Wallet | None, Wallet | None]:
        """Lock both wallets in a deterministic order.

        Ordering by id means concurrent A->B and B->A transfers queue behind each
        other instead of deadlocking on each other's row locks.
        """
        locked: dict[uuid.UUID, Wallet | None] = {}
        for wallet_id in sorted((sender_wallet_id, receiver_wallet_id), key=str):
            locked[wallet_id] = await self.wallet_repo.get_for_update(wallet_id)

        return locked.get(sender_wallet_id), locked.get(receiver_wallet_id)

    async def _lock_own_wallet(self, user_id: uuid.UUID) -> Wallet:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            wallet = await self.wallet_repo.create(user_id)

        locked = await self.wallet_repo.get_for_update(wallet.id)
        if not locked:
            raise NotFoundError("Wallet not found")
        return locked

    async def _commit(self, idempotency_key: str) -> Transaction | None:
        """Commit, then release the buffered pushes.

        Returns the winning transaction if a concurrent request already used this
        idempotency key, so a double-submit yields one transfer and two identical
        responses rather than a 500.
        """
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            self._pending_pushes.clear()
            winner = await self.tx_repo.get_by_idempotency_key(idempotency_key)
            if not winner:
                raise
            return winner

        pushes, self._pending_pushes = self._pending_pushes, []
        for user_id, message in pushes:
            await manager.send_to_user(user_id, message)
        return None

    async def _queue_notification(
        self,
        user_id: uuid.UUID,
        notif_type: NotificationType,
        title: str,
        body: str,
        tx: Transaction,
    ) -> None:
        notif = await self.notif_repo.create(
            user_id,
            notif_type,
            title,
            body,
            {
                "transaction_id": str(tx.id),
                "reference": tx.reference,
                "amount_cents": tx.amount_cents,
            },
        )
        self._pending_pushes.append(
            (
                str(user_id),
                {
                    "type": "notification",
                    "data": {
                        "id": str(notif.id),
                        "type": notif.type.value,
                        "title": notif.title,
                        "body": notif.body,
                        "is_read": notif.is_read,
                        "created_at": notif.created_at.isoformat() if notif.created_at else "",
                    },
                },
            )
        )

    async def _view_for_user(self, tx: Transaction, user_id: uuid.UUID) -> TransactionView:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            wallet = await self.wallet_repo.create(user_id)
        return (await self._build_views([tx], wallet.id))[0]

    async def _build_views(
        self, txs: list[Transaction], viewer_wallet_id: uuid.UUID
    ) -> list[TransactionView]:
        counterparty_ids = {
            other
            for tx in txs
            if (other := self._counterparty_wallet_id(tx, viewer_wallet_id)) is not None
        }
        owners = await self.wallet_repo.get_owners_by_wallet_ids(counterparty_ids)

        views: list[TransactionView] = []
        for tx in txs:
            other_id = self._counterparty_wallet_id(tx, viewer_wallet_id)
            owner = owners.get(other_id) if other_id else None
            views.append(
                TransactionView(
                    transaction=tx,
                    direction=self._direction(tx, viewer_wallet_id),
                    counterparty=(
                        Counterparty(
                            wallet_id=other_id,
                            name=None,
                            masked_mobile=mask_mobile(owner.phone),
                            mobile=normalize_philippine_mobile(owner.phone) or None,
                        )
                        if other_id and owner
                        else None
                    ),
                )
            )
        return views

    @staticmethod
    def _direction(tx: Transaction, viewer_wallet_id: uuid.UUID) -> TransactionDirection:
        if tx.receiver_wallet_id == viewer_wallet_id and tx.sender_wallet_id != viewer_wallet_id:
            return TransactionDirection.IN
        return TransactionDirection.OUT

    @staticmethod
    def _counterparty_wallet_id(tx: Transaction, viewer_wallet_id: uuid.UUID) -> uuid.UUID | None:
        if tx.sender_wallet_id and tx.sender_wallet_id != viewer_wallet_id:
            return tx.sender_wallet_id
        if tx.receiver_wallet_id and tx.receiver_wallet_id != viewer_wallet_id:
            return tx.receiver_wallet_id
        return None

    @staticmethod
    def _label_for(user: User | None) -> str:
        return mask_mobile(user.phone) if user else "your wallet"

    async def _find_user_by_mobile(self, mobile: str) -> User | None:
        repo = UserRepository(self.session)
        return await repo.get_by_phone(mobile)

    async def request_money(
        self,
        sender_user_id: uuid.UUID,
        receiver_wallet_id: uuid.UUID,
        amount_cents: int,
        idempotency_key: str,
        description: str | None = None,
    ) -> TransactionView:
        validate_amount(amount_cents)

        existing = await self.tx_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return await self._view_for_user(existing, sender_user_id)

        sender_wallet = await self.wallet_repo.get_by_user_id(sender_user_id)
        if not sender_wallet:
            raise NotFoundError("Sender wallet not found")
        if sender_wallet.id == receiver_wallet_id:
            raise ValidationError("Cannot request money from yourself")

        receiver_wallet = await self.wallet_repo.get_by_id(receiver_wallet_id)
        if not receiver_wallet:
            raise NotFoundError("Receiver wallet not found")

        tx = Transaction(
            idempotency_key=idempotency_key,
            reference=generate_reference(),
            type=TransactionType.SEND,
            status=TransactionStatus.PENDING,
            sender_wallet_id=sender_wallet.id,
            receiver_wallet_id=receiver_wallet.id,
            amount_cents=amount_cents,
            fee_cents=0,
            net_amount_cents=amount_cents,
            description=description,
            created_by=sender_user_id,
        )
        await self.tx_repo.create(tx)

        owners = await self.wallet_repo.get_owners_by_wallet_ids(
            [sender_wallet.id, receiver_wallet.id]
        )
        await self._queue_notification(
            receiver_wallet.user_id,
            NotificationType.TRANSFER_RECEIVED,
            "Money request",
            f"{self._label_for(owners.get(sender_wallet.id))} requested "
            f"{format_php(amount_cents)}.",
            tx,
        )

        await self._commit(idempotency_key)
        return await self._view_for_user(tx, sender_user_id)

    async def respond_to_request(
        self,
        user_id: uuid.UUID,
        tx_id: uuid.UUID,
        approve: bool,
    ) -> TransactionView:
        tx = await self.tx_repo.get_by_id(tx_id)
        if not tx:
            raise NotFoundError("Request not found")

        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet or wallet.id != tx.receiver_wallet_id:
            raise AuthorizationError("Not authorized")

        if tx.status != TransactionStatus.PENDING:
            raise ValidationError("Request is not pending")

        if approve:
            tx.status = TransactionStatus.SUCCESS
            await self.tx_repo.create(tx)
            await self.wallet_repo.update_balance(wallet.id, tx.amount_cents)
            await self.wallet_repo.update_balance(tx.sender_wallet_id, -tx.amount_cents)

            owners = await self.wallet_repo.get_owners_by_wallet_ids(
                [tx.sender_wallet_id, tx.receiver_wallet_id]
            )
            await self._queue_notification(
                tx.sender_wallet_id,
                NotificationType.SENT,
                "Payment completed",
                f"Your request of {format_php(tx.amount_cents)} was paid by "
                f"{self._label_for(owners.get(tx.receiver_wallet_id))}.",
                tx,
            )
            await self._queue_notification(
                tx.receiver_wallet_id,
                NotificationType.TRANSFER_RECEIVED,
                "Request approved",
                f"You paid {format_php(tx.amount_cents)} to "
                f"{self._label_for(owners.get(tx.sender_wallet_id))}.",
                tx,
            )
        else:
            tx.status = TransactionStatus.FAILED
            await self.tx_repo.create(tx)

        await self._commit(str(tx.idempotency_key))
        return await self._view_for_user(tx, user_id)
