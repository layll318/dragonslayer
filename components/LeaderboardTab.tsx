'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { formatNumber } from '@/utils/format';
import { useGame } from '@/contexts/GameContext';
import { RefreshCw } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  player_id: number;
  name: string;
  level: number;
  total_gold: number;
  total_taps: number;
}

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

function SkeletonRow({ i }: { i: number }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-3 rounded-lg"
      style={{ background: 'rgba(22,16,8,0.97)', border: '1px solid rgba(212,160,23,0.08)' }}
    >
      <div className="w-9 h-9 rounded-lg bg-[#1a1206] animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 rounded bg-[#1a1206] animate-pulse" style={{ width: `${55 + i * 7}%` }} />
        <div className="h-2 rounded bg-[#120e06] animate-pulse w-24" />
      </div>
      <div className="w-9 h-9 rounded-lg bg-[#1a1206] animate-pulse flex-shrink-0" />
      <div className="w-16 h-3 rounded bg-[#1a1206] animate-pulse flex-shrink-0" />
    </div>
  );
}

export default function LeaderboardTab() {
  const { state } = useGame();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (state.playerId) params.set('player_id', String(state.playerId));
      const res = await fetch(`/frontend-api/leaderboard?${params}`);
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries ?? []);
        setOwnRank(data.own_rank ?? null);
      } else {
        setError(data.error || 'Failed to load');
      }
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }, [state.playerId]);

  useEffect(() => { load(); }, [load]);

  const canRefresh = Date.now() - lastRefresh > 15_000;

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Leaderboard</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Top Dragonslayers</p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && (
              <button
                onClick={canRefresh ? load : undefined}
                className="flex items-center gap-1 bg-black/30 px-2.5 py-1.5 rounded-lg border border-[rgba(212,160,23,0.15)] transition-opacity"
                style={{ opacity: canRefresh ? 1 : 0.4 }}
              >
                <RefreshCw className="w-3 h-3 text-[#6b5a3a]" />
              </button>
            )}
            <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-lg border border-[rgba(212,160,23,0.15)]">
              <span className="text-[10px] text-[#6b5a3a] uppercase tracking-wider font-bold">Season 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Own rank chip (if outside top 20) */}
      {ownRank !== null && ownRank > 20 && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)' }}>
          <span className="text-[#f0c040] text-xs font-bold font-cinzel">Your rank:</span>
          <span className="text-[#d8c8a8] text-xs font-bold">#{ownRank}</span>
        </div>
      )}

      {/* Column labels */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 mt-1 text-[9px] text-[#4a3a2a] font-bold uppercase tracking-widest">
          <span className="w-9 text-center">Rank</span>
          <span className="flex-1">Player</span>
          <span className="w-10 text-center">Lv</span>
          <span className="w-20 text-right">Gold</span>
        </div>
      )}

      <div className="px-3 space-y-2">
        {/* Loading skeleton */}
        {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} i={i} />)}

        {/* Error state */}
        {!loading && error && (
          <div className="py-12 text-center">
            <p className="text-4xl mb-3">⚔️</p>
            <p className="text-[#6b5a3a] text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-[#f0c040] underline">Try again</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-5xl mb-3">🐉</p>
            <p className="font-cinzel text-[#f0c040] font-bold text-sm mb-1">No heroes yet</p>
            <p className="text-[#6b5a3a] text-xs">Connect your wallet to claim rank #1!</p>
          </div>
        )}

        {/* Real entries */}
        {!loading && !error && entries.map((player) => {
          const rs = getRankStyle(player.rank);
          const isMe = state.playerId !== null && player.player_id === state.playerId;
          return (
            <div
              key={player.player_id}
              className="relative flex items-center gap-2 px-3 py-3 rounded-lg overflow-hidden"
              style={{
                background: isMe
                  ? 'linear-gradient(90deg, rgba(212,160,23,0.12) 0%, rgba(22,16,8,0.97) 100%)'
                  : `linear-gradient(90deg, ${rs.bg} 0%, transparent 100%), linear-gradient(180deg, rgba(22,16,8,0.97) 0%, rgba(12,8,4,0.99) 100%)`,
                border: isMe ? '1px solid rgba(212,160,23,0.4)' : `1px solid ${rs.border}`,
                boxShadow: isMe ? '0 0 16px rgba(212,160,23,0.08)' : `${rs.glow}, 0 4px 12px rgba(0,0,0,0.3)`,
              }}
            >
              {/* Rank glow line */}
              {player.rank <= 3 && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: rs.color, boxShadow: `0 0 8px ${rs.color}` }} />
              )}
              {isMe && player.rank > 3 && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: '#d4a017', boxShadow: '0 0 8px #d4a017' }} />
              )}

              {/* Rank badge */}
              <div
                className="w-9 h-9 flex items-center justify-center rounded-lg font-bold text-sm flex-shrink-0"
                style={{
                  color: isMe ? '#f0c040' : rs.color,
                  background: player.rank <= 3 ? `${rs.color}12` : isMe ? 'rgba(212,160,23,0.12)' : 'rgba(0,0,0,0.2)',
                  border: player.rank <= 3 ? `1px solid ${rs.color}30` : isMe ? '1px solid rgba(212,160,23,0.3)' : '1px solid rgba(100,80,40,0.15)',
                }}
              >
                {getRankIcon(player.rank)}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-bold text-sm block truncate"
                    style={{ color: isMe ? '#f0c040' : player.rank <= 3 ? rs.color : '#d8c8a8' }}
                  >
                    {player.name}
                  </span>
                  {isMe && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(212,160,23,0.15)] text-[#d4a017] border border-[rgba(212,160,23,0.2)] flex-shrink-0">
                      YOU
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#5a4a3a]">
                  {formatNumber(player.total_taps)} taps
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
                  {formatNumber(player.total_gold)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {!loading && (
        <div className="mx-3 mt-4 p-4 rounded-lg text-center"
          style={{
            background: 'linear-gradient(180deg, rgba(22,16,8,0.6) 0%, rgba(12,8,4,0.8) 100%)',
            border: '1px dashed rgba(212,160,23,0.2)',
          }}
        >
          <span className="text-[#6b5a3a] text-xs">
            {state.walletAddress ? 'Your progress syncs every 30s' : 'Connect your wallet in Profile to compete'}
          </span>
        </div>
      )}
    </div>
  );
}
