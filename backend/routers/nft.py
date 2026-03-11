import logging
import os
from fastapi import APIRouter, HTTPException, Request
from database import get_pool
from xrpl.asyncio.clients import AsyncWebsocketClient
from xrpl.asyncio.transaction import submit_and_wait
from xrpl.models.transactions import NFTokenMint, NFTokenCreateOffer
from xrpl.wallet import Wallet
from xrpl.utils import get_nftoken_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nft", tags=["nft"])

PLACEHOLDER_IMAGE = "https://placehold.co/600x600/1a0e00/f0c040?text=DragonSlayer"
BASE_URL = "https://dragonslayer-production.up.railway.app"
XRPL_NODE = os.environ.get("XRPL_NODE", "wss://xrplcluster.com")
XRPL_WALLET_SEED = os.environ.get("XRPL_WALLET_SEED", "")

ITEM_IMAGE_MAP = {
    "Lynx Sword":   f"{BASE_URL}/images/lynxsword.png",
    "Nomic Shield": f"{BASE_URL}/images/nomicsshield.png",
    "Dragon Fang":  f"{BASE_URL}/images/swordlvl4.png",
    "Aegis":        f"{BASE_URL}/images/shieldlvl4.png",
}


@router.post("/mint-item")
async def server_mint_item(request: Request):
    """
    Server mints an NFT from the game wallet, then creates a 0-XRP sell offer
    to the player's wallet. The player accepts the offer via Xaman to claim.
    """
    body = await request.json()
    player_id = body.get("player_id")
    item_id = body.get("item_id")
    player_wallet = body.get("player_wallet")

    if not player_id or not item_id or not player_wallet:
        raise HTTPException(status_code=400, detail="Missing player_id, item_id, or player_wallet")

    if not XRPL_WALLET_SEED:
        raise HTTPException(status_code=500, detail="XRPL_WALLET_SEED not configured on server")

    meta_url = f"{BASE_URL}/api/nft/item/{player_id}/{item_id}"
    uri_hex = meta_url.encode("utf-8").hex().upper()

    server_wallet = Wallet.from_seed(XRPL_WALLET_SEED)

    try:
        async with AsyncWebsocketClient(XRPL_NODE) as client:
            mint_tx = NFTokenMint(
                account=server_wallet.classic_address,
                nftoken_taxon=0,
                flags=8,
                uri=uri_hex,
            )
            mint_response = await submit_and_wait(mint_tx, client, server_wallet)
            nft_token_id = get_nftoken_id(mint_response.result)

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
    pool = get_pool()
    async with pool.acquire() as conn:
        save = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id=$1",
            player_id,
        )

    item = None
    if save and save["save_json"]:
        s = save["save_json"]
        # Search inventory
        for inv_item in (s.get("inventory") or []):
            if str(inv_item.get("id", "")) == item_id:
                item = inv_item
                break
        # Search equipment slots
        if not item:
            for slot_item in (s.get("equipment") or {}).values():
                if slot_item and str(slot_item.get("id", "")) == item_id:
                    item = slot_item
                    break

    if not item:
        return {
            "name": "DragonSlayer Item",
            "description": "A legendary DragonSlayer item minted on XRPL.",
            "image": PLACEHOLDER_IMAGE,
            "attributes": [{"trait_type": "Status", "value": "Unknown"}],
        }

    name = item.get("name", "Unknown Item")
    rarity = item.get("rarity", "legendary")
    power = item.get("power", 0)
    item_type = item.get("itemType", "weapon")
    image = ITEM_IMAGE_MAP.get(name, PLACEHOLDER_IMAGE)

    return {
        "name": name,
        "description": f"{rarity.title()} DragonSlayer {item_type} · Power {power} · Minted on XRPL",
        "image": image,
        "external_url": f"{BASE_URL}/profile/{player_id}",
        "attributes": [
            {"trait_type": "Rarity",    "value": rarity.title()},
            {"trait_type": "Type",      "value": item_type.title()},
            {"trait_type": "Power",     "value": power},
            {"trait_type": "Game",      "value": "DragonSlayer"},
            {"trait_type": "Item Name", "value": name},
        ],
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

        s = save["save_json"]
        level = s.get("level", 1)
        total_dragons = s.get("totalDragonsSlain", 0)
        total_gold = s.get("totalGoldEarned", 0)
        total_expeditions = s.get("totalExpeditions", 0)

        equipment = s.get("equipment", {})

        NFT_ITEM_NAMES = {"lynx_sword": "Lynx Sword", "nomic_shield": "Nomic Shield"}

        def equip_label(slot: str) -> str:
            item = equipment.get(slot)
            if not item:
                return "None"
            item_id = item.get("id", "")
            if item_id in NFT_ITEM_NAMES:
                return f"✨ {NFT_ITEM_NAMES[item_id]} (NFT)"
            return f"{item.get('rarity', '').title()} {item.get('name', '')}"

        return {
            "name": f"DragonSlayer #{player_id} — {username}",
            "description": (
                f"Level {level} DragonSlayer · "
                f"{total_dragons:,} dragons slain · "
                f"{total_expeditions} expeditions completed"
            ),
            "image": PLACEHOLDER_IMAGE,
            "external_url": f"https://dragonslayer.app/profile/{player_id}",
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
