'use client';

import React, { useState, useEffect } from 'react';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

export default function MerchantModal() {
  const { state, buyFromMerchant, canAfford } = useGame();
  const [open, setOpen] = useState(false);
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
    <>
      {/* Merchant visit banner — shown on Hero tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
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
              {unpurchased} deal{unpurchased !== 1 ? 's' : ''} available · leaves in {timeLeft}
            </p>
          </div>
          <span className="text-[#a78bfa] text-sm">›</span>
        </button>
      )}

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-50">
          <div
            className="w-full max-w-[430px] rounded-t-2xl pb-safe"
            style={{
              background: 'linear-gradient(180deg, rgba(22,14,40,0.99) 0%, rgba(10,6,20,1) 100%)',
              border: '1px solid rgba(139,92,246,0.25)',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
              style={{ background: 'rgba(22,14,40,0.95)', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🧙</span>
                <div>
                  <p className="font-cinzel font-bold text-[#a78bfa] text-base">Travelling Merchant</p>
                  <p className="text-[#4a3a6a] text-[9px]">Leaves in {timeLeft} · deals reset at midnight</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#4a3a6a] hover:text-[#6b5a8a] text-xl px-2">✕</button>
            </div>

            {/* Gold balance */}
            <div className="px-4 py-2 flex items-center gap-1.5 border-b border-[rgba(139,92,246,0.08)]">
              <span className="coin-icon" style={{ width: 14, height: 14 }} />
              <span className="font-cinzel text-[#f0c040] font-bold text-sm">{formatNumber(state.gold)}</span>
              <span className="text-[#4a3a2a] text-[9px]">available gold</span>
            </div>

            {/* Deals */}
            <div className="px-3 py-3 flex flex-col gap-2">
              {deals.map(deal => {
                const affordable = canAfford(deal.goldCost);
                return (
                  <div
                    key={deal.id}
                    className="rounded-xl p-3"
                    style={{
                      background: deal.purchased ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.06)',
                      border: deal.purchased
                        ? '1px solid rgba(255,255,255,0.04)'
                        : '1px solid rgba(139,92,246,0.2)',
                      opacity: deal.purchased ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{deal.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px]">{deal.title}</p>
                        <p className="text-[#6b5a3a] text-[9px] mt-0.5 leading-snug">{deal.desc}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <span className="coin-icon" style={{ width: 11, height: 11 }} />
                          <span className={`font-cinzel font-bold text-[11px] ${affordable ? 'text-[#f0c040]' : 'text-red-400'}`}>
                            {formatNumber(deal.goldCost)}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {deal.purchased ? (
                          <span className="text-[#4ade80] text-[10px] font-bold">✓ Bought</span>
                        ) : (
                          <button
                            onClick={() => buyFromMerchant(deal.id)}
                            disabled={!affordable}
                            className="px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all active:scale-95"
                            style={{
                              background: affordable
                                ? 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)'
                                : 'rgba(100,80,40,0.2)',
                              color: affordable ? '#fff' : '#4a3a2a',
                              border: affordable ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(100,80,40,0.2)',
                              opacity: affordable ? 1 : 0.5,
                            }}
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

