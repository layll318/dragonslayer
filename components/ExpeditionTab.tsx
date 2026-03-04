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
  MaterialQuality,
  calcGearBonus,
  calcArmyPower,
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
    addMaterials,
    speedUpExpedition,
    gearMultiplier,
    armyPower,
    CRAFTING_RECIPES,
    ITEM_UNLOCK_LEVELS: unlockLevels,
  } = useGame();

  const [buyStatus, setBuyStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [buyMsg, setBuyMsg] = React.useState('');
  const [txHash, setTxHash] = React.useState('');
  const [txType, setTxType] = React.useState<MaterialType | ''>('');
  const [txStatus, setTxStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [txMsg, setTxMsg] = React.useState('');
  const [walletCopied, setWalletCopied] = React.useState(false);
  const [showAd, setShowAd] = React.useState(false);
  const [adWatched, setAdWatched] = React.useState(false);
  const USED_TX_KEY = 'ds_used_tx_hashes';
  const TREASURY = 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';

  function copyTreasury() {
    navigator.clipboard.writeText(TREASURY).then(() => {
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    });
  }

  // ── Pending-purchase recovery ─────────────────────────────────────────────
  const PENDING_KEY = 'ds_pending_mat_purchase';

  const creditPendingPurchase = React.useCallback(async (silent = false) => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    let pending: { uuid: string; memo: string; typeOrBundle: string; ts: number };
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_KEY); return; }

    // Expire after 15 minutes
    if (Date.now() - pending.ts > 15 * 60 * 1000) {
      localStorage.removeItem(PENDING_KEY);
      if (!silent) { setBuyMsg('Payment window expired. Please try again.'); setBuyStatus('error'); }
      return;
    }

    if (!silent) setBuyMsg('⏳ Checking payment status…');
    try {
      const sr = await fetch(`/frontend-api/materials/status/${pending.uuid}`);
      const status = await sr.json();
      console.log('[XRP shop] status check:', status);

      if (status.cancelled || status.expired) {
        localStorage.removeItem(PENDING_KEY);
        setBuyMsg('Payment cancelled or expired.'); setBuyStatus('error'); return;
      }
      if (!status.signed) {
        if (!silent) setBuyMsg('⏳ Not paid yet — complete it in Xaman.');
        return;
      }

      // Payment confirmed — build credit list
      const memo: string = status.memo || pending.memo || '';
      const allTypes: MaterialType[] = ['dragon_scale','fire_crystal','iron_ore','bone_shard','ancient_rune'];
      let drops: { type: MaterialType; quality: MaterialQuality; quantity: number }[] = [];
      if (memo.startsWith('bundle')) {
        drops = allTypes.map(t => ({ type: t, quality: 'common' as MaterialQuality, quantity: 3 }));
      } else if (memo.startsWith('single:')) {
        const [, mt, q] = memo.split(':');
        if (allTypes.includes(mt as MaterialType))
          drops = [{ type: mt as MaterialType, quality: 'common', quantity: parseInt(q || '3', 10) }];
      }
      if (drops.length === 0) {
        const t = pending.typeOrBundle as MaterialType | 'bundle';
        drops = t === 'bundle'
          ? allTypes.map(t2 => ({ type: t2, quality: 'common' as MaterialQuality, quantity: 3 }))
          : [{ type: t as MaterialType, quality: 'common', quantity: 3 }];
      }
      console.log('[XRP shop] crediting:', drops);
      addMaterials(drops);
      localStorage.removeItem(PENDING_KEY);

      // Best-effort backend persist
      if (state.playerId) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
        if (apiUrl) fetch(`${apiUrl}/api/items/buy-materials`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: state.playerId, xaman_payload_uuid: pending.uuid }),
        }).catch(() => {});
      }

      const label = pending.typeOrBundle === 'bundle' ? '15 materials (3 of each)' : `3× ${pending.typeOrBundle.replace('_',' ')}`;
      setBuyMsg(`✅ Credited: ${label}`);
      setBuyStatus('done');
    } catch (e) {
      console.error('[XRP shop] status check failed:', e);
      if (!silent) setBuyMsg('Network error checking payment. Try tapping check again.');
    }
  }, [addMaterials, state.playerId]);

  // On mount: recover any pending purchase
  useEffect(() => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      setBuyStatus('loading');
      creditPendingPurchase(false);
    }
  }, [creditPendingPurchase]);

  // On visibilitychange (user returns from Xaman): check again
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && localStorage.getItem(PENDING_KEY)) {
        setBuyStatus('loading');
        creditPendingPurchase(false);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [creditPendingPurchase]);

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
              {/* Watch ad to complete */}
              <button
                onClick={() => { setAdWatched(false); setShowAd(true); }}
                className="mt-1 w-full py-2 rounded-xl text-[11px] font-bold tracking-wide transition-opacity"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 0 12px rgba(168,85,247,0.4)' }}
              >
                ⚡ Watch Ad → Complete Now
              </button>
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
                <span className="text-[8px] opacity-80">
                  🐉 {estLow(h)}–{estHigh(h)}
                </span>
                <span className="text-[8px] opacity-60">
                  {h === 4 ? 'Common' : h === 8 ? 'Uncommon' : 'Rare'} mats
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
                  const held = state.materials.find(m => m.type === req.type && m.quality === req.quality);
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

        {/* XRP Material Shop */}
        <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2">
              � XRP MATERIAL SHOP
            </p>

            {/* Treasury wallet — send XRP here */}
            <div className="rounded-lg px-2 py-2 mb-3" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(212,160,23,0.25)' }}>
              <p className="text-[8px] text-[#6b5a3a] mb-1">Send XRP to this wallet:</p>
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-[9px] text-[#f0c040] flex-1 break-all leading-snug">{TREASURY}</p>
                <button
                  onClick={copyTreasury}
                  className="shrink-0 px-2 py-1 rounded text-[9px] font-bold transition-colors"
                  style={{
                    background: walletCopied ? 'rgba(74,222,128,0.2)' : 'rgba(212,160,23,0.15)',
                    border: `1px solid ${walletCopied ? 'rgba(74,222,128,0.5)' : 'rgba(212,160,23,0.3)'}`,
                    color: walletCopied ? '#4ade80' : '#f0c040',
                  }}
                >
                  {walletCopied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
              <p className="text-[7px] text-[#4a3a2a] mt-1">1 XRP = 3× one type · 3 XRP = 3× all 5 types · then claim below with TX hash</p>
            </div>

            {/* Single type Xaman-pay buttons */}
            {state.walletAddress && (
              <p className="text-[8px] text-[#6b5a3a] mb-1">Or pay via Xaman (wallet connected):</p>
            )}

            {/* Single type buttons */}
            <div className="grid grid-cols-5 gap-1 mb-2">
              {(['dragon_scale','fire_crystal','iron_ore','bone_shard','ancient_rune'] as MaterialType[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleBuyMaterial(t)}
                  disabled={buyStatus === 'loading' || !state.walletAddress}
                  className="flex flex-col items-center py-1.5 px-1 rounded-lg transition-opacity"
                  style={{
                    background: 'rgba(212,160,23,0.08)',
                    border: '1px solid rgba(212,160,23,0.2)',
                    opacity: (buyStatus === 'loading' || !state.walletAddress) ? 0.4 : 1,
                  }}
                >
                  <span className="text-base leading-none">{MATERIAL_LABELS[t].split(' ')[0]}</span>
                  <span className="text-[7px] text-[#f0c040] font-bold mt-0.5">1 XRP</span>
                  <span className="text-[6px] text-[#6b5a3a]">×3</span>
                </button>
              ))}
            </div>

            {/* Bundle */}
            <button
              onClick={() => handleBuyMaterial('bundle')}
              disabled={buyStatus === 'loading' || !state.walletAddress}
              className="action-btn w-full py-2 text-[10px]"
              style={{ opacity: !state.walletAddress ? 0.4 : 1 }}
            >
              🎒 All 5 Types ×3 — 3 XRP
            </button>

            {/* Check pending Xaman payment manually */}
            {!buyMsg && localStorage.getItem(PENDING_KEY) && (
              <button
                onClick={() => creditPendingPurchase(false)}
                className="w-full mt-1.5 text-[9px] text-[#d4a017] underline text-center"
              >I already paid — check my Xaman payment</button>
            )}

            {buyMsg && (
              <p className={`text-[9px] mt-1.5 text-center ${buyStatus === 'error' ? 'text-red-400' : buyStatus === 'done' ? 'text-[#4ade80]' : 'text-[#f0c040]'}`}>
                {buyMsg}
              </p>
            )}
            {buyStatus === 'loading' && (
              <button
                onClick={() => { setBuyStatus('idle'); setBuyMsg(''); }}
                className="w-full mt-1.5 text-[9px] text-[#6b5a3a] underline text-center"
              >
                Cancel / I closed Xaman
              </button>
            )}

            {/* ── TX Hash Claim ── */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(212,160,23,0.15)' }}>
              <p className="font-cinzel text-[#e8d8a8] text-[10px] font-bold mb-1">Already sent XRP? Claim with TX hash</p>
              <p className="text-[8px] text-[#6b5a3a] mb-2">Any wallet — paste the TX hash from xrpscan.com or your wallet.</p>
              <input
                type="text"
                placeholder="e.g. A1B2C3D4E5F6..."
                value={txHash}
                onChange={e => setTxHash(e.target.value.trim())}
                className="w-full px-2 py-1.5 rounded-lg text-[10px] text-[#f0e8d0] mb-2"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,160,23,0.25)', outline: 'none' }}
              />
              <p className="text-[8px] text-[#6b5a3a] mb-1">1 XRP = pick a type below · 3 XRP = all 5 types automatically</p>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {(['dragon_scale','fire_crystal','iron_ore','bone_shard','ancient_rune'] as MaterialType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTxType(prev => prev === t ? '' : t)}
                    className="flex flex-col items-center py-1 px-1 rounded-lg transition-all"
                    style={{
                      background: txType === t ? 'rgba(212,160,23,0.3)' : 'rgba(212,160,23,0.06)',
                      border: `1px solid ${txType === t ? 'rgba(212,160,23,0.7)' : 'rgba(212,160,23,0.15)'}`,
                    }}
                  >
                    <span className="text-sm leading-none">{MATERIAL_LABELS[t].split(' ')[0]}</span>
                    <span className="text-[6px] text-[#6b5a3a] mt-0.5">{MATERIAL_LABELS[t].split(' ').slice(1).join(' ')}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleClaimByTxHash}
                disabled={txStatus === 'loading' || txHash.length < 60}
                className="action-btn w-full py-2 text-[10px]"
                style={{ opacity: txHash.length < 60 ? 0.5 : 1 }}
              >
                {txStatus === 'loading' ? '⏳ Verifying…' : '✅ Claim Materials'}
              </button>
              {txMsg && (
                <p className={`text-[9px] mt-1.5 text-center ${txStatus === 'error' ? 'text-red-400' : 'text-[#4ade80]'}`}>
                  {txMsg}
                </p>
              )}
            </div>
        </div>
      </div>
    );
  };

  async function handleBuyMaterial(typeOrBundle: MaterialType | 'bundle') {
    if (!state.walletAddress) return;
    setBuyStatus('loading');
    setBuyMsg('Opening Xaman…');
    try {
      const res = await fetch('/frontend-api/materials/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typeOrBundle, wallet: state.walletAddress }),
      });
      const data = await res.json();
      console.log('[XRP shop] payload created:', data);
      if (!data.deeplink || !data.uuid) {
        setBuyMsg(data.error || 'Failed to create payment.');
        setBuyStatus('error');
        return;
      }

      // Save to localStorage BEFORE opening Xaman so it survives app switching
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        uuid: data.uuid,
        memo: data.memo ?? `single:${typeOrBundle}:3`,
        typeOrBundle: String(typeOrBundle),
        ts: Date.now(),
      }));

      window.open(data.deeplink, '_blank');
      setBuyMsg('⏳ Pay in Xaman, then return here. We\'ll detect it automatically.');

      // Also try an immediate check after a short delay (desktop case)
      setTimeout(() => creditPendingPurchase(true), 6000);
    } catch (e) {
      console.error('[XRP shop] create payload error:', e);
      setBuyMsg('Network error — try again.');
      setBuyStatus('error');
    }
  }

  async function handleClaimByTxHash() {
    const hash = txHash.trim().toUpperCase();
    if (hash.length < 60) { setTxMsg('Paste a valid TX hash.'); setTxStatus('error'); return; }

    // Client-side dedup
    const usedRaw = localStorage.getItem(USED_TX_KEY);
    const used: string[] = usedRaw ? JSON.parse(usedRaw) : [];
    if (used.includes(hash)) {
      setTxMsg('This TX hash has already been claimed on this device.');
      setTxStatus('error');
      return;
    }

    setTxStatus('loading');
    setTxMsg('');
    try {
      const res = await fetch('/frontend-api/materials/verify-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, type: txType || undefined }),
      });
      const data = await res.json();
      console.log('[verify-tx] response:', data);

      if (!data.success) {
        setTxMsg(data.error || 'Verification failed.');
        setTxStatus('error');
        return;
      }

      // Credit materials
      addMaterials(data.credits);

      // Mark hash as used on this device
      used.push(hash);
      localStorage.setItem(USED_TX_KEY, JSON.stringify(used));

      // Best-effort backend persist
      if (state.playerId) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
        if (apiUrl) fetch(`${apiUrl}/api/items/buy-materials`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: state.playerId, xaman_payload_uuid: hash }),
        }).catch(() => {});
      }

      const label = data.credits.length > 1
        ? `${data.credits.length * data.credits[0].quantity} materials (3 of each type)`
        : `3× ${(data.credits[0].type as string).replace('_', ' ')}`;
      setTxMsg(`✅ Credited: ${label}`);
      setTxStatus('done');
      setTxHash('');
      setTxType('');
    } catch (e) {
      console.error('[verify-tx] error:', e);
      setTxMsg('Network error — try again.');
      setTxStatus('error');
    }
  }

  // ── TAB BAR + LAYOUT ─────────────────────────────────────────────────────

  const tabs: { id: Section; label: string; badge?: number }[] = [
    { id: 'expedition', label: '🗺️ Quest' },
    { id: 'gear',       label: '⚔️ Gear',  badge: state.inventory.length },
    { id: 'craft',      label: '🔨 Craft' },
    { id: 'materials',  label: '🎒 Mats',  badge: state.materials.reduce((n, m) => n + m.quantity, 0) },
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
                onClick={() => setShowAd(false)}
                className="text-[#6b5a3a] text-lg leading-none px-2"
              >✕</button>
            )}
          </div>

          {/* Video */}
          <video
            key="ad-video"
            src="/images/testlynxadd.MOV"
            autoPlay
            playsInline
            className="w-full max-h-[75vh] object-contain"
            onEnded={() => {
              setAdWatched(true);
              speedUpExpedition();
            }}
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
                  onClick={() => setShowAd(false)}
                  className="action-btn px-8 py-2.5 text-sm"
                  style={{ animation: 'goldShimmerBtn 1.5s ease-in-out infinite' }}
                >
                  ⚔️ Claim Now
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
