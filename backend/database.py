import asyncpg
import ssl
import os
import logging

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None


def _fix_url(database_url: str) -> str:
    """Railway sometimes provides postgres:// — asyncpg needs postgresql://"""
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return database_url


async def init_db(database_url: str):
    global pool
    database_url = _fix_url(database_url)

    # Railway PostgreSQL requires SSL
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        pool = await asyncpg.create_pool(
            database_url,
            min_size=2,
            max_size=10,
            ssl=ssl_ctx,
        )
        logger.info("✅ Database pool created (SSL)")
    except Exception as e:
        logger.warning(f"SSL connection failed ({e}), retrying without SSL...")
        pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
        logger.info("✅ Database pool created (no SSL)")

    await create_tables()
    logger.info("✅ Tables ready")


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

            ALTER TABLE players ADD COLUMN IF NOT EXISTS starter_nft_id TEXT;

            CREATE TABLE IF NOT EXISTS player_materials (
                id          SERIAL PRIMARY KEY,
                player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                material    TEXT NOT NULL,
                quality     TEXT NOT NULL,
                quantity    INTEGER NOT NULL DEFAULT 1,
                UNIQUE (player_id, material, quality)
            );

            CREATE TABLE IF NOT EXISTS player_items (
                id            SERIAL PRIMARY KEY,
                player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                item_type     TEXT NOT NULL,
                name          TEXT NOT NULL,
                rarity        TEXT NOT NULL,
                power         INTEGER NOT NULL DEFAULT 1,
                nft_token_id  TEXT,
                equipped      BOOLEAN NOT NULL DEFAULT FALSE,
                equipped_slot TEXT,
                obtained_via  TEXT,
                obtained_at   TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS expeditions (
                id             SERIAL PRIMARY KEY,
                player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                started_at     TIMESTAMPTZ NOT NULL,
                duration_hours INTEGER NOT NULL,
                ends_at        TIMESTAMPTZ NOT NULL,
                status         TEXT NOT NULL DEFAULT 'active',
                dragons_slain  INTEGER,
                gold_earned    INTEGER,
                result_json    JSONB
            );
        """)
        # Add last_active_at to track player presence for AFK detection
        await conn.execute("""
            ALTER TABLE game_saves
                ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW()
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS player_nfts (
                nft_token_id   TEXT PRIMARY KEY,
                player_id      INTEGER REFERENCES players(id) ON DELETE SET NULL,
                item_id        TEXT NOT NULL,
                item_name      TEXT NOT NULL DEFAULT '',
                item_data      JSONB NOT NULL DEFAULT '{}',
                ipfs_image_cid TEXT,
                ipfs_meta_cid  TEXT,
                minted_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at     TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS used_tx_hashes (
                tx_hash    TEXT PRIMARY KEY,
                player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
                item_type  TEXT,
                claimed_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS arena_battles (
                id              SERIAL PRIMARY KEY,
                attacker_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                defender_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                attacker_power  INTEGER NOT NULL DEFAULT 0,
                defender_power  INTEGER NOT NULL DEFAULT 0,
                formation       TEXT NOT NULL DEFAULT 'balanced',
                result          TEXT NOT NULL DEFAULT 'loss',
                gold_stolen     INTEGER NOT NULL DEFAULT 0,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        logger.info("✅ Tables created / verified")


def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database not initialized")
    return pool
