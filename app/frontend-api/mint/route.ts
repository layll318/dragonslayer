import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY    = process.env.XAMAN_API_KEY    || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE       = 'https://xumm.app/api/v1/platform';

function toHex(str: string): string {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json({ error: 'Xaman API credentials not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { wallet, itemId, itemName, itemRarity, itemPower, itemType, playerId } = body as {
      wallet?: string;
      itemId?: string;
      itemName?: string;
      itemRarity?: string;
      itemPower?: number;
      itemType?: string;
      playerId?: number | string;
    };

    if (!itemId || !itemName) {
      return NextResponse.json({ error: 'Missing itemId or itemName' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'https://dragonslayer-production.up.railway.app';
    const cleanOrigin = origin.replace(/\/$/, '').split('/').slice(0, 3).join('/');
    const metaUrl = `${cleanOrigin}/api/nft/item/${playerId ?? 0}/${itemId}`;
    const uriHex = toHex(metaUrl);

    const rarityLabel = itemRarity ? itemRarity.charAt(0).toUpperCase() + itemRarity.slice(1) : '';
    const instruction = [
      `Mint "${itemName}" as an XRPL NFT`,
      rarityLabel && `Rarity: ${rarityLabel}`,
      itemType && `Type: ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
      itemPower != null && `Power: ${itemPower}`,
    ].filter(Boolean).join(' · ');

    const res = await fetch(`${XAMAN_BASE}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     XAMAN_API_KEY,
        'X-API-Secret':  XAMAN_API_SECRET,
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: 'NFTokenMint',
          NFTokenTaxon: 0,
          Flags: 8, // tfTransferable
          URI: uriHex,
          ...(wallet ? { Account: wallet } : {}),
        },
        options: { submit: true },
        custom_meta: { instruction },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Xaman mint create error:', err);
      return NextResponse.json({ error: 'Xaman rejected the mint request' }, { status: res.status });
    }

    const data = await res.json();
    const uuid: string     = data.uuid;
    const deeplink: string = data.next?.always ?? `https://xumm.app/sign/${uuid}`;
    const qr_png: string   = data.refs?.qr_png ?? null;

    console.log(`[mint] created payload uuid=${uuid} item=${itemName} player=${playerId}`);
    return NextResponse.json({ success: true, uuid, deeplink, qr_png });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Mint route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
