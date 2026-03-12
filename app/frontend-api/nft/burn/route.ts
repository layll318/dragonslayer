import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY    = process.env.XAMAN_API_KEY    || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE       = 'https://xumm.app/api/v1/platform';

export async function POST(request: NextRequest) {
  try {
    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json({ error: 'Xaman API credentials not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { wallet, itemId, itemName, itemRarity, nftTokenId } = body as {
      wallet?: string;
      itemId?: string;
      itemName?: string;
      itemRarity?: string;
      nftTokenId?: string;
    };

    if (!wallet || !itemId || !nftTokenId) {
      return NextResponse.json({ error: 'Missing wallet, itemId, or nftTokenId' }, { status: 400 });
    }

    const rarityLabel = itemRarity ? itemRarity.charAt(0).toUpperCase() + itemRarity.slice(1) : 'Legendary';
    const instruction = `Permanently burn "${itemName ?? 'item'}" NFT (${rarityLabel}) — this destroys it on-chain and cannot be undone.`;

    const origin = request.headers.get('origin') || 'https://dragonslayer-production.up.railway.app';
    const cleanOrigin = origin.replace(/\/$/, '').split('/').slice(0, 3).join('/');
    const returnUrl = `${cleanOrigin}/`;

    const res = await fetch(`${XAMAN_BASE}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     XAMAN_API_KEY,
        'X-API-Secret':  XAMAN_API_SECRET,
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: 'NFTokenBurn',
          Account: wallet,
          NFTokenID: nftTokenId,
        },
        options: {
          submit: true,
          force_network: 'MAINNET',
          return_url: { app: returnUrl, web: returnUrl },
        },
        custom_meta: {
          instruction,
          blob: { item_id: itemId, nft_token_id: nftTokenId },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Xaman NFTokenBurn create error:', errText);
      return NextResponse.json({ error: `Xaman rejected: ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    const uuid: string     = data.uuid;
    const deeplink: string = data.next?.always ?? `https://xumm.app/sign/${uuid}`;
    const qr_png: string   = data.refs?.qr_png ?? null;

    console.log(`[nft/burn] payload uuid=${uuid} item=${itemName} nftTokenId=${nftTokenId}`);
    return NextResponse.json({ success: true, uuid, deeplink, qr_png });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('NFT burn route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
