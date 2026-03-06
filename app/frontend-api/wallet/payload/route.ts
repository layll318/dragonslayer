import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY = process.env.XAMAN_API_KEY || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE = 'https://xumm.app/api/v1/platform';

export async function GET(request: NextRequest) {
  try {
    const uuid = request.nextUrl.searchParams.get('uuid');
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

    // account can live in response.account or response.signer depending on Xaman version
    const account = data.response?.account || data.response?.signer || null;

    return NextResponse.json({
      resolved:  data.meta?.resolved  ?? false,
      signed:    data.meta?.signed    ?? false,
      cancelled: data.meta?.cancelled ?? false,
      expired:   data.meta?.expired   ?? false,
      account,
    });
  } catch (error: any) {
    console.error('Xaman payload poll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
