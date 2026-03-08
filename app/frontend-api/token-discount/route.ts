import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const XRPL_API = 'https://xrplcluster.com/';

// Token configuration
const TOKEN_CONFIG = {
  lynx: {
    currencyHex: '244C594E58000000000000000000000000000000',
    issuer: 'rsr8BspVLwDWgrYamEJE3mqZhKozfWLfkv',
    minBalance: 1,              // hold any LYNX
    label: '$LYNX',
  },
  xrpnomics: {
    currencyHex: '5852504E4F4D4943530000000000000000000000',
    issuer: 'r38o5rKYgTUg5Dgu2pDsC1xkroMbpivGJj',
    minBalance: 0.000001,       // hold any XRPNOMICS
    label: 'XRPNOMICS',
  },
  dragonslayer: {
    issuer: 'rBRUGYxmu5Lr9L246JzybRoE7TaL9VznSh',
    minBalance: 1,              // hold any DragonSlayer token
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

/** Normalise a currency code to uppercase for comparison.
 *  Both 3-char standard codes and 40-char hex codes are returned uppercase. */
function normCurrency(code: string): string {
  return (code ?? '').toUpperCase().trim();
}

/** Check if wallet holds >= minBalance of a given token (matched by 40-char hex, case-insensitive) */
async function checkTokenBalance(
  wallet: string,
  currencyHex: string,   // always pass the 40-char hex
  issuer: string,
  minBalance: number,
): Promise<{ holds: boolean; balance: number; xrplError: boolean }> {
  try {
    const data = await xrplPost({
      method: 'account_lines',
      params: [{ account: wallet, ledger_index: 'validated' }],
    });

    if (data?.result?.status === 'error') return { holds: false, balance: 0, xrplError: false };
    const lines: any[] = data?.result?.lines ?? [];
    const targetHex = normCurrency(currencyHex);
    const targetDecoded = normCurrency(decodeCurrencyHex(currencyHex));

    for (const line of lines) {
      if (normCurrency(line.account) !== normCurrency(issuer)) continue;

      const lc = normCurrency(line.currency ?? '');
      // Match the 40-char hex directly (case-insensitive), OR match the decoded ASCII label
      const matches = lc === targetHex || lc === targetDecoded;

      if (matches) {
        const balance = parseFloat(line.balance ?? '0');
        return { holds: balance >= minBalance, balance, xrplError: false };
      }
    }
    return { holds: false, balance: 0, xrplError: false };
  } catch {
    return { holds: false, balance: 0, xrplError: true };
  }
}

/** For DragonSlayer: match ANY trust line from the DS issuer with a positive balance.
 *  This avoids needing to know the exact currency hex — the issuer address is the key. */
async function checkDragonSlayerBalance(
  wallet: string,
  issuer: string,
  minBalance: number,
): Promise<{ holds: boolean; balance: number; currencyFound: string | null; xrplError: boolean }> {
  try {
    const data = await xrplPost({
      method: 'account_lines',
      params: [{ account: wallet, ledger_index: 'validated' }],
    });

    if (data?.result?.status === 'error') return { holds: false, balance: 0, currencyFound: null, xrplError: false };
    const lines: any[] = data?.result?.lines ?? [];

    for (const line of lines) {
      if (normCurrency(line.account) !== normCurrency(issuer)) continue;
      const balance = parseFloat(line.balance ?? '0');
      if (balance >= minBalance) {
        return { holds: true, balance, currencyFound: line.currency ?? null, xrplError: false };
      }
    }
    return { holds: false, balance: 0, currencyFound: null, xrplError: false };
  } catch {
    return { holds: false, balance: 0, currencyFound: null, xrplError: true };
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet || !wallet.startsWith('r') || wallet.length < 25) {
    return NextResponse.json({ success: false, error: 'Invalid wallet address.' }, { status: 400 });
  }

  try {
    // Check all three tokens in parallel.
    // If all three XRPL calls fail (network outage) we return success:false so the
    // client keeps its cached discount rather than resetting it to 0.
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
      checkDragonSlayerBalance(
        wallet,
        TOKEN_CONFIG.dragonslayer.issuer,
        TOKEN_CONFIG.dragonslayer.minBalance,
      ),
    ]);

    // If every single check errored out (XRPL unreachable), don't overwrite cached discount
    const allErrored = lynxResult.xrplError && xrpnomicsResult.xrplError && dragonslayerResult.xrplError;
    if (allErrored) {
      return NextResponse.json({ success: false, error: 'xrpl_unavailable' }, { status: 503 });
    }

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
