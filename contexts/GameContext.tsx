'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================================
// TYPES
// ============================================================

export type MaterialType = 'dragon_scale' | 'fire_crystal' | 'iron_ore' | 'bone_shard' | 'ancient_rune' | 'lynx_fang' | 'nomic_core';
export type EggRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type DragonBonusType = 'tap_gold_pct' | 'army_power_flat' | 'material_drop_pct' | 'expedition_time_pct';

export interface DragonEgg {
  id: string;
  rarity: EggRarity;
  variantName: string;
  hatchHours: number;
  bonusType: DragonBonusType;
  bonusValue: number;
}

export interface IncubatorSlot {
  egg: DragonEgg | null;
  startedAt: number | null;
  endsAt: number | null;
  isPermanent?: boolean;
}

export interface TokenDiscount {
  lynx: boolean;
  lynxBalance: number;
  xrpnomics: boolean;
  xrpnomicsBalance: number;
  dragonslayer: boolean;
  dragonslayerBalance: number;
  pct: number;
  checkedAt: number;
}

export type MerchantDealType = 'materials' | 'egg' | 'gold_boost' | 'speedup';

export interface MerchantDeal {
  id: string;
  icon: string;
  title: string;
  desc: string;
  goldCost: number;
  purchased: boolean;
  type: MerchantDealType;
  payload: {
    materials?: { type: MaterialType; quantity: number }[];
    egg?: EggRarity;
    goldPct?: number;  // bonus gold tap % for rest of day
  };
}

export interface HatchedDragon {
  id: string;
  rarity: EggRarity;
  variantName: string;
  bonusType: DragonBonusType;
  bonusValue: number;
  hatchedAt: number;
}

export interface DefenseLogEntry {
  attackerName: string;
  trophiesLost: number;
  trophiesWon: number;
  goldLost: number;
  result: 'win' | 'loss';
  ts: number;
}
export type ItemType = 'weapon' | 'shield' | 'helm' | 'armor' | 'ring';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Material {
  type: MaterialType;
  quantity: number;
}

export interface InventoryItem {
  id: string;
  itemType: ItemType;
  name: string;
  rarity: ItemRarity;
  power: number;
  nftTokenId: string | null;
  obtainedVia: 'crafted' | 'expedition_drop';
  obtainedAt: number;
}

export type EquipmentSlots = {
  weapon: InventoryItem | null;
  shield: InventoryItem | null;
  helm:   InventoryItem | null;
  armor:  InventoryItem | null;
  ring:   InventoryItem | null;
};

export interface ActiveExpedition {
  startedAt: number;
  durationHours: 4 | 8 | 12;
  endsAt: number;
}

export interface ExpeditionResult {
  dragonsSlain: number;
  goldEarned: number;
  materials: Material[];
  droppedEgg?: DragonEgg;
}

export interface DungeonRewards {
  goldEarned: number;
  xpEarned: number;
  materials: { type: MaterialType; quantity: number }[];
  egg: DragonEgg | null;
}

export interface CraftingRecipe {
  id: string;
  itemType: ItemType;
  name: string;
  rarity: ItemRarity;
  power: number;
  goldCost: number;
  materials: { type: MaterialType; quantity: number }[];
  /** If set, the craft consumes an owned item of this type+rarity (the "old" item) */
  upgradesFrom?: { itemType: ItemType; rarity: ItemRarity };
}

export interface Building {
  id: string;
  name: string;
  description: string;
  icon: string;
  baseCost: number;
  baseIncome: number;
  costMultiplier: number;
  unlockLevel: number;
  owned: number;
  armyPower: number;
  defensePower: number;
}

export interface DailyQuest {
  id: string;
  type: 'tap_gold' | 'buy_buildings' | 'complete_expedition';
  description: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

export interface GameState {
  gold: number;
  totalGoldEarned: number;
  totalTaps: number;
  totalDragonsSlain: number;
  totalExpeditions: number;
  level: number;
  xp: number;
  xpToNext: number;
  buildings: Building[];
  equipment: EquipmentSlots;
  inventory: InventoryItem[];
  materials: Material[];
  activeExpedition: ActiveExpedition | null;
  lastExpeditionResult: ExpeditionResult | null;
  lastTick: number;
  createdAt: number;
  // Login bonus
  loginStreak: number;
  lastLoginDate: string;
  loginBonusPending: boolean;
  // Daily quests
  dailyQuests: DailyQuest[];
  questDate: string;
  tapGoldToday: number;
  buildingsBoughtToday: number;
  expeditionsToday: number;
  adsUsedThisExpedition: number;
  // Last tap result
  lastTapEarned: number;
  lastTapCrit: boolean;
  // Dragon Eggs
  eggInventory: DragonEgg[];
  incubator: IncubatorSlot[];
  hatchedDragons: HatchedDragon[];
  // Travelling Merchant
  merchantDeals: MerchantDeal[];
  merchantExpiresAt: number | null;
  merchantLastDate: string;
  questFormulaVersion?: string;
  // Arena PvP
  arenaAttacksToday: number;
  arenaPoints: number;
  arenaLastReset: string;
  trophies: number;
  seasonMonth: string;
  defenseLog: DefenseLogEntry[];
  defenseLogSeen: number;
  // Holder daily gift (token holders only)
  holderGiftStreak: number;
  holderGiftLastDate: string;
  holderGiftPending: boolean;
  // Identity / server sync
  playerId: number | null;
  walletAddress: string | null;
  isSynced: boolean;
  displayName: string | null;
  // Token discount
  tokenDiscount: TokenDiscount | null;
  dungeonAttemptsToday: number;
  dungeonLastRaidDate: string;
  dungeonCooldownUntil: number;
  dungeonTotalVictories: number;
  dungeonBestCompletion: Record<string, number>;
}

interface GameContextType {
  state: GameState;
  tap: (comboMult?: number) => void;
  claimLoginBonus: () => void;
  claimQuest: (id: string) => void;
  buyBuilding: (id: string, qty?: number) => void;
  startExpedition: (hours: 4 | 8 | 12) => void;
  claimExpedition: () => void;
  speedUpExpedition: (reductionMs: number) => void;
  placeEggInIncubator: (eggId: string, slotIndex: number) => void;
  claimHatchedEgg: (slotIndex: number) => void;
  buyFromMerchant: (dealId: string) => void;
  addEggs: (eggs: Omit<DragonEgg, 'id'>[]) => void;
  addGold: (amount: number) => void;
  dragonBonuses: { tapGoldPct: number; armyPowerFlat: number; materialDropPct: number; expeditionTimePct: number };
  equipItem: (itemId: string) => void;
  unequipItem: (slot: keyof EquipmentSlots) => void;
  craftItem: (recipeId: string) => void;
  addMaterials: (drops: { type: MaterialType; quantity: number }[]) => void;
  connectWallet: (address: string) => Promise<void>;
  disconnectWallet: () => void;
  setDisplayName: (name: string) => Promise<void>;
  forceSave: () => Promise<void>;
  addIncubatorSlot: () => void;
  refreshTokenDiscount: () => Promise<void>;
  goldPerTap: number;
  goldPerHour: number;
  gearMultiplier: number;
  armyPower: number;
  getBuildingCost: (building: Building) => number;
  canAfford: (cost: number) => boolean;
  getCharacterTier: () => number;
  recordBotBattle: (win: boolean, goldStolen: number, botTier?: 'easy' | 'hard') => void;
  recordPvpBattle: (win: boolean, goldStolen: number, newTrophies: number) => void;
  markDefenseLogSeen: () => void;
  recordDungeonRaid: (outcome: 'victory' | 'partial' | 'defeat', rewards: DungeonRewards) => void;
  recordDungeonRun: (tier: number, roomsCleared: number, won: boolean, goldEarned: number, xpEarned: number, materials: { type: MaterialType; quantity: number }[], tokensHeld: number) => void;
  resetArenaAttacks: () => void;
  claimHolderGift: () => void;
  setItemNftTokenId: (itemId: string, tokenId: string) => void;
  refreshFromServer: () => Promise<void>;
  CRAFTING_RECIPES: CraftingRecipe[];
  ITEM_UNLOCK_LEVELS: Record<ItemType, number>;
}

// ============================================================
// CONSTANTS
// ============================================================

export const RARITY_SCORES: Record<ItemRarity, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common:    '#9a9a9a',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#f0c040',
};

export const ITEM_UNLOCK_LEVELS: Record<ItemType, number> = {
  weapon: 1, shield: 1, helm: 3, armor: 6, ring: 10,
};

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  dragon_scale: '🐉 Dragon Scale',
  fire_crystal:  '🔥 Fire Crystal',
  iron_ore:      '⚙️ Iron Ore',
  bone_shard:    '🦴 Bone Shard',
  ancient_rune:  '✨ Ancient Rune',
  lynx_fang:     '🐾 Lynx Fang',
  nomic_core:    '🔮 Nomic Core',
};

// ── Upgrade chains: T1(common) → T2(uncommon) → T3(rare) → T4(epic) ──────────
// T1 = forge from scratch with common drops (no base item needed)
// T2–T4 = consume previous tier item + drops
export const CRAFTING_RECIPES: CraftingRecipe[] = [

  // ── WEAPON ──────────────────────────────────────────────────────────────────
  {
    id: 'iron_sword', itemType: 'weapon', name: 'Iron Sword', rarity: 'common', power: 5, goldCost: 300,
    materials: [{ type: 'iron_ore', quantity: 3 }, { type: 'bone_shard', quantity: 2 }],
  },
  {
    id: 'steel_sword', itemType: 'weapon', name: 'Steel Sword', rarity: 'uncommon', power: 10, goldCost: 800,
    upgradesFrom: { itemType: 'weapon', rarity: 'common' },
    materials: [{ type: 'iron_ore', quantity: 4 }, { type: 'dragon_scale', quantity: 3 }],
  },
  {
    id: 'flame_blade', itemType: 'weapon', name: 'Flame Blade', rarity: 'rare', power: 18, goldCost: 2000,
    upgradesFrom: { itemType: 'weapon', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quantity: 4 }, { type: 'dragon_scale', quantity: 4 }],
  },
  {
    id: 'dragon_fang', itemType: 'weapon', name: 'Dragon Fang', rarity: 'epic', power: 30, goldCost: 6000,
    upgradesFrom: { itemType: 'weapon', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quantity: 5 }, { type: 'ancient_rune', quantity: 3 }],
  },

  // ── SHIELD ──────────────────────────────────────────────────────────────────
  {
    id: 'oak_shield', itemType: 'shield', name: 'Oak Shield', rarity: 'common', power: 4, goldCost: 250,
    materials: [{ type: 'iron_ore', quantity: 3 }, { type: 'bone_shard', quantity: 2 }],
  },
  {
    id: 'iron_shield', itemType: 'shield', name: 'Iron Shield', rarity: 'uncommon', power: 9, goldCost: 700,
    upgradesFrom: { itemType: 'shield', rarity: 'common' },
    materials: [{ type: 'iron_ore', quantity: 4 }, { type: 'dragon_scale', quantity: 2 }],
  },
  {
    id: 'dragon_shield', itemType: 'shield', name: 'Dragon Shield', rarity: 'rare', power: 16, goldCost: 1800,
    upgradesFrom: { itemType: 'shield', rarity: 'uncommon' },
    materials: [{ type: 'dragon_scale', quantity: 4 }, { type: 'fire_crystal', quantity: 3 }],
  },
  {
    id: 'aegis', itemType: 'shield', name: 'Aegis', rarity: 'epic', power: 26, goldCost: 5500,
    upgradesFrom: { itemType: 'shield', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quantity: 5 }, { type: 'ancient_rune', quantity: 4 }],
  },

  // ── HELM ────────────────────────────────────────────────────────────────────
  {
    id: 'iron_helm', itemType: 'helm', name: 'Iron Helm', rarity: 'common', power: 3, goldCost: 200,
    materials: [{ type: 'bone_shard', quantity: 2 }, { type: 'iron_ore', quantity: 2 }],
  },
  {
    id: 'scale_helm', itemType: 'helm', name: 'Scale Helm', rarity: 'uncommon', power: 8, goldCost: 600,
    upgradesFrom: { itemType: 'helm', rarity: 'common' },
    materials: [{ type: 'dragon_scale', quantity: 3 }, { type: 'ancient_rune', quantity: 2 }],
  },
  {
    id: 'infernal_crown', itemType: 'helm', name: 'Infernal Crown', rarity: 'rare', power: 14, goldCost: 1600,
    upgradesFrom: { itemType: 'helm', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quantity: 4 }, { type: 'ancient_rune', quantity: 3 }],
  },
  {
    id: 'demon_helm', itemType: 'helm', name: 'Demon Helm', rarity: 'epic', power: 24, goldCost: 5000,
    upgradesFrom: { itemType: 'helm', rarity: 'rare' },
    materials: [{ type: 'ancient_rune', quantity: 5 }, { type: 'fire_crystal', quantity: 3 }],
  },

  // ── ARMOR ───────────────────────────────────────────────────────────────────
  {
    id: 'leather_armor', itemType: 'armor', name: 'Leather Armor', rarity: 'common', power: 4, goldCost: 300,
    materials: [{ type: 'bone_shard', quantity: 3 }, { type: 'iron_ore', quantity: 2 }],
  },
  {
    id: 'chain_armor', itemType: 'armor', name: 'Chain Armor', rarity: 'uncommon', power: 10, goldCost: 900,
    upgradesFrom: { itemType: 'armor', rarity: 'common' },
    materials: [{ type: 'iron_ore', quantity: 4 }, { type: 'bone_shard', quantity: 3 }],
  },
  {
    id: 'dragonscale_armor', itemType: 'armor', name: 'Dragonscale Armor', rarity: 'rare', power: 20, goldCost: 2500,
    upgradesFrom: { itemType: 'armor', rarity: 'uncommon' },
    materials: [{ type: 'dragon_scale', quantity: 5 }, { type: 'iron_ore', quantity: 3 }],
  },
  {
    id: 'infernal_plate', itemType: 'armor', name: 'Infernal Plate', rarity: 'epic', power: 34, goldCost: 7000,
    upgradesFrom: { itemType: 'armor', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quantity: 5 }, { type: 'fire_crystal', quantity: 4 }],
  },

  // ── RING ────────────────────────────────────────────────────────────────────
  {
    id: 'iron_ring', itemType: 'ring', name: 'Iron Ring', rarity: 'common', power: 2, goldCost: 150,
    materials: [{ type: 'iron_ore', quantity: 2 }, { type: 'ancient_rune', quantity: 1 }],
  },
  {
    id: 'flame_ring', itemType: 'ring', name: 'Flame Ring', rarity: 'uncommon', power: 7, goldCost: 500,
    upgradesFrom: { itemType: 'ring', rarity: 'common' },
    materials: [{ type: 'fire_crystal', quantity: 3 }, { type: 'ancient_rune', quantity: 1 }],
  },
  {
    id: 'dragons_seal', itemType: 'ring', name: "Dragon's Seal", rarity: 'rare', power: 13, goldCost: 1400,
    upgradesFrom: { itemType: 'ring', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quantity: 4 }, { type: 'ancient_rune', quantity: 3 }],
  },
  {
    id: 'ancient_sigil', itemType: 'ring', name: 'Ancient Sigil', rarity: 'epic', power: 22, goldCost: 4500,
    upgradesFrom: { itemType: 'ring', rarity: 'rare' },
    materials: [{ type: 'ancient_rune', quantity: 4 }, { type: 'fire_crystal', quantity: 3 }],
  },

  // ── LEGENDARY NFT FORGE ─────────────────────────────────────────────────────
  // These are standalone NFT items — not part of the T1-T4 upgrade chain.
  // Minted on XRPL by admin; materials burn immediately on request.
  {
    id: 'lynx_sword', itemType: 'weapon', name: 'Lynx Sword', rarity: 'legendary', power: 60, goldCost: 50000,
    materials: [
      { type: 'lynx_fang',    quantity: 5 },
      { type: 'dragon_scale', quantity: 8 },
      { type: 'ancient_rune', quantity: 5 },
    ],
  },
  {
    id: 'nomic_shield', itemType: 'shield', name: 'Nomic Shield', rarity: 'legendary', power: 50, goldCost: 50000,
    materials: [
      { type: 'nomic_core',   quantity: 5 },
      { type: 'dragon_scale', quantity: 8 },
      { type: 'ancient_rune', quantity: 5 },
    ],
  },
];

const RARITY_GPH_MULT: Record<string, number> = { common: 0.03, uncommon: 0.05, rare: 0.12, epic: 0.25, legendary: 0.40 };
export function getEffectiveCraftingCost(recipe: CraftingRecipe, gph: number): number {
  return Math.max(recipe.goldCost, Math.floor(gph * (RARITY_GPH_MULT[recipe.rarity] ?? 0.03)));
}

const MAX_INVENTORY = 20;

const EMPTY_EQUIPMENT: EquipmentSlots = { weapon: null, shield: null, helm: null, armor: null, ring: null };

const INITIAL_BUILDINGS: Building[] = [
  { id: 'barracks',      name: 'Barracks',       description: 'Train foot soldiers to join your expeditions',       icon: '🪖', baseCost: 100,    baseIncome: 200,    costMultiplier: 1.15, unlockLevel: 1,  owned: 0, armyPower: 1,  defensePower: 2  },
  { id: 'archery_range', name: 'Archery Range',  description: 'Train archers — ranged firepower on expeditions',    icon: '🏹', baseCost: 500,    baseIncome: 1000,   costMultiplier: 1.15, unlockLevel: 3,  owned: 0, armyPower: 3,  defensePower: 2  },
  { id: 'stables',       name: 'Stables',        description: 'Train cavalry — fast and deadly dragon hunters',       icon: '🐴', baseCost: 2000,   baseIncome: 4000,   costMultiplier: 1.15, unlockLevel: 5,  owned: 0, armyPower: 6,  defensePower: 3  },
  { id: 'war_forge',     name: 'War Forge',      description: 'Equip your troops with dragonslaying weapons',         icon: '⚒️', baseCost: 10000,  baseIncome: 20000,  costMultiplier: 1.15, unlockLevel: 8,  owned: 0, armyPower: 12, defensePower: 10 },
  { id: 'war_camp',      name: 'War Camp',       description: 'A full regiment — the backbone of your dragon war',    icon: '⛺', baseCost: 50000,  baseIncome: 100000, costMultiplier: 1.15, unlockLevel: 12, owned: 0, armyPower: 25, defensePower: 20 },
  { id: 'castle',        name: 'Castle',         description: 'Elite knights — the finest dragonslayers in the realm', icon: '🏰', baseCost: 250000, baseIncome: 500000, costMultiplier: 1.15, unlockLevel: 18, owned: 0, armyPower: 50, defensePower: 80 },
];

const XP_PER_TAP = 2;
const CRIT_CHANCE = 0.08;
const CRIT_MULTIPLIER = 5;
const LOGIN_REWARDS = [500, 750, 1000, 1500, 2000, 3000, 5000];

function calcXpToNext(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function calcGearMultiplier(equipment: EquipmentSlots): number {
  const equipped = Object.values(equipment).filter(Boolean) as InventoryItem[];
  const total = equipped.reduce((sum, item) => sum + RARITY_SCORES[item.rarity], 0);
  return Math.max(1.0, 1.0 + total * 0.06);
}

export function calcArmyPower(buildings: Building[]): number {
  return buildings.reduce((sum, b) => sum + b.armyPower * b.owned, 0);
}

export function calcDefensePower(buildings: Building[]): number {
  return buildings.reduce((sum, b) => sum + b.defensePower * b.owned, 0);
}

export function calcGearBonus(equipment: EquipmentSlots): number {
  const equipped = Object.values(equipment).filter(Boolean) as InventoryItem[];
  return equipped.reduce((sum, item) => sum + RARITY_SCORES[item.rarity], 0);
}

function mergeMaterialsByType(mats: Material[]): Material[] {
  const map: Record<string, number> = {};
  for (const m of mats) {
    map[m.type] = (map[m.type] ?? 0) + m.quantity;
  }
  return Object.entries(map).map(([type, quantity]) => ({ type: type as MaterialType, quantity }));
}

function calcExpeditionYield(
  level: number,
  armyPwr: number,
  gearBonus: number,
  hours: 4 | 8 | 12,
): { dragonsSlain: number; goldEarned: number; materials: Material[] } {
  const rand = 0.85 + Math.random() * 0.30;
  const heroBonus = level * 0.5;
  const dragonsSlain = Math.max(1, Math.floor(
    (heroBonus + armyPwr * 0.8 + gearBonus * 2) * (hours / 4) * rand
  ));
  const goldEarned = dragonsSlain * (50 + level * 8);

  const allTypes: MaterialType[] = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'];
  // All 5 types always drop — qty: 4h=1-2, 8h=1-3, 12h=2-4
  const maxQty = hours === 4 ? 2 : hours === 8 ? 3 : 4;
  const materials: Material[] = allTypes.map(type => ({
    type, quantity: Math.floor(Math.random() * maxQty) + 1,
  }));
  // Legendary mats only from 12h expeditions
  if (hours === 12) {
    materials.push({ type: 'lynx_fang',  quantity: 1 + Math.floor(Math.random() * 3) });
    materials.push({ type: 'nomic_core', quantity: 1 + Math.floor(Math.random() * 3) });
  }

  return { dragonsSlain, goldEarned, materials };
}

export interface EggVariant {
  variantName: string;
  hatchHours: number;
  bonusType: DragonBonusType;
  bonusValue: number;
  label: string;
}

export const EGG_VARIANTS: Record<EggRarity, EggVariant[]> = {
  common: [
    { variantName: 'Swift Whelp',     hatchHours: 1, bonusType: 'tap_gold_pct',        bonusValue: 5,  label: '+5% gold/tap' },
    { variantName: 'Ember Hatchling', hatchHours: 1, bonusType: 'tap_gold_pct',        bonusValue: 6,  label: '+6% gold/tap' },
    { variantName: 'Iron Pup',        hatchHours: 1, bonusType: 'army_power_flat',     bonusValue: 8,  label: '+8 army power' },
    { variantName: 'Mud Snapper',     hatchHours: 1, bonusType: 'army_power_flat',     bonusValue: 5,  label: '+5 army power' },
    { variantName: 'Stone Hatchling', hatchHours: 1, bonusType: 'material_drop_pct',   bonusValue: 4,  label: '+4% material drops' },
    { variantName: 'Scale Pup',       hatchHours: 1, bonusType: 'material_drop_pct',   bonusValue: 3,  label: '+3% material drops' },
    { variantName: 'Wind Whelp',      hatchHours: 1, bonusType: 'expedition_time_pct', bonusValue: 4,  label: '-4% expedition time' },
  ],
  uncommon: [
    { variantName: 'Flame Drake',     hatchHours: 2, bonusType: 'tap_gold_pct',        bonusValue: 10, label: '+10% gold/tap' },
    { variantName: 'Gilded Drake',    hatchHours: 2, bonusType: 'tap_gold_pct',        bonusValue: 12, label: '+12% gold/tap' },
    { variantName: 'Iron Wyvern',     hatchHours: 2, bonusType: 'army_power_flat',     bonusValue: 20, label: '+20 army power' },
    { variantName: 'Crystal Stalker', hatchHours: 2, bonusType: 'material_drop_pct',   bonusValue: 8,  label: '+8% material drops' },
    { variantName: 'Storm Runner',    hatchHours: 2, bonusType: 'expedition_time_pct', bonusValue: 7,  label: '-7% expedition time' },
  ],
  rare: [
    { variantName: 'Inferno Wyrm',    hatchHours: 4, bonusType: 'tap_gold_pct',        bonusValue: 18, label: '+18% gold/tap' },
    { variantName: 'War Colossus',    hatchHours: 4, bonusType: 'army_power_flat',     bonusValue: 45, label: '+45 army power' },
    { variantName: 'Ancient Stalker', hatchHours: 4, bonusType: 'material_drop_pct',   bonusValue: 15, label: '+15% material drops' },
    { variantName: 'Void Runner',     hatchHours: 4, bonusType: 'expedition_time_pct', bonusValue: 12, label: '-12% expedition time' },
  ],
  legendary: [
    { variantName: 'Ember Tyrant',    hatchHours: 6, bonusType: 'tap_gold_pct',        bonusValue: 30, label: '+30% gold/tap' },
    { variantName: 'Iron Overlord',   hatchHours: 6, bonusType: 'army_power_flat',     bonusValue: 100, label: '+100 army power' },
    { variantName: 'Time Rifter',     hatchHours: 6, bonusType: 'expedition_time_pct', bonusValue: 20, label: '-20% expedition time' },
  ],
};

export function calcDiminishingBonus(dragons: HatchedDragon[], bonusType: DragonBonusType): number {
  const vals = dragons
    .filter(d => d.bonusType === bonusType)
    .map(d => d.bonusValue)
    .sort((a, b) => b - a);
  return vals.reduce((total, v, i) => total + v * Math.pow(0.75, i), 0);
}

export function computeDungeonRewards(
  outcome: 'victory' | 'partial' | 'defeat',
  gph: number,
  level: number,
  dungeonTier: number,
): DungeonRewards {
  const commonMats: MaterialType[] = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'];
  if (outcome === 'victory') {
    const goldEarned = Math.max(2000, Math.floor(gph * 2));
    const xpEarned = 20 * level;
    const matQty = 3 + Math.floor(Math.random() * 3);
    const materials: { type: MaterialType; quantity: number }[] = commonMats.map(type => ({ type, quantity: matQty }));
    materials.push({ type: 'lynx_fang',  quantity: 1 + Math.floor(Math.random() * 2) });
    materials.push({ type: 'nomic_core', quantity: 1 + Math.floor(Math.random() * 2) });
    let egg: DragonEgg | null = null;
    if (Math.random() < 0.08) {
      const rarity: EggRarity = dungeonTier >= 4 ? 'rare' : dungeonTier >= 2 ? 'uncommon' : 'common';
      const variants = EGG_VARIANTS[rarity];
      const variant = variants[Math.floor(Math.random() * variants.length)];
      egg = { id: `dungeon-egg-${Date.now()}`, rarity, ...variant };
    }
    return { goldEarned, xpEarned, materials, egg };
  } else if (outcome === 'partial') {
    const goldEarned = Math.max(800, Math.floor(gph * 0.8));
    const xpEarned = 5 * level;
    const matQty = 1 + Math.floor(Math.random() * 2);
    const shuffled = [...commonMats].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    const materials: { type: MaterialType; quantity: number }[] = shuffled.map(type => ({ type, quantity: matQty }));
    if (Math.random() < 0.4) {
      const legType: MaterialType = Math.random() < 0.5 ? 'lynx_fang' : 'nomic_core';
      materials.push({ type: legType, quantity: 1 });
    }
    return { goldEarned, xpEarned, materials, egg: null };
  } else {
    return { goldEarned: 0, xpEarned: Math.max(1, level), materials: [], egg: null };
  }
}

function generateEgg(hours: 4 | 8 | 12): DragonEgg | null {
  const roll = Math.random();
  let rarity: EggRarity | null = null;
  if (hours === 12) {
    if (roll < 0.02) rarity = 'legendary';
    else if (roll < 0.07) rarity = 'rare';
    else if (roll < 0.20) rarity = 'uncommon';
    else if (roll < 0.45) rarity = 'common';
  } else if (hours === 8) {
    if (roll < 0.01) rarity = 'legendary';
    else if (roll < 0.04) rarity = 'rare';
    else if (roll < 0.12) rarity = 'uncommon';
    else if (roll < 0.30) rarity = 'common';
  } else {
    if (roll < 0.08) rarity = 'uncommon';
    else if (roll < 0.18) rarity = 'common';
  }
  if (!rarity) return null;
  const variants = EGG_VARIANTS[rarity];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  return { id: `egg-${Date.now()}-${Math.random().toString(36).slice(2)}`, rarity, ...variant };
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function generateMerchantDeals(level: number, dateStr: string, gph = 0): MerchantDeal[] {
  // Seeded pseudo-random from date string so deals are consistent within a day
  let seed = dateStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) + level;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0x7fffffff; };
  const allMats: MaterialType[] = ['dragon_scale','fire_crystal','iron_ore','bone_shard','ancient_rune'];
  const pickMat = () => allMats[Math.floor(rng() * allMats.length)];
  const goldBase = Math.max(500, gph > 0 ? Math.floor(gph * 0.5) : level * 200);
  const rareMat = pickMat();
  return [
    {
      id: 'deal_bulk_mats', icon: '🎒', title: 'Bulk Material Sack',
      desc: '8× of two random material types',
      goldCost: Math.floor(goldBase * 0.8), purchased: false, type: 'materials',
      payload: { materials: [
        { type: pickMat(), quantity: 8 },
        { type: pickMat(), quantity: 8 },
      ]},
    },
    {
      id: 'deal_rare_mat', icon: '💎', title: 'Material Cache',
      desc: `5× ${rareMat.replace(/_/g,' ')}`,
      goldCost: Math.floor(goldBase * 1.5), purchased: false, type: 'materials',
      payload: { materials: [{ type: rareMat, quantity: 5 }] },
    },
    {
      id: 'deal_uncommon_egg', icon: '🟢', title: 'Dragon Egg (Uncommon)',
      desc: 'Hatches in 2h — grants +10 army power forever',
      goldCost: Math.floor(goldBase * 2.0), purchased: false, type: 'egg',
      payload: { egg: 'uncommon' as EggRarity },
    },
    {
      id: 'deal_mixed_bundle', icon: '🛍️', title: 'Merchant Bundle',
      desc: '3× each of all 5 material types',
      goldCost: Math.floor(goldBase * 2.5), purchased: false, type: 'materials',
      payload: { materials: allMats.map(t => ({ type: t, quantity: 3 })) },
    },
  ];
}

function generateDailyQuests(level: number, gph = 0): DailyQuest[] {
  const goldTarget = Math.max(1000, level * 300);
  const buildTarget = Math.max(1, Math.min(3, Math.floor(level / 3) + 1));
  return [
    {
      id: 'tap_gold',
      type: 'tap_gold',
      description: `Earn ${goldTarget.toLocaleString()} gold by tapping`,
      target: goldTarget,
      progress: 0,
      reward: Math.max(Math.floor(goldTarget * 0.6), Math.floor(gph * 1.0)),
      completed: false,
      claimed: false,
    },
    {
      id: 'buy_buildings',
      type: 'buy_buildings',
      description: `Buy ${buildTarget} building${buildTarget > 1 ? 's' : ''}`,
      target: buildTarget,
      progress: 0,
      reward: Math.max(Math.floor(level * 80 + 200), Math.floor(gph * 0.75)),
      completed: false,
      claimed: false,
    },
    {
      id: 'complete_expedition',
      type: 'complete_expedition',
      description: 'Complete 1 expedition',
      target: 1,
      progress: 0,
      reward: Math.max(Math.floor(level * 50 + 150), Math.floor(gph * 0.50)),
      completed: false,
      claimed: false,
    },
  ];
}

// ============================================================
// CONTEXT
// ============================================================

const GameContext = createContext<GameContextType | undefined>(undefined);

const SAVE_KEY = 'dragonslayer_save';

function loadState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

function saveState(state: GameState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage full — silently ignore
  }
}

function createInitialState(): GameState {
  const now = Date.now();
  const today = getToday();
  return {
    gold: 100,
    totalGoldEarned: 100,
    totalTaps: 0,
    totalDragonsSlain: 0,
    totalExpeditions: 0,
    level: 1,
    xp: 0,
    xpToNext: calcXpToNext(1),
    buildings: INITIAL_BUILDINGS.map((b) => ({ ...b })),
    equipment: { ...EMPTY_EQUIPMENT },
    inventory: [],
    materials: [],
    activeExpedition: null,
    lastExpeditionResult: null,
    lastTick: now,
    createdAt: now,
    loginStreak: 0,
    lastLoginDate: '',
    loginBonusPending: true,
    dailyQuests: generateDailyQuests(1),
    questDate: today,
    tapGoldToday: 0,
    buildingsBoughtToday: 0,
    expeditionsToday: 0,
    adsUsedThisExpedition: 0,
    lastTapEarned: 0,
    lastTapCrit: false,
    eggInventory: [],
    incubator: [{ egg: null, startedAt: null, endsAt: null }],
    hatchedDragons: [],
    merchantDeals: [],
    merchantExpiresAt: null,
    merchantLastDate: '',
    arenaAttacksToday: 0,
    arenaPoints: 0,
    arenaLastReset: '',
    trophies: 0,
    seasonMonth: new Date().toISOString().slice(0, 7),
    defenseLog: [],
    defenseLogSeen: 0,
    holderGiftStreak: 0,
    holderGiftLastDate: '',
    holderGiftPending: false,
    playerId: null,
    walletAddress: null,
    isSynced: false,
    displayName: null,
    tokenDiscount: null,
    dungeonAttemptsToday: 0,
    dungeonLastRaidDate: '',
    dungeonCooldownUntil: 0,
    dungeonTotalVictories: 0,
    dungeonBestCompletion: {},
  };
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(createInitialState);
  const initialized = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const stateRef = useRef<GameState>(state);

  // Load saved state on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const saved = loadState();
    if (saved) {
      const now = Date.now();
      const elapsed = (now - saved.lastTick) / 1000;

      // Always use INITIAL_BUILDINGS as template (resets removed IDs, preserves owned count)
      const migratedBuildings = INITIAL_BUILDINGS.map((template) => {
        const existing = (saved.buildings || []).find((b: Building) => b.id === template.id);
        return { ...template, owned: existing?.owned ?? 0 };
      });

      // Calculate offline gold from buildings using gear multiplier
      const savedEquipment = saved.equipment ?? { ...EMPTY_EQUIPMENT };
      const gearMult = calcGearMultiplier(savedEquipment);
      const totalIncome = migratedBuildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const offlineGold = Math.floor((totalIncome / 3600) * elapsed * gearMult * 0.5);

      const today = getToday();
      const lastLogin = saved.lastLoginDate || '';
      const isNewDay = lastLogin !== today;
      // Holder gift: set pending if cached token discount shows holdings and it's a new day
      const cachedPct = saved.tokenDiscount?.pct ?? 0;
      const isNewHolderDay = (saved.holderGiftLastDate || '') !== today;
      const holderGiftPending = cachedPct > 0 && isNewHolderDay ? true : (saved.holderGiftPending ?? false);
      const newStreak = isNewDay ? (saved.loginStreak || 0) + 1 : (saved.loginStreak || 0);

      // Migrate daily quests — replace full_care with complete_expedition if needed
      const savedGph = migratedBuildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const QUEST_VERSION = 'v3';
      const needsQuestRefresh = (saved as any).questFormulaVersion !== QUEST_VERSION;
      const rawQuests = (isNewDay || needsQuestRefresh)
        ? generateDailyQuests(saved.level, savedGph)
        : (saved.dailyQuests || generateDailyQuests(saved.level, savedGph));
      const newQuests = rawQuests.map((q: DailyQuest) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q as any).type === 'full_care'
          ? { ...q, id: 'complete_expedition', type: 'complete_expedition' as const, description: 'Complete 1 expedition' }
          : q
      );


      setState({
        ...saved,
        buildings: migratedBuildings,
        equipment: savedEquipment,
        inventory: saved.inventory ?? [],
        materials: mergeMaterialsByType(saved.materials ?? []),
        activeExpedition: saved.activeExpedition ?? null,
        lastExpeditionResult: saved.lastExpeditionResult ?? null,
        totalDragonsSlain: saved.totalDragonsSlain ?? 0,
        totalExpeditions: saved.totalExpeditions ?? 0,
        expeditionsToday: isNewDay ? 0 : (saved.expeditionsToday ?? 0),
        adsUsedThisExpedition: saved.adsUsedThisExpedition ?? 0,
        gold: saved.gold + offlineGold,
        totalGoldEarned: saved.totalGoldEarned + offlineGold,
        lastTick: now,
        loginStreak: newStreak,
        lastLoginDate: today,
        loginBonusPending: isNewDay ? true : (saved.loginBonusPending ?? false),
        dailyQuests: newQuests,
        questDate: today,
        tapGoldToday: isNewDay ? 0 : (saved.tapGoldToday || 0),
        buildingsBoughtToday: isNewDay ? 0 : (saved.buildingsBoughtToday || 0),
        lastTapEarned: saved.lastTapEarned || 0,
        lastTapCrit: saved.lastTapCrit || false,
        eggInventory: saved.eggInventory || [],
        incubator: (saved.incubator?.length ? saved.incubator : [{ egg: null, startedAt: null, endsAt: null }]),
        hatchedDragons: saved.hatchedDragons || [],
        merchantDeals: needsQuestRefresh ? [] : (saved.merchantDeals || []),
        merchantExpiresAt: needsQuestRefresh ? null : (saved.merchantExpiresAt ?? null),
        merchantLastDate: needsQuestRefresh ? '' : (saved.merchantLastDate || ''),
        questFormulaVersion: 'v3',
        arenaAttacksToday: saved.arenaAttacksToday || 0,
        arenaPoints: saved.arenaPoints || 0,
        arenaLastReset: saved.arenaLastReset || '',
        holderGiftStreak: saved.holderGiftStreak ?? 0,
        holderGiftLastDate: saved.holderGiftLastDate ?? '',
        holderGiftPending,
        playerId: saved.playerId ?? null,
        walletAddress: saved.walletAddress ?? null,
        isSynced: saved.isSynced ?? false,
        tokenDiscount: saved.tokenDiscount ?? null,
        dungeonAttemptsToday: isNewDay ? 0 : (saved.dungeonAttemptsToday ?? 0),
        dungeonLastRaidDate: saved.dungeonLastRaidDate ?? '',
        dungeonCooldownUntil: saved.dungeonCooldownUntil ?? 0,
        dungeonTotalVictories: saved.dungeonTotalVictories ?? 0,
        dungeonBestCompletion: saved.dungeonBestCompletion ?? {},
      });

      // Auto-reconnect: wallet already in localStorage — re-establish identity via wallet path
      if (saved.walletAddress) {
        const apiUrl2 = process.env.NEXT_PUBLIC_API_URL ?? '';
        if (apiUrl2) {
          const tgUser2 = typeof window !== 'undefined'
            ? (window as any).Telegram?.WebApp?.initDataUnsafe?.user
            : null;
          fetch(`${apiUrl2}/api/auth/wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: saved.walletAddress,
              telegram_id: tgUser2?.id ?? undefined,
              telegram_username: tgUser2?.username ?? tgUser2?.first_name ?? undefined,
            }),
          })
            .then(r => r.json())
            .then(async data => {
              if (!data.success || !data.player_id) return;
              // Fetch the server save for this wallet player
              const saveRes = await fetch(`${apiUrl2}/api/save/${data.player_id}`);
              const saveData = await saveRes.json().catch(() => null);
              setState(prev => {
                const serverSave = saveData?.save_json && Object.keys(saveData.save_json).length > 0
                  ? saveData.save_json : null;
                const serverLevel = Number(serverSave?.level ?? 0);
                const localLevel  = Number(prev.level ?? 0);
                const serverGold  = Number(serverSave?.totalGoldEarned ?? 0);
                const localGold   = Number(prev.totalGoldEarned ?? 0);
                const serverAhead = serverSave && (
                  serverLevel > localLevel ||
                  (serverLevel === localLevel && serverGold > localGold)
                );
                if (serverAhead) {
                  const { tokenDiscount: _td, ...serverSaveWithoutDiscount } = serverSave as any;
                  return { ...prev, ...serverSaveWithoutDiscount, lastTick: Date.now(),
                    playerId: data.player_id, walletAddress: saved.walletAddress,
                    displayName: data.username ?? serverSaveWithoutDiscount.displayName ?? prev.displayName,
                    isSynced: true };
                }
                return { ...prev, playerId: data.player_id, walletAddress: saved.walletAddress,
                displayName: data.username ?? prev.displayName, isSynced: false };
              });
              // If local was better, push it up
              const cur = stateRef.current;
              const serverSave = saveData?.save_json && Object.keys(saveData.save_json).length > 0
                ? saveData.save_json : null;
              const localAhead = !serverSave ||
                Number(cur.level ?? 0) > Number(serverSave.level ?? 0) ||
                (Number(cur.level ?? 0) === Number(serverSave.level ?? 0) &&
                 Number(cur.totalGoldEarned ?? 0) > Number(serverSave.totalGoldEarned ?? 0));
              if (localAhead) {
                fetch(`${apiUrl2}/api/save/${data.player_id}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ save_json: cur }),
                }).catch(() => {});
              }
              // Always re-verify token discount on reconnect (covers mobile/TWA restarts)
              refreshTokenDiscount();
            })
            .catch(() => {});
        }
      }
    }

    // Pick up wallet address from Xaman return redirect or localStorage fallback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const linkedAddr = params.get('wallet_linked') || localStorage.getItem('xaman_linked_address');
      if (linkedAddr && linkedAddr.startsWith('r') && linkedAddr.length >= 25) {
        localStorage.removeItem('xaman_linked_address');
        window.history.replaceState({}, '', window.location.pathname);
        setState(prev => ({ ...prev, walletAddress: linkedAddr }));
        const apiUrl2 = process.env.NEXT_PUBLIC_API_URL ?? '';
        if (apiUrl2) {
          fetch(`${apiUrl2}/api/auth/wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: linkedAddr }),
          })
            .then(r => r.json())
            .then(data => {
              if (data.success) {
                setState(prev => ({
                  ...prev,
                  walletAddress: linkedAddr,
                  playerId: data.player_id,
                  isSynced: true,
                }));
              }
            })
            .catch(() => {/* ignore */});
        }
      }
    }

    // TWA auth — if telegram account has a wallet linked, do full wallet reconnect
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    if (apiUrl && typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
      fetch(`${apiUrl}/api/auth/twa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: tgUser.id,
          telegram_username: tgUser.username,
          telegram_first_name: tgUser.first_name,
        }),
      })
        .then(r => r.json())
        .then(async data => {
          if (!data.success) return; // No wallet linked yet — stay local
          const walletAddr = data.wallet_address;
          if (!walletAddr || typeof walletAddr !== 'string' ||
              !walletAddr.startsWith('r') || walletAddr.length < 25) return;

          // Full wallet identity: fetch server save, merge, set playerId
          setState(prev => ({ ...prev, walletAddress: walletAddr, displayName: data.username ?? prev.displayName }));
          const saveRes = await fetch(`${apiUrl}/api/save/${data.player_id}`);
          const saveData = await saveRes.json().catch(() => null);
          setState(prev => {
            const serverSave = saveData?.save_json && Object.keys(saveData.save_json).length > 0
              ? saveData.save_json : null;
            const serverLevel = Number(serverSave?.level ?? 0);
            const localLevel  = Number(prev.level ?? 0);
            const serverGold  = Number(serverSave?.totalGoldEarned ?? 0);
            const localGold   = Number(prev.totalGoldEarned ?? 0);
            const serverAhead = serverSave && (
              serverLevel > localLevel ||
              (serverLevel === localLevel && serverGold > localGold)
            );
            if (serverAhead) {
              return { ...prev, ...serverSave, lastTick: Date.now(),
                playerId: data.player_id, walletAddress: walletAddr,
                displayName: data.username ?? prev.displayName, isSynced: true };
            }
            return { ...prev, playerId: data.player_id, walletAddress: walletAddr,
              displayName: data.username ?? prev.displayName, isSynced: false };
          });
          // If local was better, push it
          const cur = stateRef.current;
          const serverSave = saveData?.save_json && Object.keys(saveData.save_json).length > 0
            ? saveData.save_json : null;
          const localAhead = !serverSave ||
            Number(cur.level ?? 0) > Number(serverSave.level ?? 0) ||
            (Number(cur.level ?? 0) === Number(serverSave.level ?? 0) &&
             Number(cur.totalGoldEarned ?? 0) > Number(serverSave.totalGoldEarned ?? 0));
          if (localAhead) {
            fetch(`${apiUrl}/api/save/${data.player_id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ save_json: cur }),
            }).catch(() => {});
          }
        })
        .catch(() => {/* ignore network errors */});
    }
  }, []);

  // Daily merchant refresh — generate new deals once per day
  useEffect(() => {
    const today = getToday();
    setState((prev) => {
      if (prev.merchantLastDate === today && prev.merchantDeals.length > 0) return prev;
      const gph = prev.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const deals = generateMerchantDeals(prev.level, today, gph);
      const expiresAt = new Date(today + 'T23:59:59').getTime();
      return { ...prev, merchantDeals: deals, merchantExpiresAt: expiresAt, merchantLastDate: today };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Game tick every 1s — passive income only
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setState((prev) => {
        const now = Date.now();
        const dt = (now - prev.lastTick) / 1000;

        // Passive income from buildings, boosted by gear
        const totalIncome = prev.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
        const gearMult = calcGearMultiplier(prev.equipment);
        const passiveGold = (totalIncome / 3600) * dt * gearMult;

        return {
          ...prev,
          gold: prev.gold + passiveGold,
          totalGoldEarned: prev.totalGoldEarned + passiveGold,
          lastTick: now,
        };
      });
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [])

  // Keep stateRef current so intervals always access the latest state
  useEffect(() => {
    stateRef.current = state;
  });

  // Auto-save every 5 s via ref — avoids 4×/sec localStorage writes
  useEffect(() => {
    const interval = setInterval(() => saveState(stateRef.current), 5_000);
    return () => clearInterval(interval);
  }, []);

  // Server sync every 30s (stable interval — uses ref, not state dep)
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    if (!apiUrl) return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (!s.playerId) return;
      fetch(`${apiUrl}/api/save/${s.playerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ save_json: s }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        const serverLog: unknown[] = data?.save_json?.defenseLog;
        if (!Array.isArray(serverLog)) return;
        setState(prev => {
          const localLog: unknown[] = prev.defenseLog ?? [];
          if (serverLog.length > localLog.length) return { ...prev, defenseLog: serverLog as typeof prev.defenseLog };
          return prev;
        });
      }).catch(() => {/* ignore */});
    }, 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on tab close / refresh
  useEffect(() => {
    const handleUnload = () => saveState(stateRef.current);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // ── AFK detection ────────────────────────────────────────────────────────────
  // Track real user interaction (mouse, touch, keyboard, page-focus).
  // Idle threshold is generous (10 min) — we only want to catch truly abandoned
  // windows, not players who leave the idle screen running while watching.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    // visibilitychange = user switches back to the tab / returns to app on mobile
    const onVisible = () => { if (!document.hidden) onActivity(); };
    window.addEventListener('mousemove',   onActivity, { passive: true });
    window.addEventListener('keydown',     onActivity, { passive: true });
    window.addEventListener('touchstart',  onActivity, { passive: true });
    window.addEventListener('click',       onActivity, { passive: true });
    window.addEventListener('scroll',      onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('mousemove',   onActivity);
      window.removeEventListener('keydown',     onActivity);
      window.removeEventListener('touchstart',  onActivity);
      window.removeEventListener('click',       onActivity);
      window.removeEventListener('scroll',      onActivity);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Send heartbeat to server — marks player as "active" for arena AFK detection.
  // Uses a ref so it always reads the latest playerId without needing it as a dep.
  const sendHeartbeatRef = useRef<() => void>(() => {});
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    sendHeartbeatRef.current = () => {
      const s = stateRef.current;
      if (!s.playerId || !apiUrl) return;
      const idleMin = (Date.now() - lastActivityRef.current) / 60_000;
      if (idleMin > 10) return; // abandoned window — don't mark active
      fetch(`${apiUrl}/api/save/heartbeat/${s.playerId}`, { method: 'POST' }).catch(() => {});
    };
  }); // runs every render so apiUrl/stateRef are always fresh

  // Interval: fire every 60 s
  useEffect(() => {
    const interval = setInterval(() => sendHeartbeatRef.current(), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Also fire when playerId first becomes available (auth completes after async load)
  const prevPlayerIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.playerId && state.playerId !== prevPlayerIdRef.current) {
      prevPlayerIdRef.current = state.playerId;
      sendHeartbeatRef.current();
    }
  }, [state.playerId]);

  // Also fire when tab becomes visible (mobile user returns to the app)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) sendHeartbeatRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Season soft-reset: when a new month starts, carry over 25% of trophies
  useEffect(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (state.seasonMonth && state.seasonMonth !== currentMonth) {
      setState(prev => {
        if (prev.seasonMonth === currentMonth) return prev;
        return { ...prev, trophies: Math.floor((prev.trophies ?? 0) * 0.25), seasonMonth: currentMonth };
      });
    }
  }, [state.seasonMonth]);

  const gearMultiplier = calcGearMultiplier(state.equipment);

  const dragonArmyPowerFlat = useMemo(
    () => calcDiminishingBonus(state.hatchedDragons, 'army_power_flat'),
    [state.hatchedDragons]
  );

  const tapDragonPct = useMemo(
    () => calcDiminishingBonus(state.hatchedDragons, 'tap_gold_pct'),
    [state.hatchedDragons]
  );

  const armyPower = useMemo(() => calcArmyPower(state.buildings) + dragonArmyPowerFlat, [state.buildings, dragonArmyPowerFlat]);

  const goldPerTap = Math.max(1, Math.floor((1 + state.level * 0.5) * gearMultiplier * (1 + tapDragonPct / 100)));

  const goldPerHour = Math.floor(
    state.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0) * gearMultiplier
  );

  const getBuildingCost = useCallback((building: Building): number => {
    return Math.floor(building.baseCost * Math.pow(building.costMultiplier, building.owned));
  }, []);

  const canAfford = useCallback(
    (cost: number) => state.gold >= cost,
    [state.gold]
  );

  const addXp = useCallback((amount: number, prevState: GameState): Partial<GameState> => {
    let xp = prevState.xp + amount;
    let level = prevState.level;
    let xpToNext = prevState.xpToNext;

    while (xp >= xpToNext) {
      xp -= xpToNext;
      level += 1;
      xpToNext = calcXpToNext(level);
    }

    return { xp, level, xpToNext };
  }, []);

  const tap = useCallback((comboMult = 1) => {
    setState((prev) => {
      if (prev.activeExpedition) return prev; // fighter is away
      const base = Math.max(1, Math.floor((1 + prev.level * 0.5) * calcGearMultiplier(prev.equipment)));
      const isCrit = Math.random() < CRIT_CHANCE;
      const tapDragonPct = calcDiminishingBonus(prev.hatchedDragons, 'tap_gold_pct');
      const earned = Math.floor(base * comboMult * (isCrit ? CRIT_MULTIPLIER : 1) * (1 + tapDragonPct / 100));
      const xpUpdate = addXp(XP_PER_TAP, prev);

      // Update tap_gold quest progress
      const newTapGold = prev.tapGoldToday + earned;
      const dailyQuests = prev.dailyQuests.map(q => {
        if (q.type === 'tap_gold' && !q.completed) {
          const progress = Math.min(newTapGold, q.target);
          return { ...q, progress, completed: progress >= q.target };
        }
        return q;
      });

      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold + earned,
        totalGoldEarned: prev.totalGoldEarned + earned,
        totalTaps: prev.totalTaps + 1,
        tapGoldToday: newTapGold,
        dailyQuests,
        lastTapEarned: earned,
        lastTapCrit: isCrit,
      };
    });
  }, [addXp]);

  const startExpedition = useCallback((hours: 4 | 8 | 12) => {
    setState((prev) => {
      if (prev.activeExpedition) return prev;
      const now = Date.now();
      const expeditionTimePct = calcDiminishingBonus(prev.hatchedDragons, 'expedition_time_pct');
      const durationMs = Math.floor(hours * 3600 * 1000 * (1 - Math.min(expeditionTimePct, 75) / 100));
      const activeExpedition: ActiveExpedition = {
        startedAt: now,
        durationHours: hours,
        endsAt: now + durationMs,
      };
      return { ...prev, activeExpedition, adsUsedThisExpedition: 0, lastExpeditionResult: null };
    });
  }, []);

  const speedUpExpedition = useCallback((reductionMs: number) => {
    setState((prev) => {
      if (!prev.activeExpedition) return prev;
      if (prev.adsUsedThisExpedition >= 2) return prev;
      const MIN_REMAINING_MS = 60_000; // always keep at least 60 s on the clock
      const newEndsAt = Math.max(
        Date.now() + MIN_REMAINING_MS,
        prev.activeExpedition.endsAt - reductionMs,
      );
      return {
        ...prev,
        adsUsedThisExpedition: prev.adsUsedThisExpedition + 1,
        activeExpedition: {
          ...prev.activeExpedition,
          endsAt: newEndsAt,
        },
      };
    });
  }, []);

  const claimExpedition = useCallback(() => {
    setState((prev) => {
      if (!prev.activeExpedition) return prev;
      if (Date.now() < prev.activeExpedition.endsAt) return prev;
      const armyPwr = calcArmyPower(prev.buildings);
      const gearBonus = calcGearBonus(prev.equipment);
      const { dragonsSlain, goldEarned, materials } = calcExpeditionYield(
        prev.level, armyPwr, gearBonus, prev.activeExpedition.durationHours,
      );
      const materialDropPct = calcDiminishingBonus(prev.hatchedDragons, 'material_drop_pct');
      const boostedMaterials = materialDropPct > 0
        ? materials.map(m => ({ ...m, quantity: Math.ceil(m.quantity * (1 + materialDropPct / 100)) }))
        : materials;
      const newMaterials = [...prev.materials];
      for (const drop of boostedMaterials) {
        const existing = newMaterials.find(m => m.type === drop.type);
        if (existing) existing.quantity += drop.quantity;
        else newMaterials.push({ ...drop });
      }
      const dailyQuests = prev.dailyQuests.map(q =>
        q.type === 'complete_expedition' && !q.completed
          ? { ...q, progress: 1, completed: true }
          : q
      );
      const xpUpdate = addXp(dragonsSlain * 3, prev);
      const droppedEgg = generateEgg(prev.activeExpedition.durationHours);
      const newEggInventory = droppedEgg
        ? [...prev.eggInventory, droppedEgg]
        : prev.eggInventory;
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold + goldEarned,
        totalGoldEarned: prev.totalGoldEarned + goldEarned,
        totalDragonsSlain: prev.totalDragonsSlain + dragonsSlain,
        totalExpeditions: prev.totalExpeditions + 1,
        expeditionsToday: prev.expeditionsToday + 1,
        materials: newMaterials,
        eggInventory: newEggInventory,
        activeExpedition: null,
        lastExpeditionResult: { dragonsSlain, goldEarned, materials: boostedMaterials, droppedEgg: droppedEgg ?? undefined },
        dailyQuests,
      };
    });
  }, [addXp]);

  const addMaterials = useCallback(
    (drops: { type: MaterialType; quantity: number }[]) => {
      setState((prev) => {
        const newMaterials = [...prev.materials];
        for (const drop of drops) {
          const existing = newMaterials.find(m => m.type === drop.type);
          if (existing) existing.quantity += drop.quantity;
          else newMaterials.push({ ...drop });
        }
        return { ...prev, materials: newMaterials };
      });
    },
    [],
  );

  const placeEggInIncubator = useCallback((eggId: string, slotIndex: number) => {
    setState((prev) => {
      const egg = prev.eggInventory.find(e => e.id === eggId);
      if (!egg) return prev;
      const slot = prev.incubator[slotIndex];
      if (!slot || slot.egg !== null) return prev; // slot occupied
      const now = Date.now();
      const newIncubator = [...prev.incubator];
      newIncubator[slotIndex] = { egg, startedAt: now, endsAt: now + egg.hatchHours * 3600 * 1000 };
      return {
        ...prev,
        eggInventory: prev.eggInventory.filter(e => e.id !== eggId),
        incubator: newIncubator,
      };
    });
  }, []);

  const claimHatchedEgg = useCallback((slotIndex: number) => {
    setState((prev) => {
      const slot = prev.incubator[slotIndex];
      if (!slot?.egg || !slot.endsAt || Date.now() < slot.endsAt) return prev;
      const dragon: HatchedDragon = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        rarity: slot.egg.rarity,
        variantName: slot.egg.variantName,
        bonusType: slot.egg.bonusType,
        bonusValue: slot.egg.bonusValue,
        hatchedAt: Date.now(),
      };
      const newIncubator = [...prev.incubator];
      newIncubator[slotIndex] = { egg: null, startedAt: null, endsAt: null };
      return {
        ...prev,
        incubator: newIncubator,
        hatchedDragons: [...prev.hatchedDragons, dragon],
      };
    });
  }, []);

  const addEggs = useCallback((eggs: Omit<DragonEgg, 'id'>[]) => {
    setState((prev) => {
      const newEggs = eggs.map(e => ({ ...e, id: `egg-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
      return { ...prev, eggInventory: [...prev.eggInventory, ...newEggs] };
    });
  }, []);

  const addGold = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      gold: prev.gold + amount,
      totalGoldEarned: prev.totalGoldEarned + amount,
    }));
  }, []);

  const buyFromMerchant = useCallback((dealId: string) => {
    setState((prev) => {
      const deal = prev.merchantDeals.find(d => d.id === dealId);
      if (!deal || deal.purchased) return prev;
      const discountPct = prev.tokenDiscount?.pct ?? 0;
      const effectiveCost = discountPct > 0 ? Math.floor(deal.goldCost * (1 - discountPct / 100)) : deal.goldCost;
      if (prev.gold < effectiveCost) return prev;
      let newState = { ...prev, gold: prev.gold - effectiveCost };
      if (deal.type === 'materials' && deal.payload.materials) {
        const newMats = [...newState.materials];
        for (const drop of deal.payload.materials) {
          const ex = newMats.find(m => m.type === drop.type);
          if (ex) ex.quantity += drop.quantity;
          else newMats.push({ ...drop });
        }
        newState = { ...newState, materials: newMats };
      } else if (deal.type === 'egg' && deal.payload.egg) {
        const rarity = deal.payload.egg;
        const variants = EGG_VARIANTS[rarity];
        const variant = variants[Math.floor(Math.random() * variants.length)];
        const egg: DragonEgg = { id: `egg-${Date.now()}`, rarity, ...variant };
        newState = { ...newState, eggInventory: [...newState.eggInventory, egg] };
      }
      const updatedDeals = prev.merchantDeals.map(d => d.id === dealId ? { ...d, purchased: true } : d);
      return { ...newState, merchantDeals: updatedDeals };
    });
  }, []);

  const equipItem = useCallback((itemId: string) => {
    setState((prev) => {
      const item = prev.inventory.find(i => i.id === itemId);
      if (!item) return prev;
      if (prev.level < ITEM_UNLOCK_LEVELS[item.itemType]) return prev;
      const slot = item.itemType as keyof EquipmentSlots;
      const currentlyEquipped = prev.equipment[slot];
      const newInventory = prev.inventory
        .filter(i => i.id !== itemId)
        .concat(currentlyEquipped ? [currentlyEquipped] : []);
      return {
        ...prev,
        equipment: { ...prev.equipment, [slot]: item },
        inventory: newInventory,
      };
    });
  }, []);

  const unequipItem = useCallback((slot: keyof EquipmentSlots) => {
    setState((prev) => {
      const item = prev.equipment[slot];
      if (!item) return prev;
      const newInventory = [...prev.inventory, item].slice(-MAX_INVENTORY);
      return {
        ...prev,
        equipment: { ...prev.equipment, [slot]: null },
        inventory: newInventory,
      };
    });
  }, []);

  const setItemNftTokenId = useCallback((itemId: string, tokenId: string) => {
    setState((prev) => {
      const invIdx = prev.inventory.findIndex(i => i.id === itemId);
      if (invIdx !== -1) {
        const newInventory = [...prev.inventory];
        newInventory[invIdx] = { ...newInventory[invIdx], nftTokenId: tokenId };
        return { ...prev, inventory: newInventory };
      }
      const slotKey = (Object.keys(prev.equipment) as (keyof EquipmentSlots)[]).find(
        k => prev.equipment[k]?.id === itemId
      );
      if (slotKey) {
        return {
          ...prev,
          equipment: {
            ...prev.equipment,
            [slotKey]: { ...prev.equipment[slotKey]!, nftTokenId: tokenId },
          },
        };
      }
      return prev;
    });
  }, []);

  const craftItem = useCallback((recipeId: string) => {
    setState((prev) => {
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      if (!recipe || prev.gold < recipe.goldCost) return prev;

      // Check materials
      for (const req of recipe.materials) {
        const held = prev.materials.find(m => m.type === req.type);
        if (!held || held.quantity < req.quantity) return prev;
      }

      // If this is an upgrade, find and consume the base item
      // (check inventory first, then equipped slot)
      let newInventory = [...prev.inventory];
      let newEquipment = { ...prev.equipment };
      if (recipe.upgradesFrom) {
        const { itemType, rarity } = recipe.upgradesFrom;
        const invIdx = newInventory.findIndex(
          i => i.itemType === itemType && i.rarity === rarity
        );
        if (invIdx !== -1) {
          newInventory.splice(invIdx, 1);
        } else {
          const equippedItem = newEquipment[itemType as keyof EquipmentSlots];
          if (equippedItem && equippedItem.rarity === rarity) {
            newEquipment = { ...newEquipment, [itemType]: null };
          } else {
            return prev; // don't have the required base item
          }
        }
      }

      // Deduct materials
      const newMaterials = prev.materials
        .map(m => {
          const req = recipe.materials.find(r => r.type === m.type);
          return req ? { ...m, quantity: m.quantity - req.quantity } : m;
        })
        .filter(m => m.quantity > 0);

      const newItem: InventoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        itemType: recipe.itemType,
        name: recipe.name,
        rarity: recipe.rarity,
        power: recipe.power,
        nftTokenId: null,
        obtainedVia: 'crafted',
        obtainedAt: Date.now(),
      };
      newInventory = [...newInventory, newItem].slice(-MAX_INVENTORY);
      return {
        ...prev,
        gold: prev.gold - recipe.goldCost,
        materials: newMaterials,
        inventory: newInventory,
        equipment: newEquipment,
      };
    });
  }, []);

  const buyBuilding = useCallback((id: string, qty = 1) => {
    setState((prev) => {
      const idx = prev.buildings.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const building = prev.buildings[idx];
      if (prev.level < building.unlockLevel) return prev;

      let totalCost = 0;
      for (let i = 0; i < qty; i++) {
        totalCost += Math.floor(building.baseCost * Math.pow(building.costMultiplier, building.owned + i));
      }
      const discountPct = prev.tokenDiscount?.pct ?? 0;
      const effectiveCost = discountPct > 0 ? Math.floor(totalCost * (1 - discountPct / 100)) : totalCost;
      if (prev.gold < effectiveCost) return prev;

      const newBuildings = [...prev.buildings];
      newBuildings[idx] = { ...building, owned: building.owned + qty };
      const xpUpdate = addXp(10 * qty, prev);

      // Update buy_buildings quest, handling intra-session day rollover
      const today = getToday();
      const isNewDay = prev.questDate !== today;
      const newBoughtToday = (isNewDay ? 0 : prev.buildingsBoughtToday) + qty;
      const gph = prev.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const dailyQuests = (isNewDay ? generateDailyQuests(prev.level, gph) : prev.dailyQuests).map(q => {
        if (q.type === 'buy_buildings' && !q.completed) {
          const progress = Math.min(newBoughtToday, q.target);
          return { ...q, progress, completed: progress >= q.target };
        }
        return q;
      });

      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold - effectiveCost,
        buildings: newBuildings,
        buildingsBoughtToday: newBoughtToday,
        dailyQuests,
        questDate: isNewDay ? today : prev.questDate,
        tapGoldToday: isNewDay ? 0 : prev.tapGoldToday,
        expeditionsToday: isNewDay ? 0 : prev.expeditionsToday,
      };
    });
  }, [addXp]);

  const claimLoginBonus = useCallback(() => {
    setState((prev) => {
      if (!prev.loginBonusPending) return prev;
      const gph = prev.buildings.reduce((s, b) => s + b.baseIncome * b.owned, 0);
      const streakIdx = Math.min((prev.loginStreak - 1), LOGIN_REWARDS.length - 1);
      const flatBonus = LOGIN_REWARDS[Math.max(0, streakIdx)];
      const bonus = Math.max(flatBonus, Math.floor(gph * (0.5 + Math.max(0, streakIdx) * 0.25)));
      return {
        ...prev,
        gold: prev.gold + bonus,
        totalGoldEarned: prev.totalGoldEarned + bonus,
        loginBonusPending: false,
      };
    });
  }, []);

  const claimQuest = useCallback((id: string) => {
    setState((prev) => {
      const quest = prev.dailyQuests.find(q => q.id === id);
      if (!quest || !quest.completed || quest.claimed) return prev;
      return {
        ...prev,
        gold: prev.gold + quest.reward,
        totalGoldEarned: prev.totalGoldEarned + quest.reward,
        dailyQuests: prev.dailyQuests.map(q => q.id === id ? { ...q, claimed: true } : q),
      };
    });
  }, []);

  const recordBotBattle = useCallback((win: boolean, goldStolen: number, botTier: 'easy' | 'hard' = 'easy') => {
    setState(prev => {
      const today = new Date().toISOString().split('T')[0];
      const attacks = prev.arenaLastReset === today ? (prev.arenaAttacksToday ?? 0) : 0;
      const trophiesGained = win ? (botTier === 'hard' ? 8 : 3) : 0;
      const trophiesLost = !win && botTier === 'hard' ? 5 : 0;
      return {
        ...prev,
        gold: prev.gold + goldStolen,
        totalGoldEarned: prev.totalGoldEarned + goldStolen,
        arenaAttacksToday: attacks + 1,
        arenaLastReset: today,
        arenaPoints: (prev.arenaPoints ?? 0) + (win ? 10 : 2),
        trophies: Math.max(0, (prev.trophies ?? 0) + trophiesGained - trophiesLost),
      };
    });
  }, []);

  const recordPvpBattle = useCallback((win: boolean, goldStolen: number, newTrophies: number) => {
    setState(prev => {
      const today = new Date().toISOString().split('T')[0];
      const attacks = prev.arenaLastReset === today ? (prev.arenaAttacksToday ?? 0) : 0;
      return {
        ...prev,
        gold: prev.gold + goldStolen,
        totalGoldEarned: prev.totalGoldEarned + goldStolen,
        arenaAttacksToday: attacks + 1,
        arenaLastReset: today,
        arenaPoints: (prev.arenaPoints ?? 0) + (win ? 10 : 2),
        trophies: Math.max(0, newTrophies),
      };
    });
  }, []);

  const markDefenseLogSeen = useCallback(() => {
    setState(prev => ({ ...prev, defenseLogSeen: Date.now() }));
  }, []);

  const recordDungeonRaid = useCallback((outcome: 'victory' | 'partial' | 'defeat', rewards: DungeonRewards) => {
    setState(prev => {
      const today = getToday();
      const isNewDay = (prev.dungeonLastRaidDate ?? '').slice(0, 10) !== today;
      const attemptsToday = isNewDay ? 0 : (prev.dungeonAttemptsToday ?? 0);
      if (attemptsToday >= 5) return prev;
      const COOLDOWN_MS = 2 * 3600 * 1000;
      const newMaterials = [...prev.materials];
      for (const drop of rewards.materials) {
        const existing = newMaterials.find(m => m.type === drop.type);
        if (existing) existing.quantity += drop.quantity;
        else newMaterials.push({ ...drop });
      }
      const newEggInventory = rewards.egg ? [...prev.eggInventory, rewards.egg] : prev.eggInventory;
      const xpUpdate = addXp(rewards.xpEarned, prev);
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold + rewards.goldEarned,
        totalGoldEarned: prev.totalGoldEarned + rewards.goldEarned,
        materials: newMaterials,
        eggInventory: newEggInventory,
        dungeonAttemptsToday: attemptsToday + 1,
        dungeonLastRaidDate: today,
        dungeonCooldownUntil: Date.now() + COOLDOWN_MS,
        dungeonTotalVictories: (prev.dungeonTotalVictories ?? 0) + (outcome === 'victory' ? 1 : 0),
      };
    });
  }, [addXp]);

  const recordDungeonRun = useCallback((
    tier: number,
    roomsCleared: number,
    won: boolean,
    goldEarned: number,
    xpEarned: number,
    materials: { type: MaterialType; quantity: number }[],
    tokensHeld: number,
  ) => {
    setState(prev => {
      const COOLDOWN_MAP: Record<number, number> = { 0: 60, 1: 45, 2: 30 };
      const cooldownMin = tokensHeld >= 3 ? 15 : (COOLDOWN_MAP[tokensHeld] ?? 60);
      const cooldownMs = cooldownMin * 60 * 1000;
      const newMaterials = [...prev.materials];
      for (const drop of materials) {
        const existing = newMaterials.find(m => m.type === drop.type);
        if (existing) existing.quantity += drop.quantity;
        else newMaterials.push({ ...drop });
      }
      const xpUpdate = addXp(xpEarned, prev);
      const tierKey = String(tier);
      const prevBest = prev.dungeonBestCompletion?.[tierKey] ?? 0;
      const newBest = Math.max(prevBest, roomsCleared);
      const goldLost = !won ? Math.floor(prev.gold * 0.10) : 0;
      return {
        ...prev,
        ...xpUpdate,
        gold: Math.max(0, prev.gold - goldLost + goldEarned),
        totalGoldEarned: prev.totalGoldEarned + goldEarned,
        materials: newMaterials,
        dungeonCooldownUntil: Date.now() + cooldownMs,
        dungeonTotalVictories: (prev.dungeonTotalVictories ?? 0) + (won ? 1 : 0),
        dungeonBestCompletion: { ...(prev.dungeonBestCompletion ?? {}), [tierKey]: newBest },
      };
    });
  }, [addXp]);

  const resetArenaAttacks = useCallback(() => {
    setState(prev => ({ ...prev, arenaAttacksToday: 0, arenaLastReset: getToday() }));
  }, []);

  const claimHolderGift = useCallback(() => {
    setState((prev) => {
      if (!prev.holderGiftPending) return prev;
      if (!prev.tokenDiscount || prev.tokenDiscount.pct === 0) return prev;
      const today = getToday();
      const streak = Math.min(Math.max(1, (prev.holderGiftStreak || 0) + 1), 30);
      // Gold scales with streak and building income
      const gph = prev.buildings.reduce((s, b) => s + b.baseIncome * b.owned, 0);
      const goldBonus = Math.max(1000 + streak * 300, Math.floor(gph * streak * 0.1));
      // Egg rarity scales with streak
      const eggRarity: EggRarity =
        streak >= 25 ? 'legendary' : streak >= 15 ? 'rare' : streak >= 7 ? 'uncommon' : 'common';
      const variants = EGG_VARIANTS[eggRarity];
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const egg: DragonEgg = { id: `holder-egg-${Date.now()}`, rarity: eggRarity, ...variant };
      // Materials: 1 per type at day 1, +1 every 5 days
      const materialQty = 1 + Math.floor(streak / 5);
      const allMats: MaterialType[] = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'];
      const newMats = [...prev.materials];
      for (const mtype of allMats) {
        const ex = newMats.find(m => m.type === mtype);
        if (ex) ex.quantity += materialQty;
        else newMats.push({ type: mtype, quantity: materialQty });
      }
      return {
        ...prev,
        gold: prev.gold + goldBonus,
        totalGoldEarned: prev.totalGoldEarned + goldBonus,
        eggInventory: [...prev.eggInventory, egg],
        materials: newMats,
        holderGiftPending: false,
        holderGiftLastDate: today,
        holderGiftStreak: streak,
      };
    });
  }, []);

  const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';

  const refreshTokenDiscount = useCallback(async () => {
    const wallet = stateRef.current.walletAddress;
    if (!wallet) return;
    try {
      const res = await fetch(`/frontend-api/token-discount?wallet=${encodeURIComponent(wallet)}`);
      const data = await res.json();
      if (data.success) {
        setState(prev => {
          const cached = prev.tokenDiscount;
          // If an individual token check errored, keep the previously cached value
          // rather than overwriting it with false
          const lynx    = data.lynxError         ? (cached?.lynx        ?? false) : !!data.lynx;
          const xrpnomics = data.xrpnomicsError  ? (cached?.xrpnomics   ?? false) : !!data.xrpnomics;
          const dragonslayer = data.dragonslayerError ? (cached?.dragonslayer ?? false) : !!data.dragonslayer;
          const lynxBalance         = data.lynxError         ? (cached?.lynxBalance         ?? 0) : (data.lynxBalance         ?? 0);
          const xrpnomicsBalance    = data.xrpnomicsError    ? (cached?.xrpnomicsBalance    ?? 0) : (data.xrpnomicsBalance    ?? 0);
          const dragonslayerBalance = data.dragonslayerError ? (cached?.dragonslayerBalance ?? 0) : (data.dragonslayerBalance ?? 0);
          const tokensHeld = [lynx, xrpnomics, dragonslayer].filter(Boolean).length;
          let pct = 0;
          if (tokensHeld >= 3) pct = 50;
          else if (tokensHeld >= 2) pct = 35;
          else if (tokensHeld >= 1) pct = 25;
          // Set holder gift pending if they hold tokens and haven't claimed today;
          // clear it if they no longer hold any tokens.
          const today = getToday();
          const newHolderGiftPending = pct === 0
            ? false
            : pct > 0 && prev.holderGiftLastDate !== today
              ? true
              : prev.holderGiftPending;
          return {
            ...prev,
            tokenDiscount: { lynx, lynxBalance, xrpnomics, xrpnomicsBalance, dragonslayer, dragonslayerBalance, pct, checkedAt: Date.now() },
            holderGiftPending: newHolderGiftPending,
          };
        });
      }
    } catch { /* ignore */ }
  }, []);

  const connectWallet = useCallback(async (address: string) => {
    if (!address) return;
    // Capture previous wallet BEFORE any state change
    const previousWallet = stateRef.current.walletAddress;
    const isSameWallet   = previousWallet === address;
    setState(prev => ({ ...prev, walletAddress: address, isSynced: false }));
    try {
      // Wallet address IS the identity — no player_id sent.
      // If inside Telegram, also pass telegram_id to link TWA → wallet player.
      const tgUser = typeof window !== 'undefined'
        ? (window as any).Telegram?.WebApp?.initDataUnsafe?.user
        : null;
      const res = await fetch(`${API_URL}/api/auth/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          telegram_id: tgUser?.id ?? undefined,
          telegram_username: tgUser?.username ?? tgUser?.first_name ?? undefined,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.player_id) return;

      // Fetch the server save for this wallet player
      const saveRes = await fetch(`${API_URL}/api/save/${data.player_id}`);
      const saveData = await saveRes.json().catch(() => null);
      const serverSave = saveData?.save_json && Object.keys(saveData.save_json).length > 0
        ? saveData.save_json : null;

      if (!isSameWallet) {
        // ── DIFFERENT WALLET ─────────────────────────────────────────────────
        // NEVER copy the current wallet's local data to a different wallet.
        // Always use that wallet's own server save, or start completely fresh.
        if (serverSave) {
          const { tokenDiscount: _td, ...serverSaveClean } = serverSave as any;
          setState(() => ({
            ...serverSaveClean,
            lastTick: Date.now(),
            playerId: data.player_id,
            walletAddress: address,
            displayName: data.username ?? serverSaveClean.displayName ?? '',
            isSynced: true,
          }));
        } else {
          // Brand-new wallet — start a completely fresh account
          setState(() => ({
            ...createInitialState(),
            playerId: data.player_id,
            walletAddress: address,
            displayName: data.username ?? '',
            isSynced: true,
          }));
        }
      } else {
        // ── SAME WALLET (reconnect / auto-reconnect) ─────────────────────────
        const local = stateRef.current;
        const serverLevel = Number(serverSave?.level ?? 0);
        const localLevel  = Number(local.level ?? 0);
        const serverGold  = Number(serverSave?.totalGoldEarned ?? 0);
        const localGold   = Number(local.totalGoldEarned ?? 0);
        const serverAhead = serverSave && (
          serverLevel > localLevel ||
          (serverLevel === localLevel && serverGold > localGold)
        );
        if (serverAhead) {
          // Server is ahead (e.g. progress on another device) — load it
          const { tokenDiscount: _td, ...serverSaveWithoutDiscount } = serverSave as any;
          setState(prev => ({
            ...prev,
            ...serverSaveWithoutDiscount,
            lastTick: Date.now(),
            playerId: data.player_id,
            walletAddress: address,
            displayName: data.username ?? serverSaveWithoutDiscount.displayName ?? prev.displayName,
            isSynced: true,
          }));
        } else {
          // Local is ahead (offline progress) — keep it and push up
          setState(prev => ({
            ...prev,
            playerId: data.player_id,
            walletAddress: address,
            displayName: data.username ?? stateRef.current.displayName,
            isSynced: true,
          }));
          await fetch(`${API_URL}/api/save/${data.player_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ save_json: local }),
          }).catch(() => {});
        }
      }
    } catch {
      // API unavailable — wallet already stored locally above
    }
    // Check token discount for this wallet
    refreshTokenDiscount();
  }, [API_URL, refreshTokenDiscount]);

  const setDisplayName = useCallback(async (name: string) => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed || !stateRef.current.playerId) return;
    setState(prev => ({ ...prev, displayName: trimmed }));
    try {
      await fetch(`${API_URL}/api/auth/username`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: stateRef.current.playerId, username: trimmed }),
      });
    } catch { /* ignore network errors — name saved locally */ }
  }, [API_URL]);

  const forceSave = useCallback(async () => {
    const s = stateRef.current;
    saveState(s);
    if (!s.playerId || !API_URL) return;
    await fetch(`${API_URL}/api/save/${s.playerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_json: s }),
    }).catch(() => {});
  }, [API_URL]);

  const refreshFromServer = useCallback(async () => {
    const s = stateRef.current;
    if (!s.playerId || !API_URL) return;
    const res = await fetch(`${API_URL}/api/save/${s.playerId}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null);
    const serverSave = data?.save_json && Object.keys(data.save_json).length > 0 ? data.save_json : null;
    if (!serverSave) return;
    setState(prev => ({
      ...prev,
      ...serverSave,
      lastTick: Date.now(),
      walletAddress: prev.walletAddress,
      playerId: prev.playerId,
      isSynced: true,
    }));
  }, [API_URL]);

  const addIncubatorSlot = useCallback(() => {
    setState(prev => ({
      ...prev,
      incubator: [...prev.incubator, { egg: null, startedAt: null, endsAt: null, isPermanent: true }],
    }));
  }, []);

  const disconnectWallet = useCallback(() => {
    // Clear localStorage so the storage event fires correctly on reconnect
    localStorage.removeItem('xaman_linked_address');
    localStorage.removeItem('xaman_pending_uuid');
    setState(prev => ({ ...prev, walletAddress: null, playerId: null, isSynced: false, displayName: null, tokenDiscount: null }));
  }, []);

  const getCharacterTier = useCallback((): number => {
    if (state.level >= 80) return 5;
    if (state.level >= 50) return 4;
    if (state.level >= 25) return 3;
    if (state.level >= 10) return 2;
    return 1;
  }, [state.level]);

  return (
    <GameContext.Provider
      value={{
        state,
        tap,
        claimLoginBonus,
        claimQuest,
        buyBuilding,
        startExpedition,
        claimExpedition,
        speedUpExpedition,
        placeEggInIncubator,
        claimHatchedEgg,
        buyFromMerchant,
        addEggs,
        addGold,
        dragonBonuses: {
          tapGoldPct: calcDiminishingBonus(state.hatchedDragons, 'tap_gold_pct'),
          armyPowerFlat: dragonArmyPowerFlat,
          materialDropPct: calcDiminishingBonus(state.hatchedDragons, 'material_drop_pct'),
          expeditionTimePct: calcDiminishingBonus(state.hatchedDragons, 'expedition_time_pct'),
        },
        equipItem,
        unequipItem,
        craftItem,
        setItemNftTokenId,
        refreshFromServer,
        addMaterials,
        connectWallet,
        disconnectWallet,
        setDisplayName,
        forceSave,
        addIncubatorSlot,
        refreshTokenDiscount,
        recordBotBattle,
        recordPvpBattle,
        markDefenseLogSeen,
        recordDungeonRaid,
        recordDungeonRun,
        resetArenaAttacks,
        claimHolderGift,
        goldPerTap,
        goldPerHour,
        gearMultiplier,
        armyPower,
        getBuildingCost,
        canAfford,
        getCharacterTier,
        CRAFTING_RECIPES,
        ITEM_UNLOCK_LEVELS,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
