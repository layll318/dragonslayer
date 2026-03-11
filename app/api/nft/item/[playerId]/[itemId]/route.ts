import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-7363.up.railway.app';

export async function GET(
  _request: NextRequest,
  { params }: { params: { playerId: string; itemId: string } },
) {
  const { playerId, itemId } = params;
  const res = await fetch(`${BACKEND_URL}/api/nft/item/${playerId}/${itemId}`, {
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
