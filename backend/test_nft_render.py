"""
Quick local test: renders a sample NFT card and opens it.
Run from backend/ directory:  python test_nft_render.py
"""
import io, pathlib, sys
from PIL import Image, ImageDraw, ImageFont

IMAGES_DIR = pathlib.Path(__file__).parent / "images"

RARITY_BORDER_COLOR = {
    "common":    (120, 120, 120),
    "uncommon":  (74,  222, 128),
    "rare":      (96,  165, 250),
    "epic":      (192, 132, 252),
    "legendary": (240, 192, 64),
}

def _font(size: int):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/verdanab.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def render(name, rarity, power, item_level, enchant_id, reforge_level, image_file) -> bytes:
    SIZE = 600
    img_path = IMAGES_DIR / image_file
    if not img_path.exists():
        print(f"  [!] Image not found: {img_path}, using placeholder colour")
        img = Image.new("RGBA", (SIZE, SIZE), (26, 14, 0, 255))
    else:
        img = Image.open(img_path).convert("RGBA").resize((SIZE, SIZE))

    border_color = RARITY_BORDER_COLOR.get(rarity.lower(), (120, 120, 120))
    frame = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=(*border_color, 220), width=8)
    img = Image.alpha_composite(img, frame)

    panel_h = 120
    panel = Image.new("RGBA", (SIZE, panel_h), (0, 0, 0, 0))
    for y in range(panel_h):
        alpha = int(220 * (y / panel_h))
        ImageDraw.Draw(panel).line([(0, y), (SIZE, y)], fill=(10, 6, 2, alpha))
    img.paste(panel, (0, SIZE - panel_h), panel)

    draw = ImageDraw.Draw(img)
    font_name  = _font(28)
    font_label = _font(22)
    font_small = _font(17)

    def _text(xy, txt, font, fill):
        x, y = xy
        shadow = (0, 0, 0, 200)
        for dx, dy in ((-1,-1),(1,-1),(-1,1),(1,1),(0,-1),(0,1),(-1,0),(1,0)):
            draw.text((x+dx, y+dy), txt, font=font, fill=shadow)
        draw.text(xy, txt, font=font, fill=fill)

    rc = border_color
    y_base = SIZE - panel_h + 10
    _text((16, y_base),       name,                                   font_name,  (*rc, 255))
    _text((16, y_base + 34),  f"Lv {item_level}   {power} PWR",      font_label, (220, 200, 150, 255))
    enchant_label = f"  |  {enchant_id.replace('_', ' ').title()}" if enchant_id else ""
    reforge_label = f"  |  Reforge +{reforge_level}"                if reforge_level else ""
    _text((16, y_base + 62),  f"{rarity.title()}{enchant_label}{reforge_label}", font_small, (160, 140, 100, 230))
    _text((SIZE - 80, 12),    "* NFT",                                font_small, (*rc, 220))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


# All mintable items (commons skipped — never minted)
SAMPLES = [
    # ── Legendary (unique art per item) ──
    dict(name="Lynx Sword",         rarity="legendary", power=98,  item_level=25, enchant_id="weapon_rare",  reforge_level=0, image_file="nft/lynx_sword.png"),
    dict(name="Nomic Shield",       rarity="legendary", power=95,  item_level=25, enchant_id="shield_rare",  reforge_level=0, image_file="nft/nomic_shield.png"),
    dict(name="Infernal Crown",     rarity="legendary", power=90,  item_level=25, enchant_id="",             reforge_level=0, image_file="nft/infernal_crown_legendary.png"),
    dict(name="Dragon Plate",       rarity="legendary", power=100, item_level=25, enchant_id="",             reforge_level=0, image_file="nft/dragon_plate.png"),
    dict(name="Dragon's Eye",       rarity="legendary", power=85,  item_level=25, enchant_id="",             reforge_level=0, image_file="nft/dragons_eye.png"),
    dict(name="Void Blade",         rarity="legendary", power=118, item_level=40, enchant_id="weapon_rare",  reforge_level=1, image_file="nft/void_blade.png"),
    dict(name="Dragon's Aegis",     rarity="legendary", power=115, item_level=40, enchant_id="shield_rare",  reforge_level=1, image_file="nft/dragons_aegis.png"),
    dict(name="Eternal Ring",       rarity="legendary", power=105, item_level=40, enchant_id="ring_unique",  reforge_level=1, image_file="nft/eternal_ring.png"),
    dict(name="Dragonslayer Blade", rarity="legendary", power=130, item_level=55, enchant_id="",             reforge_level=2, image_file="nft/dragonslayer_blade.png"),
    dict(name="Nomic Fortress",     rarity="legendary", power=125, item_level=55, enchant_id="",             reforge_level=2, image_file="nft/nomic_fortress.png"),
    # ── Epic / T4 (unique art per item) ──
    dict(name="Dragon Fang",        rarity="epic",      power=30,  item_level=8,  enchant_id="",             reforge_level=0, image_file="nft/dragon_fang.png"),
    dict(name="Aegis",              rarity="epic",      power=26,  item_level=7,  enchant_id="",             reforge_level=0, image_file="nft/aegis.png"),
    dict(name="Demon Helm",         rarity="epic",      power=24,  item_level=9,  enchant_id="",             reforge_level=0, image_file="nft/demon_helm.png"),
    dict(name="Infernal Plate",     rarity="epic",      power=34,  item_level=10, enchant_id="",             reforge_level=0, image_file="nft/infernal_plate.png"),
    dict(name="Ancient Sigil",      rarity="epic",      power=22,  item_level=6,  enchant_id="ring_unique",  reforge_level=0, image_file="nft/ancient_sigil.png"),
    # ── Rare (T3) ──
    dict(name="Flame Blade",        rarity="rare",      power=18,  item_level=5,  enchant_id="",            reforge_level=0, image_file="nft/weapon_flame_blade.png"),
    dict(name="Dragon Shield",      rarity="rare",      power=16,  item_level=4,  enchant_id="",            reforge_level=0, image_file="nft/shield_dragon.png"),
    dict(name="Infernal Crown",     rarity="rare",      power=14,  item_level=4,  enchant_id="",            reforge_level=0, image_file="nft/helm_infernal_crown.png"),
    dict(name="Dragonscale Armor",  rarity="rare",      power=20,  item_level=5,  enchant_id="",            reforge_level=0, image_file="nft/armor_dragonscale.png"),
    dict(name="Dragon's Seal",      rarity="rare",      power=13,  item_level=3,  enchant_id="",            reforge_level=0, image_file="nft/ring_dragons_seal.png"),
    # ── Uncommon (T2) ──
    dict(name="Steel Sword",        rarity="uncommon",  power=10,  item_level=2,  enchant_id="",            reforge_level=0, image_file="nft/weapon_steel_sword.png"),
    dict(name="Iron Shield",        rarity="uncommon",  power=9,   item_level=2,  enchant_id="",            reforge_level=0, image_file="nft/shield_iron.png"),
    dict(name="Scale Helm",         rarity="uncommon",  power=8,   item_level=2,  enchant_id="",            reforge_level=0, image_file="nft/helm_scale.png"),
    dict(name="Chain Armor",        rarity="uncommon",  power=10,  item_level=2,  enchant_id="",            reforge_level=0, image_file="nft/armor_chain.png"),
    dict(name="Flame Ring",         rarity="uncommon",  power=7,   item_level=2,  enchant_id="",            reforge_level=0, image_file="nft/ring_flame.png"),
]

out_dir = pathlib.Path(__file__).parent / "test_renders"
out_dir.mkdir(exist_ok=True)

print(f"Rendering {len(SAMPLES)} sample NFT cards to {out_dir}/")
for s in SAMPLES:
    png = render(**s)
    slug = s["name"].lower().replace(" ", "_").replace("'", "")
    out_path = out_dir / f"{slug}_{s['rarity']}.png"
    out_path.write_bytes(png)
    print(f"  OK  {out_path.name}  ({len(png)//1024} KB)")

# Open the first one automatically
import subprocess, os
first_slug = SAMPLES[0]["name"].lower().replace(" ", "_").replace("'", "")
first = out_dir / f"{first_slug}_legendary.png"
print(f"\nOpening {first.name} ...")
if sys.platform == "win32":
    os.startfile(str(first))
elif sys.platform == "darwin":
    subprocess.run(["open", str(first)])
else:
    subprocess.run(["xdg-open", str(first)])

print("Done — all renders saved to backend/test_renders/")
