import logging
from fastapi import APIRouter, HTTPException
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nft", tags=["nft"])

PLACEHOLDER_IMAGE = "https://placehold.co/600x600/1a0e00/f0c040?text=DragonSlayer"


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

        def equip_label(slot: str) -> str:
            item = equipment.get(slot)
            if not item:
                return "None"
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
