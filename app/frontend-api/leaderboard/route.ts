import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function GET(request: NextRequest) {
  try {
    if (!API_URL) {
      return NextResponse.json({ success: false, entries: [], error: 'API not configured' });
    }

    const playerId = request.nextUrl.searchParams.get('player_id');
    const limit = request.nextUrl.searchParams.get('limit') || '20';

    const params = new URLSearchParams({ limit });
    if (playerId) params.set('player_id', playerId);

    const res = await fetch(`${API_URL}/api/leaderboard?${params}`, {
      next: { revalidate: 30 }, // cache 30s
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, entries: [], error: 'Backend unavailable' });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ success: false, entries: [], error: 'Failed to load leaderboard' });
  }
}
