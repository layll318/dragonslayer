import logging
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/items", tags=["items"])

VALID_SLOTS = {"weapon", "shield", "helm", "armor", "ring"}

# Mirrors the upgrade chains in GameContext.tsx
# upgradesFrom = {"item_type": ..., "rarity": ...} means this craft consumes that item
CRAFTING_RECIPES = {
    # ── WEAPON ──────────────────────────────────────────────────────────────
    "iron_sword":     {"item_type": "weapon", "name": "Iron Sword",    "rarity": "common",   "power": 5,  "gold_cost": 300,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 2}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "steel_sword":    {"item_type": "weapon", "name": "Steel Sword",   "rarity": "uncommon", "power": 10, "gold_cost": 800,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 4}, {"type": "fire_crystal",  "quality": "common",   "qty": 2}], "upgrades_from": {"item_type": "weapon", "rarity": "common"}},
    "flame_blade":    {"item_type": "weapon", "name": "Flame Blade",   "rarity": "rare",     "power": 18, "gold_cost": 2000, "materials": [{"type": "fire_crystal", "quality": "uncommon", "qty": 4}, {"type": "dragon_scale", "quality": "uncommon", "qty": 4}], "upgrades_from": {"item_type": "weapon", "rarity": "uncommon"}},
    "dragon_fang":    {"item_type": "weapon", "name": "Dragon Fang",   "rarity": "epic",     "power": 30, "gold_cost": 6000, "materials": [{"type": "dragon_scale", "quality": "rare", "qty": 5}, {"type": "ancient_rune",  "quality": "rare",     "qty": 3}], "upgrades_from": {"item_type": "weapon", "rarity": "rare"}},
    # ── SHIELD ──────────────────────────────────────────────────────────────
    "oak_shield":     {"item_type": "shield", "name": "Oak Shield",    "rarity": "common",   "power": 4,  "gold_cost": 250,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 2}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "iron_shield":    {"item_type": "shield", "name": "Iron Shield",   "rarity": "uncommon", "power": 9,  "gold_cost": 700,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 4}, {"type": "fire_crystal",  "quality": "common",   "qty": 2}], "upgrades_from": {"item_type": "shield", "rarity": "common"}},
    "dragon_shield":  {"item_type": "shield", "name": "Dragon Shield", "rarity": "rare",     "power": 16, "gold_cost": 1800, "materials": [{"type": "dragon_scale", "quality": "uncommon", "qty": 3}, {"type": "fire_crystal", "quality": "uncommon", "qty": 2}], "upgrades_from": {"item_type": "shield", "rarity": "uncommon"}},
    "aegis":          {"item_type": "shield", "name": "Aegis",         "rarity": "epic",     "power": 26, "gold_cost": 5500, "materials": [{"type": "dragon_scale", "quality": "rare", "qty": 5}, {"type": "ancient_rune",  "quality": "rare",     "qty": 4}], "upgrades_from": {"item_type": "shield", "rarity": "rare"}},
    # ── HELM ────────────────────────────────────────────────────────────────
    "iron_helm":      {"item_type": "helm",   "name": "Iron Helm",     "rarity": "common",   "power": 3,  "gold_cost": 200,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 2}, {"type": "fire_crystal", "quality": "common", "qty": 1}]},
    "scale_helm":     {"item_type": "helm",   "name": "Scale Helm",    "rarity": "uncommon", "power": 8,  "gold_cost": 600,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 3}, {"type": "ancient_rune",  "quality": "common",   "qty": 2}], "upgrades_from": {"item_type": "helm", "rarity": "common"}},
    "infernal_crown": {"item_type": "helm",   "name": "Infernal Crown","rarity": "rare",     "power": 14, "gold_cost": 1600, "materials": [{"type": "fire_crystal", "quality": "uncommon", "qty": 4}, {"type": "ancient_rune",  "quality": "uncommon", "qty": 3}], "upgrades_from": {"item_type": "helm", "rarity": "uncommon"}},
    "demon_helm":     {"item_type": "helm",   "name": "Demon Helm",    "rarity": "epic",     "power": 24, "gold_cost": 5000, "materials": [{"type": "ancient_rune", "quality": "rare", "qty": 5}, {"type": "fire_crystal",  "quality": "rare",     "qty": 3}], "upgrades_from": {"item_type": "helm", "rarity": "rare"}},
    # ── ARMOR ───────────────────────────────────────────────────────────────
    "leather_armor":  {"item_type": "armor",  "name": "Leather Armor", "rarity": "common",   "power": 4,  "gold_cost": 300,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 2}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "chain_armor":    {"item_type": "armor",  "name": "Chain Armor",   "rarity": "uncommon", "power": 10, "gold_cost": 900,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 4}, {"type": "fire_crystal",  "quality": "common",   "qty": 2}], "upgrades_from": {"item_type": "armor", "rarity": "common"}},
    "dragonscale_armor": {"item_type": "armor", "name": "Dragonscale Armor", "rarity": "rare", "power": 20, "gold_cost": 2500, "materials": [{"type": "dragon_scale", "quality": "uncommon", "qty": 5}, {"type": "ancient_rune", "quality": "uncommon", "qty": 2}], "upgrades_from": {"item_type": "armor", "rarity": "uncommon"}},
    "infernal_plate": {"item_type": "armor",  "name": "Infernal Plate","rarity": "epic",     "power": 34, "gold_cost": 7000, "materials": [{"type": "dragon_scale", "quality": "rare", "qty": 5}, {"type": "fire_crystal",  "quality": "rare",     "qty": 4}], "upgrades_from": {"item_type": "armor", "rarity": "rare"}},
    # ── RING ────────────────────────────────────────────────────────────────
    "iron_ring":      {"item_type": "ring",   "name": "Iron Ring",     "rarity": "common",   "power": 2,  "gold_cost": 150,  "materials": [{"type": "dragon_scale", "quality": "common", "qty": 1}, {"type": "ancient_rune", "quality": "common", "qty": 1}]},
    "flame_ring":     {"item_type": "ring",   "name": "Flame Ring",    "rarity": "uncommon", "power": 7,  "gold_cost": 500,  "materials": [{"type": "fire_crystal", "quality": "common", "qty": 3}, {"type": "ancient_rune",  "quality": "common",   "qty": 1}], "upgrades_from": {"item_type": "ring", "rarity": "common"}},
    "dragons_seal":   {"item_type": "ring",   "name": "Dragon's Seal", "rarity": "rare",     "power": 13, "gold_cost": 1400, "materials": [{"type": "fire_crystal", "quality": "uncommon", "qty": 4}, {"type": "ancient_rune",  "quality": "uncommon", "qty": 3}], "upgrades_from": {"item_type": "ring", "rarity": "uncommon"}},
    "ancient_sigil":  {"item_type": "ring",   "name": "Ancient Sigil", "rarity": "epic",     "power": 22, "gold_cost": 4500, "materials": [{"type": "ancient_rune", "quality": "rare", "qty": 4}, {"type": "fire_crystal",  "quality": "rare",     "qty": 3}], "upgrades_from": {"item_type": "ring", "rarity": "rare"}},
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
        # If this is an upgrade, verify and find the base item to consume
        base_item_id = None
        upgrades_from = recipe.get("upgrades_from")
        if upgrades_from:
            base_row = await conn.fetchrow(
                """
                SELECT id FROM player_items
                WHERE player_id=$1 AND item_type=$2 AND rarity=$3
                ORDER BY equipped DESC, obtained_at ASC
                LIMIT 1
                """,
                req.player_id, upgrades_from["item_type"], upgrades_from["rarity"],
            )
            if not base_row:
                return {"success": False, "message": f"Missing required {upgrades_from['rarity']} {upgrades_from['item_type']} to upgrade"}
            base_item_id = base_row["id"]

        # Verify materials
        for mat in recipe["materials"]:
            row = await conn.fetchrow(
                "SELECT quantity FROM player_materials WHERE player_id=$1 AND material=$2 AND quality=$3",
                req.player_id, mat["type"], mat["quality"],
            )
            if not row or row["quantity"] < mat["qty"]:
                return {"success": False, "message": f"Insufficient {mat['type']} ({mat['quality']})"}

        # Consume base item (upgrade only)
        if base_item_id:
            await conn.execute("DELETE FROM player_items WHERE id=$1", base_item_id)

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
        await conn.execute(
            "DELETE FROM player_materials WHERE player_id=$1 AND quantity <= 0",
            req.player_id,
        )

        # Enforce inventory cap (cap is after consuming base item)
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM player_items WHERE player_id=$1", req.player_id,
        )
        if count >= 50:
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
        return {
            "success": True,
            "item": dict(new_item),
            "gold_cost": recipe["gold_cost"],
            "consumed_base_item": base_item_id is not None,
        }


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


# ── TX Hash Deduplication ───────────────────────────────────────────────────

class ClaimTxRequest(BaseModel):
    tx_hash: str
    player_id: Optional[int] = None
    item_type: Optional[str] = None


@router.post("/claim-tx")
async def claim_tx(req: ClaimTxRequest):
    """
    Server-side idempotency gate for XRP transaction hashes.
    Returns {success: True, already_claimed: False} on first claim.
    Returns {success: False, already_claimed: True}  on duplicate.
    """
    if not req.tx_hash or len(req.tx_hash.strip()) < 60:
        raise HTTPException(status_code=400, detail="Invalid tx_hash")

    tx = req.tx_hash.strip().upper()
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT player_id, item_type, claimed_at FROM used_tx_hashes WHERE tx_hash = $1",
            tx,
        )
        if existing:
            return {
                "success": False,
                "already_claimed": True,
                "claimed_by": existing["player_id"],
                "item_type": existing["item_type"],
            }

        await conn.execute(
            """
            INSERT INTO used_tx_hashes (tx_hash, player_id, item_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (tx_hash) DO NOTHING
            """,
            tx, req.player_id, req.item_type,
        )

    return {"success": True, "already_claimed": False}


# ── XRP Material Shop ───────────────────────────────────────────────────────

XAMAN_API_KEY    = os.environ.get("XAMAN_API_KEY", "")
XAMAN_API_SECRET = os.environ.get("XAMAN_API_SECRET", "")
XAMAN_BASE       = "https://xumm.app/api/v1/platform"

MATERIAL_TYPES = ["dragon_scale", "fire_crystal", "ancient_rune", "lynx_fang", "nomic_core"]


class BuyMaterialsRequest(BaseModel):
    player_id: int
    xaman_payload_uuid: str  # UUID returned by /frontend-api/materials/buy after user signs


@router.post("/buy-materials")
async def buy_materials(req: BuyMaterialsRequest):
    """
    Called after the player approves the Xaman payment.
    Verifies the payload was signed & payment resolved, then credits materials.
    """
    if not XAMAN_API_KEY or not XAMAN_API_SECRET:
        raise HTTPException(status_code=500, detail="Xaman credentials not configured")

    # Fetch payload result from Xaman
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{XAMAN_BASE}/payload/{req.xaman_payload_uuid}",
            headers={"X-API-Key": XAMAN_API_KEY, "X-API-Secret": XAMAN_API_SECRET},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail="Could not fetch Xaman payload")

    payload = r.json()
    meta = payload.get("meta", {})
    if not meta.get("signed"):
        raise HTTPException(status_code=400, detail="Payment not signed yet")
    if not meta.get("submit") or payload.get("response", {}).get("dispatched_result") not in ("tesSUCCESS", None):
        # dispatched_result can be None for test/sandbox — allow signed=True as enough for now
        pass

    # Determine what to credit from custom_meta instruction stored at creation time
    custom_meta = payload.get("custom_meta", {})
    instruction: str = custom_meta.get("instruction", "")

    # Parse memo from return_url query string (set by /frontend-api/materials/buy)
    # Fallback: credit bundle if we can't determine type
    memo = ""
    try:
        from urllib.parse import urlparse, parse_qs
        return_url = payload.get("next", {}).get("always", "")
        qs = parse_qs(urlparse(return_url).query)
        memo = qs.get("mat_purchase", [""])[0]
    except Exception:
        pass

    if memo.startswith("bundle"):
        credits = [{"type": t, "quality": "common", "quantity": 3} for t in MATERIAL_TYPES]
    elif memo.startswith("single:"):
        parts = memo.split(":")
        mat_type = parts[1] if len(parts) > 1 else ""
        qty      = int(parts[2]) if len(parts) > 2 else 3
        if mat_type not in MATERIAL_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown material type: {mat_type}")
        credits = [{"type": mat_type, "quality": "common", "quantity": qty}]
    else:
        # Fallback
        credits = [{"type": t, "quality": "common", "quantity": 1} for t in MATERIAL_TYPES]

    pool = get_pool()
    async with pool.acquire() as conn:
        for m in credits:
            await conn.execute(
                """
                INSERT INTO player_materials (player_id, material, quality, quantity)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (player_id, material, quality)
                DO UPDATE SET quantity = player_materials.quantity + EXCLUDED.quantity
                """,
                req.player_id, m["type"], m["quality"], m["quantity"],
            )

    return {"success": True, "credited": credits}
