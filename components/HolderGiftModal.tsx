'use client';

import React from 'react';
import { useGame, EGG_VARIANTS, EggRarity } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

const RARITY_COLOR: Record<EggRarity, string> = {
  common:    '#9a9a9a',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  legendary: '#f0c040',
};

const RARITY_LABEL: Record<EggRarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
};

function getStreakEggRarity(streak: number): EggRarity {
  if (streak >= 25) return 'legendary';
  if (streak >= 15) return 'rare';
  if (streak >= 7)  return 'uncommon';
  return 'common';
}

export default function HolderGiftModal() {
  const { state, claimHolderGift } = useGame();

  if (!state.holderGiftPending) return null;
  if (!state.tokenDiscount || state.tokenDiscount.pct === 0) return null;
  if (state.loginBonusPending) return null; // let login bonus show first

  const streak     = Math.min(Math.max(1, (state.holderGiftStreak || 0) + 1), 30);
  const goldBonus  = 1000 + streak * 300;
  const eggRarity  = getStreakEggRarity(streak);
  const matQty     = 1 + Math.floor(streak / 5);
  const eggColor   = RARITY_COLOR[eggRarity];
  const eggLabel   = RARITY_LABEL[eggRarity];
  const eggVariant = EGG_VARIANTS[eggRarity][0];

  // Progress bar: how far through the 30-day journey
  const pct = Math.round((streak / 30) * 100);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0d0a00 0%, #130900 100%)',
          border: '1px solid rgba(139,92,246,0.5)',
          boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 20px 60px rgba(0,0,0,0.8)',
          animation: 'modalPop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Header */}
        <div
          className="text-center pt-6 pb-3 px-4"
          style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.12) 0%, transparent 100%)' }}
        >
          <div className="text-5xl mb-2">🐉</div>
          <h2 className="font-cinzel font-black text-xl text-[#a78bfa] tracking-wider">Holder Daily Gift</h2>
          <p className="text-[#7c5cbf] text-xs mt-1">
            Day <span className="text-[#f0c040] font-bold">{streak}</span> of 30
            {streak >= 25 && <span className="text-[#f0c040] ml-1">🔥 LEGENDARY</span>}
          </p>
        </div>

        {/* 30-day progress bar */}
        <div className="px-5 pb-3">
          <div className="flex justify-between text-[8px] text-[#4a3a6a] mb-1">
            <span>Day 1</span>
            <span className="text-[#a78bfa]">Day {streak}</span>
            <span>Day 30</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }}
            />
          </div>
          <div className="flex justify-between text-[7px] text-[#4a3a6a] mt-0.5">
            <span>Common egg</span>
            <span>Uncommon (7)</span>
            <span>Rare (15)</span>
            <span>Legendary (25+)</span>
          </div>
        </div>

        {/* Reward breakdown */}
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 space-y-2"
          style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <p className="text-[8px] text-[#7c5cbf] uppercase tracking-wider font-bold mb-1">Today&apos;s Rewards</p>

          {/* Gold */}
          <div className="flex items-center gap-2">
            <span className="coin-icon flex-shrink-0" style={{ width: 18, height: 18 }} />
            <span className="font-cinzel font-black text-[#f0c040] text-base">+{formatNumber(goldBonus)}</span>
            <span className="text-[9px] text-[#6b5a3a]">gold</span>
          </div>

          {/* Dragon Egg */}
          <div className="flex items-center gap-2">
            <span className="text-lg">🥚</span>
            <div>
              <p className="font-bold text-[11px]" style={{ color: eggColor }}>
                {eggLabel} Dragon Egg
              </p>
              <p className="text-[9px]" style={{ color: eggColor, opacity: 0.8 }}>
                {eggVariant.label} · hatches in {eggVariant.hatchHours}h
              </p>
            </div>
          </div>

          {/* Materials */}
          <div className="flex items-center gap-2">
            <span className="text-lg">📦</span>
            <div>
              <p className="font-bold text-[11px] text-[#e8d8a8]">{matQty}× each material</p>
              <p className="text-[9px] text-[#6b5a3a]">dragon scale · fire crystal · iron ore · bone shard · ancient rune</p>
            </div>
          </div>
        </div>

        {/* Next milestone hint */}
        {streak < 30 && (
          <div className="mx-4 mb-3 text-center">
            {streak < 7 && (
              <p className="text-[9px] text-[#5a4a7a]">Claim 7 days in a row for an 🟢 Uncommon egg!</p>
            )}
            {streak >= 7 && streak < 15 && (
              <p className="text-[9px] text-[#5a4a7a]">🔵 Rare egg unlocks at day 15 — {15 - streak} days to go!</p>
            )}
            {streak >= 15 && streak < 25 && (
              <p className="text-[9px] text-[#5a4a7a]">⭐ Legendary egg unlocks at day 25 — {25 - streak} days to go!</p>
            )}
          </div>
        )}

        {/* Claim button */}
        <div className="px-4 pb-6">
          <button
            onClick={claimHolderGift}
            className="w-full py-3 rounded-xl font-cinzel font-black text-base tracking-wider"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #7c3aed 100%)',
              backgroundSize: '200% 100%',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(139,92,246,0.45)',
              animation: 'goldShimmerBtn 2s ease-in-out infinite',
            }}
          >
            🐉 CLAIM GIFT
          </button>
        </div>
      </div>
    </div>
  );
}
