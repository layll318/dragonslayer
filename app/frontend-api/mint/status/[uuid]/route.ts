import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY    = process.env.XAMAN_API_KEY    || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE       = 'https://xumm.app/api/v1/platform';

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } },
) {
  const { uuid } = params;
  if (!uuid) return NextResponse.json({ error: 'Missing uuid' }, { status: 400 });
  if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
    return NextResponse.json({ error: 'Xaman credentials not configured' }, { status: 500 });
  }

  const res = await fetch(`${XAMAN_BASE}/payload/${uuid}`, {
    headers: {
      'X-API-Key':    XAMAN_API_KEY,
      'X-API-Secret': XAMAN_API_SECRET,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch payload' }, { status: res.status });
  }

  const data = await res.json();
  const meta     = data.meta     ?? {};
  const response = data.response ?? {};
  const payload  = data.payload  ?? {};

  // nft_token_id was stored in custom_meta.blob during server-mint step
  // Note: custom_meta is at top-level data.custom_meta, blob is a plain object
  let tokenId: string | null = response.nftoken_id ?? null;
  if (!tokenId) {
    try {
      const blob = data.custom_meta?.blob;
      if (blob && typeof blob === 'object') {
        tokenId = (blob as Record<string, unknown>).nft_token_id as string ?? null;
      } else if (typeof blob === 'string') {
        tokenId = JSON.parse(blob).nft_token_id ?? null;
      }
    } catch { /* ignore parse errors */ }
  }

  console.log(`[mint/status] uuid=${uuid} signed=${meta.signed} cancelled=${meta.cancelled} expired=${meta.expired} tokenId=${tokenId}`);

  return NextResponse.json(
    {
      signed:    !!meta.signed,
      cancelled: !!meta.cancelled,
      expired:   !!meta.expired,
      tokenId,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    },
  );
}
