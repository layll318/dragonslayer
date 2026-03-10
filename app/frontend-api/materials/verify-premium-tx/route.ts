import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TREASURY_WALLET = process.env.TREASURY_WALLET || 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';
const API_URL         = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const XRPL_NODES = [
  'https://xrplcluster.com/',
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

async function xrplLookupTx(txHash: string): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const body = JSON.stringify({
    method: 'tx',
    params: [{ transaction: txHash.trim().toUpperCase(), binary: false }],
  });
  for (const node of XRPL_NODES) {
    try {
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.result && !data.result.error) return { ok: true, result: data.result };
    } catch {
      // try next node
    }
  }
  return { ok: false, error: 'Could not reach XRPL network — all nodes failed. Try again in a moment.' };
}

// Premium XRP amounts (in drops).
// dropsRequired is set at 50% of the full price so players with up to 50% token
// discount are always accepted.  Full prices: rare_egg=2, legendary_egg=5,
// rare_bundle=5, incubator_slot=1.
const PREMIUM_ITEMS: Record<string, { dropsRequired: number; fullDrops: number; label: string }> = {
  rare_egg:        { dropsRequired: 1_000_000, fullDrops: 2_000_000, label: 'Rare Dragon Egg' },
  legendary_egg:   { dropsRequired: 2_500_000, fullDrops: 5_000_000, label: 'Legendary Dragon Egg' },
  rare_bundle:     { dropsRequired: 2_500_000, fullDrops: 5_000_000, label: 'Rare Material Mega Bundle' },
  incubator_slot:  { dropsRequired:   500_000, fullDrops: 1_000_000, label: 'Permanent Incubator Slot' },
  gold_50m:        { dropsRequired: 1_500_000, fullDrops: 3_000_000, label: '50,000,000 Gold Pack' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { txHash, premiumType, playerId } = body as { txHash?: string; premiumType?: string; playerId?: number };

    if (!txHash || txHash.trim().length < 60) {
      return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
    }
    if (!premiumType || !PREMIUM_ITEMS[premiumType]) {
      return NextResponse.json({ error: 'Invalid premium item type.' }, { status: 400 });
    }

    const item = PREMIUM_ITEMS[premiumType];

    // Look up TX on XRPL mainnet (tries multiple public nodes)
    const lookup = await xrplLookupTx(txHash);
    if (!lookup.ok || !lookup.result) {
      return NextResponse.json({ error: lookup.error ?? 'Transaction not found on XRPL.' }, { status: 502 });
    }
    const result = lookup.result;

    if (result.TransactionType !== 'Payment') {
      return NextResponse.json({ error: 'Transaction is not a Payment.' }, { status: 400 });
    }
    if (result.Destination !== TREASURY_WALLET) {
      return NextResponse.json({ error: `Payment must be sent to ${TREASURY_WALLET}.` }, { status: 400 });
    }
    const meta = result.meta as Record<string, unknown> | undefined;
    if (meta?.TransactionResult !== 'tesSUCCESS') {
      return NextResponse.json({ error: `Transaction did not succeed (${meta?.TransactionResult}).` }, { status: 400 });
    }

    const rawAmount = result.Amount;
    if (typeof rawAmount !== 'string') {
      return NextResponse.json({ error: 'Only XRP (not IOU) payments accepted.' }, { status: 400 });
    }

    const drops = parseInt(rawAmount, 10);
    if (drops < item.dropsRequired) {
      const xrpFull = item.fullDrops / 1_000_000;
      return NextResponse.json({ error: `Insufficient payment. ${item.label} costs ${xrpFull} XRP (token holders get up to 50% off).` }, { status: 400 });
    }

    // Server-side dedup — register hash only after XRPL confirms success
    const dedupRes = await fetch(`${API_URL}/api/items/claim-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hash: txHash.trim().toUpperCase(), player_id: playerId ?? null, item_type: premiumType }),
    }).catch(() => null);
    if (dedupRes?.ok) {
      const dedupData = await dedupRes.json().catch(() => null);
      if (dedupData && !dedupData.success && dedupData.already_claimed) {
        return NextResponse.json({ error: 'This transaction hash has already been used to claim a reward.' }, { status: 409 });
      }
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
        ? ALL_TYPES.map(t => ({ type: t, quantity: 5 }))
        : null,
      // For incubator_slot: permanent slot
      incubatorSlot: premiumType === 'incubator_slot' ? true : null,
      // For gold_50m: sentinel — actual amount computed client-side from goldPerHour*24
      goldAmount: premiumType === 'gold_50m' ? 1 : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[verify-premium-tx] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
