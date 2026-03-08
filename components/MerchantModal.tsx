'use client';

import React, { useState, useEffect } from 'react';
import { useGame } from '@/contexts/GameContext';

export default function MerchantModal({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { state } = useGame();
  const [timeLeft, setTimeLeft] = useState('');

  const deals = state.merchantDeals ?? [];
  const expiresAt = state.merchantExpiresAt ?? null;
  const isActive = expiresAt ? Date.now() < expiresAt : false;
  const unpurchased = deals.filter(d => !d.purchased).length;

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = Math.max(0, expiresAt - Date.now());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!isActive || deals.length === 0) return null;

  return (
    <button
      onClick={() => onTabChange?.('buildings')}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left transition-all active:scale-95"
      style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(109,40,217,0.06) 100%)',
        border: '1px solid rgba(139,92,246,0.3)',
        boxShadow: '0 0 16px rgba(139,92,246,0.08)',
      }}
    >
      <span className="text-2xl">🧙</span>
      <div className="flex-1 min-w-0">
        <p className="font-cinzel font-bold text-[11px] tracking-wide" style={{ color: '#a78bfa' }}>
          MERCHANT IN TOWN
        </p>
        <p className="text-[#6b5a3a] text-[9px]">
          {unpurchased} deal{unpurchased !== 1 ? 's' : ''} available · leaves in {timeLeft} · tap to Shop
        </p>
      </div>
      <span className="text-[#a78bfa] text-sm">›</span>
    </button>
  );
}

