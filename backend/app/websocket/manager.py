"""Per-user WebSocket tracking with cross-worker fan-out.

The backend runs under ``uvicorn --workers 4``, so the process that handles a
transfer mutation is usually **not** the process holding the recipient's socket.
A purely in-memory registry therefore dropped every push silently: the
notification row was written, but the recipient's screen never updated until a
manual refresh.

Delivery is routed through a Redis pub/sub channel instead. Every worker
subscribes; whichever worker owns the socket performs the actual send.
"""

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

PUSH_CHANNEL = "ccash:ws:push"
_RETRY_DELAY_SECONDS = 1


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._listener: asyncio.Task | None = None

    # ------------------------------------------------------------ connections

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.connections:
            self.connections[user_id] = [ws for ws in self.connections[user_id] if ws != websocket]
            if not self.connections[user_id]:
                del self.connections[user_id]

    # --------------------------------------------------------------- delivery

    async def send_to_user(self, user_id: str, message: dict):
        """Fan a message out to every worker; the one holding the socket sends it.

        Never raises: a transport failure must not fail the financial mutation
        that triggered the notification. The notification row is already durable,
        so the client still sees it on the next fetch.
        """
        try:
            redis = await get_redis()
            await redis.publish(
                PUSH_CHANNEL, json.dumps({"user_id": user_id, "message": message})
            )
        except Exception:
            logger.warning("WebSocket fan-out failed; delivering locally only", exc_info=True)
            await self.deliver_local(user_id, message)

    async def deliver_local(self, user_id: str, message: dict):
        """Write to sockets held by *this* process."""
        payload = json.dumps(message)
        for ws in list(self.connections.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(user_id, ws)

    async def broadcast(self, message: dict):
        for user_id in list(self.connections.keys()):
            await self.send_to_user(user_id, message)

    # --------------------------------------------------------------- listener

    async def start_listener(self) -> None:
        if self._listener and not self._listener.done():
            return
        self._listener = asyncio.create_task(self._listen())

    async def stop_listener(self) -> None:
        if not self._listener:
            return
        self._listener.cancel()
        try:
            await self._listener
        except asyncio.CancelledError:
            pass
        self._listener = None

    async def _listen(self) -> None:
        while True:
            try:
                redis = await get_redis()
                pubsub = redis.pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(PUSH_CHANNEL)
                try:
                    async for raw in pubsub.listen():
                        if raw.get("type") != "message":
                            continue
                        try:
                            envelope = json.loads(raw["data"])
                            await self.deliver_local(envelope["user_id"], envelope["message"])
                        except Exception:
                            logger.warning("Discarding malformed push", exc_info=True)
                finally:
                    await pubsub.aclose()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Redis restart or a transient drop: back off and resubscribe
                # rather than leaving this worker permanently deaf.
                logger.warning("Push listener dropped; retrying", exc_info=True)
                await asyncio.sleep(_RETRY_DELAY_SECONDS)


manager = ConnectionManager()
