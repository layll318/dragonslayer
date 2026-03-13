import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY    = process.env.XAMAN_API_KEY    || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE       = 'https://xumm.app/api/v1/platform';
const TREASURY_WALLET  = process.env.TREASURY_WALLET  || 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';

const DROPS_PER_XRP = 1_000_000;
const SOUL_PACKS = [
  { id: 'souls_50',  xrp: 5,  souls: 50,  label: '50 Dragon Souls' },
  { id: 'souls_125', xrp: 10, souls: 125, label: '125 Dragon Souls' },
] as const;

export async function POST(request: NextRequest) {
  try {
    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json({ error: 'Xaman API credentials not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { packId, wallet } = body as { packId?: string; wallet?: string };

    const pack = SOUL_PACKS.find(p => p.id === packId) ?? SOUL_PACKS[0];
    const amountDrops = pack.xrp * DROPS_PER_XRP;
    const memo = `souls:${pack.souls}`;

    const origin = request.headers.get('origin') || 'https://dragonslayer-production.up.railway.app';
    const cleanOrigin = origin.replace(/\/$/, '').split('/').slice(0, 3).join('/');
    const returnUrl = `${cleanOrigin}/?soul_purchase=${encodeURIComponent(memo)}`;

    const res = await fetch(`${XAMAN_BASE}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     XAMAN_API_KEY,
        'X-API-Secret':  XAMAN_API_SECRET,
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: 'Payment',
          Destination: TREASURY_WALLET,
          Amount: String(amountDrops),
          ...(wallet ? { Account: wallet } : {}),
        },
        options: {
          submit: true,
          return_url: { app: returnUrl, web: returnUrl },
        },
        custom_meta: {
          instruction: `Pay ${pack.xrp} XRP for ${pack.souls} Dragon Souls`,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Xaman souls buy error:', err);
      return NextResponse.json({ error: 'Xaman rejected the request' }, { status: res.status });
    }

    const data = await res.json();
    const uuid: string     = data.uuid;
    const deeplink: string = data.next?.always ?? `https://xumm.app/sign/${uuid}`;
    const qr_png: string   = data.refs?.qr_png ?? null;

    return NextResponse.json({ success: true, uuid, deeplink, qr_png, memo, souls: pack.souls, xrp: pack.xrp });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Souls buy route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
