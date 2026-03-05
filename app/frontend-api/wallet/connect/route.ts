import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY = process.env.XAMAN_API_KEY || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE = 'https://xumm.app/api/v1/platform';

export async function POST(request: NextRequest) {
  try {
    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json(
        { error: 'Xaman API credentials not configured' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const returnTo = typeof body?.returnTo === 'string' && body.returnTo.startsWith('/')
      ? body.returnTo
      : '/';

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      'https://dragonslayer-production.up.railway.app'
    ).replace(/\/$/, '');
    // {id} is replaced by Xaman with the payload UUID on redirect
    const returnUrl = `${appUrl}/wallet-connected?returnTo=${encodeURIComponent(returnTo)}&id={id}`;

    const res = await fetch(`${XAMAN_BASE}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET,
      },
      body: JSON.stringify({
        txjson: { TransactionType: 'SignIn' },
        options: {
          submit: false,
          return_url: { app: returnUrl, web: returnUrl },
        },
        custom_meta: { instruction: 'Sign in to DragonSlayer' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Xaman API error:', err);
      return NextResponse.json(
        { error: 'Xaman API rejected the request' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const uuid: string = data.uuid;
    const qr_png: string = data.refs?.qr_png ?? null;
    const deeplink: string = data.next?.always ?? `https://xumm.app/sign/${uuid}`;

    return NextResponse.json({ success: true, uuid, qr_png, deeplink });
  } catch (error: any) {
    console.error('Xaman connect error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create sign-in request' },
      { status: 500 }
    );
  }
}
