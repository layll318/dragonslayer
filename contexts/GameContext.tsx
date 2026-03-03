'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

export type MaterialType = 'dragon_scale' | 'fire_crystal' | 'iron_ore' | 'bone_shard' | 'ancient_rune';
export type MaterialQuality = 'common' | 'uncommon' | 'rare';
export type ItemType = 'weapon' | 'shield' | 'helm' | 'armor' | 'ring';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Material {
  type: MaterialType;
  quality: MaterialQuality;
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
}

export interface CraftingRecipe {
  id: string;
  itemType: ItemType;
  name: string;
  rarity: ItemRarity;
  power: number;
  goldCost: number;
  materials: { type: MaterialType; quality: MaterialQuality; quantity: number }[];
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

export interface Boss {
  active: boolean;
  hp: number;
  maxHp: number;
  reward: number;
  nextAt: number;
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
  // Boss
  boss: Boss;
  // Last tap result
  lastTapEarned: number;
  lastTapCrit: boolean;
  // Identity / server sync
  playerId: number | null;
  walletAddress: string | null;
  isSynced: boolean;
}

interface GameContextType {
  state: GameState;
  tap: (comboMult?: number) => void;
  tapBoss: () => void;
  claimLoginBonus: () => void;
  claimQuest: (id: string) => void;
  buyBuilding: (id: string, qty?: number) => void;
  startExpedition: (hours: 4 | 8 | 12) => void;
  claimExpedition: () => void;
  equipItem: (itemId: string) => void;
  unequipItem: (slot: keyof EquipmentSlots) => void;
  craftItem: (recipeId: string) => void;
  connectWallet: (address: string) => Promise<void>;
  disconnectWallet: () => void;
  goldPerTap: number;
  goldPerHour: number;
  gearMultiplier: number;
  getBuildingCost: (building: Building) => number;
  canAfford: (cost: number) => boolean;
  getCharacterTier: () => number;
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
};

// ── Upgrade chains: T1(common) → T2(uncommon) → T3(rare) → T4(epic) ──────────
// T1 = forge from scratch with common drops (no base item needed)
// T2–T4 = consume previous tier item + drops
export const CRAFTING_RECIPES: CraftingRecipe[] = [

  // ── WEAPON ──────────────────────────────────────────────────────────────────
  {
    id: 'iron_sword', itemType: 'weapon', name: 'Iron Sword', rarity: 'common', power: 5, goldCost: 300,
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 3 }, { type: 'bone_shard', quality: 'common', quantity: 2 }],
  },
  {
    id: 'steel_sword', itemType: 'weapon', name: 'Steel Sword', rarity: 'uncommon', power: 10, goldCost: 800,
    upgradesFrom: { itemType: 'weapon', rarity: 'common' },
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 4 }, { type: 'dragon_scale', quality: 'common', quantity: 3 }],
  },
  {
    id: 'flame_blade', itemType: 'weapon', name: 'Flame Blade', rarity: 'rare', power: 18, goldCost: 2000,
    upgradesFrom: { itemType: 'weapon', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quality: 'uncommon', quantity: 3 }, { type: 'dragon_scale', quality: 'uncommon', quantity: 3 }],
  },
  {
    id: 'dragon_fang', itemType: 'weapon', name: 'Dragon Fang', rarity: 'epic', power: 30, goldCost: 6000,
    upgradesFrom: { itemType: 'weapon', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quality: 'rare', quantity: 4 }, { type: 'ancient_rune', quality: 'rare', quantity: 2 }],
  },

  // ── SHIELD ──────────────────────────────────────────────────────────────────
  {
    id: 'oak_shield', itemType: 'shield', name: 'Oak Shield', rarity: 'common', power: 4, goldCost: 250,
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 3 }, { type: 'bone_shard', quality: 'common', quantity: 2 }],
  },
  {
    id: 'iron_shield', itemType: 'shield', name: 'Iron Shield', rarity: 'uncommon', power: 9, goldCost: 700,
    upgradesFrom: { itemType: 'shield', rarity: 'common' },
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 4 }, { type: 'dragon_scale', quality: 'common', quantity: 2 }],
  },
  {
    id: 'dragon_shield', itemType: 'shield', name: 'Dragon Shield', rarity: 'rare', power: 16, goldCost: 1800,
    upgradesFrom: { itemType: 'shield', rarity: 'uncommon' },
    materials: [{ type: 'dragon_scale', quality: 'uncommon', quantity: 3 }, { type: 'fire_crystal', quality: 'uncommon', quantity: 2 }],
  },
  {
    id: 'aegis', itemType: 'shield', name: 'Aegis', rarity: 'epic', power: 26, goldCost: 5500,
    upgradesFrom: { itemType: 'shield', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quality: 'rare', quantity: 3 }, { type: 'ancient_rune', quality: 'rare', quantity: 3 }],
  },

  // ── HELM ────────────────────────────────────────────────────────────────────
  {
    id: 'iron_helm', itemType: 'helm', name: 'Iron Helm', rarity: 'common', power: 3, goldCost: 200,
    materials: [{ type: 'bone_shard', quality: 'common', quantity: 2 }, { type: 'iron_ore', quality: 'common', quantity: 2 }],
  },
  {
    id: 'scale_helm', itemType: 'helm', name: 'Scale Helm', rarity: 'uncommon', power: 8, goldCost: 600,
    upgradesFrom: { itemType: 'helm', rarity: 'common' },
    materials: [{ type: 'dragon_scale', quality: 'common', quantity: 3 }, { type: 'ancient_rune', quality: 'common', quantity: 2 }],
  },
  {
    id: 'infernal_crown', itemType: 'helm', name: 'Infernal Crown', rarity: 'rare', power: 14, goldCost: 1600,
    upgradesFrom: { itemType: 'helm', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quality: 'uncommon', quantity: 3 }, { type: 'ancient_rune', quality: 'uncommon', quantity: 2 }],
  },
  {
    id: 'demon_helm', itemType: 'helm', name: 'Demon Helm', rarity: 'epic', power: 24, goldCost: 5000,
    upgradesFrom: { itemType: 'helm', rarity: 'rare' },
    materials: [{ type: 'ancient_rune', quality: 'rare', quantity: 4 }, { type: 'fire_crystal', quality: 'rare', quantity: 2 }],
  },

  // ── ARMOR ───────────────────────────────────────────────────────────────────
  {
    id: 'leather_armor', itemType: 'armor', name: 'Leather Armor', rarity: 'common', power: 4, goldCost: 300,
    materials: [{ type: 'bone_shard', quality: 'common', quantity: 3 }, { type: 'iron_ore', quality: 'common', quantity: 2 }],
  },
  {
    id: 'chain_armor', itemType: 'armor', name: 'Chain Armor', rarity: 'uncommon', power: 10, goldCost: 900,
    upgradesFrom: { itemType: 'armor', rarity: 'common' },
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 4 }, { type: 'bone_shard', quality: 'common', quantity: 3 }],
  },
  {
    id: 'dragonscale_armor', itemType: 'armor', name: 'Dragonscale Armor', rarity: 'rare', power: 20, goldCost: 2500,
    upgradesFrom: { itemType: 'armor', rarity: 'uncommon' },
    materials: [{ type: 'dragon_scale', quality: 'uncommon', quantity: 4 }, { type: 'iron_ore', quality: 'uncommon', quantity: 2 }],
  },
  {
    id: 'infernal_plate', itemType: 'armor', name: 'Infernal Plate', rarity: 'epic', power: 34, goldCost: 7000,
    upgradesFrom: { itemType: 'armor', rarity: 'rare' },
    materials: [{ type: 'dragon_scale', quality: 'rare', quantity: 4 }, { type: 'fire_crystal', quality: 'rare', quantity: 3 }],
  },

  // ── RING ────────────────────────────────────────────────────────────────────
  {
    id: 'iron_ring', itemType: 'ring', name: 'Iron Ring', rarity: 'common', power: 2, goldCost: 150,
    materials: [{ type: 'iron_ore', quality: 'common', quantity: 2 }, { type: 'ancient_rune', quality: 'common', quantity: 1 }],
  },
  {
    id: 'flame_ring', itemType: 'ring', name: 'Flame Ring', rarity: 'uncommon', power: 7, goldCost: 500,
    upgradesFrom: { itemType: 'ring', rarity: 'common' },
    materials: [{ type: 'fire_crystal', quality: 'common', quantity: 3 }, { type: 'ancient_rune', quality: 'common', quantity: 1 }],
  },
  {
    id: 'dragons_seal', itemType: 'ring', name: "Dragon's Seal", rarity: 'rare', power: 13, goldCost: 1400,
    upgradesFrom: { itemType: 'ring', rarity: 'uncommon' },
    materials: [{ type: 'fire_crystal', quality: 'uncommon', quantity: 3 }, { type: 'ancient_rune', quality: 'uncommon', quantity: 2 }],
  },
  {
    id: 'ancient_sigil', itemType: 'ring', name: 'Ancient Sigil', rarity: 'epic', power: 22, goldCost: 4500,
    upgradesFrom: { itemType: 'ring', rarity: 'rare' },
    materials: [{ type: 'ancient_rune', quality: 'rare', quantity: 3 }, { type: 'fire_crystal', quality: 'rare', quantity: 2 }],
  },
];

const MAX_INVENTORY = 20;

const EMPTY_EQUIPMENT: EquipmentSlots = { weapon: null, shield: null, helm: null, armor: null, ring: null };

const INITIAL_BUILDINGS: Building[] = [
  {
    id: 'campfire',
    name: 'Campfire',
    description: 'A humble fire to warm your bones',
    icon: '🔥',
    baseCost: 100,
    baseIncome: 200,
    costMultiplier: 1.15,
    unlockLevel: 1,
    owned: 0,
  },
  {
    id: 'forge',
    name: 'Forge',
    description: 'Smelt ore into dragon-slaying weapons',
    icon: '⚒️',
    baseCost: 500,
    baseIncome: 1000,
    costMultiplier: 1.15,
    unlockLevel: 3,
    owned: 0,
  },
  {
    id: 'tavern',
    name: 'Tavern',
    description: 'Recruit fellow adventurers',
    icon: '🍺',
    baseCost: 2000,
    baseIncome: 4000,
    costMultiplier: 1.15,
    unlockLevel: 5,
    owned: 0,
  },
  {
    id: 'training_ground',
    name: 'Training Ground',
    description: 'Hone your combat skills',
    icon: '⚔️',
    baseCost: 10000,
    baseIncome: 20000,
    costMultiplier: 1.15,
    unlockLevel: 8,
    owned: 0,
  },
  {
    id: 'dragon_lair',
    name: 'Dragon Lair',
    description: 'Harvest dragon scales and bones',
    icon: '🐉',
    baseCost: 50000,
    baseIncome: 100000,
    costMultiplier: 1.15,
    unlockLevel: 12,
    owned: 0,
  },
  {
    id: 'castle',
    name: 'Castle',
    description: 'A fortress befitting a true Dragonslayer',
    icon: '🏰',
    baseCost: 250000,
    baseIncome: 500000,
    costMultiplier: 1.15,
    unlockLevel: 18,
    owned: 0,
  },
];

const XP_PER_TAP = 2;
const CRIT_CHANCE = 0.08;
const CRIT_MULTIPLIER = 5;
const BOSS_COOLDOWN_MS = 3 * 60 * 1000;
const LOGIN_REWARDS = [500, 750, 1000, 1500, 2000, 3000, 5000];

function calcXpToNext(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function calcGearMultiplier(equipment: EquipmentSlots): number {
  const equipped = Object.values(equipment).filter(Boolean) as InventoryItem[];
  const total = equipped.reduce((sum, item) => sum + RARITY_SCORES[item.rarity], 0);
  return Math.max(1.0, 1.0 + total * 0.06);
}

function calcExpeditionYield(
  level: number,
  gearMult: number,
  hours: 4 | 8 | 12,
): { dragonsSlain: number; goldEarned: number; materials: Material[] } {
  const rand = 0.85 + Math.random() * 0.30;
  const gearPower = (gearMult - 1.0) / 0.06;
  const dragonsSlain = Math.max(1, Math.floor((level * 2 + gearPower * 3) * hours * rand));
  const goldEarned = dragonsSlain * (50 + level * 8);

  const allTypes: MaterialType[] = ['dragon_scale', 'fire_crystal', 'iron_ore', 'bone_shard', 'ancient_rune'];
  const quality: MaterialQuality = hours >= 12 ? 'rare' : hours >= 8 ? 'uncommon' : 'common';
  const totalMats = hours === 4 ? Math.floor(Math.random() * 3) + 1
                  : hours === 8 ? Math.floor(Math.random() * 4) + 2
                  :               Math.floor(Math.random() * 6) + 3;

  const types = [...allTypes].sort(() => Math.random() - 0.5).slice(0, Math.min(totalMats, 4));
  const materials: Material[] = types.map(type => ({
    type, quality, quantity: Math.floor(Math.random() * 3) + 1,
  }));

  return { dragonsSlain, goldEarned, materials };
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function generateDailyQuests(level: number): DailyQuest[] {
  const goldTarget = Math.max(300, level * 150);
  const buildTarget = Math.max(1, Math.min(3, Math.floor(level / 3) + 1));
  return [
    {
      id: 'tap_gold',
      type: 'tap_gold',
      description: `Earn ${goldTarget.toLocaleString()} gold by tapping`,
      target: goldTarget,
      progress: 0,
      reward: Math.floor(goldTarget * 0.6),
      completed: false,
      claimed: false,
    },
    {
      id: 'buy_buildings',
      type: 'buy_buildings',
      description: `Buy ${buildTarget} building${buildTarget > 1 ? 's' : ''}`,
      target: buildTarget,
      progress: 0,
      reward: Math.floor(level * 80 + 200),
      completed: false,
      claimed: false,
    },
    {
      id: 'complete_expedition',
      type: 'complete_expedition',
      description: 'Complete 1 expedition',
      target: 1,
      progress: 0,
      reward: Math.floor(level * 50 + 150),
      completed: false,
      claimed: false,
    },
  ];
}

function spawnBoss(level: number, goldPerHour: number): Boss {
  const maxHp = 15 + level * 3;
  const reward = Math.max(200, Math.floor(goldPerHour / 12)); // ~5 min income
  return { active: true, hp: maxHp, maxHp, reward, nextAt: 0 };
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
    boss: { active: false, hp: 0, maxHp: 0, reward: 0, nextAt: now + BOSS_COOLDOWN_MS },
    lastTapEarned: 0,
    lastTapCrit: false,
    playerId: null,
    walletAddress: null,
    isSynced: false,
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

      // Migrate building income rates to current values
      const migratedBuildings = saved.buildings.map((savedB) => {
        const template = INITIAL_BUILDINGS.find((b) => b.id === savedB.id);
        return template ? { ...savedB, baseIncome: template.baseIncome } : savedB;
      });

      // Calculate offline gold from buildings using gear multiplier
      const savedEquipment = saved.equipment ?? { ...EMPTY_EQUIPMENT };
      const gearMult = calcGearMultiplier(savedEquipment);
      const totalIncome = migratedBuildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const offlineGold = Math.floor((totalIncome / 3600) * elapsed * gearMult * 0.5);

      const today = getToday();
      const lastLogin = saved.lastLoginDate || '';
      const isNewDay = lastLogin !== today;
      const newStreak = isNewDay ? (saved.loginStreak || 0) + 1 : (saved.loginStreak || 0);

      // Migrate daily quests — replace full_care with complete_expedition if needed
      const rawQuests = isNewDay
        ? generateDailyQuests(saved.level)
        : (saved.dailyQuests || generateDailyQuests(saved.level));
      const newQuests = rawQuests.map((q: DailyQuest) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q as any).type === 'full_care'
          ? { ...q, id: 'complete_expedition', type: 'complete_expedition' as const, description: 'Complete 1 expedition' }
          : q
      );

      const savedBoss = saved.boss || { active: false, hp: 0, maxHp: 0, reward: 0, nextAt: now + BOSS_COOLDOWN_MS };

      setState({
        ...saved,
        buildings: migratedBuildings,
        equipment: savedEquipment,
        inventory: saved.inventory ?? [],
        materials: saved.materials ?? [],
        activeExpedition: saved.activeExpedition ?? null,
        lastExpeditionResult: null,
        totalDragonsSlain: saved.totalDragonsSlain ?? 0,
        totalExpeditions: saved.totalExpeditions ?? 0,
        expeditionsToday: isNewDay ? 0 : (saved.expeditionsToday ?? 0),
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
        boss: savedBoss,
        lastTapEarned: saved.lastTapEarned || 0,
        lastTapCrit: saved.lastTapCrit || false,
        playerId: saved.playerId ?? null,
        walletAddress: saved.walletAddress ?? null,
        isSynced: saved.isSynced ?? false,
      });
    }

    // Pick up wallet address from Xaman return redirect or localStorage fallback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const linkedAddr = params.get('wallet_linked') || localStorage.getItem('xaman_linked_address');
      if (linkedAddr && linkedAddr.startsWith('r') && linkedAddr.length >= 25) {
        localStorage.removeItem('xaman_linked_address');
        window.history.replaceState({}, '', window.location.pathname);
        setState(prev => ({ ...prev, walletAddress: linkedAddr }));
        // Also register with backend to get playerId
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

    // TWA auth — if running inside Telegram, register the user
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
        .then(data => {
          if (data.success) {
            setState(prev => ({
              ...prev,
              playerId: data.player_id,
              walletAddress: data.wallet_address ?? prev.walletAddress,
              isSynced: true,
            }));
            // Load server save and merge (server wins for progress)
            return fetch(`${apiUrl}/api/save/${data.player_id}`);
          }
        })
        .then(r => r?.json())
        .then(saveData => {
          if (saveData?.save_json && Object.keys(saveData.save_json).length > 0) {
            setState(prev => ({
              ...prev,
              ...saveData.save_json,
              // Keep real-time fields from current state
              lastTick: Date.now(),
              playerId: prev.playerId,
              walletAddress: prev.walletAddress,
              isSynced: true,
            }));
          }
        })
        .catch(() => {/* ignore network errors */});
    }
  }, []);

  // Game tick every 1s — passive income + boss spawning only
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setState((prev) => {
        const now = Date.now();
        const dt = (now - prev.lastTick) / 1000;

        // Passive income from buildings, boosted by gear
        const totalIncome = prev.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
        const gearMult = calcGearMultiplier(prev.equipment);
        const passiveGold = (totalIncome / 3600) * dt * gearMult;

        // Boss spawning
        let boss = prev.boss ?? { active: false, hp: 0, maxHp: 0, reward: 0, nextAt: now + BOSS_COOLDOWN_MS };
        if (!boss.active && now >= boss.nextAt && boss.nextAt > 0) {
          boss = spawnBoss(prev.level, Math.floor(totalIncome * gearMult));
        }

        return {
          ...prev,
          gold: prev.gold + passiveGold,
          totalGoldEarned: prev.totalGoldEarned + passiveGold,
          lastTick: now,
          boss,
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

  const gearMultiplier = calcGearMultiplier(state.equipment);

  const goldPerTap = Math.max(1, Math.floor((1 + state.level * 0.5) * gearMultiplier));

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
      const base = Math.max(1, Math.floor((1 + prev.level * 0.5) * calcGearMultiplier(prev.equipment)));
      const isCrit = Math.random() < CRIT_CHANCE;
      const earned = Math.floor(base * comboMult * (isCrit ? CRIT_MULTIPLIER : 1));
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
      const activeExpedition: ActiveExpedition = {
        startedAt: now,
        durationHours: hours,
        endsAt: now + hours * 3600 * 1000,
      };
      return { ...prev, activeExpedition };
    });
  }, []);

  const claimExpedition = useCallback(() => {
    setState((prev) => {
      if (!prev.activeExpedition) return prev;
      if (Date.now() < prev.activeExpedition.endsAt) return prev;
      const gearMult = calcGearMultiplier(prev.equipment);
      const { dragonsSlain, goldEarned, materials } = calcExpeditionYield(
        prev.level, gearMult, prev.activeExpedition.durationHours,
      );
      const newMaterials = [...prev.materials];
      for (const drop of materials) {
        const existing = newMaterials.find(m => m.type === drop.type && m.quality === drop.quality);
        if (existing) existing.quantity += drop.quantity;
        else newMaterials.push({ ...drop });
      }
      const dailyQuests = prev.dailyQuests.map(q =>
        q.type === 'complete_expedition' && !q.completed
          ? { ...q, progress: 1, completed: true }
          : q
      );
      const xpUpdate = addXp(dragonsSlain * 3, prev);
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold + goldEarned,
        totalGoldEarned: prev.totalGoldEarned + goldEarned,
        totalDragonsSlain: prev.totalDragonsSlain + dragonsSlain,
        totalExpeditions: prev.totalExpeditions + 1,
        expeditionsToday: prev.expeditionsToday + 1,
        materials: newMaterials,
        activeExpedition: null,
        lastExpeditionResult: { dragonsSlain, goldEarned, materials },
        dailyQuests,
      };
    });
  }, [addXp]);

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

  const craftItem = useCallback((recipeId: string) => {
    setState((prev) => {
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      if (!recipe || prev.gold < recipe.goldCost) return prev;

      // Check materials
      for (const req of recipe.materials) {
        const held = prev.materials.find(m => m.type === req.type && m.quality === req.quality);
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
          const req = recipe.materials.find(r => r.type === m.type && r.quality === m.quality);
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
      if (prev.gold < totalCost) return prev;

      const newBuildings = [...prev.buildings];
      newBuildings[idx] = { ...building, owned: building.owned + qty };
      const xpUpdate = addXp(10 * qty, prev);

      // Update buy_buildings quest
      const newBoughtToday = prev.buildingsBoughtToday + qty;
      const dailyQuests = prev.dailyQuests.map(q => {
        if (q.type === 'buy_buildings' && !q.completed) {
          const progress = Math.min(newBoughtToday, q.target);
          return { ...q, progress, completed: progress >= q.target };
        }
        return q;
      });

      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold - totalCost,
        buildings: newBuildings,
        buildingsBoughtToday: newBoughtToday,
        dailyQuests,
      };
    });
  }, [addXp]);

  const tapBoss = useCallback(() => {
    setState((prev) => {
      if (!prev.boss.active) return prev;
      const base = Math.max(1, Math.floor((1 + prev.level * 0.5) * calcGearMultiplier(prev.equipment)));
      const newHp = prev.boss.hp - base;
      if (newHp <= 0) {
        return {
          ...prev,
          gold: prev.gold + prev.boss.reward,
          totalGoldEarned: prev.totalGoldEarned + prev.boss.reward,
          boss: { active: false, hp: 0, maxHp: prev.boss.maxHp, reward: 0, nextAt: Date.now() + BOSS_COOLDOWN_MS },
        };
      }
      return { ...prev, boss: { ...prev.boss, hp: newHp } };
    });
  }, []);

  const claimLoginBonus = useCallback(() => {
    setState((prev) => {
      if (!prev.loginBonusPending) return prev;
      const streakIdx = Math.min((prev.loginStreak - 1), LOGIN_REWARDS.length - 1);
      const bonus = LOGIN_REWARDS[Math.max(0, streakIdx)];
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

  const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';

  const connectWallet = useCallback(async (address: string) => {
    if (!address) return;
    // Always set wallet locally first so UI updates immediately
    setState(prev => ({ ...prev, walletAddress: address, isSynced: false }));
    try {
      const res = await fetch(`${API_URL}/api/auth/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await res.json();
      if (data.success) {
        setState(prev => ({
          ...prev,
          walletAddress: address,
          playerId: data.player_id,
          isSynced: true,
        }));
        // Push current local save to server using stateRef to avoid stale closure
        if (data.player_id) {
          try {
            await fetch(`${API_URL}/api/save/${data.player_id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ save_json: stateRef.current }),
            });
          } catch {/* ignore */}
        }
      }
    } catch {
      // API unavailable — wallet already stored locally above
    }
  }, [API_URL]);

  const disconnectWallet = useCallback(() => {
    setState(prev => ({ ...prev, walletAddress: null, playerId: null, isSynced: false }));
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
        tapBoss,
        claimLoginBonus,
        claimQuest,
        buyBuilding,
        startExpedition,
        claimExpedition,
        equipItem,
        unequipItem,
        craftItem,
        connectWallet,
        disconnectWallet,
        goldPerTap,
        goldPerHour,
        gearMultiplier,
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
