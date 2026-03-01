'use client';

import React, { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

export default function QuestBanner() {
  const { state, claimQuest } = useGame();
  const [open, setOpen] = useState(false);

  const quests = state.dailyQuests || [];
  const claimable = quests.filter(q => q.completed && !q.claimed).length;
  const allDone = quests.every(q => q.claimed);

  return (
    <div className="quest-banner dragon-panel overflow-hidden" style={{ padding: 0 }}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 select-none"
        style={{ touchAction: 'manipulation' }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-base">📜</span>
        <span className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider flex-1 text-left">
          DAILY QUESTS
        </span>
        {claimable > 0 && (
          <span className="bg-[#f0c040] text-[#1a0e00] text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-bounce">
            {claimable}
          </span>
        )}
        {allDone && (
          <span className="text-[#6b9a40] text-[9px] font-bold tracking-wide">ALL DONE ✓</span>
        )}
        <span className="text-[#6b5a3a] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {/* Quest list */}
      {open && (
        <div className="border-t border-[rgba(212,160,23,0.15)] divide-y divide-[rgba(212,160,23,0.08)]">
          {quests.map(q => {
            const pct = q.target > 0 ? Math.min(100, (q.progress / q.target) * 100) : 0;
            return (
              <div key={q.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-bold truncate ${q.claimed ? 'text-[#4a3a2a]' : 'text-[#d8c898]'}`}>
                    {q.description}
                  </p>
                  {!q.completed && (
                    <div className="mt-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden w-full">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #d4a017, #f0c040)',
                        }}
                      />
                    </div>
                  )}
                  {!q.completed && (
                    <p className="text-[8px] text-[#6b5a3a] mt-0.5">
                      {formatNumber(q.progress)} / {formatNumber(q.target)}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {q.claimed ? (
                    <span className="text-[#4a3a2a] text-[9px] font-bold">✓ DONE</span>
                  ) : q.completed ? (
                    <button
                      onClick={() => claimQuest(q.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[9px] text-[#1a0e00]"
                      style={{
                        background: 'linear-gradient(135deg, #f0c040, #d4a017)',
                        boxShadow: '0 2px 8px rgba(240,192,64,0.3)',
                        animation: 'goldShimmerBtn 1.5s ease-in-out infinite',
                      }}
                    >
                      <span className="coin-icon" style={{ width: 8, height: 8 }} />
                      {formatNumber(q.reward)}
                    </button>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <span className="coin-icon" style={{ width: 8, height: 8 }} />
                      <span className="text-[#6b5a3a] text-[9px] font-bold">{formatNumber(q.reward)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
