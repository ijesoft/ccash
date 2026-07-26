#!/usr/bin/env python
"""Prove that a recipient's screen updates live when money arrives.

This is the one failure mode that no unit test catches: the WebSocket registry
is per-process, so under ``uvicorn --workers N`` the worker handling a transfer
is usually not the worker holding the recipient's socket. Pushes are fanned out
over Redis pub/sub to fix that, and this script verifies the fan-out end to end
against a *running* deployment.

Run it before every demo:

    backend/.venv/bin/python scripts/verify_realtime.py

Environment:
    CCASH_API      GraphQL endpoint  (default http://localhost:8831/graphql)
    CCASH_WS       WebSocket URL     (default ws://localhost:8830/ws — the port
                                     the browser actually uses)
"""

import asyncio
import json
import os
import sys
import urllib.request
import uuid

API = os.environ.get("CCASH_API", "http://localhost:8831/graphql")
WS = os.environ.get("CCASH_WS", "ws://localhost:8830/ws")
AMOUNT_CENTS = 1_500
TIMEOUT_SECONDS = 10


def graphql(query: str, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        API, data=json.dumps({"query": query}).encode(), headers=headers
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.load(response)
    if "errors" in payload:
        raise RuntimeError(payload["errors"])
    return payload["data"]


def login(email: str, password: str) -> str:
    data = graphql(f'mutation{{login(email:"{email}",password:"{password}"){{accessToken}}}}')
    return data["login"]["accessToken"]


async def main() -> int:
    import websockets

    sender_token = login("alice@ccash.ph", "Alice123!")
    recipient_token = login("bob@ccash.ph", "Bob123!")
    recipient_wallet = graphql("{wallet{id}}", recipient_token)["wallet"]["id"]

    async with websockets.connect(f"{WS}?token={recipient_token}") as socket:
        await asyncio.sleep(0.5)  # let the subscription settle

        reference = graphql(
            f'mutation{{sendMoney(input:{{receiverWalletId:"{recipient_wallet}",'
            f'amountCents:{AMOUNT_CENTS},idempotencyKey:"realtime-{uuid.uuid4()}",'
            f'description:"realtime check"}}){{reference}}}}',
            sender_token,
        )["sendMoney"]["reference"]

        try:
            raw = await asyncio.wait_for(socket.recv(), timeout=TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            print(f"FAIL  no push within {TIMEOUT_SECONDS}s (transfer {reference} did commit)")
            print("      Likely cause: workers are not subscribed to the Redis push channel.")
            return 1

    message = json.loads(raw).get("data", {})
    if message.get("type") != "TRANSFER_RECEIVED":
        print(f"FAIL  unexpected push type {message.get('type')!r}")
        return 1

    print(f"PASS  live push delivered: {message.get('body')!r} (ref {reference})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
