'use client';

import React, { useState, useEffect } from 'react';
import {
  useGame,
  EquipmentSlots,
  InventoryItem,
  RARITY_COLORS,
  RARITY_SCORES,
  MATERIAL_LABELS,
  ITEM_UNLOCK_LEVELS,
  ItemType,
  MaterialType,
  MaterialQuality,
} from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}

const SLOT_LABELS: Record<keyof EquipmentSlots, string> = {
  weapon: '⚔️ Weapon',
  shield: '🛡️ Shield',
  helm:   '⛑️ Helm',
  armor:  '🧥 Armor',
  ring:   '💍 Ring',
};

const SLOT_ORDER: (keyof EquipmentSlots)[] = ['weapon', 'shield', 'helm', 'armor', 'ring'];

const QUALITY_LABEL: Record<MaterialQuality, string> = {
  common:   'Common',
  uncommon: 'Uncommon',
  rare:     'Rare',
};

const QUALITY_COLOR: Record<MaterialQuality, string> = {
  common:   '#9a9a9a',
  uncommon: '#4ade80',
  rare:     '#60a5fa',
};

// ─── sub-components ─────────────────────────────────────────────────────────

function ItemCard({ item, onEquip, onUnequip, isEquipped }: {
  item: InventoryItem;
  onEquip?: () => void;
  onUnequip?: () => void;
  isEquipped?: boolean;
}) {
  const color = RARITY_COLORS[item.rarity];
  return (
    <div
      className="dragon-panel p-2 flex flex-col gap-1"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-cinzel font-bold text-[11px] truncate" style={{ color }}>
          {item.name}
        </span>
        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: `${color}20`, color }}>
          {item.rarity}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#9a8a6a]">⚡ {item.power} power</span>
        {isEquipped ? (
          <button
            onClick={onUnequip}
            className="text-[8px] font-bold px-1.5 py-0.5 rounded border border-[rgba(212,160,23,0.3)] text-[#d4a017] hover:bg-[rgba(212,160,23,0.1)] transition-colors"
          >
            UNEQUIP
          </button>
        ) : (
          onEquip && (
            <button
              onClick={onEquip}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${color}30`, color }}
            >
              EQUIP
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

type Section = 'expedition' | 'gear' | 'craft' | 'materials';

export default function ExpeditionTab() {
  const {
    state,
    startExpedition,
    claimExpedition,
    equipItem,
    unequipItem,
    craftItem,
    gearMultiplier,
    CRAFTING_RECIPES,
    ITEM_UNLOCK_LEVELS: unlockLevels,
  } = useGame();

  const [section, setSection] = useState<Section>('expedition');
  const [now, setNow] = useState(Date.now());
  const [claimed, setClaimed] = useState(false);

  // Live countdown
  useEffect(() => {
    if (!state.activeExpedition) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.activeExpedition]);

  // Reset claimed flag when new expedition starts
  useEffect(() => {
    if (state.activeExpedition) setClaimed(false);
  }, [state.activeExpedition]);

  const exp = state.activeExpedition;
  const result = state.lastExpeditionResult;
  const expDone = exp ? now >= exp.endsAt : false;
  const msLeft = exp ? Math.max(0, exp.endsAt - now) : 0;

  function handleClaim() {
    claimExpedition();
    setClaimed(true);
    setSection('expedition');
  }

  // ── SECTION: EXPEDITION ──────────────────────────────────────────────────

  const renderExpedition = () => (
    <div className="flex flex-col gap-3">
      {/* Gear power summary */}
      <div className="dragon-panel px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[#e8d8a8] text-[11px] font-bold tracking-wide">⚔️ Gear Multiplier</span>
          <span className="font-cinzel font-bold text-[#f0c040]">{gearMultiplier.toFixed(2)}×</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, ((gearMultiplier - 1) / 0.5) * 100)}%`,
              background: 'linear-gradient(90deg, #d4a017, #f0c040)',
            }}
          />
        </div>
        <p className="text-[9px] text-[#6b5a3a] mt-1">
          Equip better gear in the <span className="text-[#d4a017]">Gear</span> section to improve expedition yields.
        </p>
      </div>

      {/* Active expedition / launch */}
      {exp ? (
        <div className="dragon-panel px-3 py-4 flex flex-col items-center gap-3 text-center">
          <div className="text-3xl">🗺️</div>
          <p className="font-cinzel font-bold text-[#e8d8a8] text-sm">
            Fighter is on a {exp.durationHours}h expedition
          </p>
          {expDone ? (
            <>
              <p className="text-[#4ade80] font-bold text-xs tracking-wider">✓ EXPEDITION COMPLETE!</p>
              <button
                onClick={handleClaim}
                className="action-btn px-8 py-3 text-sm"
                style={{ animation: 'goldShimmerBtn 1.5s ease-in-out infinite' }}
              >
                ⚔️ CLAIM REWARDS
              </button>
            </>
          ) : (
            <>
              <div className="font-cinzel text-[#f0c040] text-2xl font-bold tabular-nums">
                {fmt(msLeft)}
              </div>
              <p className="text-[#6b5a3a] text-[10px]">Returns in {fmt(msLeft)}</p>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((now - exp.startedAt) / (exp.endsAt - exp.startedAt)) * 100)}%`,
                    background: 'linear-gradient(90deg, #d4a017, #f0c040)',
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2">
            🗺️ SEND ON EXPEDITION
          </p>
          <p className="text-[9px] text-[#6b5a3a] mb-3">
            Choose a duration. Longer expeditions yield more materials &amp; better quality drops.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([4, 8, 12] as const).map(h => (
              <button
                key={h}
                onClick={() => startExpedition(h)}
                className="action-btn flex flex-col items-center py-3 gap-1"
              >
                <span className="font-cinzel font-bold text-base">{h}h</span>
                <span className="text-[8px] opacity-70">
                  {h === 4 ? '1–3 mats' : h === 8 ? '2–5 mats' : '3–8 mats'}
                </span>
                <span className="text-[8px] opacity-70">
                  {h === 4 ? 'Common' : h === 8 ? 'Uncommon' : 'Rare'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Last result */}
      {claimed && result && (
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#4ade80] text-[11px] tracking-wider mb-2">
            ✓ LAST EXPEDITION RESULTS
          </p>
          <div className="flex gap-4 mb-2">
            <div className="text-center">
              <div className="text-[#f0c040] font-bold font-cinzel">{result.dragonsSlain}</div>
              <div className="text-[9px] text-[#6b5a3a]">🐉 Dragons</div>
            </div>
            <div className="text-center">
              <div className="text-[#f0c040] font-bold font-cinzel">{formatNumber(result.goldEarned)}</div>
              <div className="text-[9px] text-[#6b5a3a]">💰 Gold</div>
            </div>
            <div className="text-center">
              <div className="text-[#f0c040] font-bold font-cinzel">{result.materials.length}</div>
              <div className="text-[9px] text-[#6b5a3a]">🎒 Mats</div>
            </div>
          </div>
          {result.materials.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.materials.map((m, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: `${QUALITY_COLOR[m.quality]}20`, color: QUALITY_COLOR[m.quality] }}
                >
                  {MATERIAL_LABELS[m.type as MaterialType]} ×{m.quantity}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="dragon-panel px-3 py-2">
        <div className="flex justify-around text-center">
          <div>
            <div className="font-cinzel font-bold text-[#f0c040]">{state.totalExpeditions}</div>
            <div className="text-[9px] text-[#6b5a3a]">Expeditions</div>
          </div>
          <div>
            <div className="font-cinzel font-bold text-[#f0c040]">{formatNumber(state.totalDragonsSlain)}</div>
            <div className="text-[9px] text-[#6b5a3a]">Dragons Slain</div>
          </div>
          <div>
            <div className="font-cinzel font-bold text-[#f0c040]">{state.expeditionsToday}</div>
            <div className="text-[9px] text-[#6b5a3a]">Today</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── SECTION: GEAR ────────────────────────────────────────────────────────

  const renderGear = () => (
    <div className="flex flex-col gap-3">
      <div className="dragon-panel px-3 py-3">
        <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-3">
          ⚔️ EQUIPPED GEAR
        </p>
        <div className="flex flex-col gap-2">
          {SLOT_ORDER.map(slot => {
            const item = state.equipment[slot];
            const unlockLvl = ITEM_UNLOCK_LEVELS[slot as ItemType];
            const locked = state.level < unlockLvl;
            return (
              <div key={slot}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#9a8a6a] w-[70px] flex-shrink-0 font-bold">
                    {SLOT_LABELS[slot]}
                  </span>
                  {locked ? (
                    <div className="flex-1 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                      <span className="text-[10px] text-[#4a3a2a]">🔒 Unlocks at Lv {unlockLvl}</span>
                    </div>
                  ) : item ? (
                    <div className="flex-1">
                      <ItemCard item={item} isEquipped onUnequip={() => unequipItem(slot)} />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center px-2 py-1.5 rounded-lg border border-dashed border-[rgba(212,160,23,0.2)]">
                      <span className="text-[10px] text-[#4a3a2a] italic">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inventory */}
      {state.inventory.length > 0 && (
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2">
            🎒 INVENTORY ({state.inventory.length}/20)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {state.inventory.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                onEquip={() => equipItem(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {state.inventory.length === 0 && (
        <div className="dragon-panel px-3 py-4 text-center">
          <p className="text-[#6b5a3a] text-[11px]">No items in inventory.</p>
          <p className="text-[9px] text-[#4a3a2a] mt-1">Craft items in the Craft section.</p>
        </div>
      )}
    </div>
  );

  // ── SECTION: CRAFT ───────────────────────────────────────────────────────

  const renderCraft = () => (
    <div className="flex flex-col gap-2">
      <div className="dragon-panel px-3 py-2">
        <p className="text-[9px] text-[#6b5a3a]">
          Combine crafting materials + gold to forge equipment. Better quality materials produce higher rarity items.
        </p>
      </div>
      {CRAFTING_RECIPES.map(recipe => {
        const color = RARITY_COLORS[recipe.rarity];
        const canAffordGold = state.gold >= recipe.goldCost;
        const matsMet = recipe.materials.every(req => {
          const held = state.materials.find(m => m.type === req.type && m.quality === req.quality);
          return held && held.quantity >= req.quantity;
        });
        const canCraft = canAffordGold && matsMet;

        return (
          <div
            key={recipe.id}
            className="dragon-panel p-3"
            style={{ borderColor: `${color}30` }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-cinzel font-bold text-[12px]" style={{ color }}>
                    {recipe.name}
                  </span>
                  <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                    {recipe.rarity}
                  </span>
                </div>
                <p className="text-[9px] text-[#9a8a6a] mt-0.5">⚡ {recipe.power} power · {SLOT_LABELS[recipe.itemType as keyof EquipmentSlots]?.split(' ')[1]}</p>
              </div>
              <button
                onClick={() => craftItem(recipe.id)}
                disabled={!canCraft}
                className="action-btn px-3 py-1.5 text-[9px] flex-shrink-0"
                style={canCraft ? {} : { opacity: 0.4, cursor: 'not-allowed' }}
              >
                CRAFT
              </button>
            </div>

            {/* Materials required */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              {recipe.materials.map((req, i) => {
                const held = state.materials.find(m => m.type === req.type && m.quality === req.quality);
                const have = held?.quantity ?? 0;
                const ok = have >= req.quantity;
                return (
                  <span
                    key={i}
                    className="text-[8px] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: ok ? `${QUALITY_COLOR[req.quality]}20` : 'rgba(255,60,60,0.1)',
                      color: ok ? QUALITY_COLOR[req.quality] : '#f87171',
                    }}
                  >
                    {MATERIAL_LABELS[req.type as MaterialType]} ×{req.quantity}
                    <span className="opacity-60"> ({have}/{req.quantity})</span>
                  </span>
                );
              })}
            </div>

            {/* Gold cost */}
            <div className="flex items-center gap-1">
              <span className="coin-icon" style={{ width: 8, height: 8 }} />
              <span className={`text-[9px] font-bold ${canAffordGold ? 'text-[#b09a60]' : 'text-red-400'}`}>
                {formatNumber(recipe.goldCost)} gold
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── SECTION: MATERIALS ───────────────────────────────────────────────────

  const renderMaterials = () => {
    const byType: Record<string, { type: MaterialType; quality: MaterialQuality; quantity: number }[]> = {};
    for (const m of state.materials) {
      if (!byType[m.type]) byType[m.type] = [];
      byType[m.type].push(m);
    }

    return (
      <div className="flex flex-col gap-2">
        {state.materials.length === 0 ? (
          <div className="dragon-panel px-3 py-8 text-center">
            <p className="text-3xl mb-2">🎒</p>
            <p className="font-cinzel text-[#6b5a3a] text-sm">No materials yet</p>
            <p className="text-[9px] text-[#4a3a2a] mt-1">Send your fighter on expeditions to collect crafting materials.</p>
          </div>
        ) : (
          Object.entries(byType).map(([type, entries]) => (
            <div key={type} className="dragon-panel px-3 py-2.5">
              <p className="font-bold text-[11px] text-[#e8d8a8] mb-2">
                {MATERIAL_LABELS[type as MaterialType]}
              </p>
              <div className="flex flex-wrap gap-2">
                {entries.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{ background: `${QUALITY_COLOR[m.quality]}15` }}
                  >
                    <span className="text-[9px] font-bold" style={{ color: QUALITY_COLOR[m.quality] }}>
                      {QUALITY_LABEL[m.quality]}
                    </span>
                    <span className="font-cinzel font-bold text-[#f0c040] text-sm">×{m.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {state.materials.length > 0 && (
          <div className="dragon-panel px-3 py-2 text-center">
            <p className="text-[9px] text-[#6b5a3a]">
              Use materials in the <span className="text-[#d4a017] font-bold">Craft</span> section to forge equipment.
            </p>
          </div>
        )}
      </div>
    );
  };

  // ── TAB BAR + LAYOUT ─────────────────────────────────────────────────────

  const tabs: { id: Section; label: string; badge?: number }[] = [
    { id: 'expedition', label: '🗺️ Quest' },
    { id: 'gear',       label: '⚔️ Gear',  badge: state.inventory.length },
    { id: 'craft',      label: '🔨 Craft' },
    { id: 'materials',  label: '🎒 Mats',  badge: state.materials.reduce((n, m) => n + m.quantity, 0) },
  ];

  return (
    <div className="flex flex-col flex-1 pb-2 relative z-10 page-fade">
      {/* Inner tab bar */}
      <div className="sticky top-0 z-20 px-2 pt-2 pb-1" style={{ background: 'rgba(10,6,2,0.92)', backdropFilter: 'blur(8px)' }}>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className="relative flex-1 py-1.5 rounded-lg font-cinzel font-bold text-[9px] tracking-wider transition-all"
              style={{
                background: section === t.id ? 'rgba(212,160,23,0.15)' : 'rgba(255,255,255,0.03)',
                color: section === t.id ? '#f0c040' : '#4a3a2a',
                border: `1px solid ${section === t.id ? 'rgba(212,160,23,0.3)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#f0c040] text-[#1a0e00] text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Section content */}
      <div className="flex flex-col gap-2 px-2 pt-2">
        {section === 'expedition' && renderExpedition()}
        {section === 'gear'       && renderGear()}
        {section === 'craft'      && renderCraft()}
        {section === 'materials'  && renderMaterials()}
      </div>
    </div>
  );
}
