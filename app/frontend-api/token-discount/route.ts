import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XRPL_API = 'https://xrplcluster.com/';

// Token configuration
const TOKEN_CONFIG = {
  lynx: {
    currencyHex: '244C594E58000000000000000000000000000000',
    issuer: 'rsr8BspVLwDWgrYamEJE3mqZhKozfWLfkv',
    minBalance: 850_000,        // 0.1% of 850M supply
    label: '$LYNX',
  },
  xrpnomics: {
    currencyHex: '5852504E4F4D4943530000000000000000000000',
    issuer: 'r38o5rKYgTUg5Dgu2pDsC1xkroMbpivGJj',
    minBalance: 0.1,            // 0.1 tokens of 100-supply token
    label: 'XRPNOMICS',
  },
  dragonslayer: {
    currencyHex: null,           // resolved at runtime via account_currencies
    issuer: 'rBRUGYxmu5Lr9L246JzybRoE7TaL9VznSh',
    minBalance: 30_113_636_363, // 1% of ~3.01T (265B = 8.8%)
    label: 'DragonSlayer',
  },
} as const;

type TokenKey = keyof typeof TOKEN_CONFIG;

async function xrplPost(body: object): Promise<any> {
  const res = await fetch(XRPL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`XRPL API error ${res.status}`);
  return res.json();
}

/** Decode hex currency code (40-char) to ASCII string */
function decodeCurrencyHex(hex: string): string {
  try {
    const bytes = Buffer.from(hex, 'hex');
    return bytes.toString('utf8').replace(/\x00/g, '').trim();
  } catch {
    return hex;
  }
}

/** Check if wallet holds >= minBalance of a given token */
async function checkTokenBalance(
  wallet: string,
  currencyHexOrCode: string,
  issuer: string,
  minBalance: number,
): Promise<{ holds: boolean; balance: number }> {
  try {
    const data = await xrplPost({
      method: 'account_lines',
      params: [{ account: wallet, ledger_index: 'validated' }],
    });

    const lines: any[] = data?.result?.lines ?? [];

    for (const line of lines) {
      if (line.account !== issuer) continue;

      // Match by hex or by decoded name
      const lineCurrency: string = line.currency ?? '';
      const matches =
        lineCurrency === currencyHexOrCode ||
        (lineCurrency.length === 40 && decodeCurrencyHex(lineCurrency) === decodeCurrencyHex(currencyHexOrCode)) ||
        lineCurrency === decodeCurrencyHex(currencyHexOrCode);

      if (matches) {
        const balance = parseFloat(line.balance ?? '0');
        return { holds: balance >= minBalance, balance };
      }
    }
    return { holds: false, balance: 0 };
  } catch {
    return { holds: false, balance: 0 };
  }
}

/** For DragonSlayer: discover the currency code first via account_currencies */
async function getDragonSlayerCurrencyCode(issuer: string): Promise<string | null> {
  try {
    const data = await xrplPost({
      method: 'account_currencies',
      params: [{ account: issuer, ledger_index: 'validated' }],
    });
    const obligations: string[] = data?.result?.send_currencies ?? [];
    if (obligations.length > 0) return obligations[0];
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet || !wallet.startsWith('r') || wallet.length < 25) {
    return NextResponse.json({ success: false, error: 'Invalid wallet address.' }, { status: 400 });
  }

  try {
    // Resolve DragonSlayer currency code if not hardcoded
    let dsHex: string | null = TOKEN_CONFIG.dragonslayer.currencyHex as string | null;
    if (!dsHex) {
      dsHex = await getDragonSlayerCurrencyCode(TOKEN_CONFIG.dragonslayer.issuer);
    }

    // Check all three tokens in parallel
    const [lynxResult, xrpnomicsResult, dragonslayerResult] = await Promise.all([
      checkTokenBalance(
        wallet,
        TOKEN_CONFIG.lynx.currencyHex,
        TOKEN_CONFIG.lynx.issuer,
        TOKEN_CONFIG.lynx.minBalance,
      ),
      checkTokenBalance(
        wallet,
        TOKEN_CONFIG.xrpnomics.currencyHex,
        TOKEN_CONFIG.xrpnomics.issuer,
        TOKEN_CONFIG.xrpnomics.minBalance,
      ),
      dsHex
        ? checkTokenBalance(
            wallet,
            dsHex,
            TOKEN_CONFIG.dragonslayer.issuer,
            TOKEN_CONFIG.dragonslayer.minBalance,
          )
        : Promise.resolve({ holds: false, balance: 0 }),
    ]);

    const tokensHeld = [lynxResult.holds, xrpnomicsResult.holds, dragonslayerResult.holds].filter(Boolean).length;

    // Discount tiers: 1 token = 25%, 2 = 35%, 3 = 50%
    let discountPct = 0;
    if (tokensHeld >= 3) discountPct = 50;
    else if (tokensHeld >= 2) discountPct = 35;
    else if (tokensHeld >= 1) discountPct = 25;

    return NextResponse.json({
      success: true,
      wallet,
      lynx: lynxResult.holds,
      lynxBalance: lynxResult.balance,
      xrpnomics: xrpnomicsResult.holds,
      xrpnomicsBalance: xrpnomicsResult.balance,
      dragonslayer: dragonslayerResult.holds,
      dragonslayerBalance: dragonslayerResult.balance,
      tokensHeld,
      discountPct,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[token-discount] error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
