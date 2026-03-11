'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { useGame, calcGearMultiplier } from '@/contexts/GameContext';

function NftItemOverlay({
  src,
  alt,
  fallbackLabel,
  style,
}: {
  src: string;
  alt: string;
  fallbackLabel: string;
  style?: React.CSSProperties;
}) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-center"
        style={{
          width: '100%', height: '100%',
          background: 'rgba(240,192,64,0.12)',
          border: '1px solid rgba(240,192,64,0.45)',
          boxShadow: '0 0 14px rgba(240,192,64,0.5)',
          ...style,
        }}
      >
        <span className="font-cinzel font-bold text-[#f0c040] text-[8px] leading-tight px-1">
          {fallbackLabel}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'contain', ...style }}
      onError={() => setImgError(true)}
    />
  );
}

const TIER_IMAGES = [
  '/images/slayer1.png',
  '/images/slayer2.png',
  '/images/slayer3.png',
  '/images/salyer4.png',
  '/images/slayer5.png',
];

const TIER_AURA = [
  { hasAura: false, auraColor: 'transparent', glowColor: 'rgba(255,180,80,0.15)', emberCount: 2 },
  { hasAura: false, auraColor: 'transparent', glowColor: 'rgba(255,180,80,0.2)',  emberCount: 3 },
  { hasAura: true,  auraColor: 'rgba(100,149,237,0.35)', glowColor: 'rgba(100,149,237,0.3)', emberCount: 6 },
  { hasAura: true,  auraColor: 'rgba(255,107,26,0.45)',  glowColor: 'rgba(255,107,26,0.4)',  emberCount: 10 },
  { hasAura: true,  auraColor: 'rgba(255,50,0,0.55)',    glowColor: 'rgba(255,50,0,0.5)',    emberCount: 14 },
];

const EMBER_COLORS = [
  ['#ff9944', '#ffbb66'],
  ['#ff9944', '#ffbb66'],
  ['#6699ff', '#99bbff'],
  ['#ff6b1a', '#ff8833', '#ffaa33'],
  ['#ff4500', '#ff6b1a', '#ffaa33', '#ff3300'],
];

export default function CharacterDisplay() {
  const { state, getCharacterTier } = useGame();
  const tier = getCharacterTier();
  const cfg = TIER_AURA[tier - 1];

  const gearMult = useMemo(() => calcGearMultiplier(state.equipment), [state.equipment]);
  const moodState = gearMult >= 1.2 ? 'happy' : gearMult >= 1.06 ? 'neutral' : 'sad';

  const colors = EMBER_COLORS[tier - 1];
  const floatAnim = moodState === 'happy' ? 'float 3s ease-in-out infinite' : undefined;

  const equippedWeapon = state.equipment.weapon;
  const equippedShield = state.equipment.shield;
  const showSword  = equippedWeapon?.rarity === 'epic' || equippedWeapon?.rarity === 'legendary';
  const showShield = equippedShield?.rarity === 'epic' || equippedShield?.rarity === 'legendary';
  const swordImg  = '/images/lynxsword.png';
  const shieldImg = '/images/nomicsshield.png';

  return (
    <div className="relative flex-1 w-full flex flex-col items-center justify-center" style={{ paddingBottom: 48 }}>

      {/* Aura glow layers */}
      {cfg.hasAura && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 65% 55% at 50% 55%, ${cfg.auraColor} 0%, transparent 70%)`,
            filter: 'blur(32px)',
            animation: 'fireRingPulse 3s ease-in-out infinite',
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 40% 38% at 50% 58%, ${cfg.auraColor} 0%, transparent 60%)`,
            filter: 'blur(14px)',
            opacity: 0.55,
          }} />
        </>
      )}

      {/* Ground fire ring */}
      <div className="absolute pointer-events-none" style={{
        bottom: 52, left: '50%', transform: 'translateX(-50%)',
        width: 200, height: 34,
        background: `radial-gradient(ellipse at center, ${cfg.glowColor} 0%, transparent 70%)`,
        borderRadius: '50%',
        filter: 'blur(8px)',
        animation: tier >= 3 ? 'fireRingPulse 2.5s ease-in-out infinite' : undefined,
      }} />
      <div className="absolute pointer-events-none" style={{
        bottom: 50, left: '50%', transform: 'translateX(-50%)',
        width: 220, height: 18,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%)',
        borderRadius: '50%',
      }} />

      {/* Character image + NFT weapon overlays */}
      {/* Outer container is wide enough to contain overlays on both sides without overflowing */}
      <div
        className="relative z-10"
        style={{ width: 'min(360px, 92vw)', height: 300 }}
      >
        {/* Character image — centred inside the wider container */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            width: 200,
            height: 300,
            animation: floatAnim,
            filter: tier >= 3
              ? `drop-shadow(0 0 26px ${cfg.glowColor}) drop-shadow(0 0 10px ${cfg.glowColor})`
              : `drop-shadow(0 8px 18px rgba(0,0,0,0.8))`,
          }}
        >
          <Image
            src={TIER_IMAGES[tier - 1]}
            alt="DragonSlayer character"
            fill
            style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
            priority
          />
          {/* Mood blue tint when sad */}
          {moodState === 'sad' && (
            <div className="absolute inset-0 rounded pointer-events-none"
              style={{ background: 'rgba(0,0,80,0.2)', mixBlendMode: 'multiply' }} />
          )}
        </div>

        {/* Shield overlay — epic (Aegis) or legendary (Nomic Shield) */}
        {showShield && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: 0,
              bottom: 50,
              width: 90,
              height: 120,
              filter: equippedShield?.rarity === 'legendary'
                ? 'drop-shadow(0 0 14px rgba(240,192,64,0.9)) drop-shadow(0 0 6px rgba(240,192,64,0.7))'
                : 'drop-shadow(0 0 10px rgba(100,149,237,0.8)) drop-shadow(0 0 4px rgba(150,180,255,0.6))',
              animation: floatAnim,
            }}
          >
            <NftItemOverlay
              src={shieldImg}
              alt={equippedShield?.name ?? 'Shield'}
              fallbackLabel="🛡️ Shield"
            />
            {equippedShield?.nftTokenId && (
              <span
                className="absolute -top-2 -right-2 z-30 text-[7px] font-bold px-1 py-0.5 rounded"
                style={{ background: 'rgba(240,192,64,0.9)', color: '#1a0e00', pointerEvents: 'none' }}
              >
                ✨ NFT
              </span>
            )}
          </div>
        )}

        {/* Sword overlay — epic (Dragon Fang) or legendary (Lynx Sword) */}
        {showSword && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              right: 0,
              bottom: 40,
              width: 70,
              height: 160,
              filter: equippedWeapon?.rarity === 'legendary'
                ? 'drop-shadow(0 0 14px rgba(240,192,64,0.9)) drop-shadow(0 0 6px rgba(240,192,64,0.7))'
                : 'drop-shadow(0 0 10px rgba(100,149,237,0.8)) drop-shadow(0 0 4px rgba(150,180,255,0.6))',
              animation: floatAnim,
            }}
          >
            <NftItemOverlay
              src={swordImg}
              alt={equippedWeapon?.name ?? 'Weapon'}
              fallbackLabel="⚔️ Weapon"
            />
            {equippedWeapon?.nftTokenId && (
              <span
                className="absolute -top-2 -right-2 z-30 text-[7px] font-bold px-1 py-0.5 rounded"
                style={{ background: 'rgba(240,192,64,0.9)', color: '#1a0e00', pointerEvents: 'none' }}
              >
                ✨ NFT
              </span>
            )}
          </div>
        )}
      </div>

      {/* Ember particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        {Array.from({ length: cfg.emberCount }).map((_, i) => {
          const size = 2 + (i % 3);
          return (
            <div
              key={i}
              className="ember-particle"
              style={{
                left:   `${18 + (i * 8) % 64}%`,
                bottom: `${8  + (i * 11) % 22}%`,
                animationDelay:    `${(i * 0.38) % 2.4}s`,
                animationDuration: `${2.1 + (i * 0.28) % 1.4}s`,
                width:  `${size}px`,
                height: `${size}px`,
                background: colors[i % colors.length],
                boxShadow: `0 0 ${size * 2}px ${colors[i % colors.length]}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
