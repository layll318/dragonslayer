import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XAMAN_API_KEY    = process.env.XAMAN_API_KEY    || '';
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET || '';
const XAMAN_BASE       = 'https://xumm.app/api/v1/platform';
const BACKEND_URL      = process.env.NEXT_PUBLIC_API_URL || 'https://dragonslayer-production.up.railway.app';

export async function POST(request: NextRequest) {
  try {
    if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
      return NextResponse.json({ error: 'Xaman API credentials not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { wallet, itemId, itemName, itemRarity, itemPower, itemType, playerId, itemLevel, enchantId, reforgeLevel } = body as {
      wallet?: string;
      itemId?: string;
      itemName?: string;
      itemRarity?: string;
      itemPower?: number;
      itemType?: string;
      playerId?: number | string;
      itemLevel?: number;
      enchantId?: string;
      reforgeLevel?: number;
    };

    if (!itemId || !itemName || !wallet || !playerId) {
      return NextResponse.json({ error: 'Missing wallet, itemId, itemName, or playerId' }, { status: 400 });
    }

    // ── Step 1: Server mints NFT + creates 0-XRP sell offer to player ──────
    const mintRes = await fetch(`${BACKEND_URL}/api/nft/mint-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id:     playerId,
        item_id:       itemId,
        item_name:     itemName,
        player_wallet: wallet,
        item_rarity:   itemRarity   ?? 'legendary',
        item_type:     itemType     ?? 'weapon',
        item_power:    itemPower    ?? 0,
        item_level:    itemLevel    ?? 25,
        enchant_id:    enchantId    ?? '',
        reforge_level: reforgeLevel ?? 0,
      }),
    });
    if (!mintRes.ok) {
      const err = await mintRes.text();
      console.error('Backend mint-item error:', err);
      return NextResponse.json({ error: 'Server minting failed — check XRPL_WALLET_SEED' }, { status: 500 });
    }
    const { nft_token_id, offer_index } = await mintRes.json() as { nft_token_id: string; offer_index: string };

    // ── Step 2: Xaman — player signs NFTokenAcceptOffer to claim ───────────
    const rarityLabel = itemRarity ? itemRarity.charAt(0).toUpperCase() + itemRarity.slice(1) : '';
    const instruction = [
      `Claim "${itemName}" NFT to your wallet`,
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
          TransactionType: 'NFTokenAcceptOffer',
          NFTokenSellOffer: offer_index,
        },
        options: {
          submit: true,
          force_network: 'MAINNET',
        },
        custom_meta: {
          instruction,
          blob: { nft_token_id },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Xaman AcceptOffer create error:', errText);
      return NextResponse.json({ error: `Xaman rejected: ${errText}` }, { status: res.status });
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
