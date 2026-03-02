'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGame } from '@/contexts/GameContext';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

function WalletConnectedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connectWallet } = useGame();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [address, setAddress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Xaman appends ?payloadId= or ?id= to the return URL
    const payloadId =
      searchParams.get('payloadId') ||
      searchParams.get('id') ||
      // Also check localStorage in case Xaman stripped params
      (typeof window !== 'undefined' ? localStorage.getItem('xaman_pending_uuid') : null);

    const returnTo = searchParams.get('returnTo') || '/';

    if (!payloadId) {
      setStatus('error');
      setErrorMsg('No payload ID found. Please try connecting again.');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`/frontend-api/wallet/payload?uuid=${payloadId}`);
        if (!res.ok) throw new Error('Payload not found');
        const data = await res.json();

        const isValid =
          data.signed === true &&
          !data.cancelled &&
          !data.expired &&
          data.account &&
          typeof data.account === 'string' &&
          data.account.startsWith('r') &&
          data.account.length >= 25;

        if (isValid) {
          localStorage.removeItem('xaman_pending_uuid');
          // Store in localStorage so game picks it up on any fresh load
          localStorage.setItem('xaman_linked_address', data.account);
          setAddress(data.account);
          setStatus('success');
          await connectWallet(data.account);
          setTimeout(() => router.push(`/?wallet_linked=${encodeURIComponent(data.account)}`), 2000);
        } else if (data.cancelled) {
          setStatus('error');
          setErrorMsg('Sign-in was cancelled.');
        } else if (data.expired) {
          setStatus('error');
          setErrorMsg('Sign-in request expired. Please try again.');
        } else {
          // Not resolved yet — keep polling (user may have just been redirected back)
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const r = await fetch(`/frontend-api/wallet/payload?uuid=${payloadId}`);
              const d = await r.json();
              if (d.signed && d.account?.startsWith('r')) {
                clearInterval(poll);
                localStorage.removeItem('xaman_pending_uuid');
                setAddress(d.account);
                setStatus('success');
                await connectWallet(d.account);
                setTimeout(() => router.push(returnTo), 2000);
              } else if (d.cancelled || d.expired || attempts > 15) {
                clearInterval(poll);
                setStatus('error');
                setErrorMsg(d.cancelled ? 'Cancelled.' : 'Timed out. Please try again.');
              }
            } catch { /* keep polling */ }
          }, 2000);
          return () => clearInterval(poll);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Verification failed. Please try again.');
      }
    };

    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <p className="text-[#6b5a3a] text-sm">Confirming your Xaman sign-in</p>
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
              onClick={() => router.push('/')}
              className="px-6 py-2 rounded-xl font-bold text-white text-sm
                bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
                transition-all"
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
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: '#0c0804' }}
        >
          <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
        </div>
      }
    >
      <WalletConnectedContent />
    </Suspense>
  );
}
