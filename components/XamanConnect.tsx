'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Wallet } from 'lucide-react';

interface XamanConnectProps {
  onConnected: (address: string) => void;
}

type Phase = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

export default function XamanConnect({ onConnected }: XamanConnectProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [uuid, setUuid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startConnect = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);
    setQrUrl(null);
    setDeeplink(null);
    stopPolling();

    try {
      const res = await fetch('/frontend-api/wallet/connect', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.uuid) {
        throw new Error(data.error || 'Failed to create sign-in request');
      }

      setUuid(data.uuid);
      setQrUrl(data.qr_png);
      setDeeplink(data.deeplink);
      setPhase('waiting');

      pollRef.current = setInterval(async () => {
        try {
          const poll = await fetch(`/frontend-api/wallet/payload?uuid=${data.uuid}`);
          const status = await poll.json();

          if (status.cancelled || status.expired) {
            stopPolling();
            setPhase('error');
            setErrorMsg(status.cancelled ? 'Sign-in cancelled' : 'Request expired');
            return;
          }

          if (status.resolved && status.signed && status.account) {
            stopPolling();
            setPhase('success');
            onConnected(status.account);
          }
        } catch {
          // Keep polling silently on transient errors
        }
      }, 2000);
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Connection failed');
    }
  }, [onConnected, stopPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    setPhase('idle');
    setQrUrl(null);
    setDeeplink(null);
    setUuid(null);
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
          className="flex items-center gap-2 w-full px-4 py-3 rounded-xl font-bold text-white
            bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
            transition-all shadow-lg active:scale-95"
        >
          <img
            src="https://xumm.app/assets/icons/favicon-196x196.png"
            alt="Xaman"
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

  // phase === 'waiting'
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-orange-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">

        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img
              src="https://xumm.app/assets/icons/favicon-196x196.png"
              alt="Xaman"
              className="w-7 h-7 rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h2 className="text-xl font-bold text-white">Connect Xaman</h2>
          </div>
          <p className="text-gray-400 text-sm">Scan the QR code or open in your Xaman app</p>
        </div>

        {/* QR code */}
        <div className="bg-white rounded-xl p-3 mb-4 flex items-center justify-center min-h-[220px]">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Xaman QR Code"
              className="w-full max-w-[200px] h-auto mx-auto"
            />
          ) : (
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          )}
        </div>

        {/* Deep link button */}
        {deeplink && (
          <a
            href={deeplink}
            className="block w-full py-3 px-4 mb-3 text-center font-bold text-white rounded-xl
              bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
              transition-all shadow-lg"
          >
            Open in Xaman App
          </a>
        )}

        {/* Steps */}
        <div className="space-y-2 text-sm mb-4">
          {[
            'Open Xaman on your phone',
            'Tap scan and point at the QR code',
            'Approve the sign-in request',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center
                flex-shrink-0 text-xs font-bold text-orange-400">
                {i + 1}
              </span>
              <p className="text-gray-300">{step}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            <p className="text-xs text-gray-400">Waiting for approval…</p>
          </div>
          <button
            onClick={cancel}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
