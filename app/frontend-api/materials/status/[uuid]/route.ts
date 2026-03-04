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

  // Extract the memo we embedded in the return_url at creation time
  let memo = '';
  try {
    const returnUrl: string = data.next?.always ?? '';
    if (returnUrl) {
      memo = new URL(returnUrl).searchParams.get('mat_purchase') ?? '';
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    signed:            !!meta.signed,
    cancelled:         !!meta.cancelled,
    expired:           !!meta.expired,
    dispatched_result: response.dispatched_result ?? null,
    memo,
  });
}
