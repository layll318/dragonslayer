import logging
from fastapi import APIRouter, Query
from pydantic import BaseModel
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/embed", tags=["embed"])


class OriginCheckResponse(BaseModel):
    allowed: bool
    origin: str


@router.get("/check", response_model=OriginCheckResponse)
async def check_origin(origin: str = Query(..., description="The requesting iframe origin")):
    """Check if an origin is whitelisted to embed the game."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT enabled FROM embed_origins WHERE origin=$1", origin
        )
        allowed = bool(row and row["enabled"])
        return OriginCheckResponse(allowed=allowed, origin=origin)
