import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TREASURY_WALLET = process.env.TREASURY_WALLET || 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';
const XRPL_API        = 'https://xrplcluster.com/';

// Premium XRP amounts (in drops)
const PREMIUM_ITEMS: Record<string, { dropsRequired: number; label: string }> = {
  rare_egg:      { dropsRequired: 2_000_000,  label: 'Rare Dragon Egg' },
  legendary_egg: { dropsRequired: 5_000_000,  label: 'Legendary Dragon Egg' },
  rare_bundle:   { dropsRequired: 5_000_000,  label: 'Rare Material Mega Bundle' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { txHash, premiumType } = body as { txHash?: string; premiumType?: string };

    if (!txHash || txHash.trim().length < 60) {
      return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
    }
    if (!premiumType || !PREMIUM_ITEMS[premiumType]) {
      return NextResponse.json({ error: 'Invalid premium item type.' }, { status: 400 });
    }

    const item = PREMIUM_ITEMS[premiumType];

    // Look up TX on XRPL mainnet
    const xrplRes = await fetch(XRPL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tx',
        params: [{ transaction: txHash.trim().toUpperCase(), binary: false }],
      }),
      cache: 'no-store',
    });

    if (!xrplRes.ok) {
      return NextResponse.json({ error: 'Could not reach XRPL network.' }, { status: 502 });
    }

    const xrpl = await xrplRes.json();
    const result = xrpl?.result;

    if (!result || result.error) {
      return NextResponse.json({ error: 'Transaction not found on XRPL.' }, { status: 404 });
    }

    if (result.TransactionType !== 'Payment') {
      return NextResponse.json({ error: 'Transaction is not a Payment.' }, { status: 400 });
    }
    if (result.Destination !== TREASURY_WALLET) {
      return NextResponse.json({ error: `Payment must be sent to ${TREASURY_WALLET}.` }, { status: 400 });
    }
    if (result.meta?.TransactionResult !== 'tesSUCCESS') {
      return NextResponse.json({ error: `Transaction did not succeed (${result.meta?.TransactionResult}).` }, { status: 400 });
    }

    const rawAmount = result.Amount;
    if (typeof rawAmount !== 'string') {
      return NextResponse.json({ error: 'Only XRP (not IOU) payments accepted.' }, { status: 400 });
    }

    const drops = parseInt(rawAmount, 10);
    if (drops < item.dropsRequired) {
      const xrpNeeded = item.dropsRequired / 1_000_000;
      return NextResponse.json({ error: `Insufficient payment. ${item.label} requires ${xrpNeeded} XRP.` }, { status: 400 });
    }

    const ALL_TYPES = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'] as const;

    return NextResponse.json({
      success: true,
      drops,
      sender: result.Account,
      premiumType,
      label: item.label,
      // For rare_egg / legendary_egg: egg rarity to add to inventory
      eggRarity: premiumType === 'rare_egg' ? 'rare' : premiumType === 'legendary_egg' ? 'legendary' : null,
      // For rare_bundle: material credits
      materialCredits: premiumType === 'rare_bundle'
        ? ALL_TYPES.map(t => ({ type: t, quality: 'rare', quantity: 3 }))
        : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[verify-premium-tx] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
