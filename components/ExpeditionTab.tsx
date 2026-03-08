'use client';

import React, { useState, useEffect } from 'react';
import {
  useGame,
  EquipmentSlots,
  InventoryItem,
  CraftingRecipe,
  RARITY_COLORS,
  RARITY_SCORES,
  MATERIAL_LABELS,
  ITEM_UNLOCK_LEVELS,
  ItemType,
  ItemRarity,
  MaterialType,
  calcGearBonus,
  EGG_CONFIG,
  DragonEgg,
  EggRarity,
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

type Section = 'expedition' | 'gear' | 'stash';

const EGG_RARITY_COLOR: Record<EggRarity, string> = {
  common: '#9a9a9a', uncommon: '#4ade80', rare: '#60a5fa', legendary: '#f0c040',
};
const EGG_EMOJI: Record<EggRarity, string> = {
  common: '🥚', uncommon: '🟢', rare: '💎', legendary: '✨',
};

export default function ExpeditionTab() {
  const {
    state,
    startExpedition,
    claimExpedition,
    equipItem,
    unequipItem,
    craftItem,
    speedUpExpedition,
    placeEggInIncubator,
    claimHatchedEgg,
    gearMultiplier,
    armyPower,
    CRAFTING_RECIPES,
    ITEM_UNLOCK_LEVELS: unlockLevels,
  } = useGame();

  const AD_VIDEOS = [
    '/images/testlynxadd.MOV',
    '/images/testlynxadd2.MOV',
    '/images/testlynxadd3.MOV',
    '/images/testlynxadd4.MOV',
  ];
  const [showAd, setShowAd] = React.useState(false);
  const [adWatched, setAdWatched] = React.useState(false);
  const [adVideoSrc, setAdVideoSrc] = React.useState(AD_VIDEOS[0]);
  const [eggNowMs, setEggNowMs] = React.useState(Date.now());
  // Egg incubator countdown ticker
  useEffect(() => {
    const id = setInterval(() => setEggNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

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
    if (state.activeExpedition) { setClaimed(false); }
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

  const renderExpedition = () => {
    const heroBonus = state.level * 0.5;
    const gearBonus = calcGearBonus(state.equipment);
    const totalPower = heroBonus + armyPower * 0.8 + gearBonus * 2;
    const estLow  = (h: number) => Math.max(1, Math.floor(totalPower * (h / 4) * 0.85));
    const estHigh = (h: number) => Math.max(1, Math.floor(totalPower * (h / 4) * 1.15));

    return (
    <div className="flex flex-col gap-3">
      {/* Combat power breakdown */}
      <div className="dragon-panel px-3 py-2.5">
        <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2">⚔️ COMBAT POWER</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[#9a8a6a] text-[10px]">🗡️ Hero (Lv {state.level})</span>
            <span className="font-cinzel font-bold text-[#f0c040] text-[11px]">+{heroBonus.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#9a8a6a] text-[10px]">🪖 Army ({armyPower} pwr)</span>
            <span className="font-cinzel font-bold text-[#ff8844] text-[11px]">+{(armyPower * 0.8).toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#9a8a6a] text-[10px]">⚔️ Gear ({gearBonus} pts)</span>
            <span className="font-cinzel font-bold text-[#60a5fa] text-[11px]">+{(gearBonus * 2).toFixed(1)}</span>
          </div>
          <div className="mt-1 pt-1 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <span className="text-[#e8d8a8] text-[10px] font-bold">Total</span>
            <span className="font-cinzel font-bold text-[#f0c040] text-sm">{totalPower.toFixed(1)}</span>
          </div>
        </div>
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
              {/* Watch ad to speed up */}
              {(() => {
                const reductionMins = Math.round(exp.durationHours * 60 * 0.25);
                const saveLabel = reductionMins >= 60
                  ? `${(reductionMins / 60).toFixed(1).replace('.0', '')}h`
                  : `${reductionMins}m`;
                const adsLeft = 2 - (state.adsUsedThisExpedition ?? 0);
                return adsLeft <= 0 ? (
                  <p className="mt-1 text-center text-[10px] text-[#6b5a3a]">No more boosts available for this expedition.</p>
                ) : (
                  <button
                    onClick={() => {
                      const pick = AD_VIDEOS[Math.floor(Math.random() * AD_VIDEOS.length)];
                      setAdVideoSrc(pick);
                      setAdWatched(false);
                      setShowAd(true);
                    }}
                    className="mt-1 w-full py-2 rounded-xl text-[11px] font-bold tracking-wide"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 0 12px rgba(168,85,247,0.4)' }}
                  >
                    ⚡ Speed Up ({adsLeft}/2 left) — save {saveLabel}
                  </button>
                );
              })()}
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
                className="action-btn flex flex-col items-center py-3 gap-0.5"
              >
                <span className="font-cinzel font-bold text-base">{h}h</span>
                <span className="text-[10px] opacity-80">
                  🐉 {estLow(h)}–{estHigh(h)}
                </span>
                <span className="text-[10px] opacity-60">
                  {h === 4 ? 'Common' : h === 8 ? 'Uncommon' : 'Rare'} mats
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Egg drop notification */}
      {claimed && result?.droppedEgg && (
        <div
          className="dragon-panel px-3 py-2.5 flex items-center gap-2"
          style={{ border: `1px solid ${EGG_RARITY_COLOR[result.droppedEgg.rarity]}40` }}
        >
          <span className="text-2xl">{EGG_EMOJI[result.droppedEgg.rarity]}</span>
          <div>
            <p className="font-cinzel font-bold text-[11px] tracking-wide"
              style={{ color: EGG_RARITY_COLOR[result.droppedEgg.rarity] }}>
              {result.droppedEgg.rarity.toUpperCase()} DRAGON EGG FOUND!
            </p>
            <p className="text-[#6b5a3a] text-[9px]">
              {EGG_CONFIG[result.droppedEgg.rarity].label} · Check Eggs tab to incubate
            </p>
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
                  style={{ background: 'rgba(212,160,23,0.15)', color: '#f0c040' }}
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
  };

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

  /** Returns true if player owns an item of the given type+rarity (inventory OR equipped) */
  function hasItem(itemType: ItemType, rarity: ItemRarity): boolean {
    const inInv = state.inventory.some(i => i.itemType === itemType && i.rarity === rarity);
    if (inInv) return true;
    const eq = state.equipment[itemType as keyof EquipmentSlots];
    return !!(eq && eq.rarity === rarity);
  }

  const renderCraft = () => {
    // Group recipes by slot in display order
    const bySlot: Record<string, CraftingRecipe[]> = {};
    for (const slot of SLOT_ORDER) {
      bySlot[slot] = CRAFTING_RECIPES.filter(r => r.itemType === slot);
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="dragon-panel px-3 py-2">
          <p className="text-[9px] text-[#6b5a3a]">
            Each item upgrades into the next tier. Forge T1 from scratch, then upgrade with expedition drops.
            <span className="text-[#d4a017]"> Upgrading consumes the previous item.</span>
          </p>
        </div>

        {SLOT_ORDER.map(slot => {
          const chain = bySlot[slot];
          // Find highest tier already owned
          const ownedTiers = chain.filter(r => hasItem(r.itemType as ItemType, r.rarity));
          const highestOwned = ownedTiers[ownedTiers.length - 1] ?? null;
          // Next recipe to craft/upgrade
          const nextIdx = highestOwned
            ? chain.findIndex(r => r.id === highestOwned.id) + 1
            : 0;
          const nextRecipe = chain[nextIdx] ?? null;

          return (
            <div key={slot} className="dragon-panel p-3">
              {/* Slot header */}
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-3">
                {SLOT_LABELS[slot]}
              </p>

              {/* Chain row */}
              <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
                {chain.map((recipe, idx) => {
                  const owned = hasItem(recipe.itemType as ItemType, recipe.rarity);
                  const isNext = idx === nextIdx;
                  const color = RARITY_COLORS[recipe.rarity];
                  return (
                    <React.Fragment key={recipe.id}>
                      <div
                        className="flex flex-col items-center gap-0.5 flex-shrink-0"
                        style={{ minWidth: 52 }}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-base border transition-all"
                          style={{
                            background: owned
                              ? `${color}25`
                              : isNext
                              ? 'rgba(255,255,255,0.05)'
                              : 'rgba(255,255,255,0.02)',
                            borderColor: owned
                              ? color
                              : isNext
                              ? `${color}50`
                              : 'rgba(255,255,255,0.06)',
                            opacity: !owned && !isNext ? 0.35 : 1,
                          }}
                        >
                          {owned ? '✓' : isNext ? '🔨' : '🔒'}
                        </div>
                        <span
                          className="text-[8px] font-bold text-center leading-tight"
                          style={{ color: owned ? color : isNext ? '#9a8a6a' : '#3a2a1a' }}
                        >
                          {recipe.name.split(' ')[0]}
                        </span>
                        <span className="text-[7px]" style={{ color: owned ? color : '#3a2a1a' }}>
                          ⚡{recipe.power}
                        </span>
                      </div>
                      {idx < chain.length - 1 && (
                        <span className="text-[#3a2a1a] text-xs flex-shrink-0">›</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Active recipe card */}
              {nextRecipe ? (() => {
                const color = RARITY_COLORS[nextRecipe.rarity];
                const isUpgrade = !!nextRecipe.upgradesFrom;
                const canAffordGold = state.gold >= nextRecipe.goldCost;
                const matsMet = nextRecipe.materials.every(req => {
                  const held = state.materials.find(m => m.type === req.type);
                  return held && held.quantity >= req.quantity;
                });
                const hasBaseItem = !isUpgrade || hasItem(
                  nextRecipe.upgradesFrom!.itemType,
                  nextRecipe.upgradesFrom!.rarity,
                );
                const canCraft = canAffordGold && matsMet && hasBaseItem;

                return (
                  <div
                    className="rounded-lg p-2.5 border"
                    style={{ background: `${color}08`, borderColor: `${color}30` }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-cinzel font-bold text-[11px]" style={{ color }}>
                            {nextRecipe.name}
                          </span>
                          <span
                            className="text-[7px] font-bold uppercase px-1 py-0.5 rounded"
                            style={{ background: `${color}20`, color }}
                          >
                            {nextRecipe.rarity}
                          </span>
                        </div>
                        <p className="text-[9px] text-[#9a8a6a] mt-0.5">
                          ⚡ {nextRecipe.power} power
                          {isUpgrade && (
                            <span className="text-[#d4a017]"> · consumes {nextRecipe.upgradesFrom!.rarity} {nextRecipe.upgradesFrom!.itemType}</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => craftItem(nextRecipe.id)}
                        disabled={!canCraft}
                        className="action-btn px-3 py-1.5 text-[9px] flex-shrink-0"
                        style={canCraft ? {} : { opacity: 0.4, cursor: 'not-allowed' }}
                      >
                        {isUpgrade ? '⬆ UPGRADE' : '⚒ FORGE'}
                      </button>
                    </div>

                    {/* Base item requirement */}
                    {isUpgrade && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <span
                          className="text-[8px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: hasBaseItem ? 'rgba(74,222,128,0.1)' : 'rgba(255,60,60,0.1)',
                            color: hasBaseItem ? '#4ade80' : '#f87171',
                          }}
                        >
                          {hasBaseItem ? '✓' : '✗'} Requires {nextRecipe.upgradesFrom!.rarity} {nextRecipe.upgradesFrom!.itemType}
                        </span>
                      </div>
                    )}

                    {/* Material requirements */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {nextRecipe.materials.map((req, i) => {
                        const held = state.materials.find(m => m.type === req.type);
                        const have = held?.quantity ?? 0;
                        const ok = have >= req.quantity;
                        return (
                          <span
                            key={i}
                            className="text-[8px] px-1.5 py-0.5 rounded-full"
                            style={{
                              background: ok ? 'rgba(74,222,128,0.12)' : 'rgba(255,60,60,0.1)',
                              color: ok ? '#4ade80' : '#f87171',
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
                        {formatNumber(nextRecipe.goldCost)} gold
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-2">
                  <span className="text-[10px] text-[#4ade80] font-bold">✓ Fully upgraded!</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── SECTION: MATERIALS ───────────────────────────────────────────────────

  const renderMaterials = () => {

    return (
      <div className="flex flex-col gap-2">
        {state.materials.length === 0 ? (
          <div className="dragon-panel px-3 py-8 text-center">
            <p className="text-3xl mb-2">🎒</p>
            <p className="font-cinzel text-[#6b5a3a] text-sm">No materials yet</p>
            <p className="text-[9px] text-[#4a3a2a] mt-1">Send your fighter on expeditions to collect crafting materials.</p>
          </div>
        ) : (
          <div className="dragon-panel px-3 py-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              {state.materials.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.18)' }}
                >
                  <span className="text-[10px] text-[#c8b87a]">{MATERIAL_LABELS[m.type]}</span>
                  <span className="font-cinzel font-bold text-[#f0c040] text-sm ml-2">×{m.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.materials.length > 0 && (
          <div className="dragon-panel px-3 py-2 text-center">
            <p className="text-[9px] text-[#6b5a3a]">
              Use materials in the <span className="text-[#d4a017] font-bold">Craft</span> section to forge equipment.
            </p>
          </div>
        )}

        {/* XRP Store moved to Shop tab */}
        <div className="dragon-panel px-3 py-2 text-center">
          <p className="text-[9px] text-[#6b5a3a]">Buy more materials in the <span className="text-[#d4a017] font-bold">Shop → XRP Store</span> tab.</p>
        </div>

      </div>
    );
  };

  // ── SECTION: EGGS ──────────────────────────────────────────────────────────

  const renderEggs = () => {
    const eggs = state.eggInventory ?? [];
    const incubator = state.incubator ?? [];
    const hatched = state.hatchedDragons ?? [];
    const nowMs = eggNowMs;
    function fmtLeft(ms: number) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    return (
      <div className="flex flex-col gap-3">
        {/* Incubator */}
        <div className="dragon-panel px-3 py-3">
          <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">🔥 INCUBATOR</p>
          {incubator.map((slot, i) => (
            <div key={i} className="mb-2 p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {slot.egg ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{EGG_EMOJI[slot.egg.rarity]}</span>
                  <div className="flex-1">
                    <p className="font-bold text-[10px]" style={{ color: EGG_RARITY_COLOR[slot.egg.rarity] }}>
                      {slot.egg.rarity.toUpperCase()} EGG
                    </p>
                    <p className="text-[#6b5a3a] text-[9px]">{EGG_CONFIG[slot.egg.rarity].label}</p>
                  </div>
                  {slot.endsAt && nowMs >= slot.endsAt ? (
                    <button
                      onClick={() => claimHatchedEgg(i)}
                      className="action-btn px-3 py-1.5 text-[10px]"
                      style={{ animation: 'goldShimmerBtn 1.5s ease-in-out infinite' }}
                    >🐉 Claim!</button>
                  ) : (
                    <p className="text-[#f0c040] font-bold text-[10px]">
                      {slot.endsAt ? fmtLeft(slot.endsAt - eggNowMs) : '…'}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-[#4a3a2a] text-[9px] mb-1.5">Empty slot — place an egg to incubate</p>
                  <div className="flex flex-wrap gap-1">
                    {eggs.map(egg => (
                      <button
                        key={egg.id}
                        onClick={() => placeEggInIncubator(egg.id, i)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95"
                        style={{ background: 'rgba(212,160,23,0.08)', border: `1px solid ${EGG_RARITY_COLOR[egg.rarity]}40`, color: EGG_RARITY_COLOR[egg.rarity] }}
                      >
                        {EGG_EMOJI[egg.rarity]} {egg.rarity}
                      </button>
                    ))}
                    {eggs.length === 0 && (
                      <p className="text-[#4a3a2a] text-[8px]">No eggs — complete expeditions to find them</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Egg inventory */}
        {eggs.length > 0 && (
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">🥚 EGG INVENTORY</p>
            <div className="flex flex-wrap gap-1.5">
              {eggs.map(egg => (
                <div key={egg.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${EGG_RARITY_COLOR[egg.rarity]}30` }}>
                  <span>{EGG_EMOJI[egg.rarity]}</span>
                  <div>
                    <p className="text-[9px] font-bold" style={{ color: EGG_RARITY_COLOR[egg.rarity] }}>{egg.rarity}</p>
                    <p className="text-[8px] text-[#6b5a3a]">{EGG_CONFIG[egg.rarity].label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hatched dragons */}
        {hatched.length > 0 && (
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">🐉 ACTIVE DRAGON BONUSES</p>
            <div className="flex flex-col gap-1.5">
              {hatched.map(d => (
                <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${EGG_RARITY_COLOR[d.rarity]}30` }}>
                  <span className="text-lg">🐉</span>
                  <div>
                    <p className="text-[9px] font-bold" style={{ color: EGG_RARITY_COLOR[d.rarity] }}>
                      {d.rarity.toUpperCase()} DRAGON
                    </p>
                    <p className="text-[#4ade80] text-[9px] font-bold">{EGG_CONFIG[d.rarity].label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {eggs.length === 0 && hatched.length === 0 && incubator.every(s => !s.egg) && (
          <div className="dragon-panel px-3 py-6 text-center">
            <p className="text-3xl mb-2">🥚</p>
            <p className="font-cinzel font-bold text-[#6b5a3a] text-sm">No eggs yet</p>
            <p className="text-[#4a3a2a] text-[9px] mt-1">Dragon eggs drop rarely from expeditions — longer expeditions have higher odds</p>
          </div>
        )}
      </div>
    );
  };

  // ── TAB BAR + LAYOUT ─────────────────────────────────────────────────────

  const eggCount = state.eggInventory?.length || 0;
  const hatchReady = (state.incubator ?? []).some(s => s.egg && s.endsAt && Date.now() >= s.endsAt);
  const stashBadge = state.materials.reduce((n, m) => n + m.quantity, 0) + eggCount;
  const tabs: { id: Section; label: string; badge?: number; amber?: boolean }[] = [
    { id: 'expedition', label: '🗺️ Quest' },
    { id: 'gear',       label: '⚔️ Gear',   badge: state.inventory.length },
    { id: 'stash',      label: '🎒 Stash',  badge: stashBadge, amber: eggCount > 0 || hatchReady },
  ];

  return (
    <div className="flex flex-col flex-1 pb-2 relative z-10 page-fade">

      {/* ── Video Ad Modal ─────────────────────────────────────────────── */}
      {showAd && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.97)' }}
        >
          {/* Header */}
          <div className="w-full flex items-center justify-between px-4 py-2"
               style={{ background: 'rgba(0,0,0,0.6)' }}>
            <p className="font-cinzel text-[#f0c040] text-[11px] font-bold tracking-widest">
              ⚡ WATCH TO COMPLETE EXPEDITION
            </p>
            {adWatched && (
              <button
                onClick={() => {
                  const reductionMs = (exp?.durationHours ?? 4) * 3600 * 1000 * 0.25;
                  speedUpExpedition(reductionMs);
                  setShowAd(false);
                }}
                className="text-[#6b5a3a] text-lg leading-none px-2"
              >✕</button>
            )}
          </div>

          {/* Video */}
          <video
            key={adVideoSrc}
            src={adVideoSrc}
            autoPlay
            playsInline
            className="w-full max-h-[75vh] object-contain"
            onEnded={() => setAdWatched(true)}
            style={{ pointerEvents: 'none' }}
          />

          {/* Footer */}
          <div className="w-full px-4 py-3 flex flex-col items-center gap-2"
               style={{ background: 'rgba(0,0,0,0.6)' }}>
            {!adWatched ? (
              <p className="text-[#6b5a3a] text-[10px]">Watch the full video to unlock your reward…</p>
            ) : (
              <>
                <p className="text-[#4ade80] font-bold text-[11px] tracking-wider">✅ Expedition complete! Claim your rewards.</p>
                <button
                  onClick={() => {
                    const reductionMs = (exp?.durationHours ?? 4) * 3600 * 1000 * 0.25;
                    speedUpExpedition(reductionMs);
                    setShowAd(false);
                  }}
                  className="action-btn px-8 py-2.5 text-sm"
                  style={{ animation: 'goldShimmerBtn 1.5s ease-in-out infinite' }}
                >
                  ⚔️ Claim Boost
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
                <span
                  className="absolute -top-1 -right-1 text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center"
                  style={{
                    background: t.amber ? '#f97316' : '#f0c040',
                    color: '#1a0e00',
                  }}
                >
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
        {section === 'gear' && (
          <>
            {renderGear()}
            <div className="mt-1 px-1">
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider mb-2">🔨 FORGE EQUIPMENT</p>
            </div>
            {renderCraft()}
          </>
        )}
        {section === 'stash' && (
          <>
            {renderMaterials()}
            <div className="mt-2 px-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🐉</span>
                <p className="font-cinzel font-bold text-[#f0c040] text-sm tracking-wider">DRAGON DEN</p>
                {(eggCount > 0 || hatchReady) && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black"
                    style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)' }}>
                    {hatchReady ? '🔥 READY TO HATCH' : `${eggCount} egg${eggCount !== 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
            </div>
            {renderEggs()}
          </>
        )}
      </div>
    </div>
  );
}
