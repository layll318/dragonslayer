"""
DragonSlayer — NFT Placeholder Trading Card Generator
Outputs 29 PNG trading cards (600x840) to public/images/nft/
Run: python generate_nft_placeholders.py
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent / "public" / "images" / "nft"
OUT_DIR.mkdir(parents=True, exist_ok=True)

IMG_DIR = Path(__file__).parent / "public" / "images"

W, H = 600, 840
BORDER = 10
ART_H = 400

RARITY_COLORS = {
    "common":    "#9a9a9a",
    "uncommon":  "#4ade80",
    "rare":      "#60a5fa",
    "epic":      "#c084fc",
    "legendary": "#f0c040",
}

ART_BG = {
    "common":    [(20, 20, 20),    (40, 40, 40)],
    "uncommon":  [(10, 28, 10),    (20, 50, 20)],
    "rare":      [(10, 14, 30),    (20, 28, 55)],
    "epic":      [(22, 10, 36),    (40, 18, 60)],
    "legendary": [(26, 20, 0),     (50, 38, 0)],
}

SLOT_ICONS = {
    "weapon": "WEAPON",
    "shield": "SHIELD",
    "helm":   "HELM",
    "armor":  "ARMOR",
    "ring":   "RING",
}


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def load_font(size, bold=False):
    font_names = [
        "arialbd.ttf" if bold else "arial.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf",
    ]
    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def gradient_rect(draw, x0, y0, x1, y1, top_rgb, bot_rgb):
    height = y1 - y0
    for y in range(height):
        t = y / max(height - 1, 1)
        r = int(top_rgb[0] + (bot_rgb[0] - top_rgb[0]) * t)
        g = int(top_rgb[1] + (bot_rgb[1] - top_rgb[1]) * t)
        b = int(top_rgb[2] + (bot_rgb[2] - top_rgb[2]) * t)
        draw.line([(x0, y0 + y), (x1, y0 + y)], fill=(r, g, b))


def draw_border(draw, rarity, width=BORDER):
    col = hex_to_rgb(RARITY_COLORS[rarity])
    for i in range(width):
        draw.rectangle([i, i, W - 1 - i, H - 1 - i], outline=col)


def make_card(filename, name, rarity, nft_type, stats_lines,
              art_image_path=None, art_label=None):
    img = Image.new("RGB", (W, H), (10, 8, 6))
    draw = ImageDraw.Draw(img)

    top_c, bot_c = ART_BG[rarity]
    gradient_rect(draw, BORDER, BORDER, W - BORDER, BORDER + ART_H, top_c, bot_c)

    if art_image_path and Path(art_image_path).exists():
        art = Image.open(art_image_path).convert("RGBA")
        art_w, art_h = art.size
        scale = min((W - BORDER * 2) / art_w, ART_H / art_h, 1.0)
        new_w = int(art_w * scale)
        new_h = int(art_h * scale)
        art = art.resize((new_w, new_h), Image.LANCZOS)
        ox = (W - new_w) // 2
        oy = BORDER + (ART_H - new_h) // 2
        img.paste(art, (ox, oy), art)
    elif art_label:
        lbl_font = load_font(90, bold=True)
        col = hex_to_rgb(RARITY_COLORS[rarity])
        faded = tuple(int(c * 0.6) for c in col)
        bbox = draw.textbbox((0, 0), art_label, font=lbl_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            ((W - tw) // 2, BORDER + (ART_H - th) // 2),
            art_label,
            font=lbl_font,
            fill=faded,
        )

    header_y = BORDER
    draw.rectangle([BORDER, header_y, W - BORDER, header_y + 36],
                   fill=(10, 8, 6, 200))
    hfont = load_font(13, bold=True)
    draw.text((BORDER + 10, header_y + 10), "DRAGONSLAYER", font=hfont,
              fill=(180, 150, 60))
    type_label = nft_type.upper()
    draw.text((W - BORDER - 10 - len(type_label) * 8, header_y + 10),
              type_label, font=hfont, fill=(140, 120, 90))

    name_y = BORDER + ART_H
    rarity_rgb = hex_to_rgb(RARITY_COLORS[rarity])
    dark_rarity = tuple(int(c * 0.25) for c in rarity_rgb)
    draw.rectangle([BORDER, name_y, W - BORDER, name_y + 58], fill=dark_rarity)

    nfont = load_font(24, bold=True)
    draw.text((BORDER + 14, name_y + 7), name, font=nfont, fill=rarity_rgb)

    sfont = load_font(13)
    rarity_label = f"{rarity.upper()}  ·  {nft_type.upper()}"
    draw.text((BORDER + 14, name_y + 37), rarity_label, font=sfont,
              fill=tuple(int(c * 0.8) for c in rarity_rgb))

    stats_y = name_y + 64
    draw.rectangle([BORDER, stats_y, W - BORDER, H - BORDER - 28],
                   fill=(16, 12, 8))

    stat_font = load_font(16)
    line_h = 28
    for i, line in enumerate(stats_lines):
        draw.text((BORDER + 18, stats_y + 12 + i * line_h), line,
                  font=stat_font, fill=(200, 180, 140))

    foot_font = load_font(11)
    foot_text = "DragonSlayer Collection  ·  xrpl.org"
    fb = draw.textbbox((0, 0), foot_text, font=foot_font)
    fw = fb[2] - fb[0]
    draw.text(((W - fw) // 2, H - BORDER - 20), foot_text,
              font=foot_font, fill=(80, 65, 45))

    draw_border(draw, rarity)

    out_path = OUT_DIR / filename
    img.save(out_path, "PNG")
    print(f"  OK  {filename}")
    return out_path


def main():
    print(f"\nGenerating NFT placeholders -> {OUT_DIR}\n")

    SLAYER = [
        IMG_DIR / "slayer1.png",
        IMG_DIR / "slayer2.png",
        IMG_DIR / "slayer3.png",
        IMG_DIR / "salyer4.png",
        IMG_DIR / "slayer5.png",
    ]
    BOSS1 = IMG_DIR / "boss1.png"
    BOSS2 = IMG_DIR / "boss2.png"

    PLAYER_TIERS = [
        ("common",    "Peasant",      1),
        ("uncommon",  "Squire",       2),
        ("rare",      "Knight",       3),
        ("epic",      "Dragon Knight",4),
        ("legendary", "Legend",       5),
    ]
    for rarity, title, tier in PLAYER_TIERS:
        make_card(
            f"player_tier{tier}.png",
            f"DragonSlayer — {title}",
            rarity,
            "Player",
            [
                f"  Tier:        {tier}",
                f"  Title:       {title}",
                "  Taxon:      1  (non-transferable)",
                "  Metadata:   Live — updates with game",
            ],
            art_image_path=SLAYER[tier - 1],
        )

    WEAPONS = [
        ("iron_sword",   "Iron Sword",   "common",   5),
        ("steel_sword",  "Steel Sword",  "uncommon", 10),
        ("flame_blade",  "Flame Blade",  "rare",     18),
        ("dragon_fang",  "Dragon Fang",  "epic",     30),
    ]
    for fid, name, rarity, power in WEAPONS:
        make_card(
            f"weapon_{fid}.png", name, rarity, "Weapon",
            [f"  Power:    {power}", "  Slot:     Weapon", "  Taxon:   2  (transferable)"],
            art_label="SWORD",
        )

    SHIELDS = [
        ("oak",    "Oak Shield",    "common",   4),
        ("iron",   "Iron Shield",   "uncommon", 9),
        ("dragon", "Dragon Shield", "rare",     16),
        ("aegis",  "Aegis",         "epic",     26),
    ]
    for fid, name, rarity, power in SHIELDS:
        make_card(
            f"shield_{fid}.png", name, rarity, "Shield",
            [f"  Power:    {power}", "  Slot:     Shield", "  Taxon:   2  (transferable)"],
            art_label="SHIELD",
        )

    HELMS = [
        ("iron",           "Iron Helm",      "common",   3),
        ("scale",          "Scale Helm",     "uncommon", 8),
        ("infernal_crown", "Infernal Crown", "rare",     14),
        ("demon",          "Demon Helm",     "epic",     24),
    ]
    for fid, name, rarity, power in HELMS:
        make_card(
            f"helm_{fid}.png", name, rarity, "Helm",
            [f"  Power:    {power}", "  Slot:     Helm  (unlocks Lv3)", "  Taxon:   2  (transferable)"],
            art_label="HELM",
        )

    ARMORS = [
        ("leather",       "Leather Armor",     "common",   4),
        ("chain",         "Chain Armor",        "uncommon", 10),
        ("dragonscale",   "Dragonscale Armor",  "rare",     20),
        ("infernal_plate","Infernal Plate",     "epic",     34),
    ]
    for fid, name, rarity, power in ARMORS:
        make_card(
            f"armor_{fid}.png", name, rarity, "Armor",
            [f"  Power:    {power}", "  Slot:     Armor  (unlocks Lv6)", "  Taxon:   2  (transferable)"],
            art_label="ARMOR",
        )

    RINGS = [
        ("iron",         "Iron Ring",     "common",   2),
        ("flame",        "Flame Ring",    "uncommon", 7),
        ("dragons_seal", "Dragon's Seal", "rare",     13),
        ("ancient_sigil","Ancient Sigil", "epic",     22),
    ]
    for fid, name, rarity, power in RINGS:
        make_card(
            f"ring_{fid}.png", name, rarity, "Ring",
            [f"  Power:    {power}", "  Slot:     Ring  (unlocks Lv10)", "  Taxon:   2  (transferable)"],
            art_label="RING",
        )

    EGGS = [
        ("common",    "Dragon Egg — Common",    "common",    "1h",  "+5% gold / tap",      BOSS1),
        ("uncommon",  "Dragon Egg — Uncommon",  "uncommon",  "2h",  "+10 army power",       BOSS1),
        ("rare",      "Dragon Egg — Rare",      "rare",      "4h",  "+15% material drops",  BOSS2),
        ("legendary", "Dragon Egg — Legendary", "legendary", "6h",  "-10% expedition time", BOSS2),
    ]
    for fid, name, rarity, hatch, bonus, art in EGGS:
        make_card(
            f"egg_{fid}.png", name, rarity, "Dragon Egg",
            [
                f"  Hatch time:  {hatch}",
                f"  Bonus:       {bonus}",
                "  Re-hatches after 24h cooldown",
                "  Taxon:       3  (transferable)",
            ],
            art_image_path=art,
        )

    print(f"\nDone - {len(list(OUT_DIR.glob('*.png')))} images in {OUT_DIR}\n")


if __name__ == "__main__":
    main()
