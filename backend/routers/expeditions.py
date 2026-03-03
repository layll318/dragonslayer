import logging
import random
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/expeditions", tags=["expeditions"])

MATERIAL_TYPES = ["dragon_scale", "fire_crystal", "iron_ore", "bone_shard", "ancient_rune"]


class StartExpeditionRequest(BaseModel):
    player_id: int
    duration_hours: int  # 4, 8, or 12


class ClaimExpeditionRequest(BaseModel):
    player_id: int
    expedition_id: int
    level: int = 1
    gear_multiplier: float = 1.0


class ExpeditionResponse(BaseModel):
    success: bool
    expedition_id: Optional[int] = None
    message: str = ""


class ClaimResponse(BaseModel):
    success: bool
    dragons_slain: int = 0
    gold_earned: int = 0
    materials: List[dict] = []
    message: str = ""


def _calc_yield(level: int, gear_mult: float, hours: int):
    rand = 0.85 + random.random() * 0.30
    gear_power = (gear_mult - 1.0) / 0.06
    dragons_slain = max(1, int((level * 2 + gear_power * 3) * hours * rand))
    gold_earned = dragons_slain * (50 + level * 8)

    quality = "rare" if hours >= 12 else "uncommon" if hours >= 8 else "common"
    total_mats = (
        random.randint(1, 3) if hours == 4
        else random.randint(2, 5) if hours == 8
        else random.randint(3, 8)
    )
    chosen = random.sample(MATERIAL_TYPES, min(total_mats, len(MATERIAL_TYPES)))
    materials = [
        {"type": t, "quality": quality, "quantity": random.randint(1, 3)}
        for t in chosen
    ]
    return dragons_slain, gold_earned, materials


@router.post("/start", response_model=ExpeditionResponse)
async def start_expedition(req: StartExpeditionRequest):
    if req.duration_hours not in (4, 8, 12):
        raise HTTPException(status_code=400, detail="duration_hours must be 4, 8, or 12")

    pool = get_pool()
    async with pool.acquire() as conn:
        # Check for already-active expedition
        active = await conn.fetchrow(
            "SELECT id FROM expeditions WHERE player_id=$1 AND status='active'",
            req.player_id,
        )
        if active:
            return ExpeditionResponse(success=False, message="Expedition already in progress")

        now = datetime.now(timezone.utc)
        from datetime import timedelta
        ends_at = now + timedelta(hours=req.duration_hours)

        row = await conn.fetchrow(
            """
            INSERT INTO expeditions (player_id, started_at, duration_hours, ends_at, status)
            VALUES ($1, $2, $3, $4, 'active')
            RETURNING id
            """,
            req.player_id, now, req.duration_hours, ends_at,
        )
        return ExpeditionResponse(success=True, expedition_id=row["id"])


@router.get("/active/{player_id}")
async def get_active_expedition(player_id: int):
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM expeditions WHERE player_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 1",
            player_id,
        )
        if not row:
            return {"active": False}
        return {
            "active": True,
            "expedition_id": row["id"],
            "started_at": row["started_at"].isoformat(),
            "ends_at": row["ends_at"].isoformat(),
            "duration_hours": row["duration_hours"],
        }


@router.post("/claim", response_model=ClaimResponse)
async def claim_expedition(req: ClaimExpeditionRequest):
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM expeditions WHERE id=$1 AND player_id=$2 AND status='active'",
            req.expedition_id, req.player_id,
        )
        if not row:
            return ClaimResponse(success=False, message="Expedition not found or already claimed")

        now = datetime.now(timezone.utc)
        if now < row["ends_at"]:
            return ClaimResponse(success=False, message="Expedition not finished yet")

        dragons_slain, gold_earned, materials = _calc_yield(
            req.level, req.gear_multiplier, row["duration_hours"]
        )

        import json
        await conn.execute(
            """
            UPDATE expeditions
            SET status='claimed', dragons_slain=$1, gold_earned=$2, result_json=$3
            WHERE id=$4
            """,
            dragons_slain, gold_earned, json.dumps({"materials": materials}), req.expedition_id,
        )

        # Upsert materials into player_materials
        for m in materials:
            await conn.execute(
                """
                INSERT INTO player_materials (player_id, material, quality, quantity)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (player_id, material, quality)
                DO UPDATE SET quantity = player_materials.quantity + EXCLUDED.quantity
                """,
                req.player_id, m["type"], m["quality"], m["quantity"],
            )

        return ClaimResponse(
            success=True,
            dragons_slain=dragons_slain,
            gold_earned=gold_earned,
            materials=materials,
        )
