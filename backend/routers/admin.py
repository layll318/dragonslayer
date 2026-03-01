import logging
import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


def verify_admin(authorization: Optional[str]):
    admin_token = os.getenv("ADMIN_TOKEN", "")
    if not admin_token:
        raise HTTPException(status_code=500, detail="ADMIN_TOKEN not configured")
    expected = f"Bearer {admin_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


class OriginRequest(BaseModel):
    origin: str
    label: Optional[str] = None
    enabled: bool = True


class OriginResponse(BaseModel):
    id: int
    origin: str
    label: Optional[str]
    enabled: bool


@router.get("/embed/origins")
async def list_origins(authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, origin, label, enabled FROM embed_origins ORDER BY created_at DESC"
        )
        return [dict(r) for r in rows]


@router.post("/embed/origins", response_model=OriginResponse)
async def add_origin(req: OriginRequest, authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO embed_origins (origin, label, enabled)
            VALUES ($1, $2, $3)
            ON CONFLICT (origin) DO UPDATE SET label=$2, enabled=$3
            RETURNING id, origin, label, enabled
            """,
            req.origin, req.label, req.enabled,
        )
        return OriginResponse(**dict(row))


@router.delete("/embed/origins/{origin_id}")
async def delete_origin(origin_id: int, authorization: Optional[str] = Header(None)):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM embed_origins WHERE id=$1", origin_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Origin not found")
        return {"success": True, "deleted_id": origin_id}


@router.patch("/embed/origins/{origin_id}")
async def toggle_origin(
    origin_id: int,
    enabled: bool,
    authorization: Optional[str] = Header(None),
):
    verify_admin(authorization)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE embed_origins SET enabled=$1 WHERE id=$2 RETURNING id, origin, label, enabled",
            enabled, origin_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Origin not found")
        return OriginResponse(**dict(row))
