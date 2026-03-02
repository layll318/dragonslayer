'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useGame, getCareCost, FEED_COST_BASE, REST_COST_BASE, TRAIN_COST_BASE } from '@/contexts/GameContext';
import { formatNumber, formatPercent } from '@/utils/format';
import CharacterDisplay from './CharacterDisplay';
import QuestBanner from './QuestBanner';
import DragonBoss from './DragonBoss';
import LoginBonusModal from './LoginBonusModal';
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

export default function HeroTab() {
  const { state, tap, feed, rest, train, goldPerTap, goldPerHour, careMultiplier, getCharacterTier } = useGame();
  const { hapticFeedback, isTWA } = useTelegramWebApp();

  const [floats,     setFloats]     = useState<GoldFloat[]>([]);
  const [ripples,    setRipples]    = useState<Ripple[]>([]);
  const [flash,      setFlash]      = useState(false);
  const [levelUp,    setLevelUp]    = useState(false);
  const [comboCount, setComboCount] = useState(0);
  const [tutStep,    setTutStep]    = useState(0); // 0=tap hint, 1=care hint, 2=building hint, 3=done

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

  const feedCost  = getCareCost(FEED_COST_BASE,  state.level);
  const restCost  = getCareCost(REST_COST_BASE,  state.level);
  const trainCost = getCareCost(TRAIN_COST_BASE, state.level);
  const xpPercent = state.xpToNext > 0 ? (state.xp / state.xpToNext) * 100 : 0;
  const tier      = getCharacterTier();
  const careWarning = Math.min(state.fed, state.energy, state.mood) < 25;

  return (
    <div className="flex flex-col flex-1 pb-2 relative z-10 page-fade">

      {/* ══════════════ LOGIN BONUS MODAL ══════════════ */}
      <LoginBonusModal />

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
                <span className="text-[9px] text-[#6b5a3a] font-bold uppercase tracking-wider">{TIER_NAMES[tier - 1]}</span>
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

          {/* Dragon Boss overlay */}
          <DragonBoss />

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
              {careMultiplier !== 1.0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${careMultiplier > 1 ? 'text-green-300 bg-green-900/40' : 'text-red-300 bg-red-900/40'}`}>
                  {careMultiplier}×
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
                <span className="text-base">❤️</span>
                <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">Keep stats high for bonus gold!</span>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════ TUTORIAL HINT: BUY BUILDINGS ══════════════ */}
        {tutStep === 2 && (
          <div className="tut-callout mx-1">
            <span className="text-base">🏰</span>
            <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">Visit Forge tab — buy a building for passive gold!</span>
          </div>
        )}

        {/* ══════════════ DAILY QUESTS ══════════════ */}
        <QuestBanner />

        {/* ══════════════ CARE HUD ══════════════ */}
        <div className={`dragon-panel px-3 py-2.5 ${careWarning ? 'care-warning' : ''}`}>
          <CareRow icon="🍖" label="Fed"    value={state.fed}    barClass="stat-bar-fed"    btnLabel="FEED"  btnCost={feedCost}  canAfford={state.gold >= feedCost}  onClick={feed}  />
          <div className="ornate-divider my-1.5" />
          <CareRow icon="⚡"  label="Energy" value={state.energy} barClass="stat-bar-energy" btnLabel="REST"  btnCost={restCost}  canAfford={state.gold >= restCost}  onClick={rest}  />
          <div className="ornate-divider my-1.5" />
          <CareRow icon="😊" label="Mood"   value={state.mood}   barClass="stat-bar-mood"   btnLabel="TRAIN" btnCost={trainCost} canAfford={state.gold >= trainCost} onClick={train} />
        </div>

        {/* ══════════════ GOLD PER TAP HINT ══════════════ */}
        <div className="text-center text-[#a89878] text-xs pb-1 tracking-wider uppercase">
          <span className="text-[#f0c040] font-bold">+{goldPerTap}</span> gold per tap
          {' · '}
          <span className="text-[#f0c040] font-bold">{formatNumber(state.totalTaps)}</span> taps
        </div>
      </div>
    </div>
  );
}

function CareRow({
  icon, label, value, barClass, btnLabel, btnCost, canAfford, onClick,
}: {
  icon: string; label: string; value: number; barClass: string;
  btnLabel: string; btnCost: number; canAfford: boolean; onClick: () => void;
}) {
  const isLow = value < 25;
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm w-5 text-center flex-shrink-0 ${isLow ? 'animate-pulse' : ''}`}>{icon}</span>
      <span className="text-[#e8d8a8] text-[12px] font-bold w-[48px] flex-shrink-0 tracking-wide">{label}</span>
      <div className="flex-1 min-w-0 stat-bar-bg h-5 relative">
        <div className={`${barClass} h-full transition-all duration-700 ease-out`} style={{ width: `${value}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {formatPercent(value)}
        </span>
      </div>
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-[68px]">
        <button
          onClick={onClick}
          disabled={!canAfford}
          className="action-btn w-full text-[9px]"
          style={{ letterSpacing: '1px', minHeight: 44, touchAction: 'manipulation' }}
        >
          {btnLabel}
        </button>
        <div className="flex items-center gap-0.5 justify-center">
          <span className="coin-icon" style={{ width: 7, height: 7 }} />
          <span className={`text-[10px] font-bold ${canAfford ? 'text-[#b09a60]' : 'text-red-400/80'}`}>
            {formatNumber(btnCost)}
          </span>
        </div>
      </div>
    </div>
  );
}
