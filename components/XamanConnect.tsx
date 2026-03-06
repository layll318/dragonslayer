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
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [pollCount, setPollCount] = useState(0);
  const pollCountRef = useRef(0);       // ref so doPoll never needs pollCount as a dep
  const signedNoAcctRef = useRef(0);   // how many times signed=true but account=null

  // Refs so interval callbacks always have fresh values without recreating
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const uuidRef      = useRef<string | null>(null);
  const onConnectedRef = useRef(onConnected);

  // Keep onConnectedRef in sync without causing re-renders or callback recreation
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const clearTimers = useCallback(() => {
    if (pollRef.current)    { clearInterval(pollRef.current);   pollRef.current    = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (wsRef.current)      { wsRef.current.close();            wsRef.current       = null; }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const clearPending = () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_QR_KEY);
    localStorage.removeItem(PENDING_DL_KEY);
  };

  // Core poll — no dependencies on props so the interval never goes stale
  const doPoll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/frontend-api/wallet/payload?uuid=${id}&_t=${Date.now()}`, { cache: 'no-store' });

      pollCountRef.current += 1;
      setPollCount(pollCountRef.current);

      if (!res.ok) {
        setDebugInfo(`HTTP ${res.status} from poll API`);
        return; // transient — keep trying
      }

      const data = await res.json();
      const d = data._dbg || {};
      setDebugInfo(
        `#${pollCountRef.current} signed=${data.signed} acct=${data.account ?? 'null'} ` +
        `resp.acct=${d.resp_account ?? '-'} resp.sgn=${d.resp_signer ?? '-'} ` +
        `signers=${JSON.stringify(d.signers)} resolved=${data.resolved}`
      );

      // Success: signed. Don't require "resolved" — Xaman can set signed=true
      // slightly before resolved=true, causing misses if we require both.
      if (data.signed) {
        const acct = data.account || localStorage.getItem('xaman_linked_address');
        if (acct && typeof acct === 'string' && acct.startsWith('r') && acct.length >= 25) {
          signedNoAcctRef.current = 0;
          clearTimers();
          clearPending();
          setPhase('success');
          onConnectedRef.current(acct);
          return;
        }
        // signed=true but account still null — Xaman populates it async.
        // After 8 attempts (~20s) give up and surface an error.
        signedNoAcctRef.current += 1;
        if (signedNoAcctRef.current >= 8) {
          clearTimers();
          clearPending();
          setPhase('error');
          setErrorMsg('Xaman approved but no account returned. Check Railway logs for raw response.');
        }
        return;
      }

      // Terminal failure states
      if (data.cancelled || data.expired) {
        clearTimers();
        clearPending();
        setPhase('error');
        setErrorMsg(data.cancelled ? 'Sign-in was cancelled.' : 'Request expired — please try again.');
      }
    } catch (e: any) {
      setDebugInfo(`fetch error: ${e?.message}`);
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

  // Rapid-burst poll when tab becomes visible — catches approval the moment user returns
  const rapidBurstRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRapidBurst = useCallback((id: string) => {
    if (rapidBurstRef.current) clearInterval(rapidBurstRef.current);
    let ticks = 0;
    rapidBurstRef.current = setInterval(() => {
      ticks++;
      doPoll(id);
      if (ticks >= 12) {
        clearInterval(rapidBurstRef.current!);
        rapidBurstRef.current = null;
      }
    }, 800);
  }, [doPoll]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && uuidRef.current) {
        doPoll(uuidRef.current);          // immediate
        startRapidBurst(uuidRef.current); // then every 800ms for ~10s
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      if (rapidBurstRef.current) clearInterval(rapidBurstRef.current);
    };
  }, [doPoll, startRapidBurst]);

  // Cross-tab: if /wallet-connected (opened in another tab) sets xaman_linked_address,
  // the storage event fires HERE in the original game tab — connect immediately.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'xaman_linked_address' && e.newValue && phase === 'waiting') {
        const addr = e.newValue;
        if (addr.startsWith('r') && addr.length >= 25) {
          clearTimers();
          clearPending();
          uuidRef.current = null;
          setPhase('success');
          onConnectedRef.current(addr);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [phase, clearTimers]);

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

      const { uuid: newUuid, qr_png, deeplink: dl, ws_url } = data;
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

      // ── Xaman real-time WebSocket — fires the instant user approves ──
      // This is the primary detection path; polling is the fallback.
      if (ws_url && typeof WebSocket !== 'undefined') {
        try {
          if (wsRef.current) wsRef.current.close();
          const ws = new WebSocket(ws_url);
          wsRef.current = ws;
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              setDebugInfo(prev => `WS: ${JSON.stringify(msg).slice(0,80)} | ${prev}`);
              // Xaman pushes {signed:true} or {expired:true} etc.
              if (msg.signed === true) {
                // Signed! Poll immediately to get account address.
                doPoll(newUuid);
                // Then rapid burst in case first poll is too early
                startRapidBurst(newUuid);
              } else if (msg.expired === true) {
                clearTimers();
                clearPending();
                setPhase('error');
                setErrorMsg('Request expired — please try again.');
              }
            } catch { /* non-JSON message, ignore */ }
          };
          ws.onerror = () => setDebugInfo(prev => `WS error | ${prev}`);
          ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null; };
        } catch { /* WebSocket not available */ }
      }
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
          /* ── MOBILE: window.open keeps THIS tab alive so polling detects approval automatically ── */
          <div className="flex flex-col gap-2 mb-4">
            {deeplink && (
              <button
                onClick={() => {
                  // Open in new tab/trigger App Link — keeps THIS tab alive so polling works
                  const w = window.open(deeplink, '_blank', 'noopener,noreferrer');
                  // If popup blocked (rare from direct click), navigate current tab
                  if (!w) window.location.href = deeplink;
                }}
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

            <p className="text-[10px] text-[#6b5a3a] text-center leading-relaxed px-2">
              After approving in Xaman, press the back button and return to this tab.
            </p>

            {/* Manual check — prominent, since polling may need a nudge */}
            {uuid && (
              <button
                onClick={() => uuid && doPoll(uuid)}
                className="w-full py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                style={{ border: '1px solid rgba(212,160,23,0.4)', color: '#f0c040', background: 'rgba(212,160,23,0.08)' }}
              >
                ✓ Already approved? Tap here
              </button>
            )}

            {/* QR fallback toggle */}
            <button
              onClick={() => setShowQr(v => !v)}
              className="w-full text-xs text-[#6b5a3a] underline text-center"
            >
              {showQr ? 'Hide QR' : 'Use QR code instead'}
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

        {/* DEBUG — visible in UI so you can screenshot & report */}
        <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/5">
          <p className="text-[8px] font-mono text-[#4a3a2a] break-all leading-relaxed">
            polls: {pollCount} | uuid: {uuid?.slice(0,8) ?? 'none'}<br/>
            {debugInfo || 'waiting…'}
          </p>
        </div>
      </div>
    </div>
  );
}
