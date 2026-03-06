'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGame, calcDefensePower } from '@/contexts/GameContext';
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
  const gold = level * 500 + Math.floor(Math.random() * level * 300);
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

export default function ArenaTab() {
  const { state, armyPower, recordBotBattle } = useGame();
  const defPower = calcDefensePower(state.buildings);

  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [formation, setFormation] = useState<Formation>('balanced');
  const [attacking, setAttacking] = useState(false);
  const [roundIdx, setRoundIdx] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState('');

  const attacksLeft = MAX_ATTACKS - (state.arenaAttacksToday ?? 0);

  const botOpponent = useMemo(() => makeBotOpponent(armyPower, state.level), [armyPower, state.level]);

  const loadOpponents = useCallback(async () => {
    if (!state.playerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/arena/opponents?player_id=${state.playerId}`);
      const data = await res.json();
      if (data.success) setOpponents(data.opponents);
      else setError(data.detail || 'Failed to load opponents');
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }, [state.playerId]);

  useEffect(() => { loadOpponents(); }, [loadOpponents]);

  const handleAttack = async () => {
    if (!selected || attacking || attacksLeft <= 0) return;

    // ── Bot battle (client-side) ────────────────────────────────────────────
    if (selected.player_id === 0) {
      setAttacking(true);
      setRoundIdx(0);
      setResult(null);
      const fm = FORMATION_INFO[formation];
      const rand = 0.85 + Math.random() * 0.30;
      const effAtk = Math.round(armyPower * fm.atkMod * rand);
      const effDef = Math.round(selected.defense_power * fm.defMod * (0.85 + Math.random() * 0.30));
      const win = effAtk > effDef;
      const goldStolen = win ? Math.floor(selected.idle_gold * 0.04) : 0;
      for (let i = 0; i < 3; i++) {
        setRoundIdx(i);
        await new Promise(r => setTimeout(r, 1100));
      }
      const rounds = win
        ? [
            { label: 'Round 1', desc: 'You charge the Shadow Raider — they falter!' },
            { label: 'Round 2', desc: 'Your forces overwhelm the bot defenses.' },
            { label: 'Round 3', desc: 'VICTORY — the Shadow Raider retreats!' },
          ]
        : [
            { label: 'Round 1', desc: 'The Shadow Raider holds the line.' },
            { label: 'Round 2', desc: 'Bot defenses push back hard.' },
            { label: 'Round 3', desc: 'DEFEAT — regroup and try again.' },
          ];
      recordBotBattle(win, goldStolen);
      setResult({
        win,
        gold_stolen: goldStolen,
        effective_attack: effAtk,
        effective_defense: effDef,
        rounds,
        attacks_remaining: attacksLeft - 1,
        arena_points: (state.arenaPoints ?? 0) + (win ? 5 : 1),
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

  // ── Wallet connected but player ID not yet synced ───────────────────────────
  if (state.walletAddress && !state.playerId) {
    return (
      <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
        <ArenaHeader attacksLeft={attacksLeft} arenaPoints={state.arenaPoints ?? 0} />
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-4">
          <span className="text-5xl">⏳</span>
          <p className="font-cinzel font-bold text-[#f0c040] text-lg">Syncing Account…</p>
          <p className="text-[#6b5a3a] text-sm leading-relaxed">
            Your wallet is connected — waiting for server sync. This only takes a moment.
          </p>
        </div>
      </div>
    );
  }

  // ── No wallet ───────────────────────────────────────────────────────────────
  if (!state.walletAddress) {
    return (
      <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
        <ArenaHeader attacksLeft={attacksLeft} arenaPoints={state.arenaPoints ?? 0} />
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-4">
          <span className="text-5xl">⚔️</span>
          <p className="font-cinzel font-bold text-[#f0c040] text-lg">Arena Locked</p>
          <p className="text-[#6b5a3a] text-sm leading-relaxed">
            Connect your Xaman wallet in Profile to compete in the Arena and battle real players.
          </p>
        </div>
      </div>
    );
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
        <ArenaHeader attacksLeft={result.attacks_remaining} arenaPoints={result.arena_points} />
        <div className="px-3 mt-4 flex flex-col gap-3">
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
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="coin-icon" style={{ width: 18, height: 18 }} />
                <span className="font-cinzel text-[#f0c040] font-bold text-lg">
                  +{formatNumber(result.gold_stolen)} gold stolen
                </span>
              </div>
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
                <span className="text-[#d4a017] text-[9px] font-bold w-14 flex-shrink-0">{r.label}</span>
                <span className="text-[#6b5a3a] text-[9px]">{r.desc}</span>
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
      <ArenaHeader attacksLeft={attacksLeft} arenaPoints={state.arenaPoints ?? 0} />

      <div className="px-3 mt-2 flex flex-col gap-3">

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
          <div className="dragon-panel px-3 py-3 text-center">
            <p className="text-[#f0c040] font-bold text-sm">⏳ No attacks remaining today</p>
            <p className="text-[#6b5a3a] text-[10px] mt-1">Resets at midnight</p>
          </div>
        )}

        {/* Opponent list */}
        <div className="dragon-panel px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider">CHOOSE OPPONENT</p>
            <button onClick={loadOpponents} disabled={loading}
              className="text-[9px] text-[#6b5a3a] underline transition-opacity"
              style={{ opacity: loading ? 0.5 : 1 }}>
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
          {loading && (
            <div className="text-center py-2 text-[#6b5a3a] text-xs">Loading real players…</div>
          )}
          <div className="flex flex-col gap-1.5">
            {[botOpponent, ...opponents].map(opp => {
              const isSelected = selected?.player_id === opp.player_id;
              const ch = winChance(armyPower, formation, opp.defense_power);
              const isBot = opp.player_id === 0;
              return (
                <button
                  key={isBot ? 'bot' : opp.player_id}
                  onClick={() => setSelected(isSelected ? null : opp)}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: isSelected ? 'rgba(212,160,23,0.12)' : isBot ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.02)',
                    border: isSelected ? '1px solid rgba(212,160,23,0.4)' : isBot ? '1px solid rgba(124,58,237,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: isBot ? 'rgba(124,58,237,0.15)' : 'rgba(212,160,23,0.08)', border: `1px solid ${isBot ? 'rgba(124,58,237,0.3)' : 'rgba(212,160,23,0.2)'}` }}>
                    {isBot ? '🤖' : `Lv${opp.level}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="text-[10px] font-bold truncate" style={{ color: isBot ? '#c084fc' : '#e8d8a8' }}>{opp.name}</p>
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
                    <p className="text-[8px] text-[#6b5a3a]">⚔️{opp.attack_power} · 🛡️{opp.defense_power}{isBot ? ' · AI' : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] font-bold"
                      style={{ color: ch >= 60 ? '#4ade80' : ch >= 40 ? '#f0c040' : '#f87171' }}>
                      {ch}% win
                    </p>
                    <p className="text-[8px] text-[#6b5a3a]">💰{formatNumber(Math.floor(opp.idle_gold * 0.04))}</p>
                  </div>
                </button>
              );
            })}
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
                  <p className="text-[7px] text-[#4a3a2a] leading-tight">{FORMATION_INFO[f].desc}</p>
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
              <p className="font-cinzel font-bold text-[#f0c040]">{state.arenaPoints ?? 0}</p>
              <p className="text-[9px] text-[#6b5a3a]">Conquest Pts</p>
            </div>
            <div>
              <p className="font-cinzel font-bold text-[#f0c040]">{attacksLeft}</p>
              <p className="text-[9px] text-[#6b5a3a]">Attacks Left</p>
            </div>
            <div>
              <p className="font-cinzel font-bold text-[#f0c040]">{defPower}</p>
              <p className="text-[9px] text-[#6b5a3a]">Your Defense</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function ArenaHeader({ attacksLeft, arenaPoints }: { attacksLeft: number; arenaPoints: number }) {
  return (
    <div className="top-bar sticky top-0 z-30 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Arena</h2>
          <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Battle real players</p>
        </div>
        <div className="text-right">
          <p className="font-cinzel text-[#f0c040] font-bold text-sm">🏆 {formatNumber(arenaPoints)}</p>
          <p className="text-[#6b5a3a] text-[9px]">{attacksLeft}/{MAX_ATTACKS} attacks</p>
        </div>
      </div>
    </div>
  );
}
