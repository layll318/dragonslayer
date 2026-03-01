'use client';

import React from 'react';
import { formatNumber } from '@/utils/format';

const MOCK_LEADERBOARD = [
  { rank: 1, name: 'DragonLord99', level: 47, gold: 8_500_000, taps: 125_000 },
  { rank: 2, name: 'SlayerKing', level: 42, gold: 6_200_000, taps: 98_000 },
  { rank: 3, name: 'FireBreath', level: 38, gold: 4_800_000, taps: 87_000 },
  { rank: 4, name: 'DarkKnight', level: 35, gold: 3_500_000, taps: 76_000 },
  { rank: 5, name: 'BoneCrusher', level: 31, gold: 2_800_000, taps: 65_000 },
  { rank: 6, name: 'StormBlade', level: 28, gold: 2_100_000, taps: 54_000 },
  { rank: 7, name: 'IronFist', level: 25, gold: 1_600_000, taps: 43_000 },
  { rank: 8, name: 'ShadowHunter', level: 22, gold: 1_200_000, taps: 35_000 },
  { rank: 9, name: 'BlazeMaster', level: 19, gold: 800_000, taps: 28_000 },
  { rank: 10, name: 'NoviceSlayer', level: 15, gold: 500_000, taps: 20_000 },
];

function getRankStyle(rank: number) {
  if (rank === 1) return { color: '#FFD700', bg: 'rgba(255,215,0,0.08)', border: 'rgba(255,215,0,0.3)', glow: '0 0 20px rgba(255,215,0,0.1)' };
  if (rank === 2) return { color: '#C0C0C0', bg: 'rgba(192,192,192,0.06)', border: 'rgba(192,192,192,0.25)', glow: '0 0 15px rgba(192,192,192,0.08)' };
  if (rank === 3) return { color: '#CD7F32', bg: 'rgba(205,127,50,0.06)', border: 'rgba(205,127,50,0.25)', glow: '0 0 15px rgba(205,127,50,0.08)' };
  return { color: '#8a7a5a', bg: 'transparent', border: 'rgba(212,160,23,0.12)', glow: 'none' };
}

function getRankIcon(rank: number): string {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

export default function LeaderboardTab() {
  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Leaderboard</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Top Dragonslayers</p>
          </div>
          <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-lg border border-[rgba(212,160,23,0.15)]">
            <span className="text-[10px] text-[#6b5a3a] uppercase tracking-wider font-bold">Season 1</span>
          </div>
        </div>
      </div>

      {/* Column labels */}
      <div className="flex items-center gap-2 px-5 py-2 mt-1 text-[9px] text-[#4a3a2a] font-bold uppercase tracking-widest">
        <span className="w-9 text-center">Rank</span>
        <span className="flex-1">Player</span>
        <span className="w-10 text-center">Lv</span>
        <span className="w-20 text-right">Gold</span>
      </div>

      <div className="px-3 space-y-2">
        {MOCK_LEADERBOARD.map((player) => {
          const rs = getRankStyle(player.rank);
          return (
            <div
              key={player.rank}
              className="relative flex items-center gap-2 px-3 py-3 rounded-lg overflow-hidden"
              style={{
                background: `linear-gradient(90deg, ${rs.bg} 0%, transparent 100%), linear-gradient(180deg, rgba(22,16,8,0.97) 0%, rgba(12,8,4,0.99) 100%)`,
                border: `1px solid ${rs.border}`,
                boxShadow: `${rs.glow}, 0 4px 12px rgba(0,0,0,0.3)`,
              }}
            >
              {/* Rank glow line for top 3 */}
              {player.rank <= 3 && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: rs.color, boxShadow: `0 0 8px ${rs.color}` }} />
              )}

              {/* Rank */}
              <div
                className="w-9 h-9 flex items-center justify-center rounded-lg font-bold text-sm flex-shrink-0"
                style={{
                  color: rs.color,
                  background: player.rank <= 3 ? `${rs.color}12` : 'rgba(0,0,0,0.2)',
                  border: player.rank <= 3 ? `1px solid ${rs.color}30` : '1px solid rgba(100,80,40,0.15)',
                }}
              >
                {getRankIcon(player.rank)}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span
                  className="font-bold text-sm block truncate"
                  style={{ color: player.rank <= 3 ? rs.color : '#d8c8a8' }}
                >
                  {player.name}
                </span>
                <span className="text-[10px] text-[#5a4a3a]">
                  {formatNumber(player.taps)} taps
                </span>
              </div>

              {/* Level */}
              <div className="w-10 flex-shrink-0">
                <div className="level-badge w-9 h-9 flex items-center justify-center mx-auto">
                  <span className="font-cinzel text-[#f0c040] font-bold text-xs">{player.level}</span>
                </div>
              </div>

              {/* Gold */}
              <div className="w-20 text-right flex items-center justify-end gap-1 flex-shrink-0">
                <span className="coin-icon" style={{ width: 12, height: 12 }} />
                <span className="font-cinzel text-[#f0c040] font-bold text-xs tabular-nums">
                  {formatNumber(player.gold)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="mx-3 mt-4 p-4 rounded-lg text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(22,16,8,0.6) 0%, rgba(12,8,4,0.8) 100%)',
          border: '1px dashed rgba(212,160,23,0.2)',
        }}
      >
        <span className="text-[#6b5a3a] text-xs">Connect your wallet to compete</span>
      </div>
    </div>
  );
}
