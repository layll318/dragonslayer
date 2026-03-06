import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY = process.env.XAMAN_API_KEY || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE = 'https://xumm.app/api/v1/platform';

export async function GET(request: NextRequest) {
  try {
    // strip any cache-buster suffix (uuid may have ?t= handled by URLSearchParams already)
    const rawUuid = request.nextUrl.searchParams.get('uuid');
    const uuid = rawUuid?.split('?')[0] ?? null;
    if (!uuid) {
      return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    }

    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json({ error: 'Xaman API credentials not configured' }, { status: 500 });
    }

    const res = await fetch(`${XAMAN_BASE}/payload/${uuid}`, {
      headers: {
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Payload not found' }, { status: res.status });
    }

    const data = await res.json();

    // Log the full raw Xaman response so we can see what's actually returned
    console.log('Xaman payload raw:', JSON.stringify({
      meta: data.meta,
      response: data.response,
    }));

    // account can live in several places depending on Xaman version / payload type
    const account =
      data.response?.account ||
      data.response?.signer  ||
      data.meta?.signers?.[0] ||
      null;

    const payload = {
      resolved:  data.meta?.resolved  ?? false,
      signed:    data.meta?.signed    ?? false,
      cancelled: data.meta?.cancelled ?? false,
      expired:   data.meta?.expired   ?? false,
      account,
      // debug fields so the client UI can show exactly what Xaman returned
      _dbg: {
        resp_account: data.response?.account ?? null,
        resp_signer:  data.response?.signer  ?? null,
        signers:      data.meta?.signers     ?? null,
        resolved:     data.meta?.resolved    ?? null,
      },
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Xaman payload poll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
