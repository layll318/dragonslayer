import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
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
    telegram_id: Optional[int] = None
    telegram_username: Optional[str] = None

    @field_validator('wallet_address')
    @classmethod
    def wallet_address_must_be_valid_xrpl(cls, v: str) -> str:
        v = v.strip()
        if not v or not v.startswith('r') or not (25 <= len(v) <= 35):
            raise ValueError('wallet_address must be a valid XRPL address (starts with r, 25-35 chars)')
        return v


class UsernameUpdateRequest(BaseModel):
    player_id: int
    username: str


class UsernameUpdateResponse(BaseModel):
    success: bool
    username: str


class AuthResponse(BaseModel):
    success: bool
    player_id: Optional[int] = None
    wallet_address: Optional[str] = None
    telegram_id: Optional[int] = None
    username: Optional[str] = None
    is_new: bool = False


@router.patch("/username", response_model=UsernameUpdateResponse)
async def update_username(req: UsernameUpdateRequest):
    """
    Let a player set their display name.
    This name is shown in the arena opponent list and leaderboard.
    """
    username = req.username.strip()[:32]  # max 32 chars
    if not username:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE players SET username=$1, updated_at=NOW() WHERE id=$2 RETURNING id, username",
            username, req.player_id,
        )
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Player not found")
        return UsernameUpdateResponse(success=True, username=row["username"])


@router.post("/twa", response_model=AuthResponse)
async def twa_auth(req: TWAAuthRequest):
    """
    Called when the game loads inside Telegram — lookup only.
    Returns the wallet player linked to this telegram_id if one exists.
    Does NOT create new players; wallet is the canonical identity.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, wallet_address, username FROM players WHERE telegram_id = $1",
            req.telegram_id,
        )
        if not row:
            # No wallet linked yet — frontend stays local until user connects wallet
            return AuthResponse(success=False)
        # Update username if changed
        username = req.telegram_first_name or req.telegram_username or row["username"]
        if username and username != row["username"]:
            await conn.execute(
                "UPDATE players SET username=$1, updated_at=NOW() WHERE id=$2",
                username, row["id"],
            )
        return AuthResponse(
            success=True,
            player_id=row["id"],
            wallet_address=row["wallet_address"],
            telegram_id=req.telegram_id,
            username=username,
            is_new=False,
        )


@router.post("/wallet", response_model=AuthResponse)
async def wallet_auth(req: WalletAuthRequest):
    """
    Wallet address is the canonical identity key.
    Find-or-create a player keyed exclusively on wallet_address.
    Optionally links a telegram_id to the wallet player (for TWA auto-reconnect).
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, telegram_id, username FROM players WHERE wallet_address = $1",
            req.wallet_address,
        )
        if not row:
            # No player for this wallet yet — create one
            row = await conn.fetchrow(
                """
                INSERT INTO players (wallet_address)
                VALUES ($1)
                ON CONFLICT (wallet_address) DO UPDATE SET updated_at=NOW()
                RETURNING id, telegram_id, username
                """,
                req.wallet_address,
            )

        player_id = row["id"]

        # If a telegram_id was provided (user connecting wallet inside TWA),
        # link it to this wallet player so future TWA sessions auto-reconnect.
        if req.telegram_id and row["telegram_id"] != req.telegram_id:
            # Clear telegram_id from any other player first (UNIQUE constraint)
            await conn.execute(
                "UPDATE players SET telegram_id = NULL, updated_at = NOW() "
                "WHERE telegram_id = $1 AND id != $2",
                req.telegram_id, player_id,
            )
            username = req.telegram_username or row["username"]
            row = await conn.fetchrow(
                """
                UPDATE players SET telegram_id=$1, username=COALESCE($2, username), updated_at=NOW()
                WHERE id=$3 RETURNING id, telegram_id, username
                """,
                req.telegram_id, username, player_id,
            )

        return AuthResponse(
            success=True,
            player_id=row["id"],
            wallet_address=req.wallet_address,
            telegram_id=row["telegram_id"],
            username=row["username"],
            is_new=False,
        )
