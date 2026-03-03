import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/items", tags=["items"])

VALID_SLOTS = {"weapon", "shield", "helm", "armor", "ring"}

CRAFTING_RECIPES = {
    "iron_sword":        {"item_type": "weapon", "name": "Iron Sword",        "rarity": "common",   "power": 5,  "gold_cost": 500,  "materials": [{"type": "iron_ore", "quality": "common", "qty": 3}, {"type": "dragon_scale", "quality": "common", "qty": 2}]},
    "oak_shield":        {"item_type": "shield", "name": "Oak Shield",        "rarity": "common",   "power": 4,  "gold_cost": 400,  "materials": [{"type": "iron_ore", "quality": "common", "qty": 3}, {"type": "bone_shard",   "quality": "common", "qty": 2}]},
    "iron_helm":         {"item_type": "helm",   "name": "Iron Helm",         "rarity": "common",   "power": 3,  "gold_cost": 300,  "materials": [{"type": "bone_shard", "quality": "common", "qty": 2}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "dragonscale_armor": {"item_type": "armor",  "name": "Dragonscale Armor", "rarity": "uncommon", "power": 8,  "gold_cost": 800,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 4}, {"type": "iron_ore", "quality": "common", "qty": 2}]},
    "flame_ring":        {"item_type": "ring",   "name": "Flame Ring",        "rarity": "uncommon", "power": 6,  "gold_cost": 600,  "materials": [{"type": "fire_crystal", "quality": "common", "qty": 3}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "steel_sword":       {"item_type": "weapon", "name": "Steel Sword",       "rarity": "rare",     "power": 12, "gold_cost": 1500, "materials": [{"type": "iron_ore", "quality": "uncommon", "qty": 4}, {"type": "dragon_scale", "quality": "uncommon", "qty": 3}]},
    "dragonfire_shield": {"item_type": "shield", "name": "Dragonfire Shield", "rarity": "rare",     "power": 10, "gold_cost": 1200, "materials": [{"type": "dragon_scale", "quality": "uncommon", "qty": 3}, {"type": "fire_crystal", "quality": "uncommon", "qty": 2}]},
    "runic_helm":        {"item_type": "helm",   "name": "Runic Helm",        "rarity": "rare",     "power": 9,  "gold_cost": 1000, "materials": [{"type": "ancient_rune", "quality": "uncommon", "qty": 3}, {"type": "bone_shard", "quality": "uncommon", "qty": 2}]},
}


class CraftRequest(BaseModel):
    player_id: int
    recipe_id: str
    current_gold: int


class EquipRequest(BaseModel):
    player_id: int
    item_id: int


class UnequipRequest(BaseModel):
    player_id: int
    slot: str


@router.get("/{player_id}")
async def get_inventory(player_id: int):
    pool = get_pool()
    async with pool.acquire() as conn:
        items = await conn.fetch(
            "SELECT * FROM player_items WHERE player_id=$1 ORDER BY obtained_at DESC",
            player_id,
        )
        materials = await conn.fetch(
            "SELECT * FROM player_materials WHERE player_id=$1",
            player_id,
        )
        return {
            "items": [dict(r) for r in items],
            "materials": [dict(r) for r in materials],
        }


@router.post("/craft")
async def craft_item(req: CraftRequest):
    recipe = CRAFTING_RECIPES.get(req.recipe_id)
    if not recipe:
        raise HTTPException(status_code=400, detail="Unknown recipe")

    if req.current_gold < recipe["gold_cost"]:
        return {"success": False, "message": "Not enough gold"}

    pool = get_pool()
    async with pool.acquire() as conn:
        # Verify materials
        for mat in recipe["materials"]:
            row = await conn.fetchrow(
                "SELECT quantity FROM player_materials WHERE player_id=$1 AND material=$2 AND quality=$3",
                req.player_id, mat["type"], mat["quality"],
            )
            if not row or row["quantity"] < mat["qty"]:
                return {"success": False, "message": f"Insufficient {mat['type']} ({mat['quality']})"}

        # Deduct materials
        for mat in recipe["materials"]:
            await conn.execute(
                """
                UPDATE player_materials
                SET quantity = quantity - $1
                WHERE player_id=$2 AND material=$3 AND quality=$4
                """,
                mat["qty"], req.player_id, mat["type"], mat["quality"],
            )
        # Remove zero-quantity rows
        await conn.execute(
            "DELETE FROM player_materials WHERE player_id=$1 AND quantity <= 0",
            req.player_id,
        )

        # Count existing items and enforce cap
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM player_items WHERE player_id=$1", req.player_id,
        )
        if count >= 20:
            oldest = await conn.fetchval(
                "SELECT id FROM player_items WHERE player_id=$1 AND equipped=FALSE ORDER BY obtained_at ASC LIMIT 1",
                req.player_id,
            )
            if oldest:
                await conn.execute("DELETE FROM player_items WHERE id=$1", oldest)

        new_item = await conn.fetchrow(
            """
            INSERT INTO player_items (player_id, item_type, name, rarity, power, obtained_via)
            VALUES ($1, $2, $3, $4, $5, 'crafted')
            RETURNING *
            """,
            req.player_id, recipe["item_type"], recipe["name"],
            recipe["rarity"], recipe["power"],
        )
        return {"success": True, "item": dict(new_item), "gold_cost": recipe["gold_cost"]}


@router.post("/equip")
async def equip_item(req: EquipRequest):
    pool = get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow(
            "SELECT * FROM player_items WHERE id=$1 AND player_id=$2",
            req.item_id, req.player_id,
        )
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        slot = item["item_type"]
        # Unequip anything currently in that slot
        await conn.execute(
            "UPDATE player_items SET equipped=FALSE, equipped_slot=NULL WHERE player_id=$1 AND equipped_slot=$2",
            req.player_id, slot,
        )
        await conn.execute(
            "UPDATE player_items SET equipped=TRUE, equipped_slot=$1 WHERE id=$2",
            slot, req.item_id,
        )
        return {"success": True, "slot": slot}


@router.post("/unequip")
async def unequip_item(req: UnequipRequest):
    if req.slot not in VALID_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid slot")
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE player_items SET equipped=FALSE, equipped_slot=NULL WHERE player_id=$1 AND equipped_slot=$2",
            req.player_id, req.slot,
        )
        return {"success": True}
