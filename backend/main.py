#!/usr/bin/env python3
"""
DragonSlayer Backend API
FastAPI + asyncpg + PostgreSQL — Railway deployment
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import init_db, close_db
from routers import auth, saves, embed, admin, leaderboard, expeditions, items, nft, arena

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL env var is required")
    await init_db(DATABASE_URL)
    logger.info("🚀 DragonSlayer API started")
    yield
    await close_db()
    logger.info("🛑 DragonSlayer API stopped")


app = FastAPI(
    title="DragonSlayer API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the game frontend + any embed origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(saves.router)
app.include_router(embed.router)
app.include_router(admin.router)
app.include_router(leaderboard.router)
app.include_router(expeditions.router)
app.include_router(items.router)
app.include_router(nft.router)
app.include_router(arena.router)


@app.get("/health")
async def health():
    from database import get_pool
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            tables = await conn.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            )
            table_names = [r["tablename"] for r in tables]
        return {
            "status": "ok",
            "service": "dragonslayer-api",
            "db": "connected",
            "tables": table_names,
        }
    except Exception as e:
        return {"status": "degraded", "service": "dragonslayer-api", "db_error": str(e)}


@app.post("/api/setup")
async def manual_setup():
    """Force table creation — safe to call multiple times (IF NOT EXISTS)."""
    from database import create_tables
    try:
        await create_tables()
        return {"success": True, "message": "Tables created / verified"}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
