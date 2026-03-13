'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  calcDiminishingBonus,
  DragonBonusType,
  DragonEgg,
  EggRarity,
  FUSION_BUFF_BY_RECIPE,
  REFORGE_COSTS,
  REFORGE_POWER_STEPS,
  MAX_REFORGE_LEVEL,
  ALCHEMY_RECIPES,
  LegendaryRecipe,
  EnchantOption,
  getItemLevelCost,
  ClaimableDrop,
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

type MintPhase = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

const BURN_SOUL_YIELD: Record<string, number> = { common: 2, uncommon: 4, rare: 6, epic: 10, legendary: 20 };

const ITEM_IMAGE_BY_NAME: Record<string, string> = {
  // Legendary — unique art per item
  'Lynx Sword':         '/images/nft/lynx_sword.png',
  'Nomic Shield':       '/images/nft/nomic_shield.png',
  'Void Blade':         '/images/nft/void_blade.png',
  "Dragon's Aegis":     '/images/nft/dragons_aegis.png',
  'Dragonslayer Blade': '/images/nft/dragonslayer_blade.png',
  'Nomic Fortress':     '/images/nft/nomic_fortress.png',
  'Infernal Crown':     '/images/nft/infernal_crown_legendary.png',
  'Dragon Plate':       '/images/nft/dragon_plate.png',
  "Dragon's Eye":       '/images/nft/dragons_eye.png',
  'Eternal Ring':       '/images/nft/eternal_ring.png',
  // Epic (T4) — unique art per item
  'Dragon Fang':        '/images/nft/dragon_fang.png',
  'Aegis':              '/images/nft/aegis.png',
  'Demon Helm':         '/images/nft/demon_helm.png',
  'Infernal Plate':     '/images/nft/infernal_plate.png',
  'Ancient Sigil':      '/images/nft/ancient_sigil.png',
  // Rare (T3)
  'Flame Blade':        '/images/nft/weapon_flame_blade.png',
  'Dragon Shield':      '/images/nft/shield_dragon.png',
  'Dragonscale Armor':  '/images/nft/armor_dragonscale.png',
  "Dragon's Seal":      '/images/nft/ring_dragons_seal.png',
  // Uncommon (T2)
  'Steel Sword':        '/images/nft/weapon_steel_sword.png',
  'Iron Shield':        '/images/nft/shield_iron.png',
  'Scale Helm':         '/images/nft/helm_scale.png',
  'Chain Armor':        '/images/nft/armor_chain.png',
  'Flame Ring':         '/images/nft/ring_flame.png',
  // Common (T1)
  'Iron Sword':         '/images/nft/weapon_iron_sword.png',
  'Oak Shield':         '/images/nft/shield_oak.png',
  'Iron Helm':          '/images/nft/helm_iron.png',
  'Leather Armor':      '/images/nft/armor_leather.png',
  'Iron Ring':          '/images/nft/ring_iron.png',
};
function getItemImage(name: string): string {
  return ITEM_IMAGE_BY_NAME[name] ?? '/images/salyer4.png';
}

function ItemCard({ item, onEquip, onUnequip, isEquipped, onMint, mintPhase, showMintBtn, onClearNft, onBurn }: {
  item: InventoryItem;
  onEquip?: () => void;
  onUnequip?: () => void;
  isEquipped?: boolean;
  onMint?: () => void;
  mintPhase?: MintPhase;
  showMintBtn?: boolean;
  onClearNft?: () => void;
  onBurn?: () => void;
}) {
  const color = RARITY_COLORS[item.rarity];
  const isMinting = mintPhase === 'loading' || mintPhase === 'waiting';
  return (
    <div
      className="dragon-panel p-2 flex flex-col gap-1"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-cinzel font-bold text-[11px] truncate" style={{ color }}>
          {item.name}
        </span>
        <div className="flex items-center gap-1">
          {item.nftTokenId && (
            <span className="flex items-center gap-0.5 text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040' }}>
              ✨ NFT
              {onClearNft && (
                <button
                  onClick={e => { e.stopPropagation(); onClearNft(); }}
                  className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
                  title="Clear bad mint"
                >×</button>
              )}
            </span>
          )}
          <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: `${color}20`, color }}>
            {item.rarity}
          </span>
        </div>
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
      {showMintBtn && !item.nftTokenId && onMint && (
        <button
          onClick={onMint}
          disabled={isMinting}
          className="w-full mt-0.5 py-1 rounded text-[8px] font-bold transition-all active:scale-95"
          style={{
            background: isMinting ? 'rgba(240,192,64,0.1)' : 'linear-gradient(135deg,#b8860b,#f0c040)',
            color: isMinting ? '#f0c040' : '#1a0e00',
            opacity: isMinting ? 0.7 : 1,
          }}
        >
          {isMinting ? '⏳ Minting…' : '✨ Mint NFT'}
        </button>
      )}
      {onBurn && (
        <button
          onClick={() => {
            // NFT items route through the Xaman confirm modal (set via setBurnConfirmItem)
            // so no window.confirm here. Non-NFT legendaries still get a native confirm.
            if (!item.nftTokenId && item.rarity === 'legendary') {
              if (!window.confirm(`Burn ${item.name} for ${BURN_SOUL_YIELD.legendary}🧿 Dragon Souls? This cannot be undone.`)) return;
            }
            onBurn();
          }}
          className="w-full mt-0.5 py-1 rounded text-[8px] font-bold transition-all active:scale-95"
          style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          {item.nftTokenId ? '� Burn NFT' : `🔥 Burn +${BURN_SOUL_YIELD[item.rarity] ?? 2}🧿`}
        </button>
      )}
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
    fuseLegendaryItems,
    reforgeItem,
    alchemyConvert,
    burnItemToWallet,
    clearItemNftTokenId,
    speedUpExpedition,
    placeEggInIncubator,
    claimHatchedEgg,
    gearMultiplier,
    armyPower,
    CRAFTING_RECIPES,
    ITEM_UNLOCK_LEVELS: unlockLevels,
    burnInventoryItem,
    claimDrop,
    dismissDrop,
    levelUpItem,
    forgeLegendary,
    enchantItem,
    LEGENDARY_RECIPES,
    ENCHANT_OPTIONS,
    FORGE_LEVEL_COSTS,
    dismissCraftingV2Modal,
    removeBurnedNft,
    forceSave,
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
  const [claimed, setClaimed] = useState(() => !!state.lastExpeditionResult && !state.activeExpedition);
  const [craftOpen, setCraftOpen] = useState(false);

  // ── Mint state ────────────────────────────────────────────────────────────
  const [mintItemId, setMintItemId] = useState<string | null>(null);
  const [mintPhase, setMintPhase] = useState<MintPhase>('idle');
  const [mintDeeplink, setMintDeeplink] = useState<string | null>(null);
  const [mintQr, setMintQr] = useState<string | null>(null);
  const [mintUuid, setMintUuid] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const mintPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const mintBurstRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mintUuidRef  = useRef<string | null>(null);
  const mintItemIdRef = useRef<string | null>(null);
  const [fuseSuccess, setFuseSuccess] = useState<string | null>(null);
  const [mintConfirmItem, setMintConfirmItem] = useState<InventoryItem | null>(null);

  // ── NFT Burn state ────────────────────────────────────────────────────────
  const [burnConfirmItem, setBurnConfirmItem] = useState<InventoryItem | null>(null);
  const [burnPhase, setBurnPhase] = useState<'idle' | 'loading' | 'waiting' | 'success' | 'error'>('idle');
  const [burnDeeplink, setBurnDeeplink] = useState<string | null>(null);
  const [burnQr, setBurnQr] = useState<string | null>(null);
  const [burnUuid, setBurnUuid] = useState<string | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnItemId, setBurnItemId] = useState<string | null>(null);
  const burnPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const burnUuidRef        = useRef<string | null>(null);
  const burnItemIdRef       = useRef<string | null>(null);
  const burnNftTokenIdRef   = useRef<string | null>(null);

  const clearBurnPoll = useCallback(() => {
    if (burnPollRef.current) { clearInterval(burnPollRef.current); burnPollRef.current = null; }
  }, []);

  useEffect(() => () => clearBurnPoll(), [clearBurnPoll]);

  const cancelBurn = useCallback(() => {
    clearBurnPoll();
    setBurnItemId(null);
    setBurnPhase('idle');
    setBurnDeeplink(null);
    setBurnQr(null);
    setBurnUuid(null);
    setBurnError(null);
    burnUuidRef.current   = null;
    burnItemIdRef.current = null;
  }, [clearBurnPoll]);

  const doPollBurn = useCallback(async (uuid: string, itemId: string) => {
    try {
      const res = await fetch(`/frontend-api/nft/burn/status/${uuid}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.signed) {
        clearBurnPoll();
        removeBurnedNft(itemId);
        setBurnPhase('success');
        burnUuidRef.current   = null;
        burnItemIdRef.current = null;
        const nftTokenId = burnNftTokenIdRef.current;
        burnNftTokenIdRef.current = null;
        // Persist removal immediately and clean up player_nfts
        forceSave().catch(() => {});
        if (nftTokenId) {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://dragonslayer-production.up.railway.app';
          fetch(`${apiBase}/api/nft/player-nft/${nftTokenId}`, { method: 'DELETE' }).catch(() => {});
        }
        return;
      }
      if (data.cancelled || data.expired) {
        clearBurnPoll();
        setBurnPhase('error');
        setBurnError(data.cancelled ? 'Burn was cancelled.' : 'Burn request expired — please try again.');
        burnUuidRef.current   = null;
        burnItemIdRef.current = null;
      }
    } catch { /* network error — keep polling */ }
  }, [clearBurnPoll, removeBurnedNft]);

  const startNftBurn = useCallback(async (item: InventoryItem) => {
    if (!item.nftTokenId) return;
    setBurnConfirmItem(null);
    setBurnItemId(item.id);
    setBurnPhase('loading');
    setBurnError(null);
    clearBurnPoll();
    burnNftTokenIdRef.current = item.nftTokenId ?? null;
    try {
      const res = await fetch('/frontend-api/nft/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: state.walletAddress,
          itemId: item.id,
          itemName: item.name,
          itemRarity: item.rarity,
          nftTokenId: item.nftTokenId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.uuid) throw new Error(data.error || 'Failed to create burn request');
      const { uuid, deeplink, qr_png } = data;
      burnUuidRef.current   = uuid;
      burnItemIdRef.current = item.id;
      setBurnUuid(uuid);
      setBurnDeeplink(deeplink);
      setBurnQr(qr_png);
      setBurnPhase('waiting');
      if (deeplink) {
        const twa = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
        if (twa?.openLink) {
          twa.openLink(deeplink);
        } else if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          const w = window.open(deeplink, '_blank', 'noopener,noreferrer');
          if (!w) window.location.href = deeplink;
        }
      }
      burnPollRef.current = setInterval(() => doPollBurn(uuid, item.id), 2500);
    } catch (err: any) {
      setBurnPhase('error');
      setBurnError(err.message || 'Burn failed');
    }
  }, [clearBurnPoll, doPollBurn, state.walletAddress]);

  const MINT_UUID_KEY       = 'ds_mint_uuid';
  const MINT_ITEMID_KEY     = 'ds_mint_item_id';
  const MINT_ITEM_INFO_KEY  = 'ds_mint_item_info';

  const clearMintPoll = useCallback(() => {
    if (mintPollRef.current)  { clearInterval(mintPollRef.current);  mintPollRef.current  = null; }
    if (mintBurstRef.current) { clearInterval(mintBurstRef.current); mintBurstRef.current = null; }
  }, []);

  useEffect(() => () => clearMintPoll(), [clearMintPoll]);

  const cancelMint = useCallback(() => {
    clearMintPoll();
    localStorage.removeItem(MINT_UUID_KEY);
    localStorage.removeItem(MINT_ITEMID_KEY);
    setMintItemId(null);
    setMintPhase('idle');
    setMintDeeplink(null);
    setMintQr(null);
    setMintUuid(null);
    setMintError(null);
    mintUuidRef.current   = null;
    mintItemIdRef.current = null;
  }, [clearMintPoll]);

  const doPollMint = useCallback(async (uuid: string, itemId: string) => {
    try {
      const res = await fetch(`/frontend-api/mint/status/${uuid}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.signed) {
        clearMintPoll();
        localStorage.removeItem(MINT_UUID_KEY);
        localStorage.removeItem(MINT_ITEMID_KEY);
        if (!data.tokenId) {
          setMintPhase('error');
          setMintError('NFT signed but token ID not received — tap ✨ Mint again to retry.');
          mintUuidRef.current = null;
          mintItemIdRef.current = null;
          return;
        }
        localStorage.removeItem(MINT_ITEM_INFO_KEY);
        burnItemToWallet(itemId, data.tokenId);
        setMintPhase('success');
        mintUuidRef.current   = null;
        mintItemIdRef.current = null;
        return;
      }
      if (data.cancelled || data.expired) {
        clearMintPoll();
        localStorage.removeItem(MINT_UUID_KEY);
        localStorage.removeItem(MINT_ITEMID_KEY);
        setMintPhase('error');
        setMintError(data.cancelled ? 'Mint was cancelled.' : 'Mint request expired — please try again.');
        mintUuidRef.current   = null;
        mintItemIdRef.current = null;
      }
    } catch { /* network error — keep polling */ }
  }, [clearMintPoll, burnItemToWallet]);

  const confirmAndMint = useCallback((item: InventoryItem) => {
    setMintConfirmItem(item);
  }, []);

  const startMint = useCallback(async (item: InventoryItem) => {
    setMintConfirmItem(null);
    setMintItemId(item.id);
    setMintPhase('loading');
    setMintError(null);
    clearMintPoll();
    try {
      const res = await fetch('/frontend-api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet:       state.walletAddress,
          itemId:       item.id,
          itemName:     item.name,
          itemRarity:   item.rarity,
          itemPower:    item.power,
          itemType:     item.itemType,
          playerId:     state.playerId,
          itemLevel:    item.itemLevel    ?? 25,
          enchantId:    item.enchantId    ?? '',
          reforgeLevel: item.reforgeLevel ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.uuid) throw new Error(data.error || 'Failed to create mint request');
      const { uuid, deeplink, qr_png } = data;
      mintUuidRef.current   = uuid;
      mintItemIdRef.current = item.id;
      localStorage.setItem(MINT_UUID_KEY,   uuid);
      localStorage.setItem(MINT_ITEMID_KEY, item.id);
      localStorage.setItem(MINT_ITEM_INFO_KEY, JSON.stringify({
        id: item.id, name: item.name, itemType: item.itemType,
        rarity: item.rarity, power: item.power,
        basePower: item.basePower ?? item.power,
        reforgeLevel: item.reforgeLevel ?? 0,
        itemLevel: item.itemLevel ?? 25,
        enchantId: item.enchantId ?? null,
      }));
      setMintUuid(uuid);
      setMintDeeplink(deeplink);
      setMintQr(qr_png);
      setMintPhase('waiting');
      // Open deeplink — TWA-aware
      if (deeplink) {
        const twa = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
        if (twa?.openLink) {
          twa.openLink(deeplink);
        } else if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          const w = window.open(deeplink, '_blank', 'noopener,noreferrer');
          if (!w) window.location.href = deeplink;
        }
      }
      // Start polling every 2.5s
      mintPollRef.current = setInterval(() => doPollMint(uuid, item.id), 2500);
    } catch (err: any) {
      setMintPhase('error');
      setMintError(err.message || 'Mint failed');
    }
  }, [clearMintPoll, doPollMint, state.walletAddress, state.playerId]);

  // Resume polling if page reloaded mid-mint (e.g. after returning from Xaman)
  useEffect(() => {
    const savedUuid   = localStorage.getItem(MINT_UUID_KEY);
    const savedItemId = localStorage.getItem(MINT_ITEMID_KEY);
    if (savedUuid && savedItemId) {
      mintUuidRef.current   = savedUuid;
      mintItemIdRef.current = savedItemId;
      setMintUuid(savedUuid);
      setMintItemId(savedItemId);
      setMintPhase('waiting');
      doPollMint(savedUuid, savedItemId);
      mintPollRef.current = setInterval(() => doPollMint(savedUuid, savedItemId), 2500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Burst-poll when user returns from Xaman (visibilitychange / TWA activated)
  useEffect(() => {
    const onVisible = () => {
      const uid = mintUuidRef.current;
      const iid = mintItemIdRef.current;
      if (!uid || !iid) return;
      doPollMint(uid, iid);
      if (mintBurstRef.current) clearInterval(mintBurstRef.current);
      let ticks = 0;
      mintBurstRef.current = setInterval(() => {
        doPollMint(uid, iid);
        if (++ticks >= 10) { clearInterval(mintBurstRef.current!); mintBurstRef.current = null; }
      }, 800);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    const twa = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (twa?.onEvent) twa.onEvent('activated', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      if (twa?.offEvent) twa.offEvent('activated', onVisible);
    };
  }, [doPollMint]);

  // Live countdown
  useEffect(() => {
    if (!state.activeExpedition) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.activeExpedition]);

  // Sync claimed flag with expedition state
  useEffect(() => {
    if (state.activeExpedition) { setClaimed(false); }
    else if (state.lastExpeditionResult && !claimed) { setClaimed(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeExpedition, state.lastExpeditionResult]);

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
              {result.droppedEgg.variantName} — {result.droppedEgg.bonusType === 'tap_gold_pct' ? `+${result.droppedEgg.bonusValue}% gold/tap` : result.droppedEgg.bonusType === 'army_power_flat' ? `+${result.droppedEgg.bonusValue} army power` : result.droppedEgg.bonusType === 'material_drop_pct' ? `+${result.droppedEgg.bonusValue}% material drops` : `-${result.droppedEgg.bonusValue}% expedition time`} · Check Eggs tab
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
                      <ItemCard
                        item={item}
                        isEquipped
                        onUnequip={() => unequipItem(slot)}
                        showMintBtn={item.rarity === 'legendary' || item.rarity === 'epic'}
                        onMint={() => startMint(item)}
                        mintPhase={mintItemId === item.id ? mintPhase : 'idle'}
                        onClearNft={item.nftTokenId ? () => clearItemNftTokenId(item.id) : undefined}
                      />
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
            🎒 INVENTORY ({state.inventory.length}/10)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {state.inventory.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                onEquip={() => equipItem(item.id)}
                showMintBtn={item.rarity === 'legendary' || item.rarity === 'epic'}
                onMint={() => startMint(item)}
                mintPhase={mintItemId === item.id ? mintPhase : 'idle'}
                onClearNft={item.nftTokenId ? () => clearItemNftTokenId(item.id) : undefined}
                onBurn={item.nftTokenId
                  ? (state.walletAddress ? () => setBurnConfirmItem(item) : undefined)
                  : () => burnInventoryItem(item.id)}
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

  /** Returns the owned item for the given type+rarity (inventory OR equipped), or null */
  function findOwnedItem(itemType: ItemType, rarity: ItemRarity): InventoryItem | null {
    const inInv = state.inventory.find(i => i.itemType === itemType && i.rarity === rarity);
    if (inInv) return inInv;
    const eq = state.equipment[itemType as keyof EquipmentSlots];
    if (eq && eq.rarity === rarity) return eq;
    return null;
  }

  /** Returns true if player owns an item of the given type+rarity (inventory OR equipped) */
  function hasItem(itemType: ItemType, rarity: ItemRarity): boolean {
    const inInv = state.inventory.some(i => i.itemType === itemType && i.rarity === rarity);
    if (inInv) return true;
    const eq = state.equipment[itemType as keyof EquipmentSlots];
    return !!(eq && eq.rarity === rarity);
  }

  const renderCraft = () => {
    const pendingDrops: ClaimableDrop[] = state.claimableDrops ?? [];
    const allItems: InventoryItem[] = [
      ...state.inventory,
      ...(Object.values(state.equipment).filter(Boolean) as InventoryItem[]),
    ];
    const levelableItems = allItems.filter(i => i.rarity !== 'legendary' && (i.itemLevel ?? 1) < 25);
    const forgeReadyItems = allItems.filter(i => i.rarity !== 'legendary' && (i.itemLevel ?? 1) >= 25);
    const legendaryItems = allItems.filter(i => i.rarity === 'legendary');
    const souls = state.materials.find(m => m.type === 'dragon_soul')?.quantity ?? 0;

    return (
      <div className="flex flex-col gap-3">

        {/* ── Gear Drops ───────────────────────────────────────────────────── */}
        {pendingDrops.length > 0 && (
          <div className="dragon-panel p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🎁</span>
              <p className="font-cinzel font-bold text-[#f0c040] text-[11px] tracking-wider">Gear Drops</p>
              <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040' }}>{pendingDrops.length} pending</span>
            </div>
            <div className="flex flex-col gap-2">
              {pendingDrops.map(drop => {
                const color = RARITY_COLORS[drop.item.rarity];
                return (
                  <div key={drop.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
                    style={{ background: `${color}12`, border: `1px solid ${color}35` }}>
                    <div>
                      <span className="font-cinzel font-bold text-[11px]" style={{ color }}>{drop.item.name}</span>
                      <p className="text-[8px] text-[#9a8a6a]">⚡ {drop.item.power} power · {drop.item.rarity} {drop.item.itemType}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => claimDrop(drop.id)}
                        className="text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap"
                        style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80' }}>
                        + Bag
                      </button>
                      <button onClick={() => dismissDrop(drop.id)}
                        className="text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap"
                        style={{ background: 'rgba(153,220,255,0.1)', color: '#9ddcff' }}
                        title={`Scrap for Dragon Souls`}>
                        🔨 +{({ common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 10 } as Record<string,number>)[drop.item.rarity]}🧿
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Epic Forge (T4, craft from materials) ────────────────────────── */}
        <div className="dragon-panel p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">⚒</span>
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider">Epic Forge</p>
            <span className="text-[7px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,160,23,0.15)', color: '#d4a017' }}>T4 CRAFT</span>
          </div>
          <p className="text-[8px] text-[#6b5a3a] mb-3">Craft T4 epic gear from materials. T1–T3 gear drops from expeditions. Level any item to 25 with Dragon Souls to unlock legendary forge.</p>
          <div className="flex flex-col gap-2">
            {CRAFTING_RECIPES.map(recipe => {
              const color = RARITY_COLORS[recipe.rarity];
              const canAffordGold = state.gold >= recipe.goldCost;
              const matsMet = recipe.materials.every(req =>
                (state.materials.find(m => m.type === req.type)?.quantity ?? 0) >= req.quantity
              );
              const canCraft = canAffordGold && matsMet;
              return (
                <div key={recipe.id} className="rounded-lg p-2.5 border" style={{ background: `${color}08`, borderColor: `${color}30` }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <span className="font-cinzel font-bold text-[11px]" style={{ color }}>{recipe.name}</span>
                      <p className="text-[8px] text-[#9a8a6a] mt-0.5">⚡ {recipe.power} power · starts at level 1 · {recipe.itemType}</p>
                    </div>
                    <button onClick={() => craftItem(recipe.id)} disabled={!canCraft}
                      className="action-btn px-2.5 py-1.5 text-[9px] flex-shrink-0"
                      style={canCraft ? {} : { opacity: 0.4, cursor: 'not-allowed' }}>
                      ⚒ FORGE
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {recipe.materials.map((req, i) => {
                      const have = state.materials.find(m => m.type === req.type)?.quantity ?? 0;
                      const ok = have >= req.quantity;
                      return (
                        <span key={i} className="text-[8px] px-1.5 py-0.5 rounded"
                          style={{ background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: ok ? '#4ade80' : '#f87171' }}>
                          {MATERIAL_LABELS[req.type as MaterialType]} {have}/{req.quantity}
                        </span>
                      );
                    })}
                  </div>
                  <span className={`text-[8px] font-bold ${canAffordGold ? 'text-[#b09a60]' : 'text-red-400'}`}>🪙 {formatNumber(recipe.goldCost)}g</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Level Up (Dragon Souls, 1→25) ────────────────────────────────── */}
        {levelableItems.length > 0 && (
          <div className="dragon-panel p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">⬆</span>
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider">Level Up</p>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(153,220,255,0.15)', color: '#9ddcff' }}>🧿 {souls} Souls</span>
            </div>
            <p className="text-[8px] text-[#6b5a3a] mb-3">Spend Dragon Souls + gold to level items 1→25. Each level +2 power. Reach level 25 to forge legendary.</p>
            <div className="flex flex-col gap-2">
              {levelableItems.map(item => {
                const lvl = item.itemLevel ?? 1;
                const { dragonSouls, gold: goldCost } = getItemLevelCost(lvl);
                const canLvl = souls >= dragonSouls && state.gold >= goldCost;
                const pct = Math.round((lvl / 25) * 100);
                const color = RARITY_COLORS[item.rarity];
                return (
                  <div key={item.id} className="rounded-lg p-2.5 border" style={{ background: `${color}08`, borderColor: `${color}25` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-cinzel font-bold text-[11px] truncate" style={{ color }}>{item.name}</span>
                          <span className="text-[7px] px-1 rounded font-bold flex-shrink-0" style={{ background: `${color}25`, color }}>Lv{lvl}</span>
                        </div>
                        <p className="text-[8px] text-[#9a8a6a]">⚡ {item.power} · next: +2 power · 🧿{dragonSouls} + 🪙{formatNumber(goldCost)}g</p>
                        <div className="w-full h-1 rounded-full mt-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 80 ? '#f0c040' : '#3a8a5a' }} />
                        </div>
                      </div>
                      <button onClick={() => levelUpItem(item.id)} disabled={!canLvl}
                        className="text-[8px] font-bold px-2 py-1.5 rounded flex-shrink-0 whitespace-nowrap ml-2"
                        style={canLvl
                          ? { background: 'linear-gradient(135deg,#1a5a3a,#2a8a5a)', color: '#4ade80' }
                          : { background: 'rgba(255,255,255,0.04)', color: '#4a3a2a' }}>
                        ⬆ LVL UP
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Legendary Forge (items at level 25 + existing legendaries) ────── */}
        <div className="dragon-panel p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">✨</span>
            <p className="font-cinzel font-bold text-[#f0c040] text-[11px] tracking-wider">Legendary Forge</p>
            <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040' }}>XRPL NFT</span>
          </div>
          <p className="text-[8px] text-[#6b5a3a] mb-3">Pick the legendary you want to forge. Level any item to 25 first, then it becomes the sacrifice.</p>

          {/* ── All legendary recipes — always visible ── */}
          <div className="flex flex-col gap-2 mb-3">
            {LEGENDARY_RECIPES.filter(r => !r.holderOnly || !!state.walletAddress).map(recipe => {
              const qualifying = allItems
                .filter(i => i.rarity !== 'legendary' && i.itemType === recipe.itemType && (i.itemLevel ?? 1) >= 25)
                .sort((a, b) => (b.itemLevel ?? 25) - (a.itemLevel ?? 25));
              const sacrifice = qualifying[0] ?? null;
              const canAffordGold = state.gold >= recipe.goldCost;
              const matsMet = recipe.materials.every(req =>
                (state.materials.find(m => m.type === req.type)?.quantity ?? 0) >= req.quantity
              );
              const canForge = !!sacrifice && canAffordGold && matsMet;
              const locked = !sacrifice;
              return (
                <div key={recipe.id} className="rounded-lg p-2.5 border"
                  style={{
                    background: recipe.secret ? 'rgba(120,80,240,0.07)' : recipe.holderOnly ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.05)',
                    borderColor: locked ? 'rgba(255,255,255,0.07)' : recipe.secret ? 'rgba(120,80,240,0.35)' : 'rgba(240,192,64,0.28)',
                    opacity: locked ? 0.55 : 1,
                  }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-cinzel font-bold text-[10px]" style={{ color: locked ? '#6b5a3a' : RARITY_COLORS['legendary'] }}>
                          {recipe.secret && '🔮 '}{recipe.name}
                        </span>
                        {recipe.secret && <span className="text-[7px] text-[#c084fc]">SECRET</span>}
                        {recipe.holderOnly && <span className="text-[7px] text-[#f0c040]">👑 HOLDER</span>}
                      </div>
                      <p className="text-[7px] text-[#9a8a6a]">⚡ {recipe.power} · {recipe.itemType}{recipe.enchantId ? ' · pre-enchanted' : ''}</p>
                      {sacrifice ? (
                        <p className="text-[7px] text-[#c8b87a] mt-0.5">🔥 Burns: {sacrifice.name} (Lv{sacrifice.itemLevel ?? 25})</p>
                      ) : (
                        <p className="text-[7px] text-[#6b5a3a] mt-0.5">⚠ Need a Lv25 {recipe.itemType}</p>
                      )}
                    </div>
                    <button
                      onClick={() => sacrifice && forgeLegendary(sacrifice.id, recipe.id)}
                      disabled={!canForge}
                      className="text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap flex-shrink-0"
                      style={canForge
                        ? { background: 'linear-gradient(135deg,#b8860b,#f0c040)', color: '#1a0e00' }
                        : { background: 'rgba(255,255,255,0.04)', color: '#4a3a2a' }}>
                      ✨ FORGE
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recipe.materials.map((req, i) => {
                      const have = state.materials.find(m => m.type === req.type)?.quantity ?? 0;
                      const ok = have >= req.quantity;
                      return (
                        <span key={i} className="text-[7px] px-1 py-0.5 rounded"
                          style={{ color: ok ? '#4ade80' : '#f87171', background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)' }}>
                          {MATERIAL_LABELS[req.type as MaterialType]} {have}/{req.quantity}
                        </span>
                      );
                    })}
                    <span className={`text-[7px] font-bold ml-1 ${canAffordGold ? 'text-[#b09a60]' : 'text-red-400'}`}>
                      🪙{formatNumber(recipe.goldCost)}g
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Owned legendary items — mint, forge 25→100, enchant ── */}
          {legendaryItems.length > 0 && (
            <div className="pt-3" style={{ borderTop: '1px solid rgba(240,192,64,0.15)' }}>
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] mb-2">✨ Your Legendaries</p>
            </div>
          )}
          {legendaryItems.map(item => {
                const lvl = item.itemLevel ?? 25;
                const forgeTier = FORGE_LEVEL_COSTS.find(t => lvl >= t.fromLevel && lvl < t.toLevel);
                const isMinting = mintItemId === item.id && (mintPhase === 'loading' || mintPhase === 'waiting');
                const enchantOptions = ENCHANT_OPTIONS[item.itemType] ?? [];
                const currentEnchant = enchantOptions.find(e => e.id === item.enchantId);
                const fusionDef = (FUSION_BUFF_BY_RECIPE as Record<string, { buffId: string; label: string; description: string }>)[item.id] ??
                  Object.values(FUSION_BUFF_BY_RECIPE).find(f => {
                    const recMatch = LEGENDARY_RECIPES.find(r => r.name === item.name);
                    return recMatch && FUSION_BUFF_BY_RECIPE[recMatch.id]?.buffId === f.buffId;
                  });
                return (
                  <div key={item.id} className="mb-3 rounded-lg p-2.5 border"
                    style={{ background: 'rgba(240,192,64,0.06)', borderColor: 'rgba(240,192,64,0.35)', boxShadow: '0 0 8px rgba(240,192,64,0.08)' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <span className="font-cinzel font-bold text-[11px]" style={{ color: RARITY_COLORS['legendary'] }}>{item.name}</span>
                        <p className="text-[8px] text-[#9a8a6a]">⚡ {item.power} · Lv{lvl}
                          {currentEnchant && <span className="text-[#c084fc]"> · {currentEnchant.label}</span>}
                        </p>
                      </div>
                      {!item.nftTokenId ? (
                        <button onClick={() => confirmAndMint(item)} disabled={isMinting}
                          className="text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap"
                          style={{ background: isMinting ? 'rgba(240,192,64,0.1)' : 'linear-gradient(135deg,#b8860b,#f0c040)', color: isMinting ? '#f0c040' : '#1a0e00' }}>
                          {isMinting ? '⏳…' : '✨ Mint NFT'}
                        </button>
                      ) : (
                        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040' }}>✨ NFT</span>
                      )}
                    </div>
                    {/* Forge 25→100 */}
                    {forgeTier && (() => {
                      const soulOk = souls >= forgeTier.dragonSouls;
                      const matOk = forgeTier.materials.every(r => (state.materials.find(m => m.type === r.type)?.quantity ?? 0) >= r.quantity);
                      const goldOk = state.gold >= forgeTier.goldCost;
                      const canForgeTier = soulOk && matOk && goldOk;
                      return (
                        <div className="border-t border-[rgba(240,192,64,0.15)] pt-2 mb-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[8px] font-bold text-[#c8b87a]">🔥 Forge Lv{forgeTier.fromLevel}→{forgeTier.toLevel}
                                {item.nftTokenId && <span className="ml-1 text-[7px] font-bold text-[#f0c040]">✨ +1 NFT bonus</span>}
                              </p>
                              <p className="text-[7px] text-[#6b5a3a]">+{item.nftTokenId ? (forgeTier.powerPerLevel + 1) : forgeTier.powerPerLevel} power/lv · 🧿{forgeTier.dragonSouls} souls + 🪙{formatNumber(forgeTier.goldCost)}g</p>
                            </div>
                            <button onClick={() => reforgeItem(item.id)} disabled={!canForgeTier}
                              className="text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap"
                              style={canForgeTier
                                ? { background: 'linear-gradient(135deg,#1a3a6b,#2a5fa8)', color: '#a0d4ff' }
                                : { background: 'rgba(255,255,255,0.04)', color: '#4a3a2a' }}>
                              ⚒ FORGE
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Enchant — randomly assigned at forge time, read-only */}
                    <div className="border-t border-[rgba(240,192,64,0.15)] pt-2">
                      {currentEnchant ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px]">🔮</span>
                          <span className="text-[8px] font-bold" style={{ color: currentEnchant.rare ? '#c084fc' : '#c8b87a' }}>
                            {currentEnchant.label}
                          </span>
                          <span className="text-[7px] text-[#6b5a3a]">· assigned at forge</span>
                        </div>
                      ) : (
                        <p className="text-[7px] text-[#4a3a2a]">No enchant assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    );
  };


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

        {/* ── Alchemy ────────────────────────────────────────────────── */}
        <div className="dragon-panel px-3 py-2.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🔥</span>
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider">Alchemy</p>
            <span className="text-[7px] px-1 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.15)', color: '#f0c040' }}>converts mats</span>
          </div>
          <p className="text-[8px] text-[#6b5a3a] mb-2">Combine excess common materials into rare legendary crafting materials.</p>
          <div className="flex flex-col gap-2">
            {ALCHEMY_RECIPES.map(recipe => {
              const canConvert = recipe.inputs.every(req => (state.materials.find(m => m.type === req.type)?.quantity ?? 0) >= req.quantity);
              return (
                <div key={recipe.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: 'rgba(240,192,64,0.05)', border: '1px solid rgba(240,192,64,0.15)' }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-[#e8d8a8]">{recipe.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {recipe.inputs.map((req, i) => {
                        const have = state.materials.find(m => m.type === req.type)?.quantity ?? 0;
                        const ok = have >= req.quantity;
                        return (
                          <span key={i} className="text-[7px] px-1 py-0.5 rounded" style={{ color: ok ? '#4ade80' : '#f87171', background: ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)' }}>
                            {MATERIAL_LABELS[req.type as MaterialType]} {have}/{req.quantity}
                          </span>
                        );
                      })}
                      <span className="text-[7px] text-[#6b5a3a]">→</span>
                      <span className="text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(240,192,64,0.12)', color: '#f0c040' }}>
                        +1 {MATERIAL_LABELS[recipe.output.type as MaterialType]}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => alchemyConvert(recipe.id)}
                    disabled={!canConvert}
                    className="text-[8px] font-bold px-2 py-1 rounded flex-shrink-0 whitespace-nowrap"
                    style={{ background: canConvert ? 'linear-gradient(135deg,#7c3a00,#d4600a)' : 'rgba(255,255,255,0.04)', color: canConvert ? '#ffe0a0' : '#3a2a1a' }}
                  >
                    Convert
                  </button>
                </div>
              );
            })}
          </div>
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
                    <p className="text-[#6b5a3a] text-[9px]">{slot.egg.variantName}</p>
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
                    <p className="text-[9px] font-bold" style={{ color: EGG_RARITY_COLOR[egg.rarity] }}>{egg.variantName}</p>
                    <p className="text-[8px] text-[#6b5a3a]">{egg.rarity} · {egg.bonusType === 'tap_gold_pct' ? `+${egg.bonusValue}% gold/tap` : egg.bonusType === 'army_power_flat' ? `+${egg.bonusValue} army pwr` : egg.bonusType === 'material_drop_pct' ? `+${egg.bonusValue}% mats` : `-${egg.bonusValue}% exp time`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hatched dragons */}
        {hatched.length > 0 && (
          <div className="dragon-panel px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider">🐉 ACTIVE DRAGON BONUSES</p>
              <span className="text-[8px] text-[#4a3a2a] italic">stacked (75% falloff)</span>
            </div>
            {/* Effective totals by type — always shown first */}
            {(['tap_gold_pct','army_power_flat','material_drop_pct','expedition_time_pct'] as DragonBonusType[]).map(bt => {
              const eff = calcDiminishingBonus(hatched, bt);
              if (eff <= 0) return null;
              const count = hatched.filter(d => d.bonusType === bt).length;
              const label = bt === 'tap_gold_pct' ? `+${eff.toFixed(1)}% gold/tap` : bt === 'army_power_flat' ? `+${eff.toFixed(0)} army power` : bt === 'material_drop_pct' ? `+${eff.toFixed(1)}% mat drops` : `-${eff.toFixed(1)}% exp time`;
              return (
                <div key={bt} className="flex items-center justify-between px-2 py-1.5 rounded-lg mb-1"
                  style={{ background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.3)' }}>
                  <span className="text-[10px] font-bold text-[#4ade80]">{label}</span>
                  <span className="text-[8px] font-semibold" style={{ color: count > 1 ? '#f0c040' : '#6b5a3a' }}>
                    ×{count}{count > 1 ? ' stacked' : ''}
                  </span>
                </div>
              );
            })}
            <div className="flex flex-col gap-1 mt-1.5">
              {hatched.map(d => (
                <div key={d.id} className="flex items-center gap-2 px-2 py-1 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${EGG_RARITY_COLOR[d.rarity]}25` }}>
                  <span className="text-sm">🐉</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold truncate" style={{ color: EGG_RARITY_COLOR[d.rarity] }}>
                      {d.variantName || `${d.rarity.charAt(0).toUpperCase()}${d.rarity.slice(1)} Dragon`}
                    </p>
                    <p className="text-[8px] text-[#6b5a3a]">{d.rarity} · {d.bonusType === 'tap_gold_pct' ? `+${d.bonusValue}% gold/tap` : d.bonusType === 'army_power_flat' ? `+${d.bonusValue} army pwr` : d.bonusType === 'material_drop_pct' ? `+${d.bonusValue}% mats` : `-${d.bonusValue}% exp time`}</p>
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

      {/* ── NFT Burn Confirm Modal ───────────────────────────────────── */}
      {burnConfirmItem && burnPhase === 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.92)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#160604', border: '1px solid rgba(248,113,113,0.45)', boxShadow: '0 0 40px rgba(248,113,113,0.12)' }}>
            <p className="font-cinzel font-bold text-[#f87171] text-sm tracking-widest text-center">🔥 BURN NFT</p>
            <div className="flex items-center gap-3">
              <img src={getItemImage(burnConfirmItem.name)} alt={burnConfirmItem.name}
                className="w-16 h-16 object-contain rounded-xl" style={{ border: '1px solid rgba(248,113,113,0.3)' }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
              <div className="flex flex-col gap-1">
                <p className="font-cinzel font-bold text-[#e8d8a8] text-[13px]">{burnConfirmItem.name}</p>
                <p className="text-[#9a8a6a] text-[10px]">⚡ {burnConfirmItem.power} power · {burnConfirmItem.rarity}</p>
                <span className="text-[7px] font-bold px-1.5 py-0.5 rounded w-fit" style={{ background: 'rgba(240,192,64,0.2)', color: '#f0c040' }}>✨ NFT on XRPL</span>
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p className="text-[10px] text-[#f87171] font-bold mb-1">⚠️ This action is permanent</p>
              <p className="text-[9px] text-[#9a8a6a] leading-relaxed">The NFT will be destroyed on-chain via XRPL <code>NFTokenBurn</code>. Sign in Xaman to confirm. This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBurnConfirmItem(null)}
                className="flex-1 py-2 rounded-xl text-[10px] font-bold"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#6b5a3a' }}>Cancel</button>
              <button onClick={() => startNftBurn(burnConfirmItem)}
                className="flex-1 py-2 rounded-xl text-[10px] font-bold"
                style={{ background: 'linear-gradient(135deg,#7f1d1d,#f87171)', color: '#fff' }}>🔥 Open Xaman</button>
            </div>
          </div>
        </div>
      )}

      {/* ── NFT Burn Status Panel ─────────────────────────────────────── */}
      {(burnPhase === 'loading' || burnPhase === 'waiting' || burnPhase === 'success' || burnPhase === 'error') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.92)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#160604', border: '1px solid rgba(248,113,113,0.45)' }}>
            <p className="font-cinzel font-bold text-[#f87171] text-sm tracking-widest text-center">🔥 NFT BURN</p>
            {burnPhase === 'loading' && <p className="text-center text-[#c8b87a] text-[11px]">⏳ Creating burn request…</p>}
            {burnPhase === 'waiting' && (
              <div className="flex flex-col gap-3 items-center">
                <p className="text-[11px] text-[#c8b87a] text-center">Sign in Xaman to burn this NFT on-chain.</p>
                {burnQr && <img src={burnQr} alt="QR" className="w-36 h-36 rounded-xl" />}
                {burnDeeplink && (
                  <a href={burnDeeplink} target="_blank" rel="noopener noreferrer"
                    className="w-full py-2 rounded-xl text-center text-[10px] font-bold"
                    style={{ background: 'linear-gradient(135deg,#7f1d1d,#f87171)', color: '#fff' }}>Open Xaman</a>
                )}
                <p className="text-[9px] text-[#6b5a3a] text-center">Polling for signature…</p>
              </div>
            )}
            {burnPhase === 'success' && (
              <div className="flex flex-col gap-2 items-center">
                <span className="text-3xl">🔥</span>
                <p className="text-[#4ade80] font-bold text-[12px] text-center">NFT burned on-chain!</p>
                <p className="text-[9px] text-[#6b5a3a] text-center">The item has been removed from your inventory.</p>
              </div>
            )}
            {burnPhase === 'error' && (
              <div className="flex flex-col gap-2 items-center">
                <p className="text-[#f87171] font-bold text-[11px] text-center">{burnError}</p>
              </div>
            )}
            {(burnPhase === 'success' || burnPhase === 'error') && (
              <button onClick={cancelBurn} className="w-full py-2 rounded-xl text-[10px] font-bold"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#c8b87a' }}>Close</button>
            )}
            {burnPhase === 'waiting' && (
              <button onClick={cancelBurn} className="w-full py-1.5 rounded-xl text-[9px] font-bold"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#4a3a2a' }}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* ── Crafting V2 Migration Banner ──────────────────────────────── */}
      {(state.craftingV2SoulsAwarded ?? 0) > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.90)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#0f0800', border: '1px solid rgba(74,222,128,0.45)', boxShadow: '0 0 40px rgba(74,222,128,0.12)' }}>
            <p className="font-cinzel font-bold text-[#4ade80] text-sm tracking-widest text-center">⚔️ SYSTEM UPGRADE</p>
            <p className="text-[#c8b87a] text-[11px] text-center leading-relaxed">
              The crafting system has been rebuilt from scratch.
              Your old items have been converted to Dragon Souls.
            </p>
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <span className="text-2xl">🧿</span>
              <span className="font-cinzel font-bold text-[#4ade80] text-lg">+{state.craftingV2SoulsAwarded}</span>
              <span className="text-[#9a9a9a] text-[10px]">Dragon Souls awarded</span>
            </div>
            <p className="text-[#6b5a3a] text-[9px] text-center leading-relaxed">
              NFT items were kept on-chain. Start fresh — run expeditions to earn new gear drops!
            </p>
            <button
              onClick={dismissCraftingV2Modal}
              className="w-full py-2.5 rounded-xl font-cinzel font-bold text-[11px] tracking-wider"
              style={{ background: 'linear-gradient(135deg,#2a6b3a,#4ade80)', color: '#0a1a0a' }}
            >
              Let's Go! ⚔️
            </button>
          </div>
        </div>
      )}

      {/* ── Mint Confirmation Card ─────────────────────────────────────── */}
      {mintConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.88)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#160d04', border: '1px solid rgba(240,192,64,0.4)', boxShadow: '0 0 32px rgba(240,192,64,0.15)' }}>
            <p className="font-cinzel font-bold text-[#f0c040] text-sm tracking-widest text-center">✨ MINT NFT</p>
            <div className="flex items-center gap-4">
              <img
                src={getItemImage(mintConfirmItem.name)}
                alt={mintConfirmItem.name}
                className="w-16 h-16 object-contain rounded-xl"
                style={{ border: '1px solid rgba(240,192,64,0.3)' }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
              />
              <div className="flex flex-col gap-1">
                <p className="font-cinzel font-bold text-[#e8d8a8] text-[13px]">{mintConfirmItem.name}</p>
                <p className="text-[#9a8a6a] text-[10px]">⚡ {mintConfirmItem.power} power · {mintConfirmItem.rarity}</p>
                {(mintConfirmItem.reforgeLevel ?? 0) > 0 && (
                  <p className="text-[10px] font-bold" style={{ color: '#60a5fa' }}>⚒ Reforge Lv{mintConfirmItem.reforgeLevel}</p>
                )}
              </div>
            </div>
            <p className="text-[9px] text-[#6b5a3a] text-center leading-relaxed">
              This item will be minted permanently on <span className="text-[#f0c040] font-bold">XRPL</span> and sent to your wallet. After signing in Xaman, the NFT is yours forever.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMintConfirmItem(null)} className="flex-1 py-2 rounded-xl text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.05)', color: '#6b5a3a' }}>
                Cancel
              </button>
              <button
                onClick={() => startMint(mintConfirmItem)}
                className="flex-1 py-2 rounded-xl text-[10px] font-bold"
                style={{ background: 'linear-gradient(135deg,#b8860b,#f0c040)', color: '#1a0e00' }}
              >
                ✨ Open Xaman
              </button>
            </div>
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
              <button
                onClick={() => setCraftOpen(v => !v)}
                className="w-full flex items-center justify-between py-1.5 px-1 transition-colors"
              >
                <p className="font-cinzel font-bold text-[#e8d8a8] text-[10px] tracking-wider">🔨 FORGE EQUIPMENT</p>
                <span className="text-[#6b5a3a] text-[12px] leading-none" style={{ transform: craftOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </button>
            </div>
            {craftOpen && renderCraft()}
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

      {/* ── Mint modal overlay ── */}
      {mintPhase !== 'idle' && mintItemId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="rounded-2xl p-5 w-full max-w-sm shadow-2xl mb-2"
            style={{
              background: 'linear-gradient(180deg, rgba(22,16,8,0.99) 0%, rgba(12,8,4,1) 100%)',
              border: '1px solid rgba(212,160,23,0.25)',
            }}
          >
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xl">✨</span>
                <h2 className="text-lg font-bold text-[#f0c040] font-cinzel">Claim NFT</h2>
              </div>
              {mintPhase === 'loading' && (
                <p className="text-[#6b5a3a] text-xs">Minting on-chain… please wait…</p>
              )}
              {mintPhase === 'waiting' && (
                <p className="text-[#6b5a3a] text-xs">Open Xaman to claim your NFT.</p>
              )}
              {mintPhase === 'success' && (
                <p className="text-[#4ade80] text-xs font-bold">✅ NFT claimed! It's yours.</p>
              )}
              {mintPhase === 'error' && (
                <p className="text-red-400 text-xs">{mintError || 'Mint failed'}</p>
              )}
            </div>

            {mintPhase === 'waiting' && (
              <div className="flex flex-col gap-2 mb-4">
                {mintDeeplink && (
                  <button
                    onClick={() => {
                      const twa = (window as any).Telegram?.WebApp;
                      if (twa?.openLink) {
                        twa.openLink(mintDeeplink);
                      } else {
                        const w = window.open(mintDeeplink, '_blank', 'noopener,noreferrer');
                        if (!w) window.location.href = mintDeeplink;
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold text-white text-sm active:scale-95 transition-all shadow-lg"
                    style={{ background: 'linear-gradient(135deg,#b8860b,#f0c040)', color: '#1a0e00' }}
                  >
                    <img src="https://xumm.app/assets/icons/favicon-196x196.png" alt="" className="w-4 h-4 rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    Open Xaman to Claim
                  </button>
                )}
                {mintUuid && (
                  <button
                    onClick={() => mintUuidRef.current && doPollMint(mintUuidRef.current, mintItemId)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                    style={{ border: '2px solid rgba(212,160,23,0.7)', color: '#f0c040', background: 'rgba(212,160,23,0.1)' }}
                  >
                    ✓ Claimed in Xaman? Check now
                  </button>
                )}
                {mintQr && (
                  <div className="bg-white rounded-xl p-3 flex items-center justify-center">
                    <img src={mintQr} alt="Xaman QR" className="w-full max-w-[160px] h-auto mx-auto" />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={cancelMint}
                className="text-xs text-[#4a3a2a] hover:text-[#6b5a3a] transition-colors underline"
              >
                {mintPhase === 'success' ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
