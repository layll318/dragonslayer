import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


class TWAAuthRequest(BaseModel):
    telegram_id: int
    telegram_username: Optional[str] = None
    telegram_first_name: Optional[str] = None
    wallet_address: Optional[str] = None


class WalletAuthRequest(BaseModel):
    wallet_address: str


class AuthResponse(BaseModel):
    success: bool
    player_id: int
    wallet_address: Optional[str] = None
    telegram_id: Optional[int] = None
    username: Optional[str] = None
    is_new: bool = False


@router.post("/twa", response_model=AuthResponse)
async def twa_auth(req: TWAAuthRequest):
    """
    Called when the game loads inside Telegram.
    Upserts a player record keyed by telegram_id.
    Returns player_id and any linked wallet address.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, wallet_address, username FROM players WHERE telegram_id = $1",
            req.telegram_id,
        )
        if row:
            # Update username if changed
            if req.telegram_first_name and row["username"] != req.telegram_first_name:
                await conn.execute(
                    "UPDATE players SET username=$1, updated_at=NOW() WHERE id=$2",
                    req.telegram_first_name, row["id"],
                )
            # If caller also provided a wallet, link it
            if req.wallet_address and not row["wallet_address"]:
                try:
                    await conn.execute(
                        "UPDATE players SET wallet_address=$1, updated_at=NOW() WHERE id=$2",
                        req.wallet_address, row["id"],
                    )
                except Exception:
                    pass  # wallet may already belong to another player
            refreshed = await conn.fetchrow("SELECT * FROM players WHERE id=$1", row["id"])
            return AuthResponse(
                success=True,
                player_id=refreshed["id"],
                wallet_address=refreshed["wallet_address"],
                telegram_id=refreshed["telegram_id"],
                username=refreshed["username"],
                is_new=False,
            )
        else:
            # New player
            new_row = await conn.fetchrow(
                """
                INSERT INTO players (telegram_id, wallet_address, username)
                VALUES ($1, $2, $3)
                ON CONFLICT (telegram_id) DO UPDATE SET updated_at=NOW()
                RETURNING *
                """,
                req.telegram_id,
                req.wallet_address,
                req.telegram_first_name or req.telegram_username,
            )
            return AuthResponse(
                success=True,
                player_id=new_row["id"],
                wallet_address=new_row["wallet_address"],
                telegram_id=new_row["telegram_id"],
                username=new_row["username"],
                is_new=True,
            )


@router.post("/wallet", response_model=AuthResponse)
async def wallet_auth(req: WalletAuthRequest):
    """
    Called from the web when a player links their XRPL wallet.
    Upserts a player keyed by wallet_address.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, telegram_id, username FROM players WHERE wallet_address = $1",
            req.wallet_address,
        )
        if row:
            return AuthResponse(
                success=True,
                player_id=row["id"],
                wallet_address=req.wallet_address,
                telegram_id=row["telegram_id"],
                username=row["username"],
                is_new=False,
            )
        else:
            new_row = await conn.fetchrow(
                """
                INSERT INTO players (wallet_address)
                VALUES ($1)
                ON CONFLICT (wallet_address) DO UPDATE SET updated_at=NOW()
                RETURNING *
                """,
                req.wallet_address,
            )
            return AuthResponse(
                success=True,
                player_id=new_row["id"],
                wallet_address=new_row["wallet_address"],
                is_new=True,
            )
