import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TREASURY_WALLET = process.env.TREASURY_WALLET || 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';
const XRPL_API       = 'https://xrplcluster.com/';
const MIN_DROPS      = 500_000;   // 0.5 XRP minimum — covers up to 50% token discount on 1 XRP
const BUNDLE_DROPS   = 1_500_000; // 1.5 XRP — covers up to 50% token discount on 3 XRP bundle
const API_URL        = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { txHash, type, playerId } = body as { txHash?: string; type?: string; playerId?: number };

    if (!txHash || txHash.trim().length < 60) {
      return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
    }

    // Look up TX on XRPL mainnet via public Clio server
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

    console.log(`[verify-tx] hash=${txHash} result=${result?.meta?.TransactionResult} dest=${result?.Destination} amount=${result?.Amount}`);

    if (!result || result.error) {
      return NextResponse.json({ error: 'Transaction not found on XRPL.' }, { status: 404 });
    }

    // Validate it's a successful payment to treasury
    if (result.TransactionType !== 'Payment') {
      return NextResponse.json({ error: 'Transaction is not a Payment.' }, { status: 400 });
    }
    if (result.Destination !== TREASURY_WALLET) {
      return NextResponse.json({ error: `Payment must be sent to ${TREASURY_WALLET}.` }, { status: 400 });
    }
    if (result.meta?.TransactionResult !== 'tesSUCCESS') {
      return NextResponse.json({ error: `Transaction did not succeed (${result.meta?.TransactionResult}).` }, { status: 400 });
    }

    // Parse amount — XRP payments use drops (string), IOU would be an object
    const rawAmount = result.Amount;
    if (typeof rawAmount !== 'string') {
      return NextResponse.json({ error: 'Only XRP (not IOU) payments accepted.' }, { status: 400 });
    }
    const drops = parseInt(rawAmount, 10);
    if (drops < MIN_DROPS) {
      return NextResponse.json({ error: `Payment too small (${drops} drops). Minimum 0.5 XRP (1 XRP with up to 50% token discount).` }, { status: 400 });
    }

    // Determine credits based on amount.
    // Thresholds are set at 50% of the full price to accept max-discounted payments:
    //   bundle (3 XRP full) → accept >= 1.5 XRP
    //   single (1 XRP full) → accept >= 0.5 XRP
    const ALL_TYPES = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'] as const;
    type MatType = typeof ALL_TYPES[number];

    let credits: { type: MatType; quantity: number }[];

    if (drops >= BUNDLE_DROPS) {
      // >= 1.5 XRP → bundle: 3 of every type
      credits = ALL_TYPES.map(t => ({ type: t, quantity: 3 }));
    } else {
      // 0.5–1.49 XRP → 3 of a single type (user must specify)
      const mat = type as MatType;
      if (!ALL_TYPES.includes(mat)) {
        return NextResponse.json({ error: 'Specify which material type to claim (1 XRP = 3× one type).' }, { status: 400 });
      }
      credits = [{ type: mat, quantity: 3 }];
    }

    // Server-side dedup — register hash only after XRPL confirms success
    const dedupRes = await fetch(`${API_URL}/api/items/claim-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hash: txHash.trim().toUpperCase(), player_id: playerId ?? null, item_type: `material_${type ?? 'unknown'}` }),
    }).catch(() => null);
    if (dedupRes?.ok) {
      const dedupData = await dedupRes.json().catch(() => null);
      if (dedupData && !dedupData.success && dedupData.already_claimed) {
        return NextResponse.json({ error: 'This transaction hash has already been used to claim a reward.' }, { status: 409 });
      }
    }

    return NextResponse.json({
      success: true,
      drops,
      sender: result.Account,
      credits,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[verify-tx] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
