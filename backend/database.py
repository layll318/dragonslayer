import asyncpg
import os
import logging

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None


async def init_db(database_url: str):
    global pool
    pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
    await create_tables()
    logger.info("✅ Database pool created and tables ready")


async def close_db():
    global pool
    if pool:
        await pool.close()


async def create_tables():
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id          SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE,
                wallet_address TEXT UNIQUE,
                username    TEXT,
                created_at  TIMESTAMPTZ DEFAULT NOW(),
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS game_saves (
                id          SERIAL PRIMARY KEY,
                player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                save_json   JSONB NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (player_id)
            );

            CREATE TABLE IF NOT EXISTS embed_origins (
                id          SERIAL PRIMARY KEY,
                origin      TEXT UNIQUE NOT NULL,
                label       TEXT,
                enabled     BOOLEAN DEFAULT TRUE,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        logger.info("✅ Tables created / verified")


def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database not initialized")
    return pool
