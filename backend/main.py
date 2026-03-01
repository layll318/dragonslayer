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
from routers import auth, saves, embed, admin

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
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "https://localhost:3000",
        "*",  # embed origins are checked at the route level; CORS itself is open
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(saves.router)
app.include_router(embed.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "dragonslayer-api"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
