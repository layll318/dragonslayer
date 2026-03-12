import json
import logging
import os
from fastapi import APIRouter, HTTPException, Request
from database import get_pool
from xrpl.asyncio.clients import AsyncJsonRpcClient
from xrpl.asyncio.transaction import submit_and_wait
from xrpl.models.transactions import NFTokenMint, NFTokenCreateOffer
from xrpl.wallet import Wallet


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nft", tags=["nft"])


def _to_dict(val) -> dict:
    """Safely convert an asyncpg JSONB value (string or dict) to a plain dict."""
    if val is None:
        return {}
    if isinstance(val, str):
        return json.loads(val)
    return dict(val)

PLACEHOLDER_IMAGE = "https://placehold.co/600x600/1a0e00/f0c040?text=DragonSlayer"
BACKEND_URL  = os.environ.get("BACKEND_URL",  "https://backend-production-7363.up.railway.app")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://dragonslayer-production.up.railway.app")
XRPL_NODE = os.environ.get("XRPL_NODE", "https://s1.ripple.com:51234/")
XRPL_WALLET_SEED = os.environ.get("XRPL_WALLET_SEED", "")

ITEM_IMAGE_BY_NAME = {
    # Legendary
    "Lynx Sword":          f"{BACKEND_URL}/images/lynxsword.png",
    "Nomic Shield":        f"{BACKEND_URL}/images/nomicsshield.png",
    "Void Blade":          f"{BACKEND_URL}/images/lynxsword.png",
    "Dragon's Aegis":      f"{BACKEND_URL}/images/nomicsshield.png",
    "Dragonslayer Blade":  f"{BACKEND_URL}/images/lynxsword.png",
    "Nomic Fortress":      f"{BACKEND_URL}/images/nomicsshield.png",
    "Infernal Crown":      f"{BACKEND_URL}/images/helm_infernal_crown.png",
    "Dragon Plate":        f"{BACKEND_URL}/images/armor_dragonscale.png",
    "Dragon's Eye":        f"{BACKEND_URL}/images/ring_ancient_sigil.png",
    "Eternal Ring":        f"{BACKEND_URL}/images/ring_ancient_sigil.png",
    # Epic (T4)
    "Dragon Fang":         f"{BACKEND_URL}/images/weapon_dragon_fang.png",
    "Aegis":               f"{BACKEND_URL}/images/shield_aegis.png",
    "Demon Helm":          f"{BACKEND_URL}/images/helm_demon.png",
    "Infernal Plate":      f"{BACKEND_URL}/images/armor_infernal_plate.png",
    "Ancient Sigil":       f"{BACKEND_URL}/images/ring_ancient_sigil.png",
    # Rare (T3)
    "Flame Blade":         f"{BACKEND_URL}/images/weapon_flame_blade.png",
    "Dragon Shield":       f"{BACKEND_URL}/images/shield_dragon.png",
    "Infernal Crown":      f"{BACKEND_URL}/images/helm_infernal_crown.png",
    "Dragonscale Armor":   f"{BACKEND_URL}/images/armor_dragonscale.png",
    "Dragon's Seal":       f"{BACKEND_URL}/images/ring_dragons_seal.png",
    # Uncommon (T2)
    "Steel Sword":         f"{BACKEND_URL}/images/weapon_steel_sword.png",
    "Iron Shield":         f"{BACKEND_URL}/images/shield_iron.png",
    "Scale Helm":          f"{BACKEND_URL}/images/helm_scale.png",
    "Chain Armor":         f"{BACKEND_URL}/images/armor_chain.png",
    "Flame Ring":          f"{BACKEND_URL}/images/ring_flame.png",
    # Common (T1)
    "Iron Sword":          f"{BACKEND_URL}/images/weapon_iron_sword.png",
    "Oak Shield":          f"{BACKEND_URL}/images/shield_oak.png",
    "Iron Helm":           f"{BACKEND_URL}/images/helm_iron.png",
    "Leather Armor":       f"{BACKEND_URL}/images/armor_leather.png",
    "Iron Ring":           f"{BACKEND_URL}/images/ring_iron.png",
}

ITEM_IMAGE_BY_ID = {
    "lynx_sword":          f"{BACKEND_URL}/images/lynxsword.png",
    "nomic_shield":        f"{BACKEND_URL}/images/nomicsshield.png",
    "dragon_fang":         f"{BACKEND_URL}/images/weapon_dragon_fang.png",
    "aegis":               f"{BACKEND_URL}/images/shield_aegis.png",
    "demon_helm":          f"{BACKEND_URL}/images/helm_demon.png",
    "infernal_plate":      f"{BACKEND_URL}/images/armor_infernal_plate.png",
    "ancient_sigil":       f"{BACKEND_URL}/images/ring_ancient_sigil.png",
}

ITEM_NAME_BY_ID = {
    "lynx_sword":          "Lynx Sword",
    "nomic_shield":        "Nomic Shield",
    "dragon_fang":         "Dragon Fang",
    "aegis":               "Aegis",
    "demon_helm":          "Demon Helm",
    "infernal_plate":      "Infernal Plate",
    "ancient_sigil":       "Ancient Sigil",
}

# Keep legacy alias for backwards compat
ITEM_IMAGE_MAP = ITEM_IMAGE_BY_NAME


@router.post("/mint-item")
async def server_mint_item(request: Request):
    """
    Server mints an NFT from the game wallet, then creates a 0-XRP sell offer
    to the player's wallet. The player accepts the offer via Xaman to claim.
    """
    body = await request.json()
    player_id = body.get("player_id")
    item_id = body.get("item_id")
    item_name = body.get("item_name", "")
    player_wallet = body.get("player_wallet")

    if not player_id or not item_id or not player_wallet:
        raise HTTPException(status_code=400, detail="Missing player_id, item_id, or player_wallet")

    if not XRPL_WALLET_SEED:
        raise HTTPException(status_code=500, detail="XRPL_WALLET_SEED not configured on server")

    # Use a readable slug in the URI so the metadata endpoint can resolve the image
    # even if the DB save hasn't been synced yet.
    item_slug = item_name.strip().lower().replace(" ", "_") if item_name else item_id
    meta_url = f"{BACKEND_URL}/api/nft/item/{player_id}/{item_slug}"
    uri_hex = meta_url.encode("utf-8").hex().upper()

    server_wallet = Wallet.from_seed(XRPL_WALLET_SEED)

    try:
        client = AsyncJsonRpcClient(XRPL_NODE)
        mint_tx = NFTokenMint(
            account=server_wallet.classic_address,
            nftoken_taxon=1,
            flags=8,
            uri=uri_hex,
        )
        mint_response = await submit_and_wait(mint_tx, client, server_wallet)
        nft_token_id = mint_response.result.get("meta", {}).get("nftoken_id")
        if not nft_token_id:
            raise HTTPException(status_code=500, detail="NFT token ID not found in mint response")

        offer_tx = NFTokenCreateOffer(
            account=server_wallet.classic_address,
            nftoken_id=nft_token_id,
            amount="0",
            destination=player_wallet,
            flags=1,
        )
        offer_response = await submit_and_wait(offer_tx, client, server_wallet)

        offer_index = None
        for node in offer_response.result.get("meta", {}).get("AffectedNodes", []):
            created = node.get("CreatedNode", {})
            if created.get("LedgerEntryType") == "NFTokenOffer":
                offer_index = created.get("LedgerIndex")
                break

        if not offer_index:
            raise HTTPException(status_code=500, detail="Failed to get offer index")

        return {"nft_token_id": nft_token_id, "offer_index": offer_index}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("server_mint_item error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/item/{player_id}/{item_id}")
async def get_nft_item_metadata(player_id: int, item_id: str):
    """
    XRPL NFT metadata for a crafted legendary item.
    The mint URI points here: /api/nft/item/{player_id}/{item_id}
    """
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            save = await conn.fetchrow(
                "SELECT save_json FROM game_saves WHERE player_id=$1",
                player_id,
            )

        def _matches(candidate: dict) -> bool:
            if str(candidate.get("id", "")) == item_id:
                return True
            name_slug = candidate.get("name", "").strip().lower().replace(" ", "_")
            return name_slug == item_id

        item = None
        if save and save["save_json"]:
            s = _to_dict(save["save_json"])
            for inv_item in (s.get("inventory") or []):
                if _matches(inv_item):
                    item = inv_item
                    break
            if not item:
                for slot_item in (s.get("equipment") or {}).values():
                    if slot_item and _matches(slot_item):
                        item = slot_item
                        break

        if not item:
            fallback_img  = ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
            fallback_name = ITEM_NAME_BY_ID.get(item_id, item_id.replace("_", " ").title())
            return {
                "name": fallback_name,
                "description": f"Legendary DragonSlayer item · Minted on XRPL",
                "image": fallback_img,
                "attributes": [{"trait_type": "Game", "value": "DragonSlayer"}],
            }

        name = item.get("name", ITEM_NAME_BY_ID.get(item_id, "Unknown Item"))
        rarity = item.get("rarity", "legendary")
        power = item.get("power", 0)
        item_type = item.get("itemType", "weapon")
        item_level = item.get("itemLevel", 1)
        enchant_id = item.get("enchantId") or ""
        reforge_level = item.get("reforgeLevel", 0)
        image = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)

        attributes = [
            {"trait_type": "Rarity",        "value": rarity.title()},
            {"trait_type": "Type",          "value": item_type.title()},
            {"trait_type": "Power",         "value": power},
            {"trait_type": "Item Level",    "value": item_level},
            {"trait_type": "Game",          "value": "DragonSlayer"},
            {"trait_type": "Item Name",     "value": name},
        ]
        if enchant_id:
            attributes.append({"trait_type": "Enchant", "value": enchant_id})
        if reforge_level:
            attributes.append({"trait_type": "Reforge Level", "value": reforge_level})

        return {
            "name": name,
            "description": f"{rarity.title()} DragonSlayer {item_type} · Power {power} · Level {item_level} · Minted on XRPL",
            "image": image,
            "attributes": attributes,
        }
    except Exception as e:
        logger.exception("get_nft_item_metadata error for player=%s item=%s", player_id, item_id)
        return {
            "name": "DragonSlayer Item",
            "description": "A legendary DragonSlayer item.",
            "image": PLACEHOLDER_IMAGE,
            "attributes": [{"trait_type": "Status", "value": "Error"}],
        }


@router.get("/{token_id}")
async def get_nft_metadata(token_id: str):
    """
    Dynamic NFT metadata endpoint.
    The starter NFT's URI field points here so metadata stays live.
    Phase 1: looks up the player by starter_nft_id and returns current game stats.
    Phase 2: when real NFTs are minted, this will serve real on-chain metadata.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        player = await conn.fetchrow(
            "SELECT id, username FROM players WHERE starter_nft_id=$1",
            token_id,
        )

        if not player:
            # Placeholder response for unminted tokens during dev
            return {
                "name": f"DragonSlayer — Placeholder",
                "description": "A DragonSlayer fighter NFT. Art coming soon.",
                "image": PLACEHOLDER_IMAGE,
                "attributes": [
                    {"trait_type": "Status", "value": "Pre-mint Placeholder"},
                ],
            }

        player_id = player["id"]
        username = player["username"] or f"Fighter #{player_id}"

        save = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id=$1",
            player_id,
        )

        if not save or not save["save_json"]:
            return {
                "name": f"DragonSlayer — {username}",
                "description": "A DragonSlayer fighter NFT.",
                "image": PLACEHOLDER_IMAGE,
                "attributes": [{"trait_type": "Level", "value": 1}],
            }

        s = _to_dict(save["save_json"])
        level = s.get("level", 1)
        total_dragons = s.get("totalDragonsSlain", 0)
        total_gold = s.get("totalGoldEarned", 0)
        total_expeditions = s.get("totalExpeditions", 0)

        equipment = s.get("equipment", {})

        NFT_ITEM_NAMES = {"Lynx Sword", "Nomic Shield"}

        def equip_label(slot: str) -> str:
            item = equipment.get(slot)
            if not item:
                return "None"
            name = item.get("name", "")
            nft_id = item.get("nftTokenId")
            if name in NFT_ITEM_NAMES and nft_id:
                return f"✨ {name} (NFT)"
            return f"{item.get('rarity', '').title()} {name}"

        return {
            "name": f"DragonSlayer #{player_id} — {username}",
            "description": (
                f"Level {level} DragonSlayer · "
                f"{total_dragons:,} dragons slain · "
                f"{total_expeditions} expeditions completed"
            ),
            "image": PLACEHOLDER_IMAGE,
            "attributes": [
                {"trait_type": "Level",            "value": level},
                {"trait_type": "Dragons Slain",    "value": total_dragons},
                {"trait_type": "Gold Earned",      "value": total_gold},
                {"trait_type": "Expeditions",      "value": total_expeditions},
                {"trait_type": "Weapon",           "value": equip_label("weapon")},
                {"trait_type": "Shield",           "value": equip_label("shield")},
                {"trait_type": "Helm",             "value": equip_label("helm")},
                {"trait_type": "Armor",            "value": equip_label("armor")},
                {"trait_type": "Ring",             "value": equip_label("ring")},
            ],
        }
