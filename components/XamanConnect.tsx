'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Wallet } from 'lucide-react';

const PENDING_KEY = 'xaman_pending_uuid';
const PENDING_QR_KEY = 'xaman_pending_qr';
const PENDING_DL_KEY = 'xaman_pending_dl';
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface XamanConnectProps {
  onConnected: (address: string) => void;
}

type Phase = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 768 && 'ontouchstart' in window) return true;
  return false;
}

function isTelegramWebApp() {
  return typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
}


export default function XamanConnect({ onConnected }: XamanConnectProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [uuid, setUuid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Refs so interval callbacks always have fresh values without recreating
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uuidRef      = useRef<string | null>(null);
  const onConnectedRef = useRef(onConnected);

  // Keep onConnectedRef in sync without causing re-renders or callback recreation
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const clearTimers = useCallback(() => {
    if (pollRef.current)    { clearInterval(pollRef.current);   pollRef.current    = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const clearPending = () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_QR_KEY);
    localStorage.removeItem(PENDING_DL_KEY);
  };

  // Core poll — no dependencies on props so the interval never goes stale
  const doPoll = useCallback(async (uuid: string) => {
    try {
      const res = await fetch(`/frontend-api/wallet/payload?uuid=${uuid}`);
      if (!res.ok) return; // transient — keep trying

      const data = await res.json();

      // Success: signed. Don't require "resolved" — Xaman can set signed=true
      // slightly before resolved=true, causing misses if we require both.
      if (data.signed && data.account) {
        clearTimers();
        clearPending();
        setPhase('success');
        onConnectedRef.current(data.account);
        return;
      }

      // Terminal failure states
      if (data.cancelled || data.expired) {
        clearTimers();
        clearPending();
        setPhase('error');
        setErrorMsg(data.cancelled ? 'Sign-in was cancelled.' : 'Request expired — please try again.');
      }
    } catch {
      // Network error — keep trying until timeout fires
    }
  }, [clearTimers]);

  const startPolling = useCallback((uuid: string) => {
    clearTimers();

    // Poll every 2.5 s
    pollRef.current = setInterval(() => doPoll(uuid), POLL_INTERVAL_MS);

    // Hard timeout after 5 minutes
    timeoutRef.current = setTimeout(() => {
      clearTimers();
      clearPending();
      uuidRef.current = null;
      setPhase('error');
      setErrorMsg('Sign-in timed out — please try again.');
    }, POLL_TIMEOUT_MS);
  }, [clearTimers, doPoll]);

  // On mount: resume any in-progress connection (handles page reload on mobile)
  useEffect(() => {
    const uuid = localStorage.getItem(PENDING_KEY);
    if (uuid) {
      const savedQr = localStorage.getItem(PENDING_QR_KEY);
      const savedDl = localStorage.getItem(PENDING_DL_KEY);
      uuidRef.current = uuid;
      setQrUrl(savedQr);
      setDeeplink(savedDl);
      setPhase('waiting');
      doPoll(uuid).then(() => {
        // If still in waiting after immediate check, start interval
        startPolling(uuid);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Extra check on tab-focus — catches desktop users who switched tabs
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && uuidRef.current) doPoll(uuidRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [doPoll]);

  const startConnect = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);
    clearTimers();

    try {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
      const res = await fetch('/frontend-api/wallet/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      });
      const data = await res.json();
      if (!res.ok || !data.uuid) throw new Error(data.error || 'Failed to create sign-in request');

      const { uuid: newUuid, qr_png, deeplink: dl } = data;
      uuidRef.current = newUuid;
      localStorage.setItem(PENDING_KEY, newUuid);
      if (qr_png) localStorage.setItem(PENDING_QR_KEY, qr_png);
      if (dl)     localStorage.setItem(PENDING_DL_KEY, dl);

      setUuid(newUuid);
      setQrUrl(qr_png);
      setDeeplink(dl);
      setShowQr(!isMobileDevice()); // auto-show QR on desktop, hidden on mobile
      setPhase('waiting');
      startPolling(newUuid);
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Connection failed');
    }
  }, [clearTimers, startPolling]);

  const cancel = useCallback(() => {
    clearTimers();
    clearPending();
    uuidRef.current = null;
    setPhase('idle');
    setQrUrl(null);
    setDeeplink(null);
    setUuid(null);
    setShowQr(false);
    setErrorMsg(null);
  }, [clearTimers]);

  if (phase === 'success') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <CheckCircle className="w-4 h-4" />
        <span>Wallet linked!</span>
      </div>
    );
  }

  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="space-y-2">
        <button
          onClick={startConnect}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-bold text-white
            bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
            transition-all shadow-lg active:scale-95"
        >
          <img
            src="https://xumm.app/assets/icons/favicon-196x196.png"
            alt=""
            className="w-5 h-5 rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Wallet className="w-4 h-4" />
          <span>Connect with Xaman</span>
        </button>
        {errorMsg && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <XCircle className="w-3 h-3 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 text-orange-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Creating sign-in request…</span>
      </div>
    );
  }

  // ── 'waiting' phase ──
  const mobile = isMobileDevice();
  const inTelegram = isTelegramWebApp();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(22,16,8,0.99) 0%, rgba(12,8,4,1) 100%)',
          border: '1px solid rgba(212,160,23,0.25)',
        }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img
              src="https://xumm.app/assets/icons/favicon-196x196.png"
              alt="Xaman"
              className="w-7 h-7 rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h2 className="text-xl font-bold text-[#f0c040] font-cinzel">Connect Xaman</h2>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <Loader2 className="w-3 h-3 animate-spin text-[#6b5a3a]" />
            <p className="text-[#6b5a3a] text-xs">Waiting for approval…</p>
          </div>
        </div>

        {mobile ? (
          /* ── MOBILE: button onClick → window.location.href — preserves gesture chain, triggers iOS Universal Link / Android App Link ── */
          <div className="flex flex-col gap-2 mb-4">
            {deeplink && (
              <button
                onClick={() => { window.location.href = deeplink; }}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold text-white text-sm
                  bg-gradient-to-r from-orange-500 to-orange-600 active:scale-95 transition-all shadow-lg"
              >
                <img
                  src="https://xumm.app/assets/icons/favicon-196x196.png"
                  alt=""
                  className="w-4 h-4 rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="flex flex-col items-start leading-tight">
                  <span>Open Xaman App</span>
                  <span className="text-[10px] font-normal opacity-80">iOS &amp; Android</span>
                </span>
              </button>
            )}

            {/* Already approved — manual poll trigger */}
            {uuid && (
              <button
                onClick={() => doPoll(uuid)}
                className="w-full py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ border: '1px solid rgba(212,160,23,0.3)', color: '#d4a017', background: 'rgba(212,160,23,0.06)' }}
              >
                Already approved? Tap to check
              </button>
            )}

            {/* QR fallback toggle */}
            <button
              onClick={() => setShowQr(v => !v)}
              className="w-full text-xs text-[#6b5a3a] underline text-center"
            >
              {showQr ? 'Hide QR' : 'Scan QR from another device instead'}
            </button>
            {showQr && (
              <div className="bg-white rounded-xl p-3 flex items-center justify-center min-h-[180px]">
                {qrUrl
                  ? <img src={qrUrl} alt="Xaman QR Code" className="w-full max-w-[170px] h-auto mx-auto" />
                  : <Loader2 className="w-8 h-8 animate-spin text-gray-400" />}
              </div>
            )}
          </div>
        ) : (
          /* ── DESKTOP: QR code front-and-centre, polling auto-detects approval ── */
          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[10px] text-center text-[#6b5a3a] mb-1">
              Scan this QR code with Xaman on your phone
            </p>
            <div className="bg-white rounded-xl p-3 flex items-center justify-center min-h-[190px]">
              {qrUrl
                ? <img src={qrUrl} alt="Xaman QR Code" className="w-full max-w-[180px] h-auto mx-auto" />
                : <Loader2 className="w-8 h-8 animate-spin text-gray-400" />}
            </div>

            {/* Desktop Xaman app or browser fallback */}
            {deeplink && (
              <a
                href={deeplink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 rounded-xl text-xs font-bold text-center active:scale-95 transition-all"
                style={{ border: '1px solid rgba(212,160,23,0.3)', color: '#d4a017', background: 'rgba(212,160,23,0.06)', textDecoration: 'none', display: 'block' }}
              >
                Or open sign request in browser
              </a>
            )}

            {uuid && (
              <button
                onClick={() => doPoll(uuid)}
                className="w-full py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', background: 'rgba(74,222,128,0.05)' }}
              >
                Already approved? Check now
              </button>
            )}
          </div>
        )}

        {inTelegram && (
          <p className="text-[9px] text-[#4a3a2a] text-center mb-2">
            Tap "Open Xaman App", approve in Xaman, then return here.
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={cancel}
            className="text-xs text-[#4a3a2a] hover:text-[#6b5a3a] transition-colors underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
