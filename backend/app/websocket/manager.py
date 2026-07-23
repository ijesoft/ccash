import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.connections:
            self.connections[user_id] = [ws for ws in self.connections[user_id] if ws != websocket]
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.connections:
            for ws in self.connections[user_id]:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    pass

    async def broadcast(self, message: dict):
        for user_id in list(self.connections.keys()):
            await self.send_to_user(user_id, message)


manager = ConnectionManager()