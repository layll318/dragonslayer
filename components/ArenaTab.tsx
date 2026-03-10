'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGame, calcDefensePower, DefenseLogEntry, MATERIAL_LABELS } from '@/contexts/GameContext';
import type { MaterialType } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
const MAX_ATTACKS = 5;

type Formation = 'rush' | 'balanced' | 'hold';

interface Opponent {
  player_id: number;
  name: string;
  level: number;
  attack_power: number;
  defense_power: number;
  idle_gold: number;
  buildings: { id: string; owned: number }[];
  is_active?: boolean;
}

interface BattleResult {
  win: boolean;
  gold_stolen: number;
  effective_attack: number;
  effective_defense: number;
  rounds: { label: string; desc: string }[];
  attacks_remaining: number;
  arena_points: number;
  trophies?: number;
  trophies_won?: number;
  trophies_lost?: number;
}

const FORMATION_INFO: Record<Formation, { icon: string; label: string; desc: string; atkMod: number; defMod: number }> = {
  rush:     { icon: '🗡️', label: 'Rush',     desc: '+30% atk  −20% def', atkMod: 1.30, defMod: 0.80 },
  balanced: { icon: '⚖️', label: 'Balanced', desc: 'no modifiers',        atkMod: 1.00, defMod: 1.00 },
  hold:     { icon: '🛡️', label: 'Hold',     desc: '−15% atk  +25% def', atkMod: 0.85, defMod: 1.25 },
};

const BUILDING_ICONS: Record<string, string> = {
  barracks: '🪖', archery_range: '🏹', stables: '🐴',
  war_forge: '⚒️', war_camp: '⛺', castle: '🏰',
};

function buildingRow(buildings: { id: string; owned: number }[]) {
  return buildings
    .filter(b => b.owned > 0)
    .map(b => `${BUILDING_ICONS[b.id] ?? '🏗️'}×${b.owned}`)
    .join('  ');
}

function winChance(myAtk: number, formation: Formation, theirDef: number): number {
  if (theirDef === 0 && myAtk === 0) return 50;
  if (theirDef === 0) return 95;
  const eff = myAtk * FORMATION_INFO[formation].atkMod;
  return Math.round(Math.min(95, Math.max(5, (eff / (eff + theirDef)) * 100)));
}

function makeBotOpponent(armyPower: number, level: number): Opponent {
  const defPwr = Math.max(1, Math.round(armyPower * (0.8 + Math.random() * 0.5)));
  const atkPwr = Math.max(1, Math.round(armyPower * (0.7 + Math.random() * 0.6)));
  const gold = level * 1500 + Math.floor(Math.random() * level * 800);
  return {
    player_id: 0,
    name: 'Shadow Raider 🤖',
    level: Math.max(1, level + Math.floor(Math.random() * 3) - 1),
    attack_power: atkPwr,
    defense_power: defPwr,
    idle_gold: gold,
    buildings: [],
  };
}

type ArenaView = 'battle' | 'defense';

function useCountdownToMidnightUTC() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      if (diff <= 0) { setLabel('resetting…'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`${h}h ${m.toString().padStart(2,'0')}m ${s.toString().padStart(2,'0')}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return label;
}

export default function ArenaTab() {
  const { state, armyPower, recordBotBattle, recordPvpBattle, markDefenseLogSeen } = useGame();
  const defPower = calcDefensePower(state.buildings);

  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [formation, setFormation] = useState<Formation>('balanced');
  const [attacking, setAttacking] = useState(false);
  const [roundIdx, setRoundIdx] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<ArenaView>('battle');
  const [mainTab, setMainTab] = useState<'arena' | 'dungeon'>('arena');

  const today = new Date().toISOString().split('T')[0];
  const effectiveAttacksToday = state.arenaLastReset === today ? (state.arenaAttacksToday ?? 0) : 0;
  const attacksLeft = MAX_ATTACKS - effectiveAttacksToday;

  const easyBot  = useMemo(() => ({ ...makeBotOpponent(armyPower, state.level), player_id: -1, name: 'Shadow Raider 🤖' }), [armyPower, state.level]);
  const hardBot  = useMemo(() => ({
    ...makeBotOpponent(Math.round(armyPower * 2), state.level + 3),
    player_id: -2,
    name: 'Iron Warlord ⚔️🤖',
    idle_gold: Math.max(3000, Math.round(armyPower * 350)),
  }), [armyPower, state.level]);
  const starterBot = useMemo((): Opponent => ({
    player_id: -3,
    name: 'Goblin Scout 🟢',
    level: 1,
    attack_power: 1,
    defense_power: 0,
    idle_gold: Math.max(2000, state.level * 1000),
    buildings: [],
  }), [state.level]);

  const defenseLog: DefenseLogEntry[] = state.defenseLog ?? [];
  const unreadDefense = defenseLog.some(e => e.ts > (state.defenseLogSeen ?? 0));

  const loadOpponents = useCallback(async () => {
    if (!state.playerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/arena/opponents?player_id=${state.playerId}`, { cache: 'no-store' });
      if (!res.ok) {
        let detail = '';
        try { const d = await res.json(); detail = d.detail || ''; } catch {}
        setError(`Server error ${res.status}${detail ? ': ' + detail : ''} — backend may need redeploy`);
        return;
      }
      const data = await res.json();
      if (data.success) setOpponents(data.opponents);
      else setError(data.detail || 'Failed to load opponents');
    } catch (e: any) {
      setError(`Network error: ${e?.message ?? 'Could not reach server'}`);
    } finally {
      setLoading(false);
    }
  }, [state.playerId]);

  useEffect(() => { loadOpponents(); }, [loadOpponents]);

  const handleAttack = async () => {
    if (!selected || attacking || attacksLeft <= 0) return;

    // ── Bot battle (client-side) ────────────────────────────────────────────
    const isStarterBot = selected.player_id === -3;
    const isEasyBot = selected.player_id === -1;
    const isHardBot = selected.player_id === -2;
    if (isStarterBot || isEasyBot || isHardBot) {
      const botTier = isHardBot ? 'hard' : 'easy';
      setAttacking(true);
      setRoundIdx(0);
      setResult(null);
      const fm = FORMATION_INFO[formation];
      const rand = 0.85 + Math.random() * 0.30;
      const effAtk = Math.round(armyPower * fm.atkMod * rand);
      const effDef = Math.round(selected.defense_power * fm.defMod * (0.85 + Math.random() * 0.30));
      const win = isStarterBot ? true : (effAtk > effDef);
      const goldStolen = win ? Math.floor(selected.idle_gold * 0.15) : 0;
      const trophiesWon = win ? (isHardBot ? 8 : isStarterBot ? 1 : 3) : 0;
      const trophiesLost = !win && isHardBot ? 5 : 0;
      for (let i = 0; i < 3; i++) {
        setRoundIdx(i);
        await new Promise(r => setTimeout(r, 1100));
      }
      const rounds = win
        ? [
            { label: 'Round 1', desc: `You charge ${selected.name} — they falter!` },
            { label: 'Round 2', desc: 'Your forces overwhelm the bot defenses.' },
            { label: 'Round 3', desc: 'VICTORY — the bot retreats!' },
          ]
        : [
            { label: 'Round 1', desc: `${selected.name} holds the line.` },
            { label: 'Round 2', desc: 'Bot defenses push back hard.' },
            { label: 'Round 3', desc: 'DEFEAT — regroup and try again.' },
          ];
      recordBotBattle(win, goldStolen, botTier);
      setResult({
        win,
        gold_stolen: goldStolen,
        effective_attack: effAtk,
        effective_defense: effDef,
        rounds,
        attacks_remaining: attacksLeft - 1,
        arena_points: (state.arenaPoints ?? 0) + (win ? 10 : 2),
        trophies: Math.max(0, (state.trophies ?? 0) + trophiesWon - trophiesLost),
        trophies_won: trophiesWon,
        trophies_lost: trophiesLost,
      });
      setAttacking(false);
      return;
    }

    // ── Real PvP battle (server) ─────────────────────────────────────────────
    if (!state.playerId) return;
    setAttacking(true);
    setRoundIdx(0);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/arena/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attacker_id: state.playerId,
          defender_id: selected.player_id,
          formation,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Attack failed');
        setAttacking(false);
        return;
      }
      // Animate rounds
      for (let i = 0; i < (data.rounds?.length ?? 3); i++) {
        setRoundIdx(i);
        await new Promise(r => setTimeout(r, 1100));
      }
      recordPvpBattle(data.win, data.gold_stolen ?? 0, data.trophies ?? (state.trophies ?? 0));
      setResult(data);
    } catch {
      setError('Attack failed — server unreachable');
    } finally {
      setAttacking(false);
    }
  };

  const resetBattle = () => {
    setResult(null);
    setSelected(null);
    loadOpponents();
  };


  if (mainTab === 'dungeon') {
    return <HeroDungeonTab onSwitchToArena={() => setMainTab('arena')} />;
  }

  // ── Battle animation ────────────────────────────────────────────────────────
  if (attacking && selected) {
    const rounds = [
      { label: 'Round 1', desc: formation === 'rush' ? 'Your cavalry charges forward!' : 'Both lines clash at the front!' },
      { label: 'Round 2', desc: 'Archers fire — the battle intensifies!' },
      { label: 'Round 3', desc: 'Final push — who will stand?' },
    ];
    const r = rounds[Math.min(roundIdx, 2)];
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(180deg,#0c0804 0%,#1a0804 100%)' }}>
        <div className="w-full max-w-sm px-6 text-center">
          <p className="font-cinzel text-[#f0c040] font-black text-2xl mb-6 tracking-widest">⚔️ BATTLE ⚔️</p>
          {/* Formation rows */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-center">
              <p className="text-[9px] text-[#6b5a3a] uppercase mb-1">YOU</p>
              <p className="text-2xl">{buildingRow(state.buildings) || '🪖'}</p>
              <p className="text-[#f0c040] text-xs font-bold mt-1">ATK {Math.round(armyPower * FORMATION_INFO[formation].atkMod)}</p>
            </div>
            <span className="text-3xl font-black text-[#c84040]">VS</span>
            <div className="text-center">
              <p className="text-[9px] text-[#6b5a3a] uppercase mb-1">{selected.name}</p>
              <p className="text-2xl">{buildingRow(selected.buildings) || '🏰'}</p>
              <p className="text-[#60a5fa] text-xs font-bold mt-1">DEF {selected.defense_power}</p>
            </div>
          </div>
          {/* Round indicator */}
          <div className="dragon-panel px-4 py-4 mb-4">
            <p className="font-cinzel font-bold text-[#f0c040] text-sm mb-1">{r.label}</p>
            <p className="text-[#9a8a6a] text-xs">{r.desc}</p>
          </div>
          {/* Progress dots */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full transition-all"
                style={{ background: i <= roundIdx ? '#f0c040' : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Result screen ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
        <ArenaHeader attacksLeft={result.attacks_remaining} arenaPoints={result.arena_points} trophies={state.trophies ?? 0} />
        <div className="px-3 mt-4 flex flex-col gap-3">
          {/* Season banner on result screen */}
          {(() => {
            const month = state.seasonMonth || new Date().toISOString().slice(0, 7);
            const [y, m2] = month.split('-');
            const mn = new Date(Number(y), Number(m2) - 1).toLocaleString('en', { month: 'long' });
            return (
              <div className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.18) 0%,rgba(109,40,217,0.08) 100%)', border: '1px solid rgba(139,92,246,0.4)' }}>
                <div>
                  <p className="font-cinzel font-black text-[#a78bfa] text-xl leading-none">{state.trophies ?? 0}</p>
                  <p className="text-[8px] text-[#7c5cbf] mt-0.5 uppercase tracking-wider">🏅 trophies</p>
                </div>
                <div className="text-right">
                  <p className="font-cinzel font-bold text-[#c4b5fd] text-xs">{mn} {y}</p>
                  <p className="text-[8px] text-[#7c5cbf] mt-0.5">Season</p>
                </div>
              </div>
            );
          })()}
          <div className="dragon-panel px-4 py-6 text-center">
            <p className="text-5xl mb-3">{result.win ? '🏆' : '💀'}</p>
            <p className="font-cinzel font-black text-2xl tracking-wider mb-1"
              style={{ color: result.win ? '#4ade80' : '#f87171' }}>
              {result.win ? 'VICTORY!' : 'DEFEATED'}
            </p>
            <p className="text-[#6b5a3a] text-xs mb-4">
              vs {selected?.name} — {result.win ? 'their defenses fell' : 'their walls held firm'}
            </p>
            {result.win && result.gold_stolen > 0 && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="coin-icon" style={{ width: 18, height: 18 }} />
                <span className="font-cinzel text-[#f0c040] font-bold text-lg">
                  +{formatNumber(result.gold_stolen)} gold stolen
                </span>
              </div>
            )}
            {(result.trophies_won ?? 0) > 0 && (
              <p className="text-[#4ade80] font-bold text-sm mb-2">🏅 +{result.trophies_won} trophies</p>
            )}
            {(result.trophies_lost ?? 0) > 0 && (
              <p className="text-[#f87171] font-bold text-sm mb-2">🏅 -{result.trophies_lost} trophies</p>
            )}
            <div className="flex justify-center gap-6 text-center mb-4">
              <div>
                <p className="font-cinzel font-bold text-[#f0c040]">{result.effective_attack}</p>
                <p className="text-[9px] text-[#6b5a3a]">Your Attack</p>
              </div>
              <div>
                <p className="font-cinzel font-bold text-[#60a5fa]">{result.effective_defense}</p>
                <p className="text-[9px] text-[#6b5a3a]">Their Defense</p>
              </div>
            </div>
            <button onClick={resetBattle} className="action-btn px-8 py-2 text-sm">
              ⚔️ Fight Again
            </button>
          </div>
          {/* Battle log */}
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">BATTLE LOG</p>
            {result.rounds.map((r, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <span className="text-[#d4a017] text-[11px] font-bold w-14 flex-shrink-0">{r.label}</span>
                <span className="text-[#8a7a5a] text-[11px]">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Defense log view ──────────────────────────────────────────────────────
  if (view === 'defense') {
    return (
      <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
        <ArenaHeader attacksLeft={attacksLeft} arenaPoints={state.arenaPoints ?? 0} trophies={state.trophies ?? 0} />
        <div className="px-3 mt-2 flex flex-col gap-3">
          <button onClick={() => { setView('battle'); markDefenseLogSeen(); }}
            className="self-start text-[10px] text-[#6b5a3a] underline">← Back to Battle</button>
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">🛡️ DEFENSE LOG</p>
            <p className="text-[8px] text-[#4a3a2a] mb-2">Your castle&apos;s recent defense history — trophies are lost when raiders win.</p>
            {defenseLog.length === 0 ? (
              <p className="text-[#4a3a2a] text-[10px] text-center py-4">No attacks recorded yet</p>
            ) : defenseLog.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1"
                style={{ background: e.result === 'loss' ? 'rgba(248,113,113,0.07)' : 'rgba(74,222,128,0.07)', border: `1px solid ${e.result === 'loss' ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}` }}>
                <span className="text-lg">{e.result === 'loss' ? '🔴' : '🟢'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold truncate" style={{ color: e.result === 'loss' ? '#f87171' : '#4ade80' }}>
                    {e.result === 'loss' ? `⚔️ Raided by ${e.attackerName}` : '🛡️ Defended!'}
                  </p>
                  <p className="text-[8px] text-[#6b5a3a]">
                    {e.result === 'loss'
                      ? `${e.goldLost > 0 ? `-${formatNumber(e.goldLost)} gold` : 'no gold lost'}${e.trophiesLost > 0 ? ` · -${e.trophiesLost} 🏅 trophies` : ''}`
                      : `Your walls held${(e.trophiesWon ?? 0) > 0 ? ` · +${e.trophiesWon} 🏅 trophies` : ' — no gold or trophies lost'}`
                    }
                  </p>
                </div>
                <p className="text-[8px] text-[#4a3a2a] flex-shrink-0">{new Date(e.ts).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Arena UI ────────────────────────────────────────────────────────────
  const chance = selected ? winChance(armyPower, formation, selected.defense_power) : null;

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      <ArenaHeader attacksLeft={attacksLeft} arenaPoints={state.arenaPoints ?? 0} trophies={state.trophies ?? 0} />

      {/* Sub-tab toggle */}
      <div className="flex gap-1.5 px-3 pt-2">
        <button
          className="flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold"
          style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.5)', color: '#f0c040' }}
        >
          ⚔️ Arena
        </button>
        <button
          onClick={() => setMainTab('dungeon')}
          className="flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold transition-all"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b5a3a' }}
        >
          🗡️ Dungeon
        </button>
      </div>

      <div className="px-3 mt-2 flex flex-col gap-3">

        {/* ── Season Trophy Banner ────────────────────────────────────────── */}
        {(() => {
          const month = state.seasonMonth || new Date().toISOString().slice(0, 7);
          const [y, m] = month.split('-');
          const monthName = new Date(Number(y), Number(m) - 1).toLocaleString('en', { month: 'long' });
          return (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.18) 0%,rgba(109,40,217,0.08) 100%)', border: '1px solid rgba(139,92,246,0.4)' }}>
              <div>
                <p className="font-cinzel font-black text-[#a78bfa] text-xl leading-none">{state.trophies ?? 0}</p>
                <p className="text-[9px] text-[#7c5cbf] mt-0.5 uppercase tracking-wider">🏅 trophies</p>
              </div>
              <div className="text-center">
                <p className="font-cinzel font-bold text-[#c4b5fd] text-xs">{monthName} {y}</p>
                <p className="text-[8px] text-[#7c5cbf] mt-0.5">Current Season</p>
              </div>
              <div className="text-right">
                <p className="font-cinzel font-bold text-[#f0c040] text-sm">{state.arenaPoints ?? 0}</p>
                <p className="text-[8px] text-[#6b5a3a] mt-0.5">Conquest Pts</p>
              </div>
            </div>
          );
        })()}

        {/* Your power summary */}
        <div className="dragon-panel px-3 py-2.5">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">⚔️ YOUR FORCES</p>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="font-cinzel font-bold text-[#f0c040] text-sm">{armyPower}</p>
              <p className="text-[9px] text-[#6b5a3a]">Attack Power</p>
            </div>
            <div className="text-center">
              <p className="font-cinzel font-bold text-[#60a5fa] text-sm">{defPower}</p>
              <p className="text-[9px] text-[#6b5a3a]">Defense Power</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg">{buildingRow(state.buildings) || '—'}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-xs px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/20">{error}</div>
        )}

        {attacksLeft <= 0 && (
          <AttackCooldownBanner />
        )}

        {/* Opponent list */}
        {state.walletAddress && !state.playerId && (
          <div className="text-[#6b5a3a] text-[10px] px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] text-center">
            ⏳ Syncing account with server… Real players will appear shortly.
          </div>
        )}
        <div className="dragon-panel px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider">CHOOSE OPPONENT</p>
            {state.walletAddress && (
              <button onClick={loadOpponents} disabled={loading}
                className="text-[9px] text-[#6b5a3a] underline transition-opacity"
                style={{ opacity: loading ? 0.5 : 1 }}>
                {loading ? '…' : '↻ Refresh'}
              </button>
            )}
          </div>
          {state.walletAddress && loading && (
            <div className="text-center py-2 text-[#6b5a3a] text-xs">Loading real players…</div>
          )}
          {/* Defense log button */}
          <button onClick={() => { setView('defense'); markDefenseLogSeen(); }}
            className="flex items-center gap-1.5 self-end text-[9px] font-bold mb-1 px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: unreadDefense ? '#f87171' : '#6b5a3a' }}>
            🛡️ Defense Log{unreadDefense && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
          </button>
          <div className="flex flex-col gap-1.5">
            {[starterBot, easyBot, hardBot, ...(state.walletAddress ? opponents : [])].map(opp => {
              const isSelected = selected?.player_id === opp.player_id;
              const ch = winChance(armyPower, formation, opp.defense_power);
              const isBot = opp.player_id < 0;
              const isHardBot = opp.player_id === -2;
              const isStarterBotCard = opp.player_id === -3;
              const trophyPreview = isBot
                ? (isHardBot ? '🏅+8 / -5' : isStarterBotCard ? '🏅+1' : '🏅+3')
                : `🏅+${Math.ceil(25 * Math.max(0.25, Math.min(2.0, 1 - ((state.level) - opp.level) * 0.04)))} / -8`;
              return (
                <button
                  key={opp.player_id}
                  onClick={() => setSelected(isSelected ? null : opp)}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: isSelected ? 'rgba(212,160,23,0.12)' : isBot ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.02)',
                    border: isSelected ? '1px solid rgba(212,160,23,0.4)' : isBot ? '1px solid rgba(124,58,237,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: isHardBot ? 'rgba(239,68,68,0.15)' : isStarterBotCard ? 'rgba(74,222,128,0.12)' : isBot ? 'rgba(124,58,237,0.15)' : 'rgba(212,160,23,0.08)', border: `1px solid ${isHardBot ? 'rgba(239,68,68,0.35)' : isStarterBotCard ? 'rgba(74,222,128,0.35)' : isBot ? 'rgba(124,58,237,0.3)' : 'rgba(212,160,23,0.2)'}` }}>
                    {isBot ? '🤖' : `Lv${opp.level}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="text-[10px] font-bold truncate" style={{ color: isHardBot ? '#f87171' : isStarterBotCard ? '#4ade80' : isBot ? '#c084fc' : '#e8d8a8' }}>{opp.name}</p>
                      {!isBot && (
                        <span
                          className="flex-shrink-0 px-1 py-0 rounded text-[7px] font-bold leading-4"
                          style={opp.is_active
                            ? { background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }
                            : { background: 'rgba(255,255,255,0.05)', color: '#6b5a3a', border: '1px solid rgba(255,255,255,0.08)' }
                          }
                        >
                          {opp.is_active ? '● Online' : '○ AFK'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#8a7a5a]">⚔️{opp.attack_power} · 🛡️{opp.defense_power}{isBot ? ' · AI' : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] font-bold"
                      style={{ color: ch >= 60 ? '#4ade80' : ch >= 40 ? '#f0c040' : '#f87171' }}>
                      {isStarterBotCard ? '✅ Easy' : `${ch}% win`}
                    </p>
                    <p className="text-[8px] text-[#6b5a3a]">{trophyPreview}</p>
                    <p className="text-[8px] text-[#6b5a3a]">💰{formatNumber(Math.floor(opp.idle_gold * 0.10))}</p>
                  </div>
                </button>
              );
            })}
            {!state.walletAddress && (
              <div className="mt-2 flex flex-col items-center gap-2 px-3 py-3 rounded-lg text-center"
                style={{ background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.15)' }}>
                <span className="text-2xl">🔒</span>
                <p className="font-cinzel font-bold text-[#f0c040] text-xs">PvP Locked</p>
                <p className="text-[#8a7a5a] text-[10px] leading-relaxed">
                  Connect your Xaman wallet in the <span className="text-[#f0c040] font-bold">Profile</span> tab to battle real players and earn bonus arena points.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Battle preview — shown when opponent is selected */}
        {selected && (
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-3">BATTLE PREVIEW</p>

            {/* Side-by-side comparison */}
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1 text-center">
                <p className="text-[9px] text-[#6b5a3a] mb-1">YOU</p>
                <p className="text-base">{buildingRow(state.buildings) || '🪖'}</p>
                <p className="text-[#f0c040] text-[10px] font-bold">
                  ⚔️ {Math.round(armyPower * FORMATION_INFO[formation].atkMod)}
                </p>
              </div>
              <div className="text-[#c84040] font-black text-lg px-2 mt-4">VS</div>
              <div className="flex-1 text-center">
                <p className="text-[9px] text-[#6b5a3a] mb-1 truncate">{selected.name}</p>
                <p className="text-base">{buildingRow(selected.buildings) || '🏰'}</p>
                <p className="text-[#60a5fa] text-[10px] font-bold">🛡️ {selected.defense_power}</p>
              </div>
            </div>

            {/* Formation selector */}
            <p className="text-[9px] text-[#6b5a3a] uppercase tracking-wider mb-1.5">Formation</p>
            <div className="flex gap-1.5 mb-3">
              {(['rush', 'balanced', 'hold'] as Formation[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormation(f)}
                  className="flex-1 py-1.5 rounded-lg text-center transition-all"
                  style={{
                    background: formation === f ? 'rgba(212,160,23,0.15)' : 'rgba(255,255,255,0.03)',
                    border: formation === f ? '1px solid rgba(212,160,23,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <p className="text-base">{FORMATION_INFO[f].icon}</p>
                  <p className="text-[9px] font-bold" style={{ color: formation === f ? '#f0c040' : '#6b5a3a' }}>
                    {FORMATION_INFO[f].label}
                  </p>
                  <p className="text-[10px] text-[#7a6a4a] leading-tight">{FORMATION_INFO[f].desc}</p>
                </button>
              ))}
            </div>

            {/* Win chance bar */}
            {chance !== null && (
              <div className="mb-3">
                <div className="flex justify-between text-[9px] mb-1">
                  <span className="text-[#6b5a3a]">Win Estimate</span>
                  <span className="font-bold" style={{ color: chance >= 60 ? '#4ade80' : chance >= 40 ? '#f0c040' : '#f87171' }}>
                    {chance}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${chance}%`,
                      background: chance >= 60 ? 'linear-gradient(90deg,#16a34a,#4ade80)' :
                                  chance >= 40 ? 'linear-gradient(90deg,#d4a017,#f0c040)' :
                                                 'linear-gradient(90deg,#991b1b,#f87171)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Potential loot */}
            <p className="text-[9px] text-[#6b5a3a] mb-2">
              Win → steal{' '}
              <span className="text-[#f0c040] font-bold">
                💰 {formatNumber(Math.floor(selected.idle_gold * 0.04))} gold
              </span>
            </p>

            {/* Attack button */}
            <button
              onClick={handleAttack}
              disabled={attacksLeft <= 0 || attacking}
              className="action-btn w-full py-3 text-sm font-black tracking-wide"
              style={{ opacity: attacksLeft <= 0 ? 0.4 : 1 }}
            >
              ⚔️ ATTACK — {attacksLeft} {attacksLeft === 1 ? 'attack' : 'attacks'} left
            </button>
          </div>
        )}

        {/* Arena stats */}
        <div className="dragon-panel px-3 py-2">
          <div className="flex justify-around text-center">
            <div>
              <p className="font-cinzel font-bold text-[#f0c040]">{attacksLeft}/{MAX_ATTACKS}</p>
              <p className="text-[9px] text-[#6b5a3a]">Attacks Left</p>
            </div>
            <div>
              <p className="font-cinzel font-bold text-[#60a5fa]">{defPower}</p>
              <p className="text-[9px] text-[#6b5a3a]">🛡️ Defense</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function AttackCooldownBanner() {
  const countdown = useCountdownToMidnightUTC();
  return (
    <div className="dragon-panel px-3 py-3 text-center">
      <p className="text-[#f87171] font-bold text-sm">⚔️ No attacks remaining today</p>
      <p className="text-[#6b5a3a] text-[10px] mt-1">Resets in <span className="text-[#f0c040] font-mono font-bold">{countdown}</span> (midnight UTC)</p>
    </div>
  );
}

function ArenaHeader({ attacksLeft, arenaPoints, trophies }: { attacksLeft: number; arenaPoints: number; trophies: number }) {
  const countdown = useCountdownToMidnightUTC();
  return (
    <div className="top-bar sticky top-0 z-30 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Arena</h2>
          <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Season Leaderboard</p>
        </div>
        <div className="text-right">
          <p className="font-cinzel text-[#a78bfa] font-bold text-base">🏅 {formatNumber(trophies)}</p>
          {attacksLeft > 0
            ? <p className="text-[#6b5a3a] text-[9px]">{attacksLeft}/{MAX_ATTACKS} attacks left</p>
            : <p className="text-[#f87171] text-[9px] font-mono">resets in {countdown}</p>
          }
        </div>
      </div>
    </div>
  );
}

// ── Hero Dungeon ─────────────────────────────────────────────────────────────

const DUNGEONS = [
  { tier: 1 as const, name: 'Goblin Cave',  emoji: '🪨', unlockLevel:  1, color: '#9a9a9a', border: 'rgba(154,154,154,0.45)' },
  { tier: 2 as const, name: 'Dark Forest',  emoji: '🌲', unlockLevel: 10, color: '#4ade80', border: 'rgba(74,222,128,0.45)'  },
  { tier: 3 as const, name: 'Dragon Lair',  emoji: '🐉', unlockLevel: 25, color: '#60a5fa', border: 'rgba(96,165,250,0.45)'  },
  { tier: 4 as const, name: 'Shadow Realm', emoji: '🌑', unlockLevel: 50, color: '#c084fc', border: 'rgba(192,132,252,0.45)' },
];

type DungeonTier = 1 | 2 | 3 | 4;

interface DungeonEnemy {
  name: string; emoji: string; hp: number; atk: number; weakness: string;
}

const DUNGEON_ENEMIES: Record<DungeonTier, { normal: DungeonEnemy[]; boss: DungeonEnemy }> = {
  1: {
    normal: [
      { name: 'Goblin Scout',  emoji: '👺', hp:  30, atk:  5, weakness: 'Fire'  },
      { name: 'Cave Troll',    emoji: '🧌', hp:  50, atk:  8, weakness: 'Light' },
      { name: 'Goblin Shaman', emoji: '🔮', hp:  40, atk:  7, weakness: 'Steel' },
      { name: 'Stone Golem',   emoji: '🗿', hp:  60, atk: 10, weakness: 'Magic' },
      { name: 'Cave Bat',      emoji: '🦇', hp:  35, atk:  6, weakness: 'Fire'  },
    ],
    boss: { name: 'Goblin King', emoji: '👑', hp: 150, atk: 20, weakness: 'Holy' },
  },
  2: {
    normal: [
      { name: 'Shadow Wolf',   emoji: '🐺', hp:  80, atk: 15, weakness: 'Fire'   },
      { name: 'Forest Wraith', emoji: '👻', hp: 100, atk: 20, weakness: 'Holy'   },
      { name: 'Dark Archer',   emoji: '🏹', hp:  70, atk: 18, weakness: 'Shield' },
      { name: 'Cursed Knight', emoji: '⚔️', hp: 120, atk: 25, weakness: 'Magic'  },
      { name: 'Poison Vine',   emoji: '🌿', hp:  90, atk: 16, weakness: 'Fire'   },
    ],
    boss: { name: 'Forest Dragon', emoji: '🐲', hp: 300, atk: 50, weakness: 'Ice' },
  },
  3: {
    normal: [
      { name: 'Fire Drake',      emoji: '🔥', hp: 200, atk:  45, weakness: 'Water' },
      { name: 'Lava Golem',      emoji: '🌋', hp: 250, atk:  55, weakness: 'Ice'   },
      { name: 'Dragon Cultist',  emoji: '🧙', hp: 180, atk:  40, weakness: 'Holy'  },
      { name: 'Ancient Serpent', emoji: '🐍', hp: 300, atk:  65, weakness: 'Steel' },
      { name: 'Flame Imp',       emoji: '😈', hp: 160, atk:  35, weakness: 'Water' },
    ],
    boss: { name: 'Elder Dragon', emoji: '🐉', hp: 800, atk: 120, weakness: 'Ice' },
  },
  4: {
    normal: [
      { name: 'Void Walker',  emoji: '🕳️', hp: 500, atk: 100, weakness: 'Light' },
      { name: 'Shadow Demon', emoji: '😱', hp: 600, atk: 120, weakness: 'Holy'  },
      { name: 'Chaos Knight', emoji: '💀', hp: 700, atk: 150, weakness: 'Order' },
      { name: 'Ancient Lich', emoji: '☠️', hp: 800, atk: 180, weakness: 'Fire'  },
      { name: 'Void Stalker', emoji: '👁️', hp: 550, atk: 110, weakness: 'Light' },
    ],
    boss: { name: 'Shadow Dragon', emoji: '🌑', hp: 2000, atk: 300, weakness: 'Light' },
  },
};

const DUNGEON_BOSS_DROPS: Record<DungeonTier, { type: MaterialType; qty: number }[]> = {
  1: [{ type: 'dragon_scale', qty: 2 }],
  2: [{ type: 'fire_crystal',  qty: 2 }],
  3: [{ type: 'ancient_rune',  qty: 2 }],
  4: [{ type: 'lynx_fang', qty: 1 }, { type: 'nomic_core', qty: 1 }],
};

const DUNGEON_COMMON_MATS: MaterialType[] = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'];

interface DungeonPlayerStats { atk: number; maxHp: number; reduction: number; hasRing: boolean }

function getDungeonPlayerStats(eq: Record<string, { rarity?: string } | null | undefined> | null): DungeonPlayerStats {
  const ATK: Record<string, number> = { common: 5, uncommon: 15, rare: 30, epic: 60, legendary: 60 };
  const HP:  Record<string, number> = { common: 25, uncommon: 75, rare: 150, epic: 300, legendary: 300 };
  const SHD: Record<string, number> = { common: 0.10, uncommon: 0.20, rare: 0.35, epic: 0.50, legendary: 0.50 };
  const wr = eq?.weapon?.rarity;
  const ar = eq?.armor?.rarity;
  const sr = eq?.shield?.rarity;
  return {
    atk:       10 + (wr ? (ATK[wr] ?? 0) : 0),
    maxHp:    100 + (ar ? (HP[ar]  ?? 0) : 0),
    reduction:          sr ? (SHD[sr] ?? 0) : 0,
    hasRing:  !!eq?.ring,
  };
}

function getDungeonEnemy(tier: DungeonTier, room: number): DungeonEnemy {
  return room === 6 ? DUNGEON_ENEMIES[tier].boss : DUNGEON_ENEMIES[tier].normal[(room - 1) % 5];
}

function useDungeonCooldownLabel(until: number) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = Math.max(0, until - Date.now());
      if (!d) { setLabel(''); return; }
      const h = Math.floor(d / 3600000);
      const m = Math.floor((d % 3600000) / 60000);
      const s = Math.floor((d % 60000) / 1000);
      setLabel(h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  return label;
}

const DUNGEON_FLOAT_STYLE: React.CSSProperties = {
  position: 'absolute', pointerEvents: 'none', userSelect: 'none',
  fontWeight: 900, fontSize: 16, top: '15%', left: '50%',
  animation: 'dungeonFloat 0.9s ease-out forwards',
};

function DungeonFloatNum({ id, value, color }: { id: number; value: string; color: string }) {
  return <span key={id} style={{ ...DUNGEON_FLOAT_STYLE, color }}>{value}</span>;
}

function DungeonSelect({ onEnter, onBack }: { onEnter: (tier: DungeonTier) => void; onBack: () => void }) {
  const { state } = useGame();
  const cooldownLabel = useDungeonCooldownLabel(state.dungeonCooldownUntil ?? 0);
  const onCooldown    = (state.dungeonCooldownUntil ?? 0) > Date.now();
  const { atk, maxHp, reduction, hasRing } = getDungeonPlayerStats(state.equipment as any);
  const best = ((state as any).dungeonBestCompletion as Record<string, number>) ?? {};

  return (
    <div className="flex flex-col flex-1 pb-6 overflow-y-auto relative z-10 page-fade">
      <style>{`
        @keyframes dungeonFloat {
          0%   { opacity: 1; transform: translateX(-50%) translateY(0);     }
          100% { opacity: 0; transform: translateX(-50%) translateY(-48px); }
        }
      `}</style>
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">🗡️ DUNGEON</h2>
          <button onClick={onBack} className="text-[10px] text-[#6b5a3a] underline">← Arena</button>
        </div>
        {onCooldown && (
          <p className="text-[10px] text-[#f87171] mt-0.5">
            ⏳ Cooldown: <span className="font-mono font-bold">{cooldownLabel}</span>
          </p>
        )}
      </div>
      <div className="px-3 mt-2 flex flex-col gap-3">
        {state.tokenDiscount && (
          <div className="dragon-panel px-3 py-2 flex items-center gap-2">
            <span className="text-sm">🪙</span>
            <p className="text-[9px] text-[#a07a30]">Token holders: 1 token=45m · 2=30m · 3+=15m cooldown</p>
          </div>
        )}
        {DUNGEONS.map(d => {
          const locked   = state.level < d.unlockLevel;
          const tierBest = best[String(d.tier)] ?? 0;
          return (
            <div key={d.tier} className="dragon-panel px-4 py-4"
              style={{ border: `1px solid ${locked ? 'rgba(255,255,255,0.07)' : d.border}` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">{d.emoji}</span>
                <div className="flex-1">
                  <p className="font-cinzel font-bold text-base" style={{ color: locked ? '#5a4a2a' : d.color }}>{d.name}</p>
                  <p className="text-[9px] text-[#4a3a2a] uppercase tracking-wider mt-0.5">Tier {d.tier}</p>
                </div>
                {locked ? (
                  <div className="text-center">
                    <p className="text-2xl">🔒</p>
                    <p className="text-[8px] text-[#4a3a2a] mt-0.5">Lv {d.unlockLevel}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => { if (!onCooldown) onEnter(d.tier); }}
                    className="px-4 py-2 rounded-xl font-cinzel font-bold text-xs transition-all active:scale-95"
                    style={{
                      background: onCooldown ? 'rgba(255,255,255,0.04)' : `${d.color}22`,
                      border:     `1px solid ${onCooldown ? 'rgba(255,255,255,0.1)' : d.border}`,
                      color:      onCooldown ? '#4a3a2a' : d.color,
                    }}
                  >
                    {onCooldown ? '⏳' : 'ENTER'}
                  </button>
                )}
              </div>
              {!locked && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-[#6b5a3a]">{tierBest > 0 ? `Best: Room ${tierBest}/6` : 'Not attempted yet'}</span>
                  {tierBest >= 6 && <span className="font-bold" style={{ color: d.color }}>✓ CLEARED</span>}
                </div>
              )}
            </div>
          );
        })}
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel text-[#a07a30] text-[9px] uppercase tracking-widest mb-2">Your Hero Stats</p>
          <div className="flex gap-3 justify-around">
            <div className="text-center"><p className="font-bold text-[#f0c040]">⚔️ {atk}</p><p className="text-[8px] text-[#6b5a3a]">Attack</p></div>
            <div className="text-center"><p className="font-bold text-[#4ade80]">❤️ {maxHp}</p><p className="text-[8px] text-[#6b5a3a]">Max HP</p></div>
            <div className="text-center"><p className="font-bold text-[#60a5fa]">🛡️ {Math.round(reduction * 100)}%</p><p className="text-[8px] text-[#6b5a3a]">Block</p></div>
            {hasRing && <div className="text-center"><p className="font-bold text-[#c084fc]">💍 10%</p><p className="text-[8px] text-[#6b5a3a]">Crit</p></div>}
          </div>
        </div>
        <div className="dragon-panel px-3 py-2 text-center">
          <p className="font-cinzel font-bold text-[#f0c040]">{state.dungeonTotalVictories ?? 0}</p>
          <p className="text-[9px] text-[#6b5a3a]">Total Clears</p>
        </div>
      </div>
    </div>
  );
}

interface DungeonRunState {
  room: number;
  enemyHp: number;
  heroHp: number;
  floats: { id: number; value: string; color: string }[];
  phase: 'fighting' | 'done';
  won: boolean;
  goldEarned: number;
  xpEarned: number;
  materials: { type: MaterialType; quantity: number }[];
}

function DungeonRunScreen({ tier, onComplete }: { tier: DungeonTier; onComplete: () => void }) {
  const { state, recordDungeonRun, goldPerHour } = useGame();
  const dungeon = DUNGEONS.find(d => d.tier === tier)!;
  const { atk, maxHp, reduction, hasRing } = getDungeonPlayerStats(state.equipment as any);

  const firstEnemy = getDungeonEnemy(tier, 1);
  const [run, setRun] = useState<DungeonRunState>({
    room: 1, enemyHp: firstEnemy.hp, heroHp: maxHp,
    floats: [], phase: 'fighting', won: false,
    goldEarned: 0, xpEarned: 0, materials: [],
  });

  const floatId     = useRef(0);
  const resultFired = useRef(false);

  const pushFloat = useCallback((value: string, color: string) => {
    const id = floatId.current++;
    setRun(p => ({ ...p, floats: [...p.floats.slice(-4), { id, value, color }] }));
    setTimeout(() => setRun(p => ({ ...p, floats: p.floats.filter(f => f.id !== id) })), 900);
  }, []);

  useEffect(() => {
    if (run.phase === 'done') return;
    const intervalId = setInterval(() => {
      setRun(prev => {
        if (prev.phase === 'done') return prev;
        const enemy = getDungeonEnemy(tier, prev.room);
        const dmg   = Math.max(1, Math.round(enemy.atk * (1 - reduction)));
        setTimeout(() => pushFloat(`-${dmg}`, '#f87171'), 0);
        const newHp = prev.heroHp - dmg;
        if (newHp <= 0) return { ...prev, heroHp: 0, phase: 'done', won: false };
        return { ...prev, heroHp: newHp };
      });
    }, 3000);
    return () => clearInterval(intervalId);
  }, [run.phase, run.room, tier, reduction, pushFloat]);

  const handleAttack = useCallback(() => {
    setRun(prev => {
      if (prev.phase === 'done') return prev;
      const isCrit    = hasRing && Math.random() < 0.10;
      const dmg       = isCrit ? atk * 2 : atk;
      setTimeout(() => pushFloat(`+${dmg}${isCrit ? '!!' : ''}`, isCrit ? '#f0c040' : '#4ade80'), 0);
      const newEnemyHp = prev.enemyHp - dmg;
      if (newEnemyHp > 0) return { ...prev, enemyHp: newEnemyHp };
      const isBoss = prev.room === 6;
      const mats: { type: MaterialType; quantity: number }[] = [...prev.materials];
      if (isBoss) {
        for (const d of (DUNGEON_BOSS_DROPS[tier] ?? [])) mats.push({ type: d.type, quantity: d.qty });
        const randMat = DUNGEON_COMMON_MATS[Math.floor(Math.random() * DUNGEON_COMMON_MATS.length)];
        mats.push({ type: randMat, quantity: 2 + Math.floor(Math.random() * 3) });
        const goldBonus = Math.floor(goldPerHour * 0.5);
        const xpBonus   = tier * 15 * Math.max(1, state.level);
        return { ...prev, enemyHp: 0, phase: 'done', won: true, goldEarned: goldBonus, xpEarned: xpBonus, materials: mats };
      }
      const nextEnemy = getDungeonEnemy(tier, prev.room + 1);
      return { ...prev, enemyHp: nextEnemy.hp, room: prev.room + 1, materials: mats };
    });
  }, [atk, hasRing, tier, pushFloat, goldPerHour, state.level]);

  useEffect(() => {
    if (run.phase !== 'done' || resultFired.current) return;
    resultFired.current = true;
    const td     = state.tokenDiscount as any;
    const tokens = td ? ([td.lynx, td.xrpnomics, td.dragonslayer] as boolean[]).filter(Boolean).length : 0;
    recordDungeonRun(tier, run.room, run.won, run.goldEarned, run.xpEarned, run.materials, tokens);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase]);

  const enemy  = getDungeonEnemy(tier, run.room);
  const isBoss = run.room === 6;

  if (run.phase === 'done') {
    return (
      <div className="flex flex-col flex-1 pb-6 overflow-y-auto relative z-10 page-fade">
        <div className="top-bar sticky top-0 z-30 px-4 py-3">
          <h2 className="font-cinzel font-bold text-lg" style={{ color: dungeon.color }}>{dungeon.name}</h2>
        </div>
        <div className="px-3 mt-4 flex flex-col gap-3">
          <div className="dragon-panel px-4 py-6 text-center">
            <p className="text-6xl mb-3">{run.won ? '🏆' : '💀'}</p>
            <p className="font-cinzel font-black text-2xl tracking-wider mb-1"
              style={{ color: run.won ? '#4ade80' : '#f87171' }}>
              {run.won ? 'DUNGEON CLEARED!' : 'DEFEATED'}
            </p>
            <p className="text-[#6b5a3a] text-xs mb-4">
              {run.won ? 'All rooms cleared!' : `Reached Room ${run.room} of 6`}
            </p>
            {run.won ? (
              <>
                {run.goldEarned > 0 && (
                  <p className="font-cinzel text-[#f0c040] font-bold text-lg mb-1">💰 +{formatNumber(run.goldEarned)} gold</p>
                )}
                {run.xpEarned > 0 && (
                  <p className="text-[#60a5fa] font-bold text-sm mb-3">✨ +{run.xpEarned} XP</p>
                )}
                <div className="flex flex-wrap justify-center gap-1">
                  {run.materials.map((m, i) => {
                    const leg = m.type === 'lynx_fang' || m.type === 'nomic_core';
                    return (
                      <span key={i} className="px-2 py-0.5 rounded text-[9px] font-bold"
                        style={{
                          background: leg ? 'rgba(192,132,252,0.15)' : 'rgba(212,160,23,0.10)',
                          border:     `1px solid ${leg ? 'rgba(192,132,252,0.4)' : 'rgba(212,160,23,0.25)'}`,
                          color:      leg ? '#c084fc' : '#f0c040',
                        }}>
                        +{m.quantity}× {MATERIAL_LABELS[m.type]}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-[#f87171] font-bold text-sm">💸 −{formatNumber(Math.floor(state.gold * 0.10))} gold lost</p>
            )}
          </div>
          <button onClick={onComplete} className="action-btn w-full py-3 text-sm font-black">← Back to Dungeon Select</button>
        </div>
      </div>
    );
  }

  const enemyPct = Math.max(0, Math.round(run.enemyHp / enemy.hp * 100));
  const heroPct  = Math.max(0, Math.round(run.heroHp  / maxHp   * 100));

  return (
    <div className="flex flex-col flex-1 pb-6 overflow-y-auto relative z-10 page-fade">
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="font-cinzel font-bold text-sm" style={{ color: dungeon.color }}>{dungeon.name}</p>
          <p className="font-cinzel text-[#6b5a3a] text-[10px]">{isBoss ? '⚠️ BOSS' : `Room ${run.room} of 6`}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#f87171] font-bold shrink-0">HP</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${heroPct}%`, background: heroPct > 50 ? '#4ade80' : heroPct > 25 ? '#f0c040' : '#f87171' }} />
          </div>
          <span className="text-[9px] font-bold text-[#f87171] shrink-0">{run.heroHp}/{maxHp}</span>
        </div>
      </div>
      <div className="px-3 mt-3 flex flex-col gap-3">
        <div className="dragon-panel px-4 py-5 relative overflow-hidden"
          style={{ border: isBoss ? `2px solid ${dungeon.border}` : '1px solid rgba(255,255,255,0.1)' }}>
          {isBoss && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-black"
              style={{ background: `${dungeon.color}20`, color: dungeon.color, border: `1px solid ${dungeon.border}` }}>
              ⚠️ BOSS
            </div>
          )}
          <div className="relative text-center mb-4" style={{ minHeight: 90 }}>
            <p className="text-7xl leading-none mb-2"
              style={{ filter: isBoss ? `drop-shadow(0 0 14px ${dungeon.color}88)` : 'none' }}>
              {enemy.emoji}
            </p>
            <p className="font-cinzel font-bold text-base" style={{ color: isBoss ? dungeon.color : '#e8d8a8' }}>{enemy.name}</p>
            <p className="text-[9px] text-[#4a3a2a] mt-0.5">Weakness: {enemy.weakness}</p>
            {run.floats.map(f => <DungeonFloatNum key={f.id} id={f.id} value={f.value} color={f.color} />)}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#f87171] font-bold shrink-0">HP</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${enemyPct}%`, background: `linear-gradient(90deg, ${dungeon.color}88, ${dungeon.color})` }} />
            </div>
            <span className="text-[9px] font-bold text-[#f87171] shrink-0">{run.enemyHp}/{enemy.hp}</span>
          </div>
        </div>
        <div className="dragon-panel px-3 py-2 flex justify-around text-center">
          <div><p className="font-bold text-[#f0c040] text-sm">⚔️ {atk}</p><p className="text-[8px] text-[#6b5a3a]">Atk</p></div>
          <div><p className="font-bold text-[#60a5fa] text-sm">🛡️ {Math.round(reduction * 100)}%</p><p className="text-[8px] text-[#6b5a3a]">Block</p></div>
          <div><p className="font-bold text-[#4ade80] text-sm">❤️ {run.heroHp}</p><p className="text-[8px] text-[#6b5a3a]">HP</p></div>
          {hasRing && <div><p className="font-bold text-[#c084fc] text-sm">💍 10%</p><p className="text-[8px] text-[#6b5a3a]">Crit</p></div>}
        </div>
        <button onClick={handleAttack}
          className="action-btn w-full py-5 font-black tracking-widest active:scale-95 transition-transform"
          style={{ fontSize: 20, letterSpacing: '0.1em' }}>
          ⚔️ ATTACK
        </button>
      </div>
    </div>
  );
}

function HeroDungeonTab({ onSwitchToArena }: { onSwitchToArena: () => void }) {
  const [activeTier, setActiveTier] = useState<DungeonTier | null>(null);
  if (activeTier !== null) {
    return <DungeonRunScreen tier={activeTier} onComplete={() => setActiveTier(null)} />;
  }
  return <DungeonSelect onEnter={setActiveTier} onBack={onSwitchToArena} />;
}
