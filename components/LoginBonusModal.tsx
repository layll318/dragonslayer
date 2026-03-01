'use client';

import React from 'react';
import Image from 'next/image';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

const STREAK_DAYS = [1, 2, 3, 4, 5, 6, 7];
const REWARDS = [500, 750, 1000, 1500, 2000, 3000, 5000];

export default function LoginBonusModal() {
  const { state, claimLoginBonus } = useGame();

  if (!state.loginBonusPending) return null;

  const streakIdx = Math.min(Math.max(0, state.loginStreak - 1), REWARDS.length - 1);
  const todayReward = REWARDS[streakIdx];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(6px)',
    }}>
      <div className="login-bonus-modal w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a1200 0%, #0d0900 100%)',
          border: '1px solid rgba(212,160,23,0.5)',
          boxShadow: '0 0 60px rgba(212,160,23,0.2), 0 20px 60px rgba(0,0,0,0.8)',
          animation: 'modalPop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>

        {/* Header */}
        <div className="text-center pt-6 pb-3 px-4" style={{
          background: 'linear-gradient(180deg, rgba(212,160,23,0.12) 0%, transparent 100%)',
        }}>
          <div className="flex justify-center mb-2" style={{ filter: 'drop-shadow(0 0 18px rgba(100,180,255,0.7)) drop-shadow(0 0 8px rgba(60,140,255,0.5))' }}>
            <Image
              src="/images/boss2.png"
              alt="Ice Dragon"
              width={110}
              height={88}
              style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
              priority
            />
          </div>
          <h2 className="font-cinzel font-black text-xl text-[#f0c040] tracking-wider">Daily Bonus</h2>
          <p className="text-[#9a8a6a] text-xs mt-1">
            Day {state.loginStreak} Streak
            {state.loginStreak >= 7 && <span className="text-[#f0c040] ml-1">🔥 MAX</span>}
          </p>
        </div>

        {/* Streak Calendar */}
        <div className="grid grid-cols-7 gap-1 px-4 py-3">
          {STREAK_DAYS.map((day, i) => {
            const past = day < state.loginStreak;
            const today = day === state.loginStreak;
            return (
              <div key={day} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-full aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: today
                      ? 'linear-gradient(135deg, #f0c040, #d4a017)'
                      : past
                      ? 'rgba(212,160,23,0.2)'
                      : 'rgba(255,255,255,0.04)',
                    border: today ? '1px solid #f0c040' : '1px solid rgba(212,160,23,0.15)',
                    color: today ? '#1a0e00' : past ? '#f0c040' : '#5a4a3a',
                  }}
                >
                  {past ? '✓' : today ? '★' : day}
                </div>
                <span className="text-[7px] text-[#5a4a3a] font-bold">
                  {i < 6 ? (REWARDS[i] >= 1000 ? `${REWARDS[i]/1000}K` : REWARDS[i]) : '5K'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reward */}
        <div className="mx-4 mb-4 rounded-xl p-3 text-center"
          style={{ background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)' }}>
          <p className="text-[#9a8a6a] text-xs mb-1">Today&apos;s Reward</p>
          <div className="flex items-center justify-center gap-2">
            <span className="coin-icon" style={{ width: 22, height: 22 }} />
            <span className="font-cinzel font-black text-3xl text-[#f0c040]">
              {formatNumber(todayReward)}
            </span>
          </div>
        </div>

        {/* Claim Button */}
        <div className="px-4 pb-6">
          <button
            onClick={claimLoginBonus}
            className="w-full py-3 rounded-xl font-cinzel font-black text-base tracking-wider text-[#1a0e00]"
            style={{
              background: 'linear-gradient(135deg, #f0c040 0%, #d4a017 50%, #f0c040 100%)',
              boxShadow: '0 4px 20px rgba(240,192,64,0.4)',
              backgroundSize: '200% 100%',
              animation: 'goldShimmerBtn 2s ease-in-out infinite',
            }}
          >
            CLAIM REWARD
          </button>
        </div>
      </div>
    </div>
  );
}
