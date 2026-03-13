import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/save", tags=["saves"])


def _to_dict(val) -> dict:
    """Safely convert an asyncpg save_json value (string or dict) to a plain dict."""
    if val is None:
        return {}
    if isinstance(val, str):
        return json.loads(val)
    return dict(val)


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
            save_json=_to_dict(row["save_json"]) if row else None,
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
            INSERT INTO game_saves (player_id, save_json, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (player_id) DO UPDATE
              SET save_json = CASE
                WHEN jsonb_array_length(COALESCE(game_saves.save_json->'defenseLog','[]'::jsonb))
                     > jsonb_array_length(COALESCE(EXCLUDED.save_json->'defenseLog','[]'::jsonb))
                THEN EXCLUDED.save_json || jsonb_build_object('defenseLog', game_saves.save_json->'defenseLog')
                ELSE EXCLUDED.save_json
              END,
              updated_at = NOW()
            """,
            player_id,
            json.dumps(req.save_json),
        )
        # Re-fetch to confirm
        row = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id=$1", player_id
        )
        # Sync player_nfts table for any minted items whose stats changed
        asyncio.create_task(_sync_nft_items(player_id, req.save_json))
        return SaveResponse(
            success=True,
            player_id=player_id,
            save_json=_to_dict(row["save_json"]) if row else None,
        )


async def _sync_nft_items(player_id: int, save_json: dict) -> None:
    """
    For each item in inventory/equipment that has an nftTokenId, compare its
    current stats against the player_nfts row.  If power/reforgeLevel/enchantId/itemLevel
    differ, update item_data so the live metadata endpoint stays accurate.
    Runs as a fire-and-forget background task — never raises.
    """
    try:
        # Collect all NFT items from both inventory and equipment
        nft_items: list[dict] = []
        for item in save_json.get("inventory") or []:
            if item.get("nftTokenId"):
                nft_items.append(item)
        for item in (save_json.get("equipment") or {}).values():
            if item and item.get("nftTokenId"):
                nft_items.append(item)

        if not nft_items:
            return

        pool = get_pool()
        async with pool.acquire() as conn:
            for item in nft_items:
                token_id = item["nftTokenId"]
                row = await conn.fetchrow(
                    "SELECT item_data FROM player_nfts WHERE nft_token_id=$1", token_id
                )
                if not row:
                    # New token not yet in table (minted before this feature) — insert it
                    await conn.execute(
                        """
                        INSERT INTO player_nfts (nft_token_id, player_id, item_id, item_name, item_data)
                        VALUES ($1, $2, $3, $4, $5::jsonb)
                        ON CONFLICT (nft_token_id) DO NOTHING
                        """,
                        token_id, player_id,
                        item.get("id", ""),
                        item.get("name", ""),
                        json.dumps(item),
                    )
                    continue

                stored = _to_dict(row["item_data"])
                changed = (
                    stored.get("power")        != item.get("power") or
                    stored.get("reforgeLevel") != item.get("reforgeLevel") or
                    stored.get("enchantId")    != item.get("enchantId") or
                    stored.get("itemLevel")    != item.get("itemLevel")
                )
                if changed:
                    await conn.execute(
                        """
                        UPDATE player_nfts
                           SET item_data=$1::jsonb, player_id=$2, updated_at=NOW()
                         WHERE nft_token_id=$3
                        """,
                        json.dumps(item), player_id, token_id,
                    )
                    logger.info("player_nfts synced token=%s power=%s reforge=%s",
                                token_id, item.get("power"), item.get("reforgeLevel"))
    except Exception:
        logger.exception("_sync_nft_items failed for player=%s", player_id)


@router.post("/heartbeat/{player_id}")
async def heartbeat(player_id: int):
    """Lightweight ping — updates last_active_at only. Called every 60 s from the client."""
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            result = await conn.execute(
                "UPDATE game_saves SET last_active_at = NOW() WHERE player_id = $1",
                player_id,
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="No save found for player")
        except HTTPException:
            raise
        except Exception:
            pass  # last_active_at column may not exist yet — silently ignore
    return {"ok": True}
