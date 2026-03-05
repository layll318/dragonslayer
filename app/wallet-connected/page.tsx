'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// This page is intentionally dependency-free (no useGame, no
// useRouter).  It must work inside a webview, a fresh browser tab,
// and any mobile browser.  On success it does a hard
// window.location.href redirect so GameContext picks up the address
// via the ?wallet_linked= param and xaman_linked_address in
// localStorage — both paths are already handled in GameContext.tsx.
// ─────────────────────────────────────────────────────────────────

function WalletConnectedContent() {
  const searchParams = useSearchParams();
  const [status, setStatus]   = useState<'processing' | 'success' | 'error'>('processing');
  const [address, setAddress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const returnTo = searchParams.get('returnTo') || '/';

    // Xaman substitutes {id} → the real UUID in the return_url.
    // Guard against the literal string "{id}" in case substitution failed.
    const payloadId =
      searchParams.get('payloadId') ||
      searchParams.get('id') ||
      (typeof window !== 'undefined' ? localStorage.getItem('xaman_pending_uuid') : null);

    if (!payloadId || payloadId === '{id}') {
      setStatus('error');
      setErrorMsg('No payload ID — please go back and try again.');
      return;
    }

    let cancelled = false;
    let attempt   = 0;
    const MAX     = 40; // 40 × 2 s = 80 seconds max

    const check = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/frontend-api/wallet/payload?uuid=${payloadId}`);
        const d = await r.json();

        if (d.signed && d.account && typeof d.account === 'string' && d.account.startsWith('r') && d.account.length >= 25) {
          if (cancelled) return;
          localStorage.removeItem('xaman_pending_uuid');
          localStorage.setItem('xaman_linked_address', d.account);
          setAddress(d.account);
          setStatus('success');
          // Hard redirect — works in any browser / webview
          setTimeout(() => {
            const dest = returnTo.startsWith('/') ? returnTo : '/';
            window.location.href = `${dest}?wallet_linked=${encodeURIComponent(d.account)}`;
          }, 1500);
          return;
        }

        if (d.cancelled) { setStatus('error'); setErrorMsg('Sign-in was cancelled in Xaman.'); return; }
        if (d.expired)   { setStatus('error'); setErrorMsg('Request expired — please try again.'); return; }

        // Not yet signed — keep retrying
        attempt++;
        if (attempt < MAX) {
          setTimeout(check, 2000);
        } else {
          setStatus('error');
          setErrorMsg('Timed out waiting for approval. Please try again.');
        }
      } catch {
        attempt++;
        if (attempt < MAX) {
          setTimeout(check, 2000);
        } else {
          setStatus('error');
          setErrorMsg('Network error. Please try again.');
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => { window.location.href = '/'; };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0c0804 0%, #1a0f04 100%)' }}
    >
      <div
        className="rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(22,16,8,0.98) 0%, rgba(12,8,4,0.99) 100%)',
          border: '1px solid rgba(212,160,23,0.2)',
        }}
      >
        {status === 'processing' && (
          <>
            <Loader2 className="w-14 h-14 text-orange-400 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#f0c040] font-cinzel mb-2">Verifying…</h1>
            <p className="text-[#6b5a3a] text-sm mb-6">Confirming your Xaman sign-in</p>
            <button onClick={goBack} className="text-xs text-[#4a3a2a] underline">
              Already connected? Back to Game
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#f0c040] font-cinzel mb-2">Wallet Linked!</h1>
            <div className="bg-black/40 rounded-lg px-3 py-2 mb-4 border border-[rgba(212,160,23,0.15)]">
              <p className="text-[9px] text-[#6b5a3a] mb-1">Connected Address</p>
              <p className="text-[#f0c040] text-[10px] font-mono break-all">{address}</p>
            </div>
            <p className="text-[#6b5a3a] text-xs">Returning to the game…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#f0c040] font-cinzel mb-2">Connection Failed</h1>
            <p className="text-[#6b5a3a] text-sm mb-4">{errorMsg}</p>
            <button
              onClick={goBack}
              className="px-6 py-2 rounded-xl font-bold text-white text-sm
                bg-gradient-to-r from-orange-500 to-orange-600 active:scale-95 transition-all"
            >
              Back to Game
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function WalletConnectedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0804' }}>
          <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
        </div>
      }
    >
      <WalletConnectedContent />
    </Suspense>
  );
}
