'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Wallet } from 'lucide-react';

const PENDING_KEY = 'xaman_pending_uuid';
const PENDING_QR_KEY = 'xaman_pending_qr';
const PENDING_DL_KEY = 'xaman_pending_dl';

interface XamanConnectProps {
  onConnected: (address: string) => void;
}

type Phase = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function openXaman(url: string) {
  // In Telegram WebApp: use openLink so the WebApp stays alive
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    // Regular browser: open in new tab/window so current page keeps polling
    const win = window.open(url, '_blank');
    // Fallback: if popup blocked, navigate in same tab
    if (!win) window.location.href = url;
  }
}

export default function XamanConnect({ onConnected }: XamanConnectProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uuidRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Check payload and resolve — shared by polling and visibilitychange
  const checkPayload = useCallback(async (uuid: string): Promise<boolean> => {
    try {
      const res = await fetch(`/frontend-api/wallet/payload?uuid=${uuid}`);
      if (!res.ok) return false;
      const data = await res.json();
      if (data.signed && data.resolved && data.account?.startsWith('r') && data.account.length >= 25) {
        stopPolling();
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(PENDING_QR_KEY);
        localStorage.removeItem(PENDING_DL_KEY);
        setPhase('success');
        onConnected(data.account);
        return true;
      }
      if (data.cancelled || data.expired) {
        stopPolling();
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(PENDING_QR_KEY);
        localStorage.removeItem(PENDING_DL_KEY);
        setPhase('error');
        setErrorMsg(data.cancelled ? 'Sign-in was cancelled.' : 'Request expired — please try again.');
        return true;
      }
    } catch { /* transient error, keep trying */ }
    return false;
  }, [onConnected, stopPolling]);

  // Start background polling for a given uuid
  const startPolling = useCallback((uuid: string) => {
    stopPolling();
    pollRef.current = setInterval(() => checkPayload(uuid), 2000);
  }, [checkPayload, stopPolling]);

  // On mount: resume any pending connection (e.g. user returned after page reload)
  useEffect(() => {
    const pendingUuid = localStorage.getItem(PENDING_KEY);
    if (pendingUuid) {
      const savedQr = localStorage.getItem(PENDING_QR_KEY);
      const savedDl = localStorage.getItem(PENDING_DL_KEY);
      uuidRef.current = pendingUuid;
      setQrUrl(savedQr);
      setDeeplink(savedDl);
      setPhase('waiting');
      // Immediately check — might already be signed
      checkPayload(pendingUuid).then(resolved => {
        if (!resolved) startPolling(pendingUuid);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediately check on tab focus (user returns from Xaman app)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && uuidRef.current) checkPayload(uuidRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkPayload]);

  const startConnect = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);
    stopPolling();

    try {
      const res = await fetch('/frontend-api/wallet/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.uuid) throw new Error(data.error || 'Failed to create sign-in request');

      const { uuid, qr_png, deeplink: dl } = data;
      uuidRef.current = uuid;
      localStorage.setItem(PENDING_KEY, uuid);
      if (qr_png) localStorage.setItem(PENDING_QR_KEY, qr_png);
      if (dl) localStorage.setItem(PENDING_DL_KEY, dl);

      setQrUrl(qr_png);
      setDeeplink(dl);
      setPhase('waiting');
      startPolling(uuid);

      // On mobile: open Xaman WITHOUT navigating away so polling keeps running
      if (isMobileDevice()) {
        setTimeout(() => openXaman(dl), 300);
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Connection failed');
    }
  }, [startPolling, stopPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_QR_KEY);
    localStorage.removeItem(PENDING_DL_KEY);
    uuidRef.current = null;
    setPhase('idle');
    setQrUrl(null);
    setDeeplink(null);
    setErrorMsg(null);
  }, [stopPolling]);

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

  // ── 'waiting' phase: show QR for desktop, or spinner for mobile (Xaman opened) ──
  const mobile = isMobileDevice();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(22,16,8,0.99) 0%, rgba(12,8,4,1) 100%)',
          border: '1px solid rgba(212,160,23,0.25)',
        }}
      >
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
          <p className="text-[#6b5a3a] text-sm">
            {mobile ? 'Approve the sign-in request in your Xaman app' : 'Scan the QR code with Xaman'}
          </p>
        </div>

        {/* Desktop: QR code */}
        {!mobile && (
          <div className="bg-white rounded-xl p-3 mb-4 flex items-center justify-center min-h-[210px]">
            {qrUrl ? (
              <img src={qrUrl} alt="Xaman QR Code" className="w-full max-w-[190px] h-auto mx-auto" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            )}
          </div>
        )}

        {/* Mobile: spinner + re-open button */}
        {mobile && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
            <p className="text-[#6b5a3a] text-sm">Waiting for Xaman approval…</p>
            {deeplink && (
              <a
                href={deeplink}
                className="mt-2 px-5 py-2.5 rounded-xl font-bold text-white text-sm
                  bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
                  transition-all shadow-lg"
              >
                Re-open Xaman App
              </a>
            )}
          </div>
        )}

        {/* Desktop: open in app button */}
        {!mobile && deeplink && (
          <a
            href={deeplink}
            className="block w-full py-3 px-4 mb-3 text-center font-bold text-white rounded-xl text-sm
              bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
              transition-all shadow-lg"
          >
            Open in Xaman App
          </a>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-[#6b5a3a]" />
            <p className="text-xs text-[#6b5a3a]">Waiting for approval…</p>
          </div>
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
