import json
import logging
import os
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


def verify_admin(authorization: Optional[str]):
    admin_token = os.getenv("ADMIN_TOKEN", "")
    if not admin_token:
        raise HTTPException(status_code=500, detail="ADMIN_TOKEN not configured")
    expected = f"Bearer {admin_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


class OriginRequest(BaseModel):
    origin: str
    label: Optional[str] = None
    enabled: bool = True


class OriginResponse(BaseModel):
    id: int
    origin: str
    label: Optional[str]
    enabled: bool


@router.get("/embed/origins")
async def list_origins(authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, origin, label, enabled FROM embed_origins ORDER BY created_at DESC"
        )
        return [dict(r) for r in rows]


@router.post("/embed/origins", response_model=OriginResponse)
async def add_origin(req: OriginRequest, authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO embed_origins (origin, label, enabled)
            VALUES ($1, $2, $3)
            ON CONFLICT (origin) DO UPDATE SET label=$2, enabled=$3
            RETURNING id, origin, label, enabled
            """,
            req.origin, req.label, req.enabled,
        )
        return OriginResponse(**dict(row))


@router.delete("/embed/origins/{origin_id}")
async def delete_origin(origin_id: int, authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM embed_origins WHERE id=$1", origin_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Origin not found")
        return {"success": True, "deleted_id": origin_id}


@router.patch("/embed/origins/{origin_id}")
async def toggle_origin(
    origin_id: int,
    enabled: bool,
    authorization: Optional[str] = Header(None),
):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE embed_origins SET enabled=$1 WHERE id=$2 RETURNING id, origin, label, enabled",
            enabled, origin_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Origin not found")
        return OriginResponse(**dict(row))


@router.get("/players")
async def list_players(authorization: Optional[str] = Header(None)):
    """Audit endpoint — lists every player row with their save quality."""
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                p.id,
                p.telegram_id,
                p.wallet_address,
                p.username,
                p.created_at,
                p.updated_at,
                COALESCE((gs.save_json->>'level')::int, 0)                       AS save_level,
                COALESCE((gs.save_json->>'totalGoldEarned')::float8::bigint, 0)  AS save_gold,
                gs.updated_at                                                     AS save_updated_at
            FROM players p
            LEFT JOIN game_saves gs ON gs.player_id = p.id
            ORDER BY p.id
            """
        )
        return [
            {
                "id": r["id"],
                "telegram_id": r["telegram_id"],
                "wallet_address": r["wallet_address"],
                "username": r["username"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "save_level": r["save_level"],
                "save_gold": r["save_gold"],
                "save_updated_at": r["save_updated_at"].isoformat() if r["save_updated_at"] else None,
                "source": (
                    "wallet+twa" if r["wallet_address"] and r["telegram_id"]
                    else "wallet" if r["wallet_address"]
                    else "twa" if r["telegram_id"]
                    else "orphan"
                ),
            }
            for r in rows
        ]


@router.post("/season-reset")
async def season_reset(
    dry_run: bool = Query(default=True),
    authorization: Optional[str] = Header(None),
):
    """Soft-reset all player trophies for a new season (carry over 25%).
    dry_run=true (default) returns the count without modifying anything."""
    verify_admin(authorization)
    from datetime import datetime, timezone
    import math
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT player_id, COALESCE((save_json->>'trophies')::int, 0) AS trophies
            FROM game_saves
            WHERE COALESCE((save_json->>'trophies')::int, 0) > 0
            """
        )
        if dry_run:
            return {
                "dry_run": True,
                "season_month": current_month,
                "players_affected": len(rows),
                "preview": [{"player_id": r["player_id"], "old": r["trophies"], "new": math.floor(r["trophies"] * 0.25)} for r in rows[:10]],
            }
        for r in rows:
            new_trophies = math.floor(r["trophies"] * 0.25)
            await conn.execute(
                """
                UPDATE game_saves
                SET save_json = save_json ||
                    jsonb_build_object('trophies', $2::int, 'seasonMonth', $3::text),
                    updated_at = NOW()
                WHERE player_id = $1
                """,
                r["player_id"], new_trophies, current_month,
            )
        return {"success": True, "season_month": current_month, "players_reset": len(rows)}


@router.post("/cleanup-orphans")
async def cleanup_orphans(
    dry_run: bool = Query(default=True),
    authorization: Optional[str] = Header(None),
):
    """Delete players with no wallet_address AND no telegram_id (pure orphans).
    dry_run=true (default) returns the list without deleting."""
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        orphans = await conn.fetch(
            """
            SELECT p.id, p.created_at,
                   COALESCE((gs.save_json->>'level')::int, 0) AS save_level
            FROM players p
            LEFT JOIN game_saves gs ON gs.player_id = p.id
            WHERE p.wallet_address IS NULL AND p.telegram_id IS NULL
            ORDER BY p.id
            """
        )
        result = [
            {"id": r["id"], "save_level": r["save_level"],
             "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in orphans
        ]
        if not dry_run and orphans:
            ids = [r["id"] for r in orphans]
            await conn.execute(
                "DELETE FROM players WHERE id = ANY($1::int[])", ids
            )
            return {"deleted": len(ids), "players": result}
        return {"dry_run": True, "would_delete": len(result), "players": result}
