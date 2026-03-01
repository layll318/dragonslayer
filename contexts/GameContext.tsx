'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

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
  type: 'tap_gold' | 'buy_buildings' | 'full_care';
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
  level: number;
  xp: number;
  xpToNext: number;
  fed: number;
  energy: number;
  mood: number;
  buildings: Building[];
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
  feed: () => void;
  rest: () => void;
  train: () => void;
  buyBuilding: (id: string, qty?: number) => void;
  connectWallet: (address: string) => Promise<void>;
  disconnectWallet: () => void;
  goldPerTap: number;
  goldPerHour: number;
  careMultiplier: number;
  getBuildingCost: (building: Building) => number;
  canAfford: (cost: number) => boolean;
  getCharacterTier: () => number;
}

// ============================================================
// CONSTANTS
// ============================================================

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

const CARE_DECAY_PER_SECOND = 5 / 3600; // 5% per hour
const FEED_COST_BASE = 25;
const REST_COST_BASE = 15;
const TRAIN_COST_BASE = 20;
const FEED_RESTORE = 40;
const REST_RESTORE = 35;
const TRAIN_RESTORE = 30;
const XP_PER_TAP = 2;
const XP_PER_CARE = 5;
const CRIT_CHANCE = 0.08;
const CRIT_MULTIPLIER = 5;
const BOSS_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const LOGIN_REWARDS = [500, 750, 1000, 1500, 2000, 3000, 5000]; // 7-day streak

function calcXpToNext(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function calcCareMultiplier(fed: number, energy: number, mood: number): number {
  const avg = (fed + energy + mood) / 3;
  if (avg >= 75) return 1.5;
  if (avg >= 50) return 1.2;
  if (avg >= 25) return 1.0;
  if (avg >= 10) return 0.5;
  return 0.25;
}

function getCareCost(base: number, level: number): number {
  return Math.floor(base * Math.pow(1.1, level - 1));
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
      id: 'full_care',
      type: 'full_care',
      description: 'Have all care stats above 80%',
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
    level: 1,
    xp: 0,
    xpToNext: calcXpToNext(1),
    fed: 80,
    energy: 80,
    mood: 80,
    buildings: INITIAL_BUILDINGS.map((b) => ({ ...b })),
    lastTick: now,
    createdAt: now,
    loginStreak: 0,
    lastLoginDate: '',
    loginBonusPending: true,
    dailyQuests: generateDailyQuests(1),
    questDate: today,
    tapGoldToday: 0,
    buildingsBoughtToday: 0,
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
      // Apply offline progress
      const now = Date.now();
      const elapsed = (now - saved.lastTick) / 1000; // seconds

      // Migrate building income rates to current values
      const migratedBuildings = saved.buildings.map((savedB) => {
        const template = INITIAL_BUILDINGS.find((b) => b.id === savedB.id);
        return template ? { ...savedB, baseIncome: template.baseIncome } : savedB;
      });

      // Decay care stats
      let fed = Math.max(0, saved.fed - elapsed * CARE_DECAY_PER_SECOND);
      let energy = Math.max(0, saved.energy - elapsed * CARE_DECAY_PER_SECOND);
      let mood = Math.max(0, saved.mood - elapsed * CARE_DECAY_PER_SECOND);

      // Calculate offline gold from buildings (use migrated rates)
      const totalIncome = migratedBuildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
      const careMult = calcCareMultiplier(fed, energy, mood);
      const offlineGold = Math.floor((totalIncome / 3600) * elapsed * careMult * 0.5); // 50% offline efficiency

      const today = getToday();
      const lastLogin = saved.lastLoginDate || '';
      const isNewDay = lastLogin !== today;
      const newStreak = isNewDay ? (saved.loginStreak || 0) + 1 : (saved.loginStreak || 0);

      // Reset daily quests if new day
      const newQuests = isNewDay
        ? generateDailyQuests(saved.level)
        : (saved.dailyQuests || generateDailyQuests(saved.level));

      // Migrate boss nextAt if missing
      const savedBoss = saved.boss || { active: false, hp: 0, maxHp: 0, reward: 0, nextAt: now + BOSS_COOLDOWN_MS };

      setState({
        ...saved,
        buildings: migratedBuildings,
        fed,
        energy,
        mood,
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

  // Game tick every 250ms
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setState((prev) => {
        const now = Date.now();
        const dt = (now - prev.lastTick) / 1000;

        // Decay care stats
        const fed = Math.max(0, prev.fed - dt * CARE_DECAY_PER_SECOND);
        const energy = Math.max(0, prev.energy - dt * CARE_DECAY_PER_SECOND);
        const mood = Math.max(0, prev.mood - dt * CARE_DECAY_PER_SECOND);

        // Passive income from buildings
        const totalIncome = prev.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0);
        const careMult = calcCareMultiplier(fed, energy, mood);
        const passiveGold = (totalIncome / 3600) * dt * careMult;

        // Boss spawning
        let boss = prev.boss ?? { active: false, hp: 0, maxHp: 0, reward: 0, nextAt: now + BOSS_COOLDOWN_MS };
        if (!boss.active && now >= boss.nextAt && boss.nextAt > 0) {
          const gph = Math.floor(totalIncome * careMult);
          boss = spawnBoss(prev.level, gph);
        }

        // Care quest progress — mark complete if all stats > 80
        let dailyQuests = prev.dailyQuests ?? [];
        const careQuest = dailyQuests.find(q => q.type === 'full_care' && !q.completed);
        if (careQuest && fed >= 80 && energy >= 80 && mood >= 80) {
          dailyQuests = dailyQuests.map(q =>
            q.id === 'full_care' ? { ...q, progress: 1, completed: true } : q
          );
        }

        return {
          ...prev,
          fed,
          energy,
          mood,
          gold: prev.gold + passiveGold,
          totalGoldEarned: prev.totalGoldEarned + passiveGold,
          lastTick: now,
          boss,
          dailyQuests,
        };
      });
    }, 250);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Keep stateRef current so intervals always access the latest state
  useEffect(() => {
    stateRef.current = state;
  });

  // Auto-save to localStorage immediately on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

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

  const careMultiplier = calcCareMultiplier(state.fed, state.energy, state.mood);

  const goldPerTap = Math.max(1, Math.floor((1 + state.level * 0.5) * careMultiplier));

  const goldPerHour = Math.floor(
    state.buildings.reduce((sum, b) => sum + b.baseIncome * b.owned, 0) * careMultiplier
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
      const base = Math.max(1, Math.floor((1 + prev.level * 0.5) * calcCareMultiplier(prev.fed, prev.energy, prev.mood)));
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

  const feed = useCallback(() => {
    setState((prev) => {
      const cost = getCareCost(FEED_COST_BASE, prev.level);
      if (prev.gold < cost) return prev;
      const xpUpdate = addXp(XP_PER_CARE, prev);
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold - cost,
        fed: Math.min(100, prev.fed + FEED_RESTORE),
      };
    });
  }, [addXp]);

  const rest = useCallback(() => {
    setState((prev) => {
      const cost = getCareCost(REST_COST_BASE, prev.level);
      if (prev.gold < cost) return prev;
      const xpUpdate = addXp(XP_PER_CARE, prev);
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold - cost,
        energy: Math.min(100, prev.energy + REST_RESTORE),
      };
    });
  }, [addXp]);

  const train = useCallback(() => {
    setState((prev) => {
      const cost = getCareCost(TRAIN_COST_BASE, prev.level);
      if (prev.gold < cost) return prev;
      const xpUpdate = addXp(XP_PER_CARE, prev);
      return {
        ...prev,
        ...xpUpdate,
        gold: prev.gold - cost,
        mood: Math.min(100, prev.mood + TRAIN_RESTORE),
      };
    });
  }, [addXp]);

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
      const base = Math.max(1, Math.floor((1 + prev.level * 0.5) * calcCareMultiplier(prev.fed, prev.energy, prev.mood)));
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
        // Push current local save to server
        if (data.player_id) {
          try {
            await fetch(`${API_URL}/api/save/${data.player_id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ save_json: state }),
            });
          } catch {/* ignore */}
        }
      }
    } catch {
      // API unavailable — store wallet locally only
      setState(prev => ({ ...prev, walletAddress: address, isSynced: false }));
    }
  }, [API_URL, state]);

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
        feed,
        rest,
        train,
        buyBuilding,
        connectWallet,
        disconnectWallet,
        goldPerTap,
        goldPerHour,
        careMultiplier,
        getBuildingCost,
        canAfford,
        getCharacterTier,
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
