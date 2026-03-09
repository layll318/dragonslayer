import json
import logging
import math
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_pool


def _to_dict(val) -> dict:
    """Safely convert an asyncpg save_json value (string or dict) to a plain dict."""
    if val is None:
        return {}
    if isinstance(val, str):
        return json.loads(val)
    return dict(val)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/arena", tags=["arena"])

MAX_ATTACKS_PER_DAY = 5
GOLD_STEAL_PCT = 0.04  # 4% of opponent's current gold


class AttackRequest(BaseModel):
    attacker_id: int
    defender_id: int
    formation: str  # "rush" | "balanced" | "hold"


def _extract_power(save_json: dict) -> tuple[int, int]:
    """Extract (attack_power, defense_power) from a save_json blob."""
    buildings = save_json.get("buildings", [])
    ATTACK_PER_UNIT = {
        "barracks": 1, "archery_range": 3, "stables": 6,
        "war_forge": 12, "war_camp": 25, "castle": 50,
    }
    DEFENSE_PER_UNIT = {
        "barracks": 2, "archery_range": 2, "stables": 3,
        "war_forge": 10, "war_camp": 20, "castle": 80,
    }
    attack = sum(ATTACK_PER_UNIT.get(b["id"], 0) * b.get("owned", 0) for b in buildings)
    defense = sum(DEFENSE_PER_UNIT.get(b["id"], 0) * b.get("owned", 0) for b in buildings)
    return attack, defense


@router.get("/opponents")
async def get_opponents(
    player_id: int = Query(...),
    limit: int = Query(default=5, le=10),
):
    pool = get_pool()
    async with pool.acquire() as conn:
        # Get requester's army power
        my_save = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id = $1", player_id
        )
        my_attack, _ = _extract_power(_to_dict(my_save["save_json"]) if my_save else {})

        # LEFT JOIN so players who haven't synced a save yet still appear
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        ACTIVE_THRESHOLD = timedelta(minutes=5)

        try:
            rows = await conn.fetch(
                """
                SELECT p.id, p.username, p.wallet_address,
                       COALESCE(gs.save_json, '{}'::jsonb) AS save_json,
                       gs.last_active_at
                FROM players p
                LEFT JOIN game_saves gs ON gs.player_id = p.id
                WHERE p.id != $1
                  AND p.wallet_address IS NOT NULL
                ORDER BY RANDOM()
                LIMIT 50
                """,
                player_id,
            )
            has_active_col = True
        except Exception:
            # last_active_at column doesn't exist yet — fall back without it
            rows = await conn.fetch(
                """
                SELECT p.id, p.username, p.wallet_address,
                       COALESCE(gs.save_json, '{}'::jsonb) AS save_json
                FROM players p
                LEFT JOIN game_saves gs ON gs.player_id = p.id
                WHERE p.id != $1
                  AND p.wallet_address IS NOT NULL
                ORDER BY RANDOM()
                LIMIT 50
                """,
                player_id,
            )
            has_active_col = False

        candidates = []
        for r in rows:
            save = _to_dict(r["save_json"])
            atk, def_pwr = _extract_power(save)
            level = int(save.get("level", 1))
            gold = int(save.get("gold", 0))
            wallet = r["wallet_address"] or ""
            name = (
                r["username"]
                or (f"{wallet[:5]}…{wallet[-4:]}" if len(wallet) >= 10 else wallet)
                or f"Hero #{r['id']}"
            )
            if has_active_col:
                last_active = r["last_active_at"]
                is_active = bool(last_active and (now - last_active) < ACTIVE_THRESHOLD)
            else:
                is_active = False
            candidates.append({
                "player_id": r["id"],
                "name": name,
                "level": level,
                "attack_power": atk,
                "defense_power": def_pwr,
                "idle_gold": gold,
                "buildings": save.get("buildings", []),
                "is_active": is_active,
            })

        # Sort by closeness to player's attack power, pick top `limit`
        candidates.sort(key=lambda c: abs(c["attack_power"] - my_attack))
        chosen = candidates[:limit]
        # Shuffle so it doesn't always show weakest first
        random.shuffle(chosen)

        return {"success": True, "opponents": chosen}


@router.post("/attack")
async def attack(req: AttackRequest):
    pool = get_pool()
    async with pool.acquire() as conn:
        # Load both saves
        attacker_save_row = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id = $1", req.attacker_id
        )
        defender_save_row = await conn.fetchrow(
            "SELECT save_json FROM game_saves WHERE player_id = $1", req.defender_id
        )

        if not attacker_save_row or not defender_save_row:
            raise HTTPException(status_code=404, detail="Player save not found")

        attacker_save = _to_dict(attacker_save_row["save_json"])
        defender_save = _to_dict(defender_save_row["save_json"])

        # Check daily attack limit
        attacks_today = int(attacker_save.get("arenaAttacksToday", 0))
        last_reset = attacker_save.get("arenaLastReset", "")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if last_reset != today:
            attacks_today = 0
        if attacks_today >= MAX_ATTACKS_PER_DAY:
            raise HTTPException(status_code=429, detail="No attacks remaining today")

        # Calculate powers
        atk_power, _ = _extract_power(attacker_save)
        _, def_power = _extract_power(defender_save)

        # Formation multipliers
        formation_mults = {
            "rush":     {"attack": 1.30, "defense": 0.80},
            "balanced": {"attack": 1.00, "defense": 1.00},
            "hold":     {"attack": 0.85, "defense": 1.25},
        }
        fm = formation_mults.get(req.formation, formation_mults["balanced"])

        # Randomised battle resolution
        rand_atk = 0.85 + random.random() * 0.30
        rand_def = 0.85 + random.random() * 0.30
        effective_attack  = atk_power * fm["attack"]  * rand_atk
        effective_defense = def_power * fm["defense"] * rand_def

        win = effective_attack > effective_defense

        # Gold transfer
        defender_gold = int(defender_save.get("gold", 0))
        gold_stolen = int(defender_gold * GOLD_STEAL_PCT) if win else 0

        # Build battle log rounds for animation
        rounds = _build_rounds(atk_power, def_power, win)

        # ── Trophy calculation with level scaling ───────────────────────────
        atk_level = int(attacker_save.get("level", 1))
        def_level = int(defender_save.get("level", 1))
        level_diff = atk_level - def_level
        gain_mult = max(0.25, min(2.0, 1.0 - level_diff * 0.04))

        BASE_TROPHY_WIN  = 25
        BASE_TROPHY_LOSS = 8   # attacker loses if they lose
        trophies_won      = math.ceil(BASE_TROPHY_WIN  * gain_mult) if win  else 0
        trophies_atk_lost = BASE_TROPHY_LOSS                         if not win else 0
        trophies_def_lost = math.ceil(trophies_won / 4)              if win  else 0

        # ── Season soft-reset (apply on first attack of a new month) ────────
        current_month = today[:7]  # "YYYY-MM"

        def _apply_season_reset(save: dict) -> dict:
            if save.get("seasonMonth", "") not in ("", current_month):
                save = dict(save)
                save["trophies"]    = math.floor(int(save.get("trophies", 0)) * 0.25)
                save["seasonMonth"] = current_month
            elif not save.get("seasonMonth"):
                save = dict(save)
                save["seasonMonth"] = current_month
            return save

        attacker_save = _apply_season_reset(attacker_save)
        defender_save = _apply_season_reset(defender_save)

        # ── New trophy totals ────────────────────────────────────────────────
        atk_trophies = max(0, int(attacker_save.get("trophies", 0)) + trophies_won - trophies_atk_lost)
        def_trophies = max(0, int(defender_save.get("trophies", 0)) - trophies_def_lost)

        # ── Build defender's defense log entry ───────────────────────────────
        attacker_name: str = f"Hero #{req.attacker_id}"  # will be enriched below
        atk_player = await conn.fetchrow("SELECT username, wallet_address FROM players WHERE id=$1", req.attacker_id)
        if atk_player:
            wallet = atk_player["wallet_address"] or ""
            attacker_name = (
                atk_player["username"]
                or (f"{wallet[:5]}…{wallet[-4:]}" if len(wallet) >= 10 else wallet)
                or f"Hero #{req.attacker_id}"
            )
        else:
            attacker_name = f"Hero #{req.attacker_id}"

        defense_entry = {
            "attackerName": attacker_name,
            "trophiesLost": trophies_def_lost,
            "goldLost": gold_stolen if win else 0,
            "result": "loss" if win else "win",
            "ts": int(datetime.now(timezone.utc).timestamp() * 1000),
        }

        # Keep last 10 defense log entries
        def_log = list(defender_save.get("defenseLog", []))
        def_log.insert(0, defense_entry)
        def_log = def_log[:10]

        # ── Record battle ────────────────────────────────────────────────────
        await conn.execute(
            """
            INSERT INTO arena_battles
                (attacker_id, defender_id, attacker_power, defender_power,
                 formation, result, gold_stolen, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            """,
            req.attacker_id, req.defender_id,
            int(effective_attack), int(effective_defense),
            req.formation, "win" if win else "loss",
            gold_stolen,
        )

        # ── Update attacker save ─────────────────────────────────────────────
        new_attacks = attacks_today + 1
        arena_pts   = int(attacker_save.get("arenaPoints", 0)) + (10 if win else 2)

        await conn.execute(
            """
            UPDATE game_saves
            SET save_json = save_json ||
                jsonb_build_object(
                    'arenaAttacksToday', $2::int,
                    'arenaLastReset',    $3::text,
                    'arenaPoints',       $4::int,
                    'trophies',          $5::int,
                    'seasonMonth',       $6::text
                ),
                updated_at = NOW()
            WHERE player_id = $1
            """,
            req.attacker_id, new_attacks, today, arena_pts, atk_trophies, current_month,
        )

        # ── Update defender save (gold + trophies + defenseLog) ─────────────
        new_defender_gold = max(0, defender_gold - gold_stolen) if win else defender_gold
        await conn.execute(
            """
            UPDATE game_saves
            SET save_json = save_json ||
                jsonb_build_object(
                    'gold',        $2::text::jsonb,
                    'trophies',    $3::int,
                    'seasonMonth', $4::text,
                    'defenseLog',  $5::jsonb
                ),
                updated_at = NOW()
            WHERE player_id = $1
            """,
            req.defender_id,
            str(new_defender_gold),
            def_trophies,
            current_month,
            json.dumps(def_log),
        )

        return {
            "success": True,
            "win": win,
            "gold_stolen": gold_stolen,
            "effective_attack": int(effective_attack),
            "effective_defense": int(effective_defense),
            "rounds": rounds,
            "attacks_remaining": MAX_ATTACKS_PER_DAY - new_attacks,
            "arena_points": arena_pts,
            "trophies": atk_trophies,
            "trophies_won": trophies_won,
            "trophies_lost": trophies_atk_lost,
        }


def _build_rounds(atk: int, def_pwr: int, win: bool) -> list[dict]:
    """Generate 3 narrative battle rounds for the animation."""
    rounds = []
    if atk > def_pwr * 1.5:
        rounds = [
            {"label": "Round 1", "desc": "Your cavalry charges — the enemy line breaks!"},
            {"label": "Round 2", "desc": "Archers rain down fire — defenders scatter!"},
            {"label": "Round 3", "desc": "VICTORY — the castle falls!"},
        ]
    elif win:
        rounds = [
            {"label": "Round 1", "desc": "Both lines clash — heavy losses on both sides."},
            {"label": "Round 2", "desc": "Your War Forge troops push through the flanks."},
            {"label": "Round 3", "desc": "VICTORY — a hard-fought triumph!"},
        ]
    elif def_pwr > atk * 1.5:
        rounds = [
            {"label": "Round 1", "desc": "The enemy castle walls hold firm — your troops falter."},
            {"label": "Round 2", "desc": "Their knights countercharge — your lines break!"},
            {"label": "Round 3", "desc": "DEFEAT — regroup and try again."},
        ]
    else:
        rounds = [
            {"label": "Round 1", "desc": "A fierce opening exchange — neither side yields."},
            {"label": "Round 2", "desc": "Your formation falters under heavy fire."},
            {"label": "Round 3", "desc": "DEFEAT — the enemy defenses held."},
        ]
    return rounds
