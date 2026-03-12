'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import XamanConnect from '@/components/XamanConnect';
import { RefreshCw, Pencil, Check, X } from 'lucide-react';

interface LeaderboardEntry {
  player_id: number;
  name: string;
  level: number;
  total_taps: number;
  total_gold: number;
  trophies: number;
  rank: number;
}

function getRankStyle(rank: number) {
  if (rank === 1) return { color: '#f0c040', bg: 'rgba(240,192,64,0.06)', border: 'rgba(240,192,64,0.2)', glow: '0 0 12px rgba(240,192,64,0.08)' };
  if (rank === 2) return { color: '#c0c0c0', bg: 'rgba(192,192,192,0.04)', border: 'rgba(192,192,192,0.15)', glow: '0 0 8px rgba(192,192,192,0.06)' };
  if (rank === 3) return { color: '#cd7f32', bg: 'rgba(205,127,50,0.04)', border: 'rgba(205,127,50,0.15)', glow: '0 0 8px rgba(205,127,50,0.06)' };
  return { color: '#5a4a3a', bg: 'transparent', border: 'rgba(100,80,40,0.12)', glow: 'none' };
}

function getRankIcon(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

const TIER_NAMES = ['Peasant', 'Squire', 'Knight', 'Dragon Knight', 'Dragonslayer'];
const TIER_ICONS = ['🧑‍🌾', '🛡️', '⚔️', '🐲', '👑'];
const TIER_LEVELS = [1, 10, 25, 50, 80];

export default function ProfileTab() {
  const { state, goldPerHour, goldPerTap, getCharacterTier, connectWallet, disconnectWallet, setDisplayName, forceSave, refreshFromServer, refreshTokenDiscount } = useGame();
  const { user, isTWA } = useTelegramWebApp();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEditName = useCallback(() => {
    const suggested = state.displayName
      || (isTWA && user ? (user.username ? `@${user.username}` : user.first_name) : '');
    setDraftName(suggested || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [state.displayName, isTWA, user]);

  const saveName = useCallback(async () => {
    if (!draftName.trim()) return;
    setSavingName(true);
    await setDisplayName(draftName.trim());
    setSavingName(false);
    setEditingName(false);
  }, [draftName, setDisplayName]);

  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbOwnRank, setLbOwnRank] = useState<number | null>(null);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbError, setLbError] = useState<string | null>(null);
  const [lbLastRefresh, setLbLastRefresh] = useState(0);
  const [lbSeasonMonth, setLbSeasonMonth] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string>('');
  const [refreshingDiscount, setRefreshingDiscount] = useState(false);
  const [holderGiftCountdown, setHolderGiftCountdown] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const ms = tomorrow.getTime() - Date.now();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setHolderGiftCountdown(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true); setLbError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (state.playerId) params.set('player_id', String(state.playerId));
      const res = await fetch(`/frontend-api/leaderboard?${params}`);
      const data = await res.json();
      if (data.success) { setLbEntries(data.entries ?? []); setLbOwnRank(data.own_rank ?? null); setLbSeasonMonth(data.season_month ?? ''); }
      else setLbError(data.error || 'Failed to load');
    } catch { setLbError('Could not reach server'); }
    finally { setLbLoading(false); setLbLastRefresh(Date.now()); }
  }, [state.playerId]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);
  const tier = getCharacterTier();
  const timePlayed = Math.floor((Date.now() - state.createdAt) / 1000);
  const hours = Math.floor(timePlayed / 3600);
  const minutes = Math.floor((timePlayed % 3600) / 60);
  const totalBuildings = state.buildings.reduce((sum, b) => sum + b.owned, 0);
  const xpPercent = state.xpToNext > 0 ? (state.xp / state.xpToNext) * 100 : 0;

  const handleForceSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await forceSave();
      setSaveMsg('✅ Saved!');
    } catch {
      setSaveMsg('❌ Save failed');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  }, [forceSave]);

  const handleRefreshFromServer = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      await refreshFromServer();
      setRefreshMsg('✅');
    } catch {
      setRefreshMsg('❌');
    }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(''), 3000);
  }, [refreshFromServer]);

  const handleRefreshDiscount = useCallback(async () => {
    setRefreshingDiscount(true);
    await refreshTokenDiscount();
    setRefreshingDiscount(false);
  }, [refreshTokenDiscount]);

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Profile</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Your journey</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleForceSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-cinzel font-bold text-[10px] transition-all active:scale-95"
              style={{
                background: saving ? 'rgba(212,160,23,0.05)' : 'rgba(212,160,23,0.12)',
                border: '1px solid rgba(212,160,23,0.3)',
                color: saving ? '#6b5a3a' : '#f0c040',
                opacity: saving ? 0.7 : 1,
              }}
            >
              ☁️ {saving ? 'Saving…' : saveMsg || 'Save'}
            </button>
            <button
              onClick={handleRefreshFromServer}
              disabled={refreshing}
              title="Reload state from server"
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-all active:scale-95"
              style={{
                background: refreshing ? 'rgba(96,165,250,0.05)' : 'rgba(96,165,250,0.12)',
                border: '1px solid rgba(96,165,250,0.3)',
                color: refreshing ? '#3a4a6a' : (refreshMsg || '#60a5fa'),
                opacity: refreshing ? 0.7 : 1,
              }}
            >
              {refreshMsg || <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }} />}
            </button>
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
          <StatCard icon="�" label="Trophies" value={`${state.trophies ?? 0}`} highlight />
          <StatCard icon="�️" label="Buildings" value={`${totalBuildings}`} />
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

          {/* Display name — editable, shown in Arena */}
          <div className="mb-3">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={draftName}
                  onChange={e => setDraftName(e.target.value.slice(0, 32))}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                  placeholder="Your name (shown in Arena)"
                  maxLength={32}
                  className="flex-1 bg-black/40 border border-[rgba(212,160,23,0.4)] rounded-lg px-2.5 py-1.5
                    text-[#f0c040] text-xs font-bold placeholder-[#4a3a2a] outline-none focus:border-[rgba(212,160,23,0.7)]"
                />
                <button
                  onClick={saveName}
                  disabled={savingName || !draftName.trim()}
                  className="p-1.5 rounded-lg bg-[rgba(212,160,23,0.15)] border border-[rgba(212,160,23,0.4)] disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5 text-[#f0c040]" />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="p-1.5 rounded-lg bg-black/20 border border-[rgba(100,80,40,0.2)]"
                >
                  <X className="w-3.5 h-3.5 text-[#6b5a3a]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-[rgba(212,160,23,0.12)]">
                <span className="text-sm">⚔️</span>
                <div className="flex-1 min-w-0">
                  {state.displayName ? (
                    <p className="text-[#f0c040] text-xs font-bold truncate">{state.displayName}</p>
                  ) : (
                    <p className="text-[#4a3a2a] text-xs italic">
                      {state.playerId ? 'Set your arena name…' : 'Connect wallet to set name'}
                    </p>
                  )}
                  <p className="text-[#6b5a3a] text-[9px] mt-0.5">Shown in Arena &amp; leaderboard</p>
                </div>
                {state.playerId && (
                  <button
                    onClick={startEditName}
                    className="p-1.5 rounded-lg border border-[rgba(212,160,23,0.2)] hover:border-[rgba(212,160,23,0.5)] transition-colors"
                  >
                    <Pencil className="w-3 h-3 text-[#6b5a3a]" />
                  </button>
                )}
              </div>
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

        {/* ═══ TOKEN PERKS ═══ */}
        {state.walletAddress && (
          <div className="dragon-panel p-4"
            style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'linear-gradient(180deg, rgba(139,92,246,0.06) 0%, rgba(10,6,20,0) 100%)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🏅</span>
                <h3 className="font-cinzel text-[#a78bfa] font-bold text-sm">Token Perks</h3>
              </div>
              {state.tokenDiscount && state.tokenDiscount.pct > 0 && (
                <span className="px-2 py-0.5 rounded-full font-black text-[10px]"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
                  {state.tokenDiscount.pct}% OFF ACTIVE
                </span>
              )}
            </div>

            {/* Token rows */}
            {[
              { key: 'lynx' as const, label: '$LYNX', icon: '🦁', desc: 'Hold 850K+', balKey: 'lynxBalance' as const },
              { key: 'xrpnomics' as const, label: 'XRPNOMICS', icon: '📊', desc: 'Hold 0.1+', balKey: 'xrpnomicsBalance' as const },
              { key: 'dragonslayer' as const, label: 'DragonSlayer', icon: '🐉', desc: 'Hold 30B+', balKey: 'dragonslayerBalance' as const },
            ].map(({ key, label, icon, desc, balKey }) => {
              const holds = state.tokenDiscount?.[key] ?? null;
              const bal = state.tokenDiscount?.[balKey] ?? null;
              return (
                <div key={key} className="flex items-center gap-2.5 py-1.5 border-b last:border-0"
                  style={{ borderColor: 'rgba(139,92,246,0.1)' }}>
                  <span className="text-lg w-7 text-center flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[11px] text-[#e8d8f8]">{label}</p>
                    <p className="text-[9px] text-[#6b5a8a]">{desc}</p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className={`text-[11px] font-black ${
                      holds === null ? 'text-[#4a3a6a]' :
                      holds ? 'text-[#4ade80]' : 'text-[#f87171]'
                    }`}>
                      {holds === null ? '—' : holds ? '✓ Holds' : '✗ Not held'}
                    </span>
                    {bal !== null && bal > 0 && (
                      <span className="text-[8px] text-[#6b5a8a] font-mono">{formatNumber(bal)}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Tier info */}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[
                { tokens: 1, pct: 25, color: '#a78bfa' },
                { tokens: 2, pct: 35, color: '#c084fc' },
                { tokens: 3, pct: 50, color: '#f0c040' },
              ].map(({ tokens, pct, color }) => {
                const tokensHeld = [
                  state.tokenDiscount?.lynx,
                  state.tokenDiscount?.xrpnomics,
                  state.tokenDiscount?.dragonslayer,
                ].filter(Boolean).length;
                const active = tokensHeld >= tokens;
                return (
                  <div key={tokens} className="text-center py-1.5 rounded-lg"
                    style={{
                      background: active ? `${color}15` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${active ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
                    }}>
                    <p className="font-black text-[11px]" style={{ color: active ? color : '#3a2a4a' }}>{pct}% OFF</p>
                    <p className="text-[8px]" style={{ color: active ? '#9a8ab8' : '#3a2a4a' }}>{tokens} token{tokens > 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleRefreshDiscount}
              disabled={refreshingDiscount}
              className="mt-3 w-full py-1.5 rounded-lg font-bold text-[9px] transition-all active:scale-95"
              style={{
                background: 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.25)',
                color: refreshingDiscount ? '#4a3a6a' : '#a78bfa',
                opacity: refreshingDiscount ? 0.6 : 1,
              }}
            >
              {refreshingDiscount ? '⏳ Checking balances…' : '🔄 Reverify Token Holdings'}
            </button>

            {/* Holder gift countdown */}
            {state.tokenDiscount && state.tokenDiscount.pct > 0 && (
              <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
                <span className="text-[10px] text-[#a78bfa] font-bold">🎁 Daily Holder Gift</span>
                {state.holderGiftPending
                  ? <span className="text-[10px] font-black text-[#f0c040] animate-pulse">✨ Ready to claim!</span>
                  : <span className="text-[10px] text-[#6b5a8a]">⏳ Next in {holderGiftCountdown}</span>
                }
              </div>
            )}
          </div>
        )}

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
                  <span className="text-[10px] text-[#6b5a3a] font-bold relative z-10">Lv.{tierLevel}</span>
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
        {/* ═══ NFT GALLERY ═══ */}
        {(state.walletNfts ?? []).length > 0 && (
          <div className="dragon-panel p-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">✨</span>
              <h3 className="font-cinzel text-[#f0c040] font-bold text-xs uppercase tracking-widest">My NFT Items</h3>
              <span className="text-[7px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(240,192,64,0.15)', color: '#f0c040' }}>XRPL</span>
            </div>
            <div className="flex flex-col gap-2">
              {(state.walletNfts ?? []).map((nft) => {
                const imgSrc = nft.name === 'Lynx Sword' ? '/images/lynxsword.png'
                  : nft.name === 'Nomic Shield' ? '/images/nomicsshield.png'
                  : '/images/salyer4.png';
                const shortId = nft.tokenId ? `${nft.tokenId.slice(0, 8)}…${nft.tokenId.slice(-6)}` : '';
                const xrpscanUrl = nft.tokenId ? `https://xrpscan.com/nft/${nft.tokenId}` : null;
                const invItem = state.inventory.find(i => i.id === nft.itemId);
                const eqItem = Object.values(state.equipment).find(e => e?.id === nft.itemId);
                const liveItem = invItem ?? eqItem;
                const displayPower = liveItem?.power ?? nft.power;
                const reforgeLevel = liveItem?.reforgeLevel ?? 0;
                return (
                  <div key={nft.itemId} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(240,192,64,0.05)', border: '1px solid rgba(240,192,64,0.2)' }}>
                    <img src={imgSrc} alt={nft.name} className="w-10 h-10 object-contain rounded-lg flex-shrink-0" style={{ border: '1px solid rgba(240,192,64,0.25)' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-cinzel font-bold text-[11px] text-[#e8d8a8] truncate">{nft.name}</span>
                        {reforgeLevel > 0 && <span className="text-[7px] font-bold px-1 rounded flex-shrink-0" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>+{reforgeLevel}</span>}
                      </div>
                      <p className="text-[9px] text-[#9a8a6a]">⚡ {displayPower} power · {nft.rarity}</p>
                      {xrpscanUrl ? (
                        <a href={xrpscanUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] font-bold underline" style={{ color: '#6499ef' }}>
                          {shortId}
                        </a>
                      ) : (
                        <span className="text-[8px] text-[#3a2a1a]">{shortId}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ LEADERBOARD ═══ */}
        <div className="dragon-panel p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-cinzel text-[#f0c040] font-bold text-xs uppercase tracking-widest">Season Trophies</h3>
              {lbSeasonMonth && <p className="text-[#6b5a3a] text-[8px] mt-0.5">{lbSeasonMonth} season</p>}
            </div>
            <div className="flex items-center gap-2">
              {lbOwnRank !== null && (
                <span className="text-[9px] font-bold text-[#d4a017]">#{lbOwnRank}</span>
              )}
              <button
                onClick={Date.now() - lbLastRefresh > 15000 ? loadLeaderboard : undefined}
                className="p-1 rounded-lg border border-[rgba(212,160,23,0.15)] transition-opacity"
                style={{ opacity: Date.now() - lbLastRefresh > 15000 ? 1 : 0.4 }}
              >
                <RefreshCw className="w-3 h-3 text-[#6b5a3a]" />
              </button>
            </div>
          </div>

          {lbLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          )}
          {!lbLoading && lbError && (
            <div className="py-6 text-center">
              <p className="text-[#6b5a3a] text-sm">{lbError}</p>
              <button onClick={loadLeaderboard} className="mt-2 text-xs text-[#f0c040] underline">Try again</button>
            </div>
          )}
          {!lbLoading && !lbError && lbEntries.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-4xl mb-2">🐉</p>
              <p className="font-cinzel text-[#f0c040] font-bold text-sm">No heroes yet</p>
            </div>
          )}
          {!lbLoading && !lbError && lbEntries.map((player) => {
            const rs = getRankStyle(player.rank);
            const isMe = state.playerId !== null && player.player_id === state.playerId;
            return (
              <div
                key={player.player_id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 overflow-hidden"
                style={{
                  background: isMe ? 'linear-gradient(90deg, rgba(212,160,23,0.1) 0%, transparent 100%)' : `linear-gradient(90deg, ${rs.bg} 0%, transparent 100%)`,
                  border: isMe ? '1px solid rgba(212,160,23,0.35)' : `1px solid ${rs.border}`,
                }}
              >
                <div className="w-7 text-center font-bold text-xs flex-shrink-0" style={{ color: isMe ? '#f0c040' : rs.color }}>
                  {getRankIcon(player.rank)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-xs block truncate" style={{ color: isMe ? '#f0c040' : player.rank <= 3 ? rs.color : '#d8c8a8' }}>
                    {player.name}{isMe && <span className="ml-1 text-[8px] opacity-70">(you)</span>}
                  </span>
                </div>
                <span className="text-[8px] text-[#5a4a3a] font-bold flex-shrink-0">Lv.{player.level}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[9px]">🏅</span>
                  <span className="font-cinzel text-[#a78bfa] font-bold text-[10px] tabular-nums">{formatNumber(player.trophies ?? 0)}</span>
                </div>
              </div>
            );
          })}
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
      <div className="text-[#6b5a3a] text-[10px] uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
