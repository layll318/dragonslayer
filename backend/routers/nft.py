import io
import json
import logging
import os
import aiohttp
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from database import get_pool
from xrpl.asyncio.clients import AsyncJsonRpcClient
from xrpl.asyncio.transaction import submit_and_wait
from xrpl.models.transactions import NFTokenMint, NFTokenCreateOffer
from xrpl.wallet import Wallet
try:
    from PIL import Image, ImageDraw, ImageFont
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False


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

# All artwork lives in public/images/nft/ on the frontend (Next.js serves it)
_NFT = f"{FRONTEND_URL}/images/nft"
_ROOT = f"{FRONTEND_URL}/images"

ITEM_IMAGE_BY_NAME = {
    # Legendary — unique art where available, else best match from nft/
    "Lynx Sword":          f"{_ROOT}/lynxsword.png",
    "Nomic Shield":        f"{_ROOT}/nomicsshield.png",
    "Void Blade":          f"{_NFT}/weapon_dragon_fang.png",
    "Dragon's Aegis":      f"{_NFT}/shield_aegis.png",
    "Dragonslayer Blade":  f"{_ROOT}/lynxsword.png",
    "Nomic Fortress":      f"{_ROOT}/nomicsshield.png",
    "Infernal Crown":      f"{_NFT}/helm_infernal_crown.png",
    "Dragon Plate":        f"{_NFT}/armor_dragonscale.png",
    "Dragon's Eye":        f"{_NFT}/ring_ancient_sigil.png",
    "Eternal Ring":        f"{_NFT}/ring_ancient_sigil.png",
    # Epic (T4)
    "Dragon Fang":         f"{_NFT}/weapon_dragon_fang.png",
    "Aegis":               f"{_NFT}/shield_aegis.png",
    "Demon Helm":          f"{_NFT}/helm_demon.png",
    "Infernal Plate":      f"{_NFT}/armor_infernal_plate.png",
    "Ancient Sigil":       f"{_NFT}/ring_ancient_sigil.png",
    # Rare (T3)
    "Flame Blade":         f"{_NFT}/weapon_flame_blade.png",
    "Dragon Shield":       f"{_NFT}/shield_dragon.png",
    "Dragonscale Armor":   f"{_NFT}/armor_dragonscale.png",
    "Dragon's Seal":       f"{_NFT}/ring_dragons_seal.png",
    # Uncommon (T2)
    "Steel Sword":         f"{_NFT}/weapon_steel_sword.png",
    "Iron Shield":         f"{_NFT}/shield_iron.png",
    "Scale Helm":          f"{_NFT}/helm_scale.png",
    "Chain Armor":         f"{_NFT}/armor_chain.png",
    "Flame Ring":          f"{_NFT}/ring_flame.png",
    # Common (T1)
    "Iron Sword":          f"{_NFT}/weapon_iron_sword.png",
    "Oak Shield":          f"{_NFT}/shield_oak.png",
    "Iron Helm":           f"{_NFT}/helm_iron.png",
    "Leather Armor":       f"{_NFT}/armor_leather.png",
    "Iron Ring":           f"{_NFT}/ring_iron.png",
}

ITEM_IMAGE_BY_ID = {
    "lynx_sword":          f"{_ROOT}/lynxsword.png",
    "nomic_shield":        f"{_ROOT}/nomicsshield.png",
    "dragon_fang":         f"{_NFT}/weapon_dragon_fang.png",
    "aegis":               f"{_NFT}/shield_aegis.png",
    "demon_helm":          f"{_NFT}/helm_demon.png",
    "infernal_plate":      f"{_NFT}/armor_infernal_plate.png",
    "ancient_sigil":       f"{_NFT}/ring_ancient_sigil.png",
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

RARITY_BORDER_COLOR = {
    "common":    (120, 120, 120),
    "uncommon":  (74,  222, 128),
    "rare":      (96,  165, 250),
    "epic":      (192, 132, 252),
    "legendary": (240, 192, 64),
}

# Keep legacy alias for backwards compat
ITEM_IMAGE_MAP = ITEM_IMAGE_BY_NAME


async def _fetch_image_bytes(url: str) -> bytes | None:
    """Download image bytes from a URL; returns None on failure."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                if resp.status == 200:
                    return await resp.read()
    except Exception:
        pass
    return None


def _render_item_card(
    base_bytes: bytes,
    name: str,
    rarity: str,
    power: int,
    item_level: int,
    enchant_id: str,
    reforge_level: int,
) -> bytes:
    """
    Composite a 600×600 item card PNG using Pillow:
    • base artwork  • bottom gradient panel
    • rarity-coloured border  • level / power / enchant overlay text
    """
    SIZE = 600
    img = Image.open(io.BytesIO(base_bytes)).convert("RGBA").resize((SIZE, SIZE))

    # ── Rarity border (8 px inset frame) ──────────────────────────────────────
    border_color = RARITY_BORDER_COLOR.get(rarity.lower(), (120, 120, 120))
    frame = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    bw = 8
    fd.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=(*border_color, 220), width=bw)
    img = Image.alpha_composite(img, frame)

    # ── Bottom gradient panel (bottom 120 px) ─────────────────────────────────
    panel_h = 120
    panel = Image.new("RGBA", (SIZE, panel_h), (0, 0, 0, 0))
    for y in range(panel_h):
        alpha = int(220 * (y / panel_h))
        ImageDraw.Draw(panel).line([(0, y), (SIZE, y)], fill=(10, 6, 2, alpha))
    img.paste(panel, (0, SIZE - panel_h), panel)

    draw = ImageDraw.Draw(img)

    # ── Fonts (fall back to default bitmap) ───────────────────────────────────
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    def _font(size: int):
        for p in font_paths:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
        return ImageFont.load_default()

    font_name   = _font(26)
    font_label  = _font(20)
    font_small  = _font(16)

    rc = border_color  # rarity colour
    y_base = SIZE - panel_h + 8

    # Item name
    draw.text((16, y_base), name, font=font_name, fill=(*rc, 255))
    # Level + Power row
    draw.text((16, y_base + 32), f"Lv {item_level}  ⚡ {power} PWR", font=font_label, fill=(220, 200, 150, 255))
    # Rarity + enchant row
    enchant_label = f"  ·  {enchant_id.replace('_', ' ').title()}" if enchant_id else ""
    reforge_label = f"  ·  Reforge {reforge_level}" if reforge_level else ""
    sub = f"{rarity.title()}{enchant_label}{reforge_label}"
    draw.text((16, y_base + 58), sub, font=font_small, fill=(160, 140, 100, 220))

    # ── NFT watermark (top-right corner) ──────────────────────────────────────
    draw.text((SIZE - 72, 12), "✦ NFT", font=font_small, fill=(*rc, 200))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


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
                "description": "Legendary DragonSlayer item · Minted on XRPL",
                "image": fallback_img,
                "external_url": FRONTEND_URL,
                "attributes": [{"trait_type": "Game", "value": "DragonSlayer"}],
            }

        name = item.get("name", ITEM_NAME_BY_ID.get(item_id, "Unknown Item"))
        rarity = item.get("rarity", "legendary")
        power = item.get("power", 0)
        item_type = item.get("itemType", "weapon")
        item_level = item.get("itemLevel", 1)
        enchant_id = item.get("enchantId") or ""
        reforge_level = item.get("reforgeLevel", 0)

        # Use Pillow render endpoint as live image if available
        render_url = f"{BACKEND_URL}/api/nft/render/{player_id}/{item_id}"
        static_url = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
        image = render_url if PILLOW_AVAILABLE else static_url

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
            "external_url": FRONTEND_URL,
            "attributes": attributes,
        }
    except Exception as e:
        logger.exception("get_nft_item_metadata error for player=%s item=%s", player_id, item_id)
        return {
            "name": "DragonSlayer Item",
            "description": "A legendary DragonSlayer item.",
            "image": PLACEHOLDER_IMAGE,
            "external_url": FRONTEND_URL,
            "attributes": [{"trait_type": "Status", "value": "Error"}],
        }


@router.get("/render/{player_id}/{item_id}")
async def render_nft_item_image(player_id: int, item_id: str):
    """
    Dynamically renders a 600×600 PNG for a crafted item card.
    Overlays rarity border, item name, level, power and enchant onto
    the base artwork using Pillow.  Falls back to a redirect to the
    static artwork if Pillow is unavailable.
    """
    if not PILLOW_AVAILABLE:
        static = ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=static)

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
            return candidate.get("name", "").strip().lower().replace(" ", "_") == item_id

        item = None
        if save and save["save_json"]:
            s = _to_dict(save["save_json"])
            for it in (s.get("inventory") or []):
                if _matches(it):
                    item = it
                    break
            if not item:
                for it in (s.get("equipment") or {}).values():
                    if it and _matches(it):
                        item = it
                        break

        name         = (item or {}).get("name",        ITEM_NAME_BY_ID.get(item_id, item_id.replace("_", " ").title()))
        rarity       = (item or {}).get("rarity",      "legendary")
        power        = (item or {}).get("power",       0)
        item_level   = (item or {}).get("itemLevel",   1)
        enchant_id   = (item or {}).get("enchantId")   or ""
        reforge_level= (item or {}).get("reforgeLevel",0)

        base_url = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
        base_bytes = await _fetch_image_bytes(base_url)

        if not base_bytes:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=base_url)

        png_bytes = _render_item_card(
            base_bytes, name, rarity, power, item_level, enchant_id, reforge_level
        )
        return Response(content=png_bytes, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=300"})
    except Exception:
        logger.exception("render_nft_item_image error player=%s item=%s", player_id, item_id)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=PLACEHOLDER_IMAGE)


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
            return {
                "name": "DragonSlayer — Placeholder",
                "description": "A DragonSlayer fighter NFT. Art coming soon.",
                "image": PLACEHOLDER_IMAGE,
                "external_url": FRONTEND_URL,
                "attributes": [{"trait_type": "Status", "value": "Pre-mint Placeholder"}],
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
                "external_url": FRONTEND_URL,
                "attributes": [{"trait_type": "Level", "value": 1}],
            }

        s = _to_dict(save["save_json"])
        level = s.get("level", 1)
        total_dragons = s.get("totalDragonsSlain", 0)
        total_gold = s.get("totalGoldEarned", 0)
        total_expeditions = s.get("totalExpeditions", 0)

        equipment = s.get("equipment", {})

        def equip_label(slot: str) -> str:
            item = equipment.get(slot)
            if not item:
                return "None"
            name = item.get("name", "")
            nft_id = item.get("nftTokenId")
            lvl = item.get("itemLevel") or item.get("reforgeLevel") or 0
            suffix = f" Lv{lvl}" if lvl else ""
            prefix = "✨ " if nft_id else ""
            return f"{prefix}{item.get('rarity', '').title()} {name}{suffix}"

        return {
            "name": f"DragonSlayer #{player_id} — {username}",
            "description": (
                f"Level {level} DragonSlayer · "
                f"{total_dragons:,} dragons slain · "
                f"{total_expeditions} expeditions completed"
            ),
            "image": PLACEHOLDER_IMAGE,
            "external_url": FRONTEND_URL,
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
