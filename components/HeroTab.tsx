'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useGame, ActiveExpedition } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';
import CharacterDisplay from './CharacterDisplay';
import QuestBanner from './QuestBanner';
import LoginBonusModal from './LoginBonusModal';
import HolderGiftModal from './HolderGiftModal';
import MerchantModal from './MerchantModal';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';

interface GoldFloat { id: number; x: number; crit: boolean; amount: number; }
interface Ripple    { id: number; x: number; y: number; }

const TIER_NAMES = ['Peasant', 'Squire', 'Knight', 'Dragon Knight', 'Dragonslayer'];

const COMBO_THRESHOLDS = [
  { taps: 1,  mult: 1,   label: '',      color: '' },
  { taps: 5,  mult: 1.5, label: '1.5×',  color: '#f0c040' },
  { taps: 12, mult: 2,   label: '2×',    color: '#ff9900' },
  { taps: 25, mult: 3,   label: '3× 🔥', color: '#ff5500' },
  { taps: 50, mult: 5,   label: '5× ⚡', color: '#ff2200' },
];

const COMBO_DECAY_MS = 1500;

function getComboLevel(count: number) {
  let level = COMBO_THRESHOLDS[0];
  for (const t of COMBO_THRESHOLDS) {
    if (count >= t.taps) level = t;
  }
  return level;
}

function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}

interface NextGoal { icon: string; text: string; sub: string; }

function getNextGoal(state: ReturnType<typeof useGame>['state'], goldPerHour: number): NextGoal | null {
  const hasBuildings = state.buildings.some(b => b.owned > 0);
  const hasExpedition = state.totalExpeditions > 0 || !!state.activeExpedition;
  const hasMaterials = state.materials.length > 0;
  const hasGear = Object.values(state.equipment).some(Boolean);
  const hasFullGear = Object.values(state.equipment).filter(Boolean).length >= 5;
  const canCraftMore = !hasFullGear && hasMaterials;

  if (!hasBuildings)
    return { icon: '🏰', text: 'Buy your first building', sub: 'Forge tab → Barracks gives +200 gold/hr passive income' };
  if (!hasExpedition)
    return { icon: '🗺️', text: 'Send your first Expedition', sub: 'Expedition tab → earns crafting materials every few hours' };
  if (hasMaterials && !hasGear)
    return { icon: '⚔️', text: 'Craft your first gear piece', sub: 'Expedition tab → Craft → forge Iron items to boost your tapping' };
  if (canCraftMore)
    return { icon: '🔨', text: 'Upgrade your gear', sub: 'You have materials ready — Expedition → Craft to forge a new piece' };
  if (!state.activeExpedition && hasGear)
    return { icon: '🗺️', text: 'Send a new Expedition', sub: `Farm more materials to upgrade gear beyond current tier` };
  if (state.activeExpedition)
    return null; // expedition running — no nagging
  return null;
}

export default function HeroTab({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { state, tap, goldPerTap, goldPerHour, gearMultiplier, getCharacterTier, dragonBonuses } = useGame();
  const { hapticFeedback, isTWA } = useTelegramWebApp();

  const [floats,     setFloats]     = useState<GoldFloat[]>([]);
  const [ripples,    setRipples]    = useState<Ripple[]>([]);
  const [flash,      setFlash]      = useState(false);
  const [levelUp,    setLevelUp]    = useState(false);
  const [comboCount, setComboCount] = useState(0);
  const [tutStep,    setTutStep]    = useState(0); // 0=tap hint, 1=gear hint, 2=building hint, 3=done

  const counter      = useRef(0);
  const prevLevelRef = useRef(state.level);
  const comboTimer   = useRef<ReturnType<typeof setTimeout>>();
  // Holds fast-changing tap display values so handleTap deps stay stable
  const tapValuesRef = useRef({ earned: 0, crit: false, gpt: 1 });
  tapValuesRef.current = { earned: state.lastTapEarned, crit: state.lastTapCrit, gpt: goldPerTap };

  // Level-up ceremony + haptic
  useEffect(() => {
    if (state.level > prevLevelRef.current) {
      setLevelUp(true);
      if (isTWA) hapticFeedback('success');
      const t = setTimeout(() => setLevelUp(false), 1900);
      prevLevelRef.current = state.level;
      return () => clearTimeout(t);
    }
    prevLevelRef.current = state.level;
  }, [state.level, hapticFeedback, isTWA]);

  // Tutorial step progression
  useEffect(() => {
    if (tutStep === 0 && state.totalTaps >= 1) setTutStep(1);
    if (tutStep === 1 && state.totalTaps >= 5) setTutStep(2);
    if (tutStep === 2 && state.buildings.some(b => b.owned > 0)) setTutStep(3);
  }, [state.totalTaps, state.buildings, tutStep]);

  const comboLevel = getComboLevel(comboCount);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Increment combo
    setComboCount(prev => prev + 1);
    clearTimeout(comboTimer.current);
    comboTimer.current = setTimeout(() => setComboCount(0), COMBO_DECAY_MS);

    const currentCombo = getComboLevel(comboCount + 1);
    tap(currentCombo.mult);

    const { earned: lastEarned, crit: isCrit, gpt } = tapValuesRef.current;
    const earned = lastEarned || gpt;

    // Haptic feedback
    if (isTWA) {
      hapticFeedback(isCrit ? 'heavy' : comboCount >= 25 ? 'medium' : 'light');
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const rx   = e.clientX - rect.left;
    const ry   = e.clientY - rect.top;
    const xPct = Math.max(10, Math.min(85, (rx / rect.width) * 100));

    const id = ++counter.current;

    setRipples(prev => [...prev.slice(-4), { id, x: rx, y: ry }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 560);

    setFloats(prev => [...prev.slice(-8), { id, x: xPct, crit: isCrit, amount: earned }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), isCrit ? 1600 : 1150);

    setFlash(true);
    setTimeout(() => setFlash(false), isCrit ? 140 : 80);
  }, [tap, comboCount, isTWA, hapticFeedback]);

  const xpPercent = state.xpToNext > 0 ? (state.xp / state.xpToNext) * 100 : 0;
  const tier      = getCharacterTier();

  return (
    <div className="flex flex-col flex-1 pb-2 relative z-10 page-fade">

      {/* ══════════════ LOGIN BONUS MODAL ══════════════ */}
      <LoginBonusModal />

      {/* ══════════════ HOLDER DAILY GIFT MODAL ══════════════ */}
      <HolderGiftModal />

      {/* ══════════════ LEVEL-UP OVERLAY ══════════════ */}
      {levelUp && (
        <div className="level-up-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">
          <div className="level-up-inner flex flex-col items-center gap-2">
            <span
              className="font-cinzel uppercase tracking-[0.3em] text-xl"
              style={{ color: '#ffe88a', textShadow: '0 0 30px rgba(255,210,40,0.9), 0 2px 4px rgba(0,0,0,0.8)' }}
            >
              Level Up!
            </span>
            <span
              className="font-cinzel font-black text-6xl tabular-nums"
              style={{ color: '#f0c040', textShadow: '0 0 50px rgba(255,200,40,1), 0 0 20px rgba(255,140,10,0.8), 0 3px 6px rgba(0,0,0,0.9)' }}
            >
              {state.level}
            </span>
            <span className="font-cinzel text-sm tracking-widest" style={{ color: '#d4a017' }}>
              {TIER_NAMES[tier - 1]}
            </span>
          </div>
        </div>
      )}

      {/* ══════════════ TOP BAR ══════════════ */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="level-badge w-12 h-12 flex flex-col items-center justify-center">
              <span className="font-cinzel text-[#f0c040] font-black text-lg leading-none">{state.level}</span>
            </div>
            <div>
              <h1 className="gold-shimmer font-cinzel font-bold text-xl leading-tight">Dragonslayer</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="xp-bar-bg w-28 h-2">
                  <div className="xp-bar-fill h-full" style={{ width: `${xpPercent}%` }} />
                </div>
                <span className="text-[11px] text-[#8a7a5a] font-bold uppercase tracking-wider">{TIER_NAMES[tier - 1]}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-2 rounded-xl border border-[rgba(212,160,23,0.2)]">
            <span className="coin-icon flex-shrink-0" style={{ width: 18, height: 18 }} />
            <span className="font-cinzel text-[#f0c040] font-bold text-base tabular-nums">{formatNumber(state.gold)}</span>
          </div>
        </div>
      </div>

      <div className="px-3 mt-2 flex flex-col flex-1 gap-2.5">

        {/* ══════════════ CHARACTER PANEL — TAP HERE ══════════════ */}
        <div
          className="hero-panel relative overflow-hidden cursor-pointer select-none active:scale-[0.985] transition-transform duration-100 flex flex-col"
          style={{ flex: '1 1 0', minHeight: 200, touchAction: 'manipulation' }}
          onClick={handleTap}
        >
          {/* Bottom fire glow */}
          <div className="absolute bottom-0 left-0 right-0 h-[55%] pointer-events-none" style={{
            background: 'radial-gradient(ellipse 90% 70% at 50% 100%, rgba(255,80,10,0.14) 0%, transparent 100%)',
            animation: 'fireRingPulse 3s ease-in-out infinite',
          }} />

          {/* Screen flash */}
          {flash && (
            <div className="absolute inset-0 pointer-events-none z-20 rounded-xl"
              style={{ background: 'rgba(255,210,60,0.08)' }} />
          )}

          {/* Combo badge */}
          {comboLevel.label && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <span
                className="font-cinzel font-black text-lg px-3 py-1 rounded-full"
                style={{
                  color: comboLevel.color,
                  textShadow: `0 0 20px ${comboLevel.color}, 0 2px 4px rgba(0,0,0,0.8)`,
                  background: 'rgba(0,0,0,0.5)',
                  border: `1px solid ${comboLevel.color}44`,
                  animation: 'comboPop 0.15s ease-out',
                }}
              >
                {comboLevel.label}
              </span>
            </div>
          )}

          {/* Tap hint ring — visible until first tap */}
          {state.totalTaps === 0 && <div className="tap-hint-ring" />}

          <CharacterDisplay />

          {/* Expedition-active overlay — blocks tapping */}
          {state.activeExpedition && (
            <ExpeditionOverlay exp={state.activeExpedition} />
          )}

          {/* Tap ripples */}
          {ripples.map(r => (
            <div
              key={r.id}
              className="tap-ripple"
              style={{ left: r.x, top: r.y }}
            />
          ))}

          {/* Floating gold numbers (normal + crit) */}
          {floats.map(f => (
            <span
              key={f.id}
              className={f.crit ? 'crit-float' : 'gold-float'}
              style={{ left: `${f.x}%`, bottom: f.crit ? '50%' : '40%', transform: 'translateX(-50%)' }}
            >
              {f.crit ? '⚡' : '+'}{f.amount}
            </span>
          ))}

          {/* Passive income pill */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-[rgba(212,160,23,0.2)]">
              <span className="coin-icon" style={{ width: 14, height: 14 }} />
              <span className="font-cinzel text-[#f0c040] font-bold text-sm tabular-nums">{formatNumber(goldPerHour)}</span>
              <span className="text-[#9a8a6a] text-xs">/hr</span>
              {gearMultiplier > 1.0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-amber-300 bg-amber-900/40">
                  {gearMultiplier.toFixed(2)}×
                </span>
              )}
            </div>
          </div>

          {/* Tutorial hints */}
          {tutStep === 0 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
              <div className="tut-callout">
                <span className="text-base">👆</span>
                <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">Tap to earn gold!</span>
              </div>
            </div>
          )}
          {tutStep === 1 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
              <div className="tut-callout">
                <span className="text-base">⚔️</span>
                <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">Craft gear to boost your gold!</span>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════ TUTORIAL HINT: BUY BUILDINGS ══════════════ */}
        {tutStep === 2 && (
          <div className="tut-callout mx-1">
            <span className="text-base">🏰</span>
            <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">Visit Shop tab — buy a building for passive gold!</span>
          </div>
        )}

        {/* ══════════════ DAILY QUESTS ══════════════ */}
        <QuestBanner />

        {/* ══════════════ TRAVELLING MERCHANT ══════════════ */}
        <MerchantModal onTabChange={onTabChange} />

        {/* ══════════════ DRAGON DEN ══════════════ */}
        {(state.eggInventory?.length > 0 || state.hatchedDragons?.length > 0 || state.incubator?.some(s => s.egg)) && (() => {
          const eggCount = state.eggInventory?.length ?? 0;
          const hatchedCount = state.hatchedDragons?.length ?? 0;
          const incubating = state.incubator?.filter(s => s.egg).length ?? 0;
          const hatchReady = state.incubator?.some(s => s.egg && s.endsAt && Date.now() >= s.endsAt);
          return (
            <div
              role="button"
              onClick={() => onTabChange?.('expedition')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(239,68,68,0.06) 100%)',
                border: `1px solid ${hatchReady ? 'rgba(74,222,128,0.5)' : 'rgba(249,115,22,0.35)'}`,
                boxShadow: hatchReady ? '0 0 16px rgba(74,222,128,0.15)' : '0 0 12px rgba(249,115,22,0.1)',
                animation: hatchReady ? 'goldShimmerBtn 2s ease-in-out infinite' : undefined,
              }}
            >
              <span className="text-2xl flex-shrink-0">{hatchReady ? '🐣' : '🐉'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-cinzel font-bold text-[11px] tracking-wide"
                  style={{ color: hatchReady ? '#4ade80' : '#f97316' }}>
                  {hatchReady ? '🔥 DRAGON READY TO HATCH!' : '🥚 DRAGON DEN'}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: '#8a6a5a' }}>
                  {hatchReady
                    ? 'Your egg has hatched — claim your dragon bonus now!'
                    : [
                        eggCount > 0 && `${eggCount} egg${eggCount !== 1 ? 's' : ''} in inventory`,
                        incubating > 0 && `${incubating} incubating`,
                        hatchedCount > 0 && `${hatchedCount} dragon${hatchedCount !== 1 ? 's' : ''} active — common eggs boost tapping!`,
                      ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span style={{ color: hatchReady ? '#4ade80' : '#f97316' }} className="text-sm">›</span>
            </div>
          );
        })()}

        {/* ══════════════ NEXT GOAL BANNER ══════════════ */}
        {(() => {
          const goal = getNextGoal(state, goldPerHour);
          if (!goal) return null;
          return (
            <div
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(212,160,23,0.08) 0%, rgba(255,180,30,0.04) 100%)',
                border: '1px solid rgba(212,160,23,0.25)',
                boxShadow: '0 0 12px rgba(212,160,23,0.06)',
              }}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{goal.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-cinzel font-bold text-[#f0c040] text-[11px] tracking-wide">
                  NEXT: {goal.text}
                </p>
                <p className="text-[#6b5a3a] text-[9px] mt-0.5 leading-snug">{goal.sub}</p>
              </div>
              <span className="text-[#d4a017] text-sm flex-shrink-0 mt-1">›</span>
            </div>
          );
        })()}

        {/* ══════════════ GEAR POWER BAR ══════════════ */}
        <div role="button" onClick={() => onTabChange?.('buildings')} className="dragon-panel px-3 py-2.5 cursor-pointer">
          <div className="flex items-center gap-3">
            <span className="text-sm">⚔️</span>
            <span className="text-[#e8d8a8] text-[12px] font-bold tracking-wide flex-shrink-0">Gear Power</span>
            <div className="flex-1 stat-bar-bg h-5 relative">
              <div
                className="h-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(100, ((gearMultiplier - 1) / 0.5) * 100)}%`,
                  background: 'linear-gradient(90deg, #d4a017, #f0c040)',
                  borderRadius: 'inherit',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {gearMultiplier.toFixed(2)}×
              </span>
            </div>
            <span className="text-[10px] text-[#6b5a3a] flex-shrink-0">Equip gear →</span>
          </div>
        </div>

        {/* ══════════════ GOLD PER TAP HINT ══════════════ */}
        <div className="text-center text-[#a89878] text-xs pb-1 tracking-wider uppercase">
          <span className="text-[#f0c040] font-bold">+{goldPerTap}</span> gold per tap
          {dragonBonuses.tapGoldPct > 0 && (
            <span className="text-[#f97316] font-bold ml-1">(+{dragonBonuses.tapGoldPct.toFixed(1)}% 🐉)</span>
          )}
          {' · '}
          <span className="text-[#f0c040] font-bold">{formatNumber(state.totalTaps)}</span> taps
        </div>
      </div>
    </div>
  );
}

function ExpeditionOverlay({ exp }: { exp: ActiveExpedition }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, exp.endsAt - now);
  const done = msLeft === 0;
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl"
      style={{ background: 'rgba(5,3,1,0.78)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.stopPropagation()}
    >
      <span className="text-4xl mb-2">🗺️</span>
      <p className="font-cinzel font-bold text-[#e8d8a8] text-sm tracking-wide">
        Fighter on Expedition
      </p>
      {done ? (
        <p className="text-[#4ade80] font-bold text-xs mt-1 animate-pulse">✓ Ready to claim!</p>
      ) : (
        <p className="font-cinzel text-[#f0c040] text-xl font-bold tabular-nums mt-1">
          {fmtMs(msLeft)}
        </p>
      )}
      <p className="text-[9px] text-[#4a3a2a] mt-2">Go to Expedition tab to claim rewards</p>
    </div>
  );
}
