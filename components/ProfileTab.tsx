'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import XamanConnect from '@/components/XamanConnect';

const TIER_NAMES = ['Peasant', 'Squire', 'Knight', 'Dragon Knight', 'Dragonslayer'];
const TIER_ICONS = ['🧑‍🌾', '🛡️', '⚔️', '🐲', '👑'];
const TIER_LEVELS = [1, 10, 25, 50, 80];

export default function ProfileTab() {
  const { state, goldPerHour, goldPerTap, getCharacterTier, connectWallet, disconnectWallet } = useGame();
  const { user, isTWA } = useTelegramWebApp();
  const tier = getCharacterTier();
  const timePlayed = Math.floor((Date.now() - state.createdAt) / 1000);
  const hours = Math.floor(timePlayed / 3600);
  const minutes = Math.floor((timePlayed % 3600) / 60);
  const totalBuildings = state.buildings.reduce((sum, b) => sum + b.owned, 0);
  const xpPercent = state.xpToNext > 0 ? (state.xp / state.xpToNext) * 100 : 0;

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Profile</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Your journey</p>
          </div>
        </div>
      </div>

      <div className="px-3 mt-2 space-y-3">

        {/* ═══ CHARACTER INFO ═══ */}
        <div className="dragon-panel p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="level-badge w-16 h-16 flex flex-col items-center justify-center">
              <span className="font-cinzel text-[#f0c040] font-black text-xl leading-none">{state.level}</span>
              <span className="text-[#6b5a3a] text-[7px] uppercase tracking-wider mt-0.5">Level</span>
            </div>
            <div className="flex-1">
              <span className="gold-shimmer font-cinzel font-bold text-lg block">{TIER_NAMES[tier - 1]}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[#6b5a3a] text-[10px] tabular-nums">
                  {formatNumber(state.xp)} / {formatNumber(state.xpToNext)} XP
                </span>
              </div>
              <div className="xp-bar-bg w-full h-2.5 mt-1.5">
                <div className="xp-bar-fill h-full" style={{ width: `${xpPercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ STATS GRID ═══ */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon="🪙" label="Total Gold" value={formatNumber(state.totalGoldEarned)} highlight />
          <StatCard icon="👆" label="Total Taps" value={formatNumber(state.totalTaps)} />
          <StatCard icon="⚡" label="Per Tap" value={`+${goldPerTap}`} />
          <StatCard icon="🏗️" label="Gold/Hr" value={formatNumber(goldPerHour)} />
          <StatCard icon="🏛️" label="Buildings" value={`${totalBuildings}`} />
          <StatCard icon="⏱️" label="Played" value={`${hours}h ${minutes}m`} />
        </div>

        {/* ═══ IDENTITY / WALLET ═══ */}
        <div className="dragon-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-cinzel text-[#f0c040] font-bold text-sm">Identity</h3>
            {state.isSynced && (
              <span className="flex items-center gap-1 text-[9px] text-green-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                SYNCED
              </span>
            )}
          </div>

          {/* Telegram identity */}
          {isTWA && user && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-black/30 border border-[rgba(100,180,255,0.15)]">
              <span className="text-lg">✈️</span>
              <div>
                <p className="text-[#d8c8a8] text-xs font-bold">{user.first_name}{user.last_name ? ` ${user.last_name}` : ''}</p>
                {user.username && <p className="text-[#6b5a3a] text-[9px]">@{user.username}</p>}
              </div>
            </div>
          )}

          {/* Wallet status / connect */}
          {state.walletAddress ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-[rgba(212,160,23,0.2)]">
                <img
                  src="https://xumm.app/assets/icons/favicon-196x196.png"
                  alt="Xaman"
                  className="w-4 h-4 rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <p className="text-[#f0c040] text-[9px] font-mono flex-1 truncate">{state.walletAddress}</p>
              </div>
              <button
                onClick={disconnectWallet}
                className="w-full py-1.5 rounded-lg text-[10px] font-bold text-[#6b5a3a] border border-[rgba(100,80,40,0.3)] hover:border-red-500/30 hover:text-red-400 transition-colors"
              >
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[#6b5a3a] text-[10px] leading-relaxed">
                Link your XRPL wallet to sync progress across devices and earn DragonSlayer tokens.
              </p>
              <XamanConnect onConnected={connectWallet} />
            </div>
          )}
        </div>

        {/* ═══ TIER PROGRESSION ═══ */}
        <div className="dragon-panel p-4">
          <h3 className="font-cinzel text-[#f0c040] font-bold text-xs uppercase tracking-widest mb-3">Character Evolution</h3>
          <div className="space-y-1">
            {TIER_NAMES.map((name, i) => {
              const tierLevel = TIER_LEVELS[i];
              const isCurrent = i + 1 === tier;
              const isUnlocked = state.level >= tierLevel;
              const progress = isCurrent && i < 4
                ? Math.min(100, ((state.level - tierLevel) / (TIER_LEVELS[i + 1] - tierLevel)) * 100)
                : isUnlocked ? 100 : 0;

              return (
                <div
                  key={name}
                  className="relative flex items-center gap-3 px-3 py-2 rounded-lg overflow-hidden"
                  style={{
                    background: isCurrent
                      ? 'linear-gradient(90deg, rgba(212,160,23,0.08) 0%, transparent 100%)'
                      : 'transparent',
                    border: isCurrent ? '1px solid rgba(212,160,23,0.25)' : '1px solid transparent',
                  }}
                >
                  {/* Progress bg */}
                  {(isCurrent || isUnlocked) && (
                    <div
                      className="absolute left-0 top-0 bottom-0 opacity-[0.04]"
                      style={{
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #f0c040, #d4a017)',
                      }}
                    />
                  )}

                  <span className={`text-base relative z-10 ${isUnlocked ? '' : 'opacity-25 grayscale'}`}>
                    {TIER_ICONS[i]}
                  </span>
                  <span
                    className={`text-xs font-bold flex-1 relative z-10 ${
                      isCurrent ? 'text-[#f0c040]' : isUnlocked ? 'text-[#d8c8a8]' : 'text-[#4a3a2a]'
                    }`}
                  >
                    {name}
                  </span>
                  <span className="text-[9px] text-[#4a3a2a] font-bold relative z-10">Lv.{tierLevel}</span>
                  {isUnlocked && (
                    <span className="relative z-10 w-5 h-5 rounded-full bg-green-900/30 border border-green-500/30 flex items-center justify-center">
                      <span className="text-green-400 text-[10px]">✓</span>
                    </span>
                  )}
                  {!isUnlocked && (
                    <span className="relative z-10 w-5 h-5 rounded-full bg-black/20 border border-[rgba(100,80,40,0.15)] flex items-center justify-center">
                      <span className="text-[#3a2a1a] text-[10px]">-</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-lg p-3 text-center"
      style={{
        background: 'linear-gradient(180deg, rgba(22,16,8,0.97) 0%, rgba(12,8,4,0.99) 100%)',
        border: highlight ? '1px solid rgba(212,160,23,0.3)' : '1px solid rgba(100,80,40,0.15)',
        boxShadow: highlight ? '0 0 16px rgba(212,160,23,0.06)' : '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div className="text-lg mb-0.5">{icon}</div>
      <div className={`font-bold text-sm tabular-nums ${highlight ? 'text-[#f0c040]' : 'text-[#d8c8a8]'}`}>{value}</div>
      <div className="text-[#4a3a2a] text-[8px] uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
