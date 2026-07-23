from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from strawberry.fastapi import GraphQLRouter

from app.config import settings
from app.database import close_db, create_tables
from app.graphql.middleware import get_context
from app.graphql.schema import schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    Instrumentator().instrument(app).expose(app)
    yield
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

graphql_router = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_router, prefix="/graphql")


@app.get("/health")
async def health():
    return {"status": "ok"}