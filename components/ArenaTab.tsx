'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGame, calcDefensePower, DefenseLogEntry, computeDungeonRewards, DungeonRewards, MATERIAL_LABELS } from '@/contexts/GameContext';
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
    return <DragonDenTab onSwitchToArena={() => setMainTab('arena')} />;
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
          🐉 Dragon Den
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

// ── Dragon Den ────────────────────────────────────────────────────────────────

const DRAGON_TYPES = [
  {
    id: 'fire_drake', emoji: '🔴', name: 'Fire Drake',
    occupies: [0, 3, 12, 15],
    weaknessBuildingId: 'stables', weaknessLabel: '🐴 Cavalry',
    hint: 'Cavalry flanks corner dragons',
    desc: 'Nests in the corners — cavalry can flank it',
  },
  {
    id: 'frost_wyrm', emoji: '🔵', name: 'Frost Wyrm',
    occupies: [5, 6, 9, 10],
    weaknessBuildingId: 'barracks', weaknessLabel: '🪖 Infantry',
    hint: 'Face it head-on with infantry',
    desc: 'Holds the center — infantry must charge directly',
  },
  {
    id: 'stone_golem', emoji: '🟤', name: 'Stone Golem',
    occupies: [12, 13, 14, 15],
    weaknessBuildingId: 'archery_range', weaknessLabel: '🏹 Archers',
    hint: 'Hit from maximum range',
    desc: 'Guards the bottom row — archers strike from distance',
  },
  {
    id: 'storm_serpent', emoji: '⚡', name: 'Storm Serpent',
    occupies: [0, 5, 10, 15],
    weaknessBuildingId: 'war_forge', weaknessLabel: '⚒️ Rune Knights',
    hint: 'Spread your force across the grid',
    desc: 'Strikes diagonally — rune knights counter its magic',
  },
];

const BUILDING_TROOP_INFO: Record<string, { emoji: string; name: string; armyPower: number }> = {
  barracks:      { emoji: '🪖', name: 'Infantry',    armyPower: 1  },
  archery_range: { emoji: '🏹', name: 'Archer',      armyPower: 3  },
  stables:       { emoji: '🐴', name: 'Cavalry',     armyPower: 6  },
  war_forge:     { emoji: '⚒️', name: 'Rune Knight', armyPower: 12 },
  war_camp:      { emoji: '⛺', name: 'Regiment',    armyPower: 25 },
  castle:        { emoji: '🏰', name: 'Elite Guard', armyPower: 50 },
};
const BUILDING_ORDER = ['barracks', 'archery_range', 'stables', 'war_forge', 'war_camp', 'castle'];

function areAdjacentCells(a: number, b: number): boolean {
  const rowA = Math.floor(a / 4), colA = a % 4;
  const rowB = Math.floor(b / 4), colB = b % 4;
  return (Math.abs(rowA - rowB) + Math.abs(colA - colB)) === 1;
}

interface DenResult {
  outcome: 'victory' | 'partial' | 'defeat';
  score: number;
  dragonHp: number;
  rewards: DungeonRewards;
}

interface ScoreDetail {
  score: number;
  troopSum: number;
  heroBonus: number;
  placementMult: number;
  hasWeakness: boolean;
  weaknessMult: number;
  adjacencyBonus: number;
  distanceBonus: number;
}

function DragonDenTab({ onSwitchToArena }: { onSwitchToArena: () => void }) {
  const { state, recordDungeonRaid } = useGame();
  const [grid, setGrid] = useState<Record<number, string>>({});
  const [selectedTroop, setSelectedTroop] = useState<string | null>(null);
  const [denResult, setDenResult] = useState<DenResult | null>(null);
  const [raiding, setRaiding] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const isNewDay = (state.dungeonLastRaidDate ?? '').slice(0, 10) !== today;
  const attemptsToday = isNewDay ? 0 : (state.dungeonAttemptsToday ?? 0);
  const attemptsLeft = Math.max(0, 5 - attemptsToday);
  const onCooldown = !isNewDay && attemptsLeft < 5 && Date.now() < (state.dungeonCooldownUntil ?? 0);

  const dungeonTier = Math.floor(state.level / 5) + 1;
  const dragonHp = dungeonTier * 15;

  const dayIndex = Math.floor(Date.now() / 86400000);
  const dragon = DRAGON_TYPES[dayIndex % 4];

  const availableTroops = BUILDING_ORDER
    .filter(id => (state.buildings.find(b => b.id === id)?.owned ?? 0) > 0)
    .slice(0, 6);

  const gph = state.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);

  const calcScore = (gridState: Record<number, string>): ScoreDetail => {
    const placedCells = Object.keys(gridState).map(Number);
    const placedBuildingIds = Object.values(gridState);
    const uniqueTypes = Array.from(new Set(placedBuildingIds));
    const troopSum = uniqueTypes.reduce((sum, bid) => {
      const info = BUILDING_TROOP_INFO[bid];
      const building = state.buildings.find(b => b.id === bid);
      if (!info || !building) return sum;
      return sum + info.armyPower * building.owned;
    }, 0);
    const heroBonus = state.level * 3;
    let adjacencyBonus = 0;
    for (let i = 0; i < placedCells.length; i++) {
      for (let j = i + 1; j < placedCells.length; j++) {
        if (areAdjacentCells(placedCells[i], placedCells[j])) adjacencyBonus += 0.05;
      }
    }
    adjacencyBonus = Math.min(adjacencyBonus, 0.30);
    const avgDragonRow = dragon.occupies.reduce((a, c) => a + Math.floor(c / 4), 0) / dragon.occupies.length;
    const avgTroopRow = placedCells.length > 0
      ? placedCells.reduce((a, c) => a + Math.floor(c / 4), 0) / placedCells.length
      : 0;
    const distanceBonus = Math.abs(avgTroopRow - avgDragonRow) >= 2 ? 0.10 : 0;
    const placementMult = 1.0 + adjacencyBonus + distanceBonus;
    const hasWeakness = placedBuildingIds.includes(dragon.weaknessBuildingId);
    const weaknessMult = hasWeakness ? 1.35 : 0.8;
    const score = Math.round((troopSum + heroBonus) * placementMult * weaknessMult);
    return { score, troopSum, heroBonus, placementMult, hasWeakness, weaknessMult, adjacencyBonus, distanceBonus };
  };

  const handleCellTap = (cellIdx: number) => {
    if (dragon.occupies.includes(cellIdx)) return;
    if (selectedTroop) {
      setGrid(prev => {
        const n = { ...prev };
        for (const k of Object.keys(n)) {
          if (n[parseInt(k)] === selectedTroop) delete n[parseInt(k)];
        }
        n[cellIdx] = selectedTroop;
        return n;
      });
      setSelectedTroop(null);
    } else if (grid[cellIdx]) {
      setGrid(prev => { const n = { ...prev }; delete n[cellIdx]; return n; });
    }
  };

  const handleTroopSelect = (buildingId: string) => {
    setSelectedTroop(prev => prev === buildingId ? null : buildingId);
  };

  const handleRaid = async () => {
    if (attemptsLeft <= 0 || onCooldown || raiding || Object.keys(grid).length === 0) return;
    setRaiding(true);
    await new Promise(r => setTimeout(r, 1800));
    const { score } = calcScore(grid);
    let outcome: 'victory' | 'partial' | 'defeat';
    if (score >= dragonHp) outcome = 'victory';
    else if (score >= dragonHp * 0.6) outcome = 'partial';
    else outcome = 'defeat';
    const rewards = computeDungeonRewards(outcome, gph, state.level, dungeonTier);
    recordDungeonRaid(outcome, rewards);
    setDenResult({ outcome, score, dragonHp, rewards });
    setRaiding(false);
  };

  const handleNextRaid = () => {
    setDenResult(null);
    setGrid({});
    setSelectedTroop(null);
  };

  const placedCount = Object.keys(grid).length;
  const scoreDetail = placedCount > 0 ? calcScore(grid) : null;

  if (raiding) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(180deg,#0c0804 0%,#200804 100%)' }}>
        <div className="text-center">
          <p className="text-8xl mb-6" style={{ filter: 'drop-shadow(0 0 24px rgba(239,68,68,0.8))', animation: 'float 1s ease-in-out infinite' }}>{dragon.emoji}</p>
          <p className="font-cinzel text-[#f0c040] font-black text-xl tracking-widest">🗡️ RAIDING 🗡️</p>
          <p className="text-[#6b5a3a] text-sm mt-2">Your forces charge the dungeon…</p>
        </div>
      </div>
    );
  }

  if (denResult) {
    const { outcome, score, rewards } = denResult;
    const outcomeEmoji = outcome === 'victory' ? '🏆' : outcome === 'partial' ? '⚡' : '💀';
    const outcomeColor = outcome === 'victory' ? '#4ade80' : outcome === 'partial' ? '#f0c040' : '#f87171';
    const outcomeLabel = outcome === 'victory' ? 'VICTORY!' : outcome === 'partial' ? 'PARTIAL WIN' : 'DEFEATED';
    return (
      <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
        <DenHeader attemptsLeft={attemptsLeft} dungeonTier={dungeonTier} onSwitchToArena={onSwitchToArena} />
        <div className="px-3 mt-4 flex flex-col gap-3">
          <div className="dragon-panel px-4 py-6 text-center">
            <p className="text-6xl mb-3">{outcomeEmoji}</p>
            <p className="font-cinzel font-black text-2xl tracking-wider mb-1" style={{ color: outcomeColor }}>{outcomeLabel}</p>
            <p className="text-[#6b5a3a] text-xs mb-4">{dragon.name} — Score {score} vs {dragonHp} HP</p>
            {rewards.goldEarned > 0 && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="coin-icon" style={{ width: 18, height: 18 }} />
                <span className="font-cinzel text-[#f0c040] font-bold text-lg">+{formatNumber(rewards.goldEarned)} gold</span>
              </div>
            )}
            {rewards.xpEarned > 0 && (
              <p className="text-[#60a5fa] font-bold text-sm mb-2">✨ +{rewards.xpEarned} XP</p>
            )}
            {rewards.materials.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1 mb-2">
                {rewards.materials.map((m, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      background: (m.type === 'lynx_fang' || m.type === 'nomic_core')
                        ? 'rgba(192,132,252,0.15)' : 'rgba(212,160,23,0.12)',
                      border: (m.type === 'lynx_fang' || m.type === 'nomic_core')
                        ? '1px solid rgba(192,132,252,0.4)' : '1px solid rgba(212,160,23,0.25)',
                      color: (m.type === 'lynx_fang' || m.type === 'nomic_core') ? '#c084fc' : '#f0c040',
                    }}>
                    +{m.quantity}× {MATERIAL_LABELS[m.type]}
                  </span>
                ))}
              </div>
            )}
            {rewards.egg && (
              <p className="text-[#c084fc] font-bold text-sm mb-3">🥚 +1 {rewards.egg.rarity} egg dropped!</p>
            )}
          </div>
          {attemptsLeft > 1 && !onCooldown ? (
            <button onClick={handleNextRaid} className="action-btn w-full py-3 text-sm font-black">
              🐉 Next Raid ({attemptsLeft - 1} left)
            </button>
          ) : (
            <div className="dragon-panel px-3 py-3 text-center">
              <p className="text-[#6b5a3a] text-xs">
                {attemptsLeft <= 1 ? 'No raids left today — resets at midnight UTC' : 'Cooldown active — next raid in 2h'}
              </p>
            </div>
          )}
          <button onClick={onSwitchToArena} className="text-[10px] text-[#6b5a3a] underline text-center mt-1">
            ← Back to Arena
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      <DenHeader attemptsLeft={attemptsLeft} dungeonTier={dungeonTier} onSwitchToArena={onSwitchToArena} />
      <div className="px-3 mt-2 flex flex-col gap-3">

        {/* Dragon info card */}
        <div className="dragon-panel px-4 py-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-5xl flex-shrink-0"
              style={{ filter: 'drop-shadow(0 0 16px rgba(239,68,68,0.6))' }}>{dragon.emoji}</span>
            <div className="flex-1">
              <p className="font-cinzel font-bold text-[#f87171] text-base leading-tight">{dragon.name}</p>
              <p className="text-[#6b5a3a] text-[10px] leading-snug mt-0.5">{dragon.desc}</p>
              <p className="text-[8px] text-[#4a3a2a] mt-0.5 uppercase tracking-wider">Tier {dungeonTier}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-[#f87171] font-bold font-cinzel tracking-wider">HP</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full"
                style={{ width: '100%', background: 'linear-gradient(90deg,#f87171,#ef4444)', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} />
            </div>
            <span className="font-cinzel font-bold text-[#f87171] text-sm">{dragonHp}</span>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-3"
            style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.45)' }}>
            <span className="text-xl flex-shrink-0">⚡</span>
            <div>
              <p className="text-[#f0c040] font-bold text-[11px] leading-tight">Weakness: {dragon.weaknessLabel}</p>
              <p className="text-[#a07a30] text-[9px] mt-0.5">{dragon.hint}</p>
            </div>
          </div>
        </div>

        {attemptsLeft <= 0 && (
          <div className="dragon-panel px-3 py-3 text-center">
            <p className="text-[#f87171] font-bold text-sm">🐉 No raids remaining today</p>
            <p className="text-[#6b5a3a] text-[10px] mt-1">Resets at midnight UTC</p>
          </div>
        )}
        {onCooldown && attemptsLeft > 0 && (
          <DenCooldownBanner cooldownUntil={state.dungeonCooldownUntil} />
        )}

        {/* 4×4 tactical board */}
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-1">TACTICAL BOARD</p>
          <p className="text-[#4a3a2a] text-[9px] mb-2.5">
            {selectedTroop
              ? `Tap a square to deploy ${BUILDING_TROOP_INFO[selectedTroop]?.emoji} ${BUILDING_TROOP_INFO[selectedTroop]?.name} — tap again to move`
              : 'Pick a troop below · tap the board to place · adjacent troops get a bonus'}
          </p>
          <div className="grid grid-cols-4 gap-1.5 mx-auto" style={{ maxWidth: 320 }}>
            {Array.from({ length: 16 }).map((_, cellIdx) => {
              const isDragonCell = dragon.occupies.includes(cellIdx);
              const troopId = grid[cellIdx];
              const troop = troopId ? BUILDING_TROOP_INFO[troopId] : null;
              const row = Math.floor(cellIdx / 4);
              const col = cellIdx % 4;
              const isCheckerLight = (row + col) % 2 === 0;
              const hasAdjacentTroop = !!troop && Object.keys(grid).map(Number)
                .some(other => other !== cellIdx && !!grid[other] && areAdjacentCells(cellIdx, other));
              const building = troop ? state.buildings.find(b => b.id === troopId) : null;
              return (
                <button
                  key={cellIdx}
                  onClick={() => handleCellTap(cellIdx)}
                  disabled={isDragonCell}
                  className="relative flex flex-col items-center justify-center rounded-lg transition-all"
                  style={{
                    minHeight: 72,
                    background: isDragonCell
                      ? 'rgba(180,20,20,0.45)'
                      : troop
                        ? 'rgba(180,120,10,0.25)'
                        : isCheckerLight
                          ? 'rgba(38,20,6,0.9)'
                          : 'rgba(14,7,2,0.95)',
                    border: isDragonCell
                      ? '2px solid rgba(239,68,68,0.75)'
                      : troop
                        ? `2px solid ${hasAdjacentTroop ? '#4ade80' : 'rgba(212,160,23,0.65)'}`
                        : selectedTroop
                          ? '2px dashed rgba(96,165,250,0.45)'
                          : '1px solid rgba(255,255,255,0.07)',
                    boxShadow: isDragonCell
                      ? '0 0 14px rgba(239,68,68,0.4) inset'
                      : hasAdjacentTroop
                        ? '0 0 12px rgba(74,222,128,0.4)'
                        : troop
                          ? '0 0 8px rgba(212,160,23,0.3)'
                          : 'none',
                  }}
                >
                  {isDragonCell ? (
                    <>
                      <span className="text-2xl leading-none"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.9))' }}>{dragon.emoji}</span>
                      <span className="text-[7px] text-red-400 font-bold mt-0.5 tracking-wider">OCCUPIED</span>
                    </>
                  ) : troop ? (
                    <>
                      <span className="text-2xl leading-none">{troop.emoji}</span>
                      {building && (
                        <span className="text-[9px] font-bold text-[#f0c040] mt-0.5">×{building.owned}</span>
                      )}
                    </>
                  ) : selectedTroop ? (
                    <span className="text-2xl leading-none opacity-20">
                      {BUILDING_TROOP_INFO[selectedTroop]?.emoji}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Battle power bar + breakdown */}
        {scoreDetail !== null && (() => {
          const pct = Math.min(100, Math.round(scoreDetail.score / dragonHp * 100));
          const barColor = pct >= 100 ? '#4ade80' : pct >= 60 ? '#f0c040' : '#f87171';
          const outcomeWord = pct >= 100 ? 'VICTORY' : pct >= 60 ? 'PARTIAL' : 'DEFEAT';
          return (
            <div className="dragon-panel px-3 py-3">
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="font-cinzel font-bold text-[#e8d8a8]">YOUR POWER</span>
                <span className="font-cinzel font-bold text-[#f87171]">DRAGON HP {dragonHp}</span>
              </div>
              <div className="relative h-5 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg,${barColor}77,${barColor})`, boxShadow: `0 0 8px ${barColor}55` }} />
              </div>
              <div className="flex justify-between mt-1.5 mb-2">
                <span className="font-cinzel font-bold text-lg" style={{ color: barColor }}>
                  {scoreDetail.score}
                </span>
                <span className="font-cinzel font-bold text-sm self-end" style={{ color: barColor }}>
                  {outcomeWord}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(Object.values(grid))).map(bid => {
                  const info = BUILDING_TROOP_INFO[bid];
                  const bld = state.buildings.find(b => b.id === bid);
                  if (!info || !bld) return null;
                  const contrib = info.armyPower * bld.owned;
                  return (
                    <span key={bid} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                      style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', color: '#f0c040' }}>
                      {info.emoji}×{bld.owned}=+{contrib}
                    </span>
                  );
                })}
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                  style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa' }}>
                  🦸Lv{state.level}+{state.level * 3}
                </span>
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                  style={{
                    background: scoreDetail.hasWeakness ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${scoreDetail.hasWeakness ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: scoreDetail.hasWeakness ? '#4ade80' : '#f87171',
                  }}>
                  {scoreDetail.hasWeakness ? '⚡×1.35' : '⚠️×0.8 no weakness'}
                </span>
                {scoreDetail.adjacencyBonus > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                    style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
                    🔗+{Math.round(scoreDetail.adjacencyBonus * 100)}% adj
                  </span>
                )}
                {scoreDetail.distanceBonus > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                    style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa' }}>
                    📏+10% range
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Troop roster */}
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2.5">YOUR TROOPS</p>
          {availableTroops.length === 0 ? (
            <p className="text-[#4a3a2a] text-[10px] text-center py-3">Build Barracks and other units to deploy troops</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableTroops.map(bid => {
                const info = BUILDING_TROOP_INFO[bid];
                const isSelected = selectedTroop === bid;
                const isWeakness = bid === dragon.weaknessBuildingId;
                const building = state.buildings.find(b => b.id === bid);
                const isPlaced = Object.values(grid).includes(bid);
                const contribution = building ? info.armyPower * building.owned : 0;
                return (
                  <button
                    key={bid}
                    onClick={() => handleTroopSelect(bid)}
                    className="relative flex flex-col items-center py-3 px-1 rounded-xl transition-all"
                    style={{
                      background: isSelected
                        ? 'rgba(96,165,250,0.15)'
                        : isWeakness
                          ? 'rgba(240,192,64,0.1)'
                          : 'rgba(255,255,255,0.04)',
                      border: isSelected
                        ? '2px solid rgba(96,165,250,0.65)'
                        : isWeakness
                          ? '2px solid rgba(240,192,64,0.6)'
                          : '1px solid rgba(255,255,255,0.1)',
                      boxShadow: isWeakness ? '0 0 14px rgba(240,192,64,0.2)' : 'none',
                    }}
                  >
                    {isPlaced && (
                      <span className="absolute top-1 right-1.5 text-[9px] font-bold text-[#4ade80]">✓</span>
                    )}
                    <span className="text-3xl mb-1">{info.emoji}</span>
                    <span className="text-[9px] font-bold leading-tight"
                      style={{ color: isSelected ? '#60a5fa' : isWeakness ? '#f0c040' : '#8a7a5a' }}>
                      {info.name}
                    </span>
                    <span className="text-[8px] mt-0.5"
                      style={{ color: isWeakness ? '#f0c040aa' : '#6b5a3a' }}>
                      +{contribution} pwr
                    </span>
                    {isWeakness && (
                      <span className="mt-1.5 px-2 py-0.5 rounded text-[7px] font-black tracking-wide"
                        style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040', border: '1px solid rgba(240,192,64,0.45)' }}>
                        ⚡ BEST
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Raid button */}
        <button
          onClick={handleRaid}
          disabled={attemptsLeft <= 0 || onCooldown || placedCount === 0}
          className="action-btn w-full py-3.5 text-sm font-black tracking-wide"
          style={{ opacity: (attemptsLeft <= 0 || onCooldown || placedCount === 0) ? 0.4 : 1 }}
        >
          🐉 RAID THE DUNGEON — {attemptsLeft} {attemptsLeft === 1 ? 'raid' : 'raids'} left
        </button>

        {/* Stats footer */}
        <div className="dragon-panel px-3 py-3">
          <div className="flex justify-around text-center">
            <div>
              <p className="font-cinzel font-bold text-[#f0c040] text-base">{state.dungeonTotalVictories ?? 0}</p>
              <p className="text-[9px] text-[#6b5a3a]">Total Victories</p>
            </div>
            <div>
              <p className="font-cinzel font-bold text-[#60a5fa] text-base">{dungeonTier}</p>
              <p className="text-[9px] text-[#6b5a3a]">Dungeon Tier</p>
            </div>
            <div>
              <p className="font-cinzel font-bold text-[#4ade80] text-base">{attemptsLeft}/5</p>
              <p className="text-[9px] text-[#6b5a3a]">Raids Left</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function DenHeader({ attemptsLeft, dungeonTier, onSwitchToArena }: {
  attemptsLeft: number; dungeonTier: number; onSwitchToArena: () => void;
}) {
  return (
    <div className="top-bar sticky top-0 z-30 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">🐉 Dragon Den</h2>
          <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Dungeon Raids · Tier {dungeonTier}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="font-cinzel text-[#f0c040] font-bold text-base">{attemptsLeft}/5</p>
            <p className="text-[9px] text-[#6b5a3a]">raids left</p>
          </div>
          <button
            onClick={onSwitchToArena}
            className="px-2 py-1 rounded-lg text-[9px] font-bold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#6b5a3a' }}
          >
            ⚔️ Arena
          </button>
        </div>
      </div>
    </div>
  );
}

function DenCooldownBanner({ cooldownUntil }: { cooldownUntil: number }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, cooldownUntil - Date.now());
      if (diff <= 0) { setLabel('Ready!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m ${s.toString().padStart(2, '0')}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  return (
    <div className="dragon-panel px-3 py-3 text-center">
      <p className="text-[#f87171] font-bold text-sm">⏳ Raid cooldown active</p>
      <p className="text-[#6b5a3a] text-[10px] mt-1">
        Next raid available in <span className="text-[#f0c040] font-mono font-bold">{label}</span>
      </p>
    </div>
  );
}
