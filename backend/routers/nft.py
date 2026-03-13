import io
import json
import logging
import os
import pathlib
import re
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
    import PIL as _PIL
    _PIL_FONTS_DIR = os.path.join(os.path.dirname(_PIL.__file__), "fonts")
    PILLOW_AVAILABLE = True
except ImportError:
    _PIL_FONTS_DIR = ""
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
_raw_backend  = os.environ.get("BACKEND_URL",  "https://backend-production-7363.up.railway.app")
_raw_frontend = os.environ.get("FRONTEND_URL", "https://dragonslayer-production.up.railway.app")
BACKEND_URL  = _raw_backend  if _raw_backend.startswith("http")  else f"https://{_raw_backend}"
FRONTEND_URL = _raw_frontend if _raw_frontend.startswith("http") else f"https://{_raw_frontend}"
XRPL_NODE = os.environ.get("XRPL_NODE", "https://s1.ripple.com:51234/")
XRPL_WALLET_SEED = os.environ.get("XRPL_WALLET_SEED", "")

# Local images directory (backend/images/) — populated at deploy time
_IMAGES_DIR = pathlib.Path(__file__).parent.parent / "images"

# Self-hosted image URLs served from the backend's /images static mount
_NFT  = f"{BACKEND_URL}/images/nft"
_ROOT = f"{BACKEND_URL}/images"

# Human name → image filename (local file under backend/images/)
# Legendary + Epic each have a UNIQUE filename — drop real art at that path to go live.
# Rare / Uncommon / Common share generic tier art (never NFT-minted).
_IMAGE_FILE: dict[str, str] = {
    # ── Legendary (unique art per item) ──────────────────────────────────────
    "Lynx Sword":          "nft/lynx_sword.png",
    "Nomic Shield":        "nft/nomic_shield.png",
    "Void Blade":          "nft/void_blade.png",
    "Dragon's Aegis":      "nft/dragons_aegis.png",
    "Dragonslayer Blade":  "nft/dragonslayer_blade.png",
    "Nomic Fortress":      "nft/nomic_fortress.png",
    "Infernal Crown":      "nft/infernal_crown_legendary.png",
    "Dragon Plate":        "nft/dragon_plate.png",
    "Dragon's Eye":        "nft/dragons_eye.png",
    "Eternal Ring":        "nft/eternal_ring.png",
    # ── Epic / T4 (unique art per item) ──────────────────────────────────────
    "Dragon Fang":         "nft/dragon_fang.png",
    "Aegis":               "nft/aegis.png",
    "Demon Helm":          "nft/demon_helm.png",
    "Infernal Plate":      "nft/infernal_plate.png",
    "Ancient Sigil":       "nft/ancient_sigil.png",
    # ── Rare / T3 ─────────────────────────────────────────────────────────────
    "Flame Blade":         "nft/weapon_flame_blade.png",
    "Dragon Shield":       "nft/shield_dragon.png",
    "Dragonscale Armor":   "nft/armor_dragonscale.png",
    "Dragon's Seal":       "nft/ring_dragons_seal.png",
    # ── Uncommon / T2 ────────────────────────────────────────────────────────
    "Steel Sword":         "nft/weapon_steel_sword.png",
    "Iron Shield":         "nft/shield_iron.png",
    "Scale Helm":          "nft/helm_scale.png",
    "Chain Armor":         "nft/armor_chain.png",
    "Flame Ring":          "nft/ring_flame.png",
    # ── Common / T1 (never minted) ───────────────────────────────────────────
    "Iron Sword":          "nft/weapon_iron_sword.png",
    "Oak Shield":          "nft/shield_oak.png",
    "Iron Helm":           "nft/helm_iron.png",
    "Leather Armor":       "nft/armor_leather.png",
    "Iron Ring":           "nft/ring_iron.png",
}

# ID-based fallback (catches items whose name lookup ambiguously hits the
# legendary entry, e.g. rare 'infernal_crown' vs legendary 'infernal_crown_l')
_IMAGE_FILE_BY_ID: dict[str, str] = {
    # Legendary
    "lynx_sword":            "nft/lynx_sword.png",
    "nomic_shield":          "nft/nomic_shield.png",
    "void_blade":            "nft/void_blade.png",
    "dragons_aegis":         "nft/dragons_aegis.png",
    "dragonslayer_blade":    "nft/dragonslayer_blade.png",
    "nomic_fortress":        "nft/nomic_fortress.png",
    "infernal_crown_l":      "nft/infernal_crown_legendary.png",
    "dragon_plate":          "nft/dragon_plate.png",
    "dragons_eye":           "nft/dragons_eye.png",
    "eternal_ring":          "nft/eternal_ring.png",
    # Epic
    "dragon_fang":           "nft/dragon_fang.png",
    "aegis":                 "nft/aegis.png",
    "demon_helm":            "nft/demon_helm.png",
    "infernal_plate":        "nft/infernal_plate.png",
    "ancient_sigil":         "nft/ancient_sigil.png",
    # Rare (id-specific so rare infernal_crown doesn't get legendary art)
    "infernal_crown":        "nft/helm_infernal_crown.png",
    "flame_blade":           "nft/weapon_flame_blade.png",
    "dragon_shield":         "nft/shield_dragon.png",
    "dragonscale_armor":     "nft/armor_dragonscale.png",
    "dragons_seal":          "nft/ring_dragons_seal.png",
}

def _image_url(filename: str) -> str:
    """Return the backend-hosted URL for a given image filename."""
    return f"{BACKEND_URL}/images/{filename}"

ITEM_IMAGE_BY_NAME = {k: _image_url(v) for k, v in _IMAGE_FILE.items()}
ITEM_IMAGE_BY_ID   = {k: _image_url(v) for k, v in _IMAGE_FILE_BY_ID.items()}


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

ITEM_IMAGE_MAP = ITEM_IMAGE_BY_NAME  # legacy alias


def _local_image_bytes(filename: str) -> bytes | None:
    """Load image bytes from the local backend/images/ directory."""
    try:
        path = _IMAGES_DIR / filename
        if path.exists():
            return path.read_bytes()
    except Exception:
        pass
    return None


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


async def _load_item_image(name: str, item_id: str) -> bytes | None:
    """Load item base image: local file first (fast), then HTTP fallback."""
    filename = _IMAGE_FILE.get(name) or _IMAGE_FILE_BY_ID.get(item_id)
    if filename:
        data = _local_image_bytes(filename)
        if data:
            return data
    # HTTP fallback
    url = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
    return await _fetch_image_bytes(url)


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

    # ── Fonts: system TTFs (nixpacks installs fonts-dejavu-core) then Pillow default
    font_paths = [
        os.path.join(_PIL_FONTS_DIR, "DejaVuSans.ttf"),              # bundled inside Pillow package
        os.path.join(_PIL_FONTS_DIR, "DejaVuSans-Bold.ttf"),         # bundled inside Pillow package
        "/tmp/DejaVuSans-Bold.ttf",                                   # downloaded at startup
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",      # nixpacks: fonts-dejavu-core
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",                # some distros
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/local/share/fonts/DejaVuSans-Bold.ttf",
    ]
    def _font(size: int):
        for p in font_paths:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
        # Pillow ≥10.1 supports load_default(size=N) — returns a scalable bitmap
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()

    font_name  = _font(28)
    font_label = _font(22)
    font_small = _font(17)

    def _text(d: ImageDraw.ImageDraw, xy, txt, font, fill):
        """Draw text with a dark 1-px stroke for legibility on any background."""
        x, y = xy
        shadow = (0, 0, 0, 200)
        for dx, dy in ((-1,-1),(1,-1),(-1,1),(1,1),(0,-1),(0,1),(-1,0),(1,0)):
            d.text((x+dx, y+dy), txt, font=font, fill=shadow)
        d.text(xy, txt, font=font, fill=fill)

    rc = border_color  # rarity colour
    y_base = SIZE - panel_h + 10

    # Item name
    _text(draw, (16, y_base), name, font_name, (*rc, 255))
    # Level + Power row
    _text(draw, (16, y_base + 34), f"Lv {item_level}   {power} PWR", font_label, (220, 200, 150, 255))
    # Rarity + enchant row
    enchant_label = f"  |  {enchant_id.replace('_', ' ').title()}" if enchant_id else ""
    reforge_label = f"  |  Reforge +{reforge_level}" if reforge_level else ""
    sub = f"{rarity.title()}{enchant_label}{reforge_label}"
    _text(draw, (16, y_base + 62), sub, font_small, (160, 140, 100, 230))

    # ── NFT badge (top-right corner) ──────────────────────────────────────────
    _text(draw, (SIZE - 80, 12), "* NFT", font_small, (*rc, 220))

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
    # Full item fields — used to store accurate item_data at mint time
    item_rarity      = body.get("item_rarity", "legendary")
    item_type        = body.get("item_type", "weapon")
    item_power       = int(body.get("item_power", 0))
    item_level       = int(body.get("item_level", 25))
    enchant_id       = body.get("enchant_id", "") or ""
    reforge_level    = int(body.get("reforge_level", 0))

    if not player_id or not item_id or not player_wallet:
        raise HTTPException(status_code=400, detail="Missing player_id, item_id, or player_wallet")

    if not XRPL_WALLET_SEED:
        raise HTTPException(status_code=500, detail="XRPL_WALLET_SEED not configured on server")

    # Sanitize slug: strip apostrophes + any non-alphanumeric/underscore chars
    raw_slug = item_name.strip().lower().replace(" ", "_") if item_name else item_id
    item_slug = re.sub(r"[^a-z0-9_]", "", raw_slug)
    meta_url = f"{BACKEND_URL}/api/nft/item/{player_id}/{item_slug}"
    uri_hex = meta_url.encode("utf-8").hex().upper()

    server_wallet = Wallet.from_seed(XRPL_WALLET_SEED)

    try:
        client = AsyncJsonRpcClient(XRPL_NODE)
        # flags = tfBurnable (0x01) | tfTransferable (0x08) | tfMutable (0x10) = 25
        #   tfBurnable    — issuer can burn even when held by another account (NFTokenBurn)
        #   tfTransferable — NFT can be traded/transferred between accounts
        #   tfMutable      — URI can be updated via NFTokenModify (makes metadata truly dynamic)
        # Source: https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint
        mint_tx = NFTokenMint(
            account=server_wallet.classic_address,
            nftoken_taxon=1,
            flags=25,
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

        # Save to player_nfts table (best-effort — don't fail the mint)
        full_item_data = {
            "id":           item_id,
            "name":         item_name,
            "rarity":       item_rarity,
            "itemType":     item_type,
            "power":        item_power,
            "itemLevel":    item_level,
            "enchantId":    enchant_id,
            "reforgeLevel": reforge_level,
            "player_id":    int(player_id),
            "nftTokenId":   nft_token_id,
        }
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO player_nfts (nft_token_id, player_id, item_id, item_name, item_data)
                    VALUES ($1, $2, $3, $4, $5::jsonb)
                    ON CONFLICT (nft_token_id) DO UPDATE
                      SET player_id=EXCLUDED.player_id, item_id=EXCLUDED.item_id,
                          item_name=EXCLUDED.item_name, item_data=EXCLUDED.item_data,
                          updated_at=NOW()
                    """,
                    nft_token_id, int(player_id), item_id, item_name,
                    json.dumps(full_item_data),
                )
        except Exception:
            logger.exception("player_nfts insert failed for token=%s", nft_token_id)

        return {"nft_token_id": nft_token_id, "offer_index": offer_index}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("server_mint_item error")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/player-nft/{nft_token_id}")
async def delete_player_nft(nft_token_id: str):
    """Called by the frontend after on-chain NFTokenBurn is confirmed to clean up player_nfts."""
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM player_nfts WHERE nft_token_id=$1", nft_token_id
            )
        return {"success": True}
    except Exception as e:
        logger.exception("delete_player_nft error token=%s", nft_token_id)
        raise HTTPException(status_code=500, detail=str(e))


def _slug(text: str) -> str:
    """Normalise a name/id to a clean URL slug matching what server_mint_item generates."""
    return re.sub(r"[^a-z0-9_]", "", text.strip().lower().replace(" ", "_"))


@router.get("/item/{player_id}/{item_id}")
async def get_nft_item_metadata(player_id: int, item_id: str):
    """
    XRPL NFT metadata for a crafted legendary item.
    The mint URI points here: /api/nft/item/{player_id}/{item_id}
    DB (player_nfts) is the primary source of truth; game_saves is the fallback.
    """
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Primary: player_nfts table (always up-to-date via save sync)
            nft_row = await conn.fetchrow(
                """
                SELECT item_data FROM player_nfts
                 WHERE player_id=$1 AND (item_id=$2 OR item_id=$3)
                 LIMIT 1
                """,
                player_id, item_id, _slug(item_id),
            )
            save = None
            if not nft_row:
                save = await conn.fetchrow(
                    "SELECT save_json FROM game_saves WHERE player_id=$1", player_id
                )

        def _matches(candidate: dict) -> bool:
            if _slug(str(candidate.get("id", ""))) == _slug(item_id):
                return True
            return _slug(candidate.get("name", "")) == _slug(item_id)

        item = None
        if nft_row:
            item = _to_dict(nft_row["item_data"])
        elif save and save["save_json"]:
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
                "collection": {"name": "DragonSlayer Items", "family": "DragonSlayer"},
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
            "description": f"{rarity.title()} DragonSlayer {item_type} - Power {power} - Level {item_level} - Minted on XRPL",
            "image": image,
            "external_url": FRONTEND_URL,
            "collection": {"name": "DragonSlayer Items", "family": "DragonSlayer"},
            "attributes": attributes,
        }
    except Exception as e:
        logger.exception("get_nft_item_metadata error for player=%s item=%s", player_id, item_id)
        return {
            "name": "DragonSlayer Item",
            "description": "A legendary DragonSlayer item.",
            "image": PLACEHOLDER_IMAGE,
            "external_url": FRONTEND_URL,
            "collection": {"name": "DragonSlayer Items", "family": "DragonSlayer"},
            "attributes": [{"trait_type": "Status", "value": "Error"}],
        }


@router.get("/render/{player_id}/{item_id}")
async def render_nft_item_image(player_id: int, item_id: str):
    """
    Dynamically renders a 600×600 PNG for a crafted item card.
    DB (player_nfts) is the primary source of truth for item stats.
    Falls back to game_saves, then to a static image redirect.
    """
    if not PILLOW_AVAILABLE:
        static = ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=static)

    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Primary: player_nfts (always current via save sync)
            nft_row = await conn.fetchrow(
                """
                SELECT item_data FROM player_nfts
                 WHERE player_id=$1 AND (item_id=$2 OR item_id=$3)
                 LIMIT 1
                """,
                player_id, item_id, _slug(item_id),
            )
            save = None
            if not nft_row:
                save = await conn.fetchrow(
                    "SELECT save_json FROM game_saves WHERE player_id=$1", player_id
                )

        item = None
        if nft_row:
            item = _to_dict(nft_row["item_data"])
        elif save and save["save_json"]:
            s = _to_dict(save["save_json"])
            for it in (s.get("inventory") or []):
                if _slug(str(it.get("id", ""))) == _slug(item_id) or \
                   _slug(it.get("name", "")) == _slug(item_id):
                    item = it
                    break
            if not item:
                for it in (s.get("equipment") or {}).values():
                    if it and (_slug(str(it.get("id", ""))) == _slug(item_id) or
                               _slug(it.get("name", "")) == _slug(item_id)):
                        item = it
                        break

        name         = (item or {}).get("name",        ITEM_NAME_BY_ID.get(item_id, item_id.replace("_", " ").title()))
        rarity       = (item or {}).get("rarity",      "legendary")
        power        = (item or {}).get("power",       0)
        item_level   = (item or {}).get("itemLevel",   1)
        enchant_id   = (item or {}).get("enchantId")   or ""
        reforge_level= (item or {}).get("reforgeLevel",0)

        base_bytes = await _load_item_image(name, item_id)

        if not base_bytes:
            from fastapi.responses import RedirectResponse
            fallback = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
            return RedirectResponse(url=fallback)

        png_bytes = _render_item_card(
            base_bytes, name, rarity, power, item_level, enchant_id, reforge_level
        )
        return Response(content=png_bytes, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=60"})
    except Exception:
        logger.exception("render_nft_item_image error player=%s item=%s", player_id, item_id)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=PLACEHOLDER_IMAGE)


@router.get("/token/{nft_token_id}")
async def get_nft_by_token_id(nft_token_id: str):
    """
    Direct metadata lookup by on-chain NFT token ID.
    Checks player_nfts table first, then falls back to game_saves.
    Used by wallets, explorers, and marketplaces that scan the XRPL.
    """
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM player_nfts WHERE nft_token_id=$1", nft_token_id
            )
        if row:
            item_data = _to_dict(row["item_data"])
            player_id = row["player_id"]
            item_id   = row["item_id"] or ""
            name      = item_data.get("name", row["item_name"] or "Unknown Item")
            rarity    = item_data.get("rarity", "legendary")
            power     = item_data.get("power", 0)
            item_type = item_data.get("itemType", "weapon")
            item_level= item_data.get("itemLevel", 25)
            enchant_id= item_data.get("enchantId") or ""
            reforge   = item_data.get("reforgeLevel", 0)

            render_url = f"{BACKEND_URL}/api/nft/render/{player_id}/{item_id}" if player_id else None
            static_url = ITEM_IMAGE_BY_NAME.get(name) or ITEM_IMAGE_BY_ID.get(item_id, PLACEHOLDER_IMAGE)
            image      = render_url if PILLOW_AVAILABLE and player_id else static_url

            attributes = [
                {"trait_type": "Rarity",     "value": rarity.title()},
                {"trait_type": "Type",       "value": item_type.title()},
                {"trait_type": "Power",      "value": power},
                {"trait_type": "Item Level", "value": item_level},
                {"trait_type": "Game",       "value": "DragonSlayer"},
            ]
            if enchant_id:
                attributes.append({"trait_type": "Enchant", "value": enchant_id})
            if reforge:
                attributes.append({"trait_type": "Reforge Level", "value": reforge})

            return {
                "name": name,
                "description": f"{rarity.title()} DragonSlayer {item_type} - Power {power} - Lv {item_level} - Minted on XRPL",
                "image": image,
                "external_url": FRONTEND_URL,
                "collection": {"name": "DragonSlayer Items", "family": "DragonSlayer"},
                "attributes": attributes,
            }
    except Exception:
        logger.exception("get_nft_by_token_id error token=%s", nft_token_id)

    return {
        "name": "DragonSlayer Item",
        "description": "A DragonSlayer item NFT.",
        "image": PLACEHOLDER_IMAGE,
        "external_url": FRONTEND_URL,
        "collection": {"name": "DragonSlayer Items", "family": "DragonSlayer"},
        "attributes": [],
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
            return {
                "name": "DragonSlayer — Placeholder",
                "description": "A DragonSlayer fighter NFT. Art coming soon.",
                "image": PLACEHOLDER_IMAGE,
                "external_url": FRONTEND_URL,
                "collection": {"name": "DragonSlayer Fighters", "family": "DragonSlayer"},
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
                "collection": {"name": "DragonSlayer Fighters", "family": "DragonSlayer"},
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
            prefix = "[NFT] " if nft_id else ""
            return f"{prefix}{item.get('rarity', '').title()} {name}{suffix}"

        return {
            "name": f"DragonSlayer #{player_id} - {username}",
            "description": (
                f"Level {level} DragonSlayer - "
                f"{total_dragons:,} dragons slain - "
                f"{total_expeditions} expeditions completed"
            ),
            "image": PLACEHOLDER_IMAGE,
            "external_url": FRONTEND_URL,
            "collection": {"name": "DragonSlayer Fighters", "family": "DragonSlayer"},
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
