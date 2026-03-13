'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useGame,
  MaterialType,
  MATERIAL_LABELS,
  EGG_VARIANTS,
  EggRarity,
} from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

type ShopSection = 'army' | 'merchant' | 'xrp';

const TREASURY = 'rf84iAt8aRMJ7onNY9ZqmWVVFCAtSmTT7d';
const USED_TX_KEY = 'ds_used_tx_hashes';
const USED_PREMIUM_KEY = 'ds_used_premium_tx';
const PENDING_KEY = 'ds_pending_mat_purchase';

export default function BuildingsTab() {
  const {
    state, buyBuilding, getBuildingCost, canAfford, goldPerHour, armyPower,
    buyFromMerchant, addMaterials, addEggs, addIncubatorSlot, addGold, refreshTokenDiscount,
    addDragonSouls,
  } = useGame();

  const goldPackAmount = Math.max(10_000, Math.floor(goldPerHour * 24));

  const [section, setSection] = useState<ShopSection>('army');
  const [discountRefreshStatus, setDiscountRefreshStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleRefreshDiscount() {
    if (!state.walletAddress) return;
    setDiscountRefreshStatus('loading');
    try {
      await refreshTokenDiscount();
      setDiscountRefreshStatus('done');
      setTimeout(() => setDiscountRefreshStatus('idle'), 3000);
    } catch {
      setDiscountRefreshStatus('error');
      setTimeout(() => setDiscountRefreshStatus('idle'), 3000);
    }
  }

  // ── XRP shop state ────────────────────────────────────────────────────────
  const discountPct = state.tokenDiscount?.pct ?? 0;
  const discountMult = 1 - discountPct / 100;
  function discountedXrp(base: number) {
    if (discountPct === 0) return base;
    return parseFloat((base * discountMult).toFixed(2));
  }

  const [buyStatus, setBuyStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [buyMsg, setBuyMsg] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txType, setTxType] = useState<MaterialType | ''>('');
  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [txMsg, setTxMsg] = useState('');
  const [walletCopied, setWalletCopied] = useState(false);
  const [premiumHash, setPremiumHash] = useState('');
  const [premiumType, setPremiumType] = useState('');
  const [premiumStatus, setPremiumStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [premiumMsg, setPremiumMsg] = useState('');

  // ── Dragon Souls purchase state ───────────────────────────────────────────
  const [soulsPhase, setSoulsPhase] = useState<'idle'|'loading'|'waiting'|'success'|'error'>('idle');
  const [soulsDeeplink, setSoulsDeeplink] = useState<string | null>(null);
  const [soulsQr, setSoulsQr] = useState<string | null>(null);
  const [soulsError, setSoulsError] = useState<string | null>(null);
  const [soulsCredited, setSoulsCredited] = useState(0);
  const soulsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soulsUuidRef = useRef<string | null>(null);

  const clearSoulsPoll = useCallback(() => {
    if (soulsPollRef.current) { clearInterval(soulsPollRef.current); soulsPollRef.current = null; }
  }, []);
  useEffect(() => () => clearSoulsPoll(), [clearSoulsPoll]);

  const cancelSouls = useCallback(() => {
    clearSoulsPoll();
    setSoulsPhase('idle');
    setSoulsDeeplink(null); setSoulsQr(null); setSoulsError(null); setSoulsCredited(0);
    soulsUuidRef.current = null;
  }, [clearSoulsPoll]);

  const doPollSouls = useCallback(async (uuid: string) => {
    try {
      const res = await fetch(`/frontend-api/souls/status/${uuid}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.signed) {
        clearSoulsPoll();
        const qty: number = data.souls || 50;
        addDragonSouls(qty);
        setSoulsCredited(qty);
        setSoulsPhase('success');
        soulsUuidRef.current = null;
        return;
      }
      if (data.cancelled || data.expired) {
        clearSoulsPoll();
        setSoulsPhase('error');
        setSoulsError(data.cancelled ? 'Payment cancelled.' : 'Payment request expired — please try again.');
        soulsUuidRef.current = null;
      }
    } catch { /* keep polling */ }
  }, [clearSoulsPoll, addDragonSouls]);

  const startSoulsBuy = useCallback(async (packId: string) => {
    setSoulsPhase('loading');
    setSoulsError(null);
    try {
      const res = await fetch('/frontend-api/souls/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, wallet: state.walletAddress ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.uuid) throw new Error(data.error ?? 'Failed to create payment');
      soulsUuidRef.current = data.uuid;
      setSoulsDeeplink(data.deeplink);
      setSoulsQr(data.qr_png ?? null);
      setSoulsPhase('waiting');
      if (data.deeplink) window.open(data.deeplink, '_blank');
      soulsPollRef.current = setInterval(() => doPollSouls(data.uuid), 2500);
    } catch (e: unknown) {
      setSoulsPhase('error');
      setSoulsError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [doPollSouls, state.walletAddress]);

  function copyTreasury() {
    navigator.clipboard.writeText(TREASURY).then(() => {
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    });
  }

  // ── Pending-purchase recovery ─────────────────────────────────────────────
  const creditPendingPurchase = useCallback(async (silent = false) => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    let pending: { uuid: string; memo: string; typeOrBundle: string; ts: number };
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_KEY); return; }
    if (Date.now() - pending.ts > 15 * 60 * 1000) {
      localStorage.removeItem(PENDING_KEY);
      if (!silent) { setBuyMsg('Payment window expired. Please try again.'); setBuyStatus('error'); }
      return;
    }
    if (!silent) setBuyMsg('⏳ Checking payment status…');
    try {
      const sr = await fetch(`/frontend-api/materials/status/${pending.uuid}`);
      const status = await sr.json();
      if (status.cancelled || status.expired) {
        localStorage.removeItem(PENDING_KEY);
        setBuyMsg('Payment cancelled or expired.'); setBuyStatus('error'); return;
      }
      if (!status.signed) {
        if (!silent) setBuyMsg('⏳ Not paid yet — complete it in Xaman.');
        return;
      }
      const memo: string = status.memo || pending.memo || '';
      const allTypes: MaterialType[] = ['dragon_scale','fire_crystal','ancient_rune','lynx_fang','nomic_core'];
      let drops: { type: MaterialType; quantity: number }[] = [];
      if (memo.startsWith('bundle')) {
        drops = allTypes.map(t => ({ type: t, quantity: 3 }));
      } else if (memo.startsWith('single:')) {
        const [, mt, q] = memo.split(':');
        if (allTypes.includes(mt as MaterialType))
          drops = [{ type: mt as MaterialType, quantity: parseInt(q || '3', 10) }];
      }
      if (drops.length === 0) {
        const t = pending.typeOrBundle as MaterialType | 'bundle';
        drops = t === 'bundle'
          ? allTypes.map(t2 => ({ type: t2, quantity: 3 }))
          : [{ type: t as MaterialType, quantity: 3 }];
      }
      addMaterials(drops);
      localStorage.removeItem(PENDING_KEY);
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
      if (!silent) setBuyMsg('Network error checking payment. Try tapping check again.');
    }
  }, [addMaterials, state.playerId]);

  useEffect(() => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) { setBuyStatus('loading'); creditPendingPurchase(false); }
  }, [creditPendingPurchase]);

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
      if (!data.deeplink || !data.uuid) {
        setBuyMsg(data.error || 'Failed to create payment.');
        setBuyStatus('error');
        return;
      }
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        uuid: data.uuid,
        memo: data.memo ?? `single:${typeOrBundle}:3`,
        typeOrBundle: String(typeOrBundle),
        ts: Date.now(),
      }));
      window.open(data.deeplink, '_blank');
      setBuyMsg('⏳ Pay in Xaman, then return here. We\'ll detect it automatically.');
      setTimeout(() => creditPendingPurchase(true), 6000);
    } catch {
      setBuyMsg('Network error — try again.');
      setBuyStatus('error');
    }
  }

  async function handleClaimByTxHash() {
    const hash = txHash.trim().toUpperCase();
    if (hash.length < 60) { setTxMsg('Paste a valid TX hash.'); setTxStatus('error'); return; }
    const usedRaw = localStorage.getItem(USED_TX_KEY);
    const used: string[] = usedRaw ? JSON.parse(usedRaw) : [];
    if (used.includes(hash)) { setTxMsg('This TX hash has already been claimed on this device.'); setTxStatus('error'); return; }
    setTxStatus('loading'); setTxMsg('');
    try {
      const res = await fetch('/frontend-api/materials/verify-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, type: txType || undefined, playerId: state.playerId ?? undefined }),
      });
      const data = await res.json();
      if (!data.success) { setTxMsg(data.error || 'Verification failed.'); setTxStatus('error'); return; }
      addMaterials(data.credits);
      used.push(hash);
      localStorage.setItem(USED_TX_KEY, JSON.stringify(used));
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
      setTxHash(''); setTxType('');
    } catch { setTxMsg('Network error — try again.'); setTxStatus('error'); }
  }

  async function handleClaimPremiumByTxHash() {
    const hash = premiumHash.trim().toUpperCase();
    if (hash.length < 60) { setPremiumMsg('Paste a valid TX hash.'); setPremiumStatus('error'); return; }
    if (!premiumType) { setPremiumMsg('Select a premium item first.'); setPremiumStatus('error'); return; }
    const usedRaw = localStorage.getItem(USED_PREMIUM_KEY);
    const used: string[] = usedRaw ? JSON.parse(usedRaw) : [];
    if (used.includes(hash)) { setPremiumMsg('This TX hash was already claimed on this device.'); setPremiumStatus('error'); return; }
    setPremiumStatus('loading'); setPremiumMsg('');
    try {
      const res = await fetch('/frontend-api/materials/verify-premium-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, premiumType, playerId: state.playerId ?? undefined }),
      });
      const data = await res.json();
      if (!data.success) { setPremiumMsg(data.error || 'Verification failed.'); setPremiumStatus('error'); return; }
      if (data.eggRarity) {
        const variants = EGG_VARIANTS[data.eggRarity as EggRarity];
        const variant = variants[Math.floor(Math.random() * variants.length)];
        addEggs([{ rarity: data.eggRarity, variantName: variant.variantName, hatchHours: variant.hatchHours, bonusType: variant.bonusType, bonusValue: variant.bonusValue }]);
      }
      if (data.materialCredits) addMaterials(data.materialCredits);
      if (data.incubatorSlot) addIncubatorSlot();
      if (data.goldAmount) addGold(goldPackAmount);
      used.push(hash);
      localStorage.setItem(USED_PREMIUM_KEY, JSON.stringify(used));
      const dest = data.eggRarity ? 'Dragon Den (Stash tab)' : data.incubatorSlot ? 'your incubator' : data.goldAmount ? 'your treasury' : 'Materials';
      setPremiumMsg(`✅ Claimed: ${data.label}! Check ${dest}.`);
      setPremiumStatus('done');
      setPremiumHash(''); setPremiumType('');
    } catch { setPremiumMsg('Network error — try again.'); setPremiumStatus('error'); }
  }

  // ── Merchant helpers ──────────────────────────────────────────────────────
  const merchantDiscountPct = state.tokenDiscount?.pct ?? 0;
  function discountedGold(base: number) {
    if (merchantDiscountPct === 0) return base;
    return Math.floor(base * (1 - merchantDiscountPct / 100));
  }
  const deals = state.merchantDeals ?? [];
  const merchantExpiresAt = state.merchantExpiresAt ?? null;
  const merchantActive = !!(merchantExpiresAt && Date.now() < merchantExpiresAt && deals.length > 0);
  const [merchantTimeLeft, setMerchantTimeLeft] = useState('');
  useEffect(() => {
    if (!merchantExpiresAt) return;
    const tick = () => {
      const ms = Math.max(0, merchantExpiresAt - Date.now());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setMerchantTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [merchantExpiresAt]);

  // ── Sub-tab pill bar ──────────────────────────────────────────────────────
  const merchantDot = merchantActive && deals.some(d => !d.purchased);
  const tabs: { id: ShopSection; label: string; dot?: boolean }[] = [
    { id: 'army',     label: '⚔️ Army' },
    { id: 'merchant', label: '🧙 Merchant', dot: merchantDot },
    { id: 'xrp',      label: '⭐ XRP Store' },
  ];

  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Shop</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Build · Trade · Buy</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="coin-icon" style={{ width: 12, height: 12 }} />
              <span className="font-cinzel text-[#f0c040] font-bold text-sm tabular-nums">{formatNumber(state.gold)}</span>
            </div>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className="font-cinzel text-[#e8d8a8] font-bold text-xs tabular-nums">⚔️ {armyPower}</span>
              <span className="text-[#6b5a3a] text-[9px]">{formatNumber(goldPerHour)}/hr</span>
            </div>
          </div>
        </div>
        {/* Sub-tab bar */}
        <div className="flex gap-1 mt-2.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className="relative flex-1 py-1.5 rounded-lg font-cinzel font-bold text-[10px] tracking-wide transition-all"
              style={{
                background: section === t.id ? 'rgba(212,160,23,0.15)' : 'rgba(255,255,255,0.03)',
                border: section === t.id ? '1px solid rgba(212,160,23,0.4)' : '1px solid rgba(255,255,255,0.06)',
                color: section === t.id ? '#f0c040' : '#5a4a2a',
              }}
            >
              {t.label}
              {t.dot && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ background: '#a78bfa', boxShadow: '0 0 4px #a78bfa' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── ARMY ── */}
      {section === 'army' && (
        <div className="px-3 mt-2 space-y-2.5">
          {state.buildings.map((building) => {
            const cost     = getBuildingCost(building);
            const discountPct = state.tokenDiscount?.pct ?? 0;
            const effectiveCost = discountPct > 0 ? Math.floor(cost * (1 - discountPct / 100)) : cost;
            const affordable  = canAfford(effectiveCost);
            const cost10   = Math.floor(building.baseCost * (Math.pow(building.costMultiplier, building.owned) * (1 - Math.pow(building.costMultiplier, 10)) / (1 - building.costMultiplier)));
            const effectiveCost10 = discountPct > 0 ? Math.floor(cost10 * (1 - discountPct / 100)) : cost10;
            const canBuy10 = state.gold >= effectiveCost10;
            const unlocked = state.level >= building.unlockLevel;
            const income   = building.baseIncome * building.owned;
            return (
              <div key={building.id} className={`building-card p-3.5 relative overflow-hidden ${unlocked && affordable ? 'building-affordable' : ''}`}>
                {!unlocked && (
                  <div className="absolute inset-0 rounded-xl z-10 flex flex-col items-center justify-center gap-1 pointer-events-none"
                    style={{ background: 'rgba(5,3,1,0.72)', backdropFilter: 'blur(1px)' }}>
                    <span className="text-2xl">🔒</span>
                    <span className="font-cinzel font-black text-[#f0c040] text-xs tracking-wider">LOCKED</span>
                    <span className="text-[9px] text-[#9a8a6a]">Reach Level {building.unlockLevel}</span>
                    <div className="w-24 h-1.5 rounded-full mt-0.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (state.level / building.unlockLevel) * 100)}%`, background: 'linear-gradient(90deg, #d4a017, #f0c040)' }} />
                    </div>
                    <span className="text-[8px] text-[#6b5a3a]">{state.level} / {building.unlockLevel}</span>
                  </div>
                )}
                <div className={`flex items-center gap-3 ${!unlocked ? 'opacity-30' : ''}`}>
                  <div className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 relative"
                    style={{ background: 'linear-gradient(180deg, rgba(30,22,10,0.8) 0%, rgba(15,10,5,0.9) 100%)', border: `1px solid ${building.owned > 0 ? 'rgba(212,160,23,0.35)' : 'rgba(100,80,40,0.2)'}`, boxShadow: building.owned > 0 ? '0 0 12px rgba(212,160,23,0.08)' : 'none' }}>
                    {building.icon}
                    {building.owned > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-b from-[#f0c040] to-[#a07010] text-[#1a1208] text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                        {building.owned}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-cinzel text-[#f0c040] font-bold text-sm block">{building.name}</span>
                    <p className="text-[#6b5a3a] text-[10px] leading-tight mt-0.5">{building.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[#c84040] text-[10px] font-bold">⚔️ +{building.armyPower} atk</span>
                      <span className="text-[#60a5fa] text-[10px] font-bold">🛡️ +{building.defensePower} def</span>
                      <span className="text-[#8a7a5a] text-[10px]">· +{formatNumber(building.baseIncome)}/hr</span>
                      {income > 0 && <span className="text-green-400/90 text-[10px] font-bold bg-green-900/20 px-1.5 py-0.5 rounded">{formatNumber(income)}/hr total</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {unlocked ? (
                      <>
                        <button onClick={() => buyBuilding(building.id)} disabled={!affordable} className="action-btn text-[10px] px-3 py-1.5 w-[70px]">BUY</button>
                        <div className="flex items-center gap-0.5 justify-end">
                          <span className="coin-icon" style={{ width: 8, height: 8 }} />
                          {discountPct > 0 ? (
                            <>
                              <span className="text-[8px] line-through text-[#3a2a1a] mr-0.5">{formatNumber(cost)}</span>
                              <span className={`text-[9px] font-bold ${affordable ? 'text-[#4ade80]' : 'text-red-400/70'}`}>{formatNumber(effectiveCost)}</span>
                            </>
                          ) : (
                            <span className={`text-[9px] font-bold ${affordable ? 'text-[#8a7a5a]' : 'text-red-400/70'}`}>{formatNumber(cost)}</span>
                          )}
                        </div>
                        <button onClick={() => canBuy10 && buyBuilding(building.id, 10)} disabled={!canBuy10}
                          className="text-[10px] font-black px-2 py-0.5 rounded w-[70px] transition-opacity"
                          style={{ background: canBuy10 ? 'linear-gradient(180deg, #ffaa33 0%, #d4a017 100%)' : 'rgba(100,80,40,0.25)', border: canBuy10 ? '1px solid #ffe88a' : '1px solid rgba(100,80,40,0.3)', color: canBuy10 ? '#1a1208' : '#5a4a2a', opacity: canBuy10 ? 1 : 0.55 }}>
                          ×10
                        </button>
                      </>
                    ) : (
                      <div className="text-center px-2 py-1.5 rounded-lg" style={{ background: 'rgba(180,120,20,0.12)', border: '1px solid rgba(212,160,23,0.3)' }}>
                        <span className="text-[10px] font-black text-[#f0c040] block">🔒 LV.{building.unlockLevel}</span>
                        <span className="text-[9px] text-[#8a7a5a] block mt-0.5">{building.unlockLevel - state.level} more lvls</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MERCHANT ── */}
      {section === 'merchant' && (
        <div className="px-3 mt-2 flex flex-col gap-2">
          {!merchantActive ? (
            <div className="dragon-panel px-3 py-10 text-center">
              <p className="text-3xl mb-2">🧙</p>
              <p className="font-cinzel text-[#6b5a3a] text-sm">No merchant today</p>
              <p className="text-[9px] text-[#4a3a2a] mt-1">The travelling merchant visits periodically — check back later.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="text-[#a78bfa] font-cinzel font-bold text-[11px]">🧙 TRAVELLING MERCHANT</p>
                <p className="text-[#4a3a6a] text-[9px]">Leaves in {merchantTimeLeft}</p>
              </div>
              {merchantDiscountPct > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <span className="text-[#4ade80] text-[9px] font-black">{merchantDiscountPct}% TOKEN DISCOUNT APPLIED</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.15)' }}>
                <span className="coin-icon" style={{ width: 12, height: 12 }} />
                <span className="font-cinzel text-[#f0c040] font-bold text-sm">{formatNumber(state.gold)}</span>
                <span className="text-[#4a3a2a] text-[9px]">available gold</span>
              </div>
              {deals.map(deal => {
                const effectiveCost = discountedGold(deal.goldCost);
                const affordable = canAfford(effectiveCost);
                return (
                  <div key={deal.id} className="rounded-xl p-3"
                    style={{ background: deal.purchased ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.06)', border: deal.purchased ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(139,92,246,0.2)', opacity: deal.purchased ? 0.5 : 1 }}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{deal.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px]">{deal.title}</p>
                        <p className="text-[#6b5a3a] text-[9px] mt-0.5 leading-snug">{deal.desc}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <span className="coin-icon" style={{ width: 11, height: 11 }} />
                          {merchantDiscountPct > 0 ? (
                            <>
                              <span className="font-cinzel text-[9px] line-through text-[#4a3a2a]">{formatNumber(deal.goldCost)}</span>
                              <span className={`font-cinzel font-bold text-[11px] ${affordable ? 'text-[#4ade80]' : 'text-red-400'}`}>{formatNumber(effectiveCost)}</span>
                            </>
                          ) : (
                            <span className={`font-cinzel font-bold text-[11px] ${affordable ? 'text-[#f0c040]' : 'text-red-400'}`}>{formatNumber(deal.goldCost)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {deal.purchased ? (
                          <span className="text-[#4ade80] text-[10px] font-bold">✓ Bought</span>
                        ) : (
                          <button onClick={() => buyFromMerchant(deal.id)} disabled={!affordable}
                            className="px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all active:scale-95"
                            style={{ background: affordable ? 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)' : 'rgba(100,80,40,0.2)', color: affordable ? '#fff' : '#4a3a2a', border: affordable ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(100,80,40,0.2)', opacity: affordable ? 1 : 0.5 }}>
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── XRP STORE ── */}
      {section === 'xrp' && (
        <div className="px-3 mt-2 flex flex-col gap-3">
          {/* Token discount status row */}
          {state.walletAddress && (
            <div className="flex flex-col gap-1.5">
              {state.tokenDiscount && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: 'lynx',        label: '$LYNX',      holds: state.tokenDiscount.lynx,        bal: state.tokenDiscount.lynxBalance },
                    { key: 'xrpnomics',   label: 'XRPNOMICS',  holds: state.tokenDiscount.xrpnomics,   bal: state.tokenDiscount.xrpnomicsBalance },
                    { key: 'dragonslayer',label: 'DS Token',    holds: state.tokenDiscount.dragonslayer, bal: state.tokenDiscount.dragonslayerBalance },
                  ].map(t => (
                    <span key={t.key} className="px-1.5 py-0.5 rounded text-[8px] font-bold"
                      style={{ background: t.holds ? 'rgba(74,222,128,0.12)' : 'rgba(100,80,40,0.15)', border: `1px solid ${t.holds ? 'rgba(74,222,128,0.35)' : 'rgba(100,80,40,0.25)'}`, color: t.holds ? '#4ade80' : '#6b5a3a' }}>
                      {t.holds ? '✓' : '✗'} {t.label}{t.bal > 0 ? ` (${t.bal.toLocaleString()})` : ''}
                    </span>
                  ))}
                  {discountPct > 0 && (
                    <span className="text-[#4ade80] text-[8px] font-black ml-1">{discountPct}% OFF</span>
                  )}
                </div>
              )}
              <button onClick={handleRefreshDiscount} disabled={discountRefreshStatus === 'loading'}
                className="self-start px-2 py-1 rounded-lg text-[8px] font-bold transition-all"
                style={{ background: discountRefreshStatus === 'done' ? 'rgba(74,222,128,0.15)' : discountRefreshStatus === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(212,160,23,0.1)', border: `1px solid ${discountRefreshStatus === 'done' ? 'rgba(74,222,128,0.4)' : discountRefreshStatus === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(212,160,23,0.25)'}`, color: discountRefreshStatus === 'done' ? '#4ade80' : discountRefreshStatus === 'error' ? '#f87171' : '#d4a017', opacity: discountRefreshStatus === 'loading' ? 0.6 : 1 }}>
                {discountRefreshStatus === 'loading' ? '⏳ Checking tokens…' : discountRefreshStatus === 'done' ? '✓ Updated' : discountRefreshStatus === 'error' ? '✗ XRPL failed — retry' : '🔄 Check Token Discount'}
              </button>
            </div>
          )}

          {/* Material Shop */}
          <div className="dragon-panel px-3 py-3">
            <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider mb-2">🪙 XRP MATERIAL SHOP</p>
            <div className="rounded-lg px-2 py-2 mb-3" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(212,160,23,0.25)' }}>
              <p className="text-[8px] text-[#6b5a3a] mb-1">Send XRP to this wallet:</p>
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-[9px] text-[#f0c040] flex-1 break-all leading-snug">{TREASURY}</p>
                <button onClick={copyTreasury} className="shrink-0 px-2 py-1 rounded text-[9px] font-bold transition-colors"
                  style={{ background: walletCopied ? 'rgba(74,222,128,0.2)' : 'rgba(212,160,23,0.15)', border: `1px solid ${walletCopied ? 'rgba(74,222,128,0.5)' : 'rgba(212,160,23,0.3)'}`, color: walletCopied ? '#4ade80' : '#f0c040' }}>
                  {walletCopied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
              <p className="text-[7px] text-[#4a3a2a] mt-1">
                {discountPct > 0
                  ? <><span className="line-through text-[#3a2a1a]">1 XRP</span> <span className="text-[#4ade80] font-bold">{discountedXrp(1)} XRP</span> = 3× one type · <span className="line-through text-[#3a2a1a]">3 XRP</span> <span className="text-[#4ade80] font-bold">{discountedXrp(3)} XRP</span> = 3× all 5 types</>
                  : '1 XRP = 3× one type · 3 XRP = 3× all 5 types · claim below with TX hash'
                }
              </p>
            </div>

            {state.walletAddress && (
              <p className="text-[8px] text-[#6b5a3a] mb-1">Pay via Xaman (wallet connected):</p>
            )}
            <div className="grid grid-cols-5 gap-1 mb-2">
              {(['dragon_scale','fire_crystal','ancient_rune','lynx_fang','nomic_core'] as MaterialType[]).map(t => (
                <button key={t} onClick={() => handleBuyMaterial(t)} disabled={buyStatus === 'loading' || !state.walletAddress}
                  className="flex flex-col items-center py-1.5 px-1 rounded-lg transition-opacity"
                  style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.2)', opacity: (buyStatus === 'loading' || !state.walletAddress) ? 0.4 : 1 }}>
                  <span className="text-base leading-none">{MATERIAL_LABELS[t].split(' ')[0]}</span>
                  {discountPct > 0 ? (
                    <><span className="text-[6px] line-through text-[#6b5a3a]">1</span><span className="text-[7px] text-[#4ade80] font-bold">{discountedXrp(1)}</span></>
                  ) : (
                    <span className="text-[7px] text-[#f0c040] font-bold mt-0.5">1 XRP</span>
                  )}
                  <span className="text-[6px] text-[#6b5a3a]">×3</span>
                </button>
              ))}
            </div>
            <button onClick={() => handleBuyMaterial('bundle')} disabled={buyStatus === 'loading' || !state.walletAddress}
              className="action-btn w-full py-2 text-[10px]" style={{ opacity: !state.walletAddress ? 0.4 : 1 }}>
              {discountPct > 0
                ? <>🎒 All 5 Types ×3 — <span className="line-through opacity-60">3</span> {discountedXrp(3)} XRP</>
                : '🎒 All 5 Types ×3 — 3 XRP'
              }
            </button>
            {!buyMsg && localStorage.getItem(PENDING_KEY) && (
              <button onClick={() => creditPendingPurchase(false)} className="w-full mt-1.5 text-[9px] text-[#d4a017] underline text-center">
                I already paid — check my Xaman payment
              </button>
            )}
            {buyMsg && (
              <p className={`text-[9px] mt-1.5 text-center ${buyStatus === 'error' ? 'text-red-400' : buyStatus === 'done' ? 'text-[#4ade80]' : 'text-[#f0c040]'}`}>{buyMsg}</p>
            )}
            {buyStatus === 'loading' && (
              <button onClick={() => { setBuyStatus('idle'); setBuyMsg(''); }} className="w-full mt-1.5 text-[9px] text-[#6b5a3a] underline text-center">
                Cancel / I closed Xaman
              </button>
            )}

            {/* TX Hash Claim */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(212,160,23,0.15)' }}>
              <p className="font-cinzel text-[#e8d8a8] text-[10px] font-bold mb-1">Already sent XRP? Claim with TX hash</p>
              <p className="text-[8px] text-[#6b5a3a] mb-2">Paste the TX hash from xrpscan.com or your wallet.</p>
              <input type="text" placeholder="e.g. A1B2C3D4E5F6..." value={txHash}
                onChange={e => setTxHash(e.target.value.trim())}
                className="w-full px-2 py-1.5 rounded-lg text-[10px] text-[#f0e8d0] mb-2"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,160,23,0.25)', outline: 'none' }} />
              <p className="text-[8px] text-[#6b5a3a] mb-1">1 XRP = pick a type below · 3 XRP = all 5 types automatically</p>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {(['dragon_scale','fire_crystal','ancient_rune','lynx_fang','nomic_core'] as MaterialType[]).map(t => (
                  <button key={t} onClick={() => setTxType(prev => prev === t ? '' : t)}
                    className="flex flex-col items-center py-1 px-1 rounded-lg transition-all"
                    style={{ background: txType === t ? 'rgba(212,160,23,0.3)' : 'rgba(212,160,23,0.06)', border: `1px solid ${txType === t ? 'rgba(212,160,23,0.7)' : 'rgba(212,160,23,0.15)'}` }}>
                    <span className="text-sm leading-none">{MATERIAL_LABELS[t].split(' ')[0]}</span>
                    <span className="text-[6px] text-[#6b5a3a] mt-0.5">{MATERIAL_LABELS[t].split(' ').slice(1).join(' ')}</span>
                  </button>
                ))}
              </div>
              <button onClick={handleClaimByTxHash} disabled={txStatus === 'loading' || txHash.length < 60}
                className="action-btn w-full py-2 text-[10px]" style={{ opacity: txHash.length < 60 ? 0.5 : 1 }}>
                {txStatus === 'loading' ? '⏳ Verifying…' : '✅ Claim Materials'}
              </button>
              {txMsg && <p className={`text-[9px] mt-1.5 text-center ${txStatus === 'error' ? 'text-red-400' : 'text-[#4ade80]'}`}>{txMsg}</p>}
            </div>
          </div>

          {/* Dragon Souls Shop */}
          <div className="dragon-panel px-3 py-3" style={{ border: '1px solid rgba(96,165,250,0.2)', background: 'linear-gradient(180deg, rgba(96,165,250,0.04) 0%, rgba(10,6,20,0) 100%)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🧿</span>
              <p className="font-cinzel font-bold text-[#e8d8a8] text-[11px] tracking-wider">Dragon Soul Shop</p>
              <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>XRP</span>
            </div>
            <p className="text-[8px] text-[#6b5a3a] mb-3">Buy Dragon Souls with XRP. Used to level items &amp; forge legendaries.</p>
            {soulsPhase === 'idle' || soulsPhase === 'error' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <div>
                    <p className="font-cinzel font-bold text-[11px] text-[#e8d8a8]">🧿 50 Dragon Souls</p>
                    <p className="text-[8px] text-[#9a8a6a] mt-0.5">5 XRP</p>
                  </div>
                  <button onClick={() => startSoulsBuy('souls_50')}
                    className="text-[9px] font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#1a4a7a,#2a6abf)', color: '#93c5fd' }}>
                    Buy 5 XRP
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(192,132,252,0.06)', border: '1px solid rgba(192,132,252,0.2)' }}>
                  <div>
                    <p className="font-cinzel font-bold text-[11px] text-[#e8d8a8]">🧿 125 Dragon Souls <span className="text-[8px] text-[#4ade80]">+25 bonus</span></p>
                    <p className="text-[8px] text-[#9a8a6a] mt-0.5">10 XRP · best value</p>
                  </div>
                  <button onClick={() => startSoulsBuy('souls_125')}
                    className="text-[9px] font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#4a1a7a,#7a2abf)', color: '#c4b5fd' }}>
                    Buy 10 XRP
                  </button>
                </div>
                {soulsPhase === 'error' && soulsError && (
                  <p className="text-[8px] text-red-400 text-center mt-1">{soulsError}</p>
                )}
              </div>
            ) : soulsPhase === 'loading' ? (
              <div className="flex items-center justify-center py-4">
                <span className="text-[#9a8a6a] text-[10px]">Creating payment…</span>
              </div>
            ) : soulsPhase === 'waiting' ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <p className="text-[9px] text-[#e8d8a8] font-bold">Waiting for XRP payment…</p>
                {soulsQr && <img src={soulsQr} alt="Scan QR" className="w-32 h-32 rounded-xl border border-[rgba(96,165,250,0.3)]" />}
                {soulsDeeplink && (
                  <a href={soulsDeeplink} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-bold px-4 py-2 rounded-lg"
                    style={{ background: 'linear-gradient(135deg,#1a4a7a,#2a6abf)', color: '#93c5fd' }}>
                    Open Xaman
                  </a>
                )}
                <button onClick={cancelSouls} className="text-[8px] text-[#6b5a3a] underline">Cancel</button>
              </div>
            ) : soulsPhase === 'success' ? (
              <div className="flex flex-col items-center gap-2 py-3">
                <span className="text-3xl">🧿</span>
                <p className="font-cinzel font-bold text-[#4ade80] text-[11px]">+{soulsCredited} Dragon Souls credited!</p>
                <button onClick={cancelSouls} className="text-[9px] font-bold px-4 py-1.5 rounded-lg mt-1"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>Done</button>
              </div>
            ) : null}
          </div>

          {/* Premium XRP Store */}
          <div className="dragon-panel px-3 py-3" style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'linear-gradient(180deg, rgba(139,92,246,0.05) 0%, rgba(10,6,20,0) 100%)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">⭐</span>
              <p className="font-cinzel font-bold text-[11px] tracking-wider" style={{ color: '#a78bfa' }}>PREMIUM XRP STORE</p>
            </div>
            <p className="text-[#4a3a6a] text-[8px] mb-3">Exclusive items. Send XRP to treasury, then claim with TX hash.</p>
            {[
              { id: 'nomic_shield_bundle', icon: '🛡️', label: 'Nomic Shield Craft Bundle', xrp: 5, desc: '🔮 Nomic Core ×5 · 🐉 Dragon Scale ×8 · ✨ Ancient Rune ×5 — everything to forge the Nomic Shield' },
              { id: 'rare_egg',       icon: '💎', label: 'Rare Dragon Egg',          xrp: 2, desc: 'Hatches in 4h · +15% material drops forever' },
              { id: 'legendary_egg',  icon: '✨', label: 'Legendary Dragon Egg',      xrp: 5, desc: 'Hatches in 6h · −10% expedition time forever' },
              { id: 'rare_bundle',    icon: '🎁', label: 'Rare Material Mega Bundle', xrp: 5, desc: '5× of all 5 material types' },
              { id: 'incubator_slot', icon: '🔥', label: 'Permanent Incubator Slot',  xrp: 1, desc: 'Extra slot that stacks forever — never expires' },
              { id: 'gold_50m',       icon: '💰', label: `${formatNumber(goldPackAmount)} Gold Pack`,  xrp: 3, desc: `Adds ${formatNumber(goldPackAmount)} gold — scales with your income (24h worth)` },
            ].map(item => (
              <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-xl mb-1.5"
                style={{ background: premiumType === item.id ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.04)', border: `1px solid ${premiumType === item.id ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.15)'}` }}>
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[10px]" style={{ color: '#e8d8f8' }}>{item.label}</p>
                  <p className="text-[#6b5a8a] text-[8px]">{item.desc}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {discountPct > 0 ? (
                    <div className="flex flex-col items-end">
                      <span className="font-cinzel text-[9px] line-through" style={{ color: '#6b5a8a' }}>{item.xrp} XRP</span>
                      <span className="font-cinzel font-bold text-[10px]" style={{ color: '#4ade80' }}>{discountedXrp(item.xrp)} XRP</span>
                    </div>
                  ) : (
                    <span className="font-cinzel font-bold text-[10px]" style={{ color: '#a78bfa' }}>{item.xrp} XRP</span>
                  )}
                  <button onClick={() => setPremiumType(prev => prev === item.id ? '' : item.id)}
                    className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                    style={{ background: premiumType === item.id ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                    {premiumType === item.id ? '✓ Selected' : 'Select'}
                  </button>
                </div>
              </div>
            ))}
            <div className="rounded-lg px-2 py-1.5 mt-1 mb-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="text-[7px] text-[#4a3a6a] mb-0.5">Send XRP to:</p>
              <p className="font-mono text-[8px] break-all" style={{ color: '#a78bfa' }}>{TREASURY}</p>
            </div>
            <input type="text" placeholder="Paste TX hash after payment…" value={premiumHash}
              onChange={e => setPremiumHash(e.target.value.trim())}
              className="w-full px-2 py-1.5 rounded-lg text-[10px] text-[#f0e8d0] mb-1.5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(139,92,246,0.25)', outline: 'none' }} />
            <button onClick={handleClaimPremiumByTxHash} disabled={premiumStatus === 'loading' || premiumHash.length < 60 || !premiumType}
              className="w-full py-2 rounded-xl font-cinzel font-bold text-[10px] tracking-wider transition-all"
              style={{ background: (premiumHash.length >= 60 && premiumType) ? 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)' : 'rgba(100,80,40,0.15)', color: (premiumHash.length >= 60 && premiumType) ? '#fff' : '#4a3a4a', border: '1px solid rgba(139,92,246,0.3)', opacity: (premiumStatus === 'loading' || premiumHash.length < 60 || !premiumType) ? 0.5 : 1 }}>
              {premiumStatus === 'loading' ? '⏳ Verifying…' : '⭐ Claim Premium Item'}
            </button>
            {premiumMsg && <p className={`text-[9px] mt-1.5 text-center ${premiumStatus === 'error' ? 'text-red-400' : 'text-[#4ade80]'}`}>{premiumMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
