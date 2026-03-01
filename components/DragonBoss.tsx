'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

export default function DragonBoss() {
  const { state, tapBoss } = useGame();
  const [shaking, setShaking] = useState(false);
  const [reward, setReward] = useState<number | null>(null);

  const boss = state.boss;
  const hpPct = boss ? Math.max(0, (boss.hp / boss.maxHp) * 100) : 0;

  const handleBossTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.boss?.active) return;
    const willKill = state.boss.hp <= Math.max(1, Math.floor((1 + state.level * 0.5)));
    if (willKill) {
      setReward(state.boss.reward);
      setTimeout(() => setReward(null), 2000);
    }
    tapBoss();
    setShaking(true);
    setTimeout(() => setShaking(false), 200);
  }, [tapBoss, state.boss, state.level]);

  if (!boss?.active) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center select-none cursor-pointer"
      style={{
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(2px)',
        touchAction: 'manipulation',
      }}
      onClick={handleBossTap}
    >
      {/* Boss title */}
      <div className="text-center mb-3">
        <p className="font-cinzel font-black text-[#ff4422] text-xs tracking-[0.3em] uppercase animate-pulse">
          ⚔ Dragon Raid ⚔
        </p>
      </div>

      {/* Dragon image */}
      <div
        className="relative"
        style={{
          animation: shaking ? 'bossShake 0.2s ease-in-out' : undefined,
          filter: hpPct < 30
            ? 'drop-shadow(0 0 24px rgba(255,0,0,0.8)) drop-shadow(0 0 8px rgba(255,80,0,0.6))'
            : 'drop-shadow(0 0 30px rgba(255,80,0,0.7)) drop-shadow(0 0 14px rgba(255,140,0,0.5))',
        }}
      >
        <Image
          src="/images/boss1.png"
          alt="Fire Dragon Boss"
          width={200}
          height={160}
          style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
          priority
        />

        {/* Low HP red pulse overlay */}
        {hpPct < 30 && (
          <div className="absolute inset-0 rounded-lg pointer-events-none"
            style={{ background: 'rgba(255,0,0,0.15)', animation: 'careWarnPulse 0.6s ease-in-out infinite' }} />
        )}

        {/* Hit sparks */}
        {shaking && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute w-2 h-2 rounded-full"
                style={{
                  background: '#ff8800',
                  top: `${20 + Math.random() * 60}%`,
                  left: `${10 + Math.random() * 80}%`,
                  animation: 'critBurst 0.3s ease-out forwards',
                  boxShadow: '0 0 8px #ff4400',
                }} />
            ))}
          </div>
        )}
      </div>

      {/* HP Bar */}
      <div className="mt-4 w-48">
        <div className="flex items-center justify-between mb-1">
          <span className="font-cinzel text-[#ff4422] text-[9px] font-bold tracking-wider">HP</span>
          <span className="font-cinzel text-[#ff8866] text-[9px] font-bold tabular-nums">{boss.hp} / {boss.maxHp}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,50,20,0.3)' }}>
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${hpPct}%`,
              background: hpPct > 50
                ? 'linear-gradient(90deg, #ff4422, #ff8800)'
                : hpPct > 20
                ? 'linear-gradient(90deg, #ff2200, #ff6600)'
                : 'linear-gradient(90deg, #cc0000, #ff2200)',
              boxShadow: '0 0 8px rgba(255,60,20,0.6)',
            }}
          />
        </div>
      </div>

      {/* Reward preview */}
      <div className="mt-3 flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full">
        <span className="coin-icon" style={{ width: 12, height: 12 }} />
        <span className="font-cinzel text-[#f0c040] text-xs font-bold">{formatNumber(boss.reward)}</span>
        <span className="text-[#6b5a3a] text-[9px]">reward</span>
      </div>

      {/* Tap instruction */}
      <p className="mt-2 text-[#6b5a3a] text-[9px] font-bold uppercase tracking-widest animate-pulse">
        TAP TO ATTACK
      </p>

      {/* Kill reward float */}
      {reward !== null && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-none z-40"
          style={{ animation: 'goldFloat 1.8s ease-out forwards' }}>
          <span className="font-cinzel font-black text-2xl" style={{
            color: '#f0c040',
            textShadow: '0 0 20px rgba(240,192,64,0.9), 0 2px 4px rgba(0,0,0,0.8)',
          }}>
            +{formatNumber(reward)} 🐉
          </span>
        </div>
      )}
    </div>
  );
}
