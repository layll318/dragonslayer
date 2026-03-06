import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/save", tags=["saves"])


class SaveRequest(BaseModel):
    save_json: dict[str, Any]


class SaveResponse(BaseModel):
    success: bool
    player_id: int
    save_json: dict[str, Any] | None = None


@router.get("/{player_id}", response_model=SaveResponse)
async def load_save(player_id: int):
    pool = get_pool()
    async with pool.acquire() as conn:
        # Verify player exists
        player = await conn.fetchrow("SELECT id FROM players WHERE id=$1", player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        row = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id=$1", player_id
        )
        return SaveResponse(
            success=True,
            player_id=player_id,
            save_json=dict(row["save_json"]) if row else None,
        )


@router.post("/{player_id}", response_model=SaveResponse)
async def upsert_save(player_id: int, req: SaveRequest):
    pool = get_pool()
    async with pool.acquire() as conn:
        player = await conn.fetchrow("SELECT id FROM players WHERE id=$1", player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        await conn.execute(
            """
            INSERT INTO game_saves (player_id, save_json, updated_at, last_active_at)
            VALUES ($1, $2::jsonb, NOW(), NOW())
            ON CONFLICT (player_id) DO UPDATE
              SET save_json = $2::jsonb, updated_at = NOW()
            """,
            player_id,
            json.dumps(req.save_json),
        )
        # Re-fetch to confirm
        row = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id=$1", player_id
        )
        return SaveResponse(
            success=True,
            player_id=player_id,
            save_json=dict(row["save_json"]) if row else None,
        )


@router.post("/heartbeat/{player_id}")
async def heartbeat(player_id: int):
    """Lightweight ping — updates last_active_at only. Called every 60 s from the client."""
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE game_saves SET last_active_at = NOW() WHERE player_id = $1",
            player_id,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="No save found for player")
    return {"ok": True}
