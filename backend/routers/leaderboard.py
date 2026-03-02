import logging
from fastapi import APIRouter, Query
from typing import Optional
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("")
async def get_leaderboard(
    limit: int = Query(default=20, le=50),
    player_id: Optional[int] = Query(default=None),
):
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                p.id,
                p.username,
                p.wallet_address,
                COALESCE((gs.save_json->>'level')::int, 1)              AS level,
                COALESCE((gs.save_json->>'totalGoldEarned')::bigint, 0) AS total_gold,
                COALESCE((gs.save_json->>'totalTaps')::bigint, 0)       AS total_taps
            FROM players p
            LEFT JOIN game_saves gs ON gs.player_id = p.id
            ORDER BY total_gold DESC
            LIMIT $1
            """,
            limit,
        )

        entries = []
        for i, r in enumerate(rows):
            wallet = r["wallet_address"] or ""
            display = (
                r["username"]
                or (f"{wallet[:5]}…{wallet[-4:]}" if len(wallet) >= 10 else wallet)
                or f"Hero #{r['id']}"
            )
            entries.append({
                "rank": i + 1,
                "player_id": r["id"],
                "name": display,
                "level": r["level"],
                "total_gold": r["total_gold"],
                "total_taps": r["total_taps"],
            })

        # Own rank (if not in top-N)
        own_rank = None
        if player_id is not None:
            rank_row = await conn.fetchrow(
                """
                SELECT COUNT(*) + 1 AS rank
                FROM players p2
                LEFT JOIN game_saves gs2 ON gs2.player_id = p2.id
                WHERE COALESCE((gs2.save_json->>'totalGoldEarned')::bigint, 0) >
                      (
                          SELECT COALESCE((gs3.save_json->>'totalGoldEarned')::bigint, 0)
                          FROM game_saves gs3
                          WHERE gs3.player_id = $1
                      )
                """,
                player_id,
            )
            if rank_row:
                own_rank = rank_row["rank"]

        return {
            "success": True,
            "entries": entries,
            "total_players": len(rows),
            "own_rank": own_rank,
        }
