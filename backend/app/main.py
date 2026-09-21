from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator
from strawberry.fastapi import GraphQLRouter

from app.api.admin_members import router as admin_members_router
from app.api.master_list import router as master_list_router
from app.api.branding import router as branding_router
from app.api.reports import admin_router as admin_reports_router
from app.api.reports import router as reports_router
from app.config import settings
from app.core.redis import close_redis, get_redis
from app.core.security import decode_token
from app.database import close_db, create_tables
from app.graphql.middleware import get_context
from app.graphql.schema import schema
from app.middleware.rate_limit import RateLimitMiddleware
from app.websocket.manager import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await get_redis()
    # Each worker must subscribe to the push channel, otherwise a notification
    # raised in one worker never reaches a socket held by another.
    await manager.start_listener()
    yield
    await manager.stop_listener()
    await close_redis()
    await close_db()


app = FastAPI(
    title="CCash API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware)

graphql_router = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_router, prefix="/graphql")

# backend/app/main.py -> backend/ == same dir the branding service resolves
# (backend/static/branding). Nginx strips the /api prefix when proxying, so
# /api/static/branding/* reaches this mount.
BRANDING_DIR = Path(__file__).resolve().parent.parent / "static" / "branding"
BRANDING_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/branding", StaticFiles(directory=str(BRANDING_DIR)), name="branding")
app.include_router(branding_router, prefix="/admin/branding")
app.include_router(reports_router, prefix="/reports")
app.include_router(admin_reports_router, prefix="/admin/reports")
app.include_router(admin_members_router, prefix="/admin")
app.include_router(master_list_router, prefix="/admin")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


Instrumentator().instrument(app).expose(app)

@app.get("/health")
async def health():
    return {"status": "ok"}