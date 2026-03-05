'use client';

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import { formatNumber } from '@/utils/format';

export default function BuildingsTab() {
  const { state, buyBuilding, getBuildingCost, canAfford, goldPerHour, armyPower } = useGame();
  const totalBuildings = state.buildings.reduce((sum, b) => sum + b.owned, 0);


  return (
    <div className="flex flex-col flex-1 pb-4 overflow-y-auto relative z-10 page-fade">
      {/* Header */}
      <div className="top-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gold-shimmer font-cinzel font-bold text-lg tracking-wide">Army</h2>
            <p className="text-[#6b5a3a] text-[10px] mt-0.5 uppercase tracking-wider">Train units · earn passive gold</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="font-cinzel text-[#f0c040] font-bold text-sm tabular-nums">⚔️ {armyPower}</span>
              <span className="text-[#6b5a3a] text-[10px]">army pwr</span>
            </div>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className="coin-icon" style={{ width: 11, height: 11 }} />
              <span className="font-cinzel text-[#a89060] font-bold text-xs tabular-nums">{formatNumber(goldPerHour)}</span>
              <span className="text-[#6b5a3a] text-[9px]">/hr</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 mt-2 space-y-2.5">
        {state.buildings.map((building) => {
          const cost     = getBuildingCost(building);
          const affordable  = canAfford(cost);
          const cost10   = Math.floor(building.baseCost * (Math.pow(building.costMultiplier, building.owned) * (1 - Math.pow(building.costMultiplier, 10)) / (1 - building.costMultiplier)));
          const canBuy10 = state.gold >= cost10;
          const unlocked = state.level >= building.unlockLevel;
          const income   = building.baseIncome * building.owned;

          return (
            <div
              key={building.id}
              className={`building-card p-3.5 ${!unlocked ? 'opacity-30 grayscale' : ''} ${unlocked && affordable ? 'building-affordable' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 relative"
                  style={{
                    background: 'linear-gradient(180deg, rgba(30,22,10,0.8) 0%, rgba(15,10,5,0.9) 100%)',
                    border: `1px solid ${building.owned > 0 ? 'rgba(212,160,23,0.35)' : 'rgba(100,80,40,0.2)'}`,
                    boxShadow: building.owned > 0 ? '0 0 12px rgba(212,160,23,0.08), inset 0 1px 0 rgba(212,160,23,0.05)' : 'none',
                  }}
                >
                  {building.icon}
                  {building.owned > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-b from-[#f0c040] to-[#a07010] text-[#1a1208] text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border border-[#ffe88a]/30">
                      {building.owned}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="font-cinzel text-[#f0c040] font-bold text-sm block">{building.name}</span>
                  <p className="text-[#6b5a3a] text-[10px] leading-tight mt-0.5">{building.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[#c84040] text-[10px] font-bold">⚔️ +{building.armyPower} atk</span>
                    <span className="text-[#60a5fa] text-[10px] font-bold">🛡️ +{building.defensePower} def</span>
                    <span className="text-[#8a7a5a] text-[10px]">· +{formatNumber(building.baseIncome)}/hr</span>
                    {income > 0 && (
                      <span className="text-green-400/90 text-[10px] font-bold bg-green-900/20 px-1.5 py-0.5 rounded">
                        {formatNumber(income)}/hr total
                      </span>
                    )}
                  </div>
                </div>

                {/* Buy buttons */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {unlocked ? (
                    <>
                      {/* Buy 1 */}
                      <button
                        onClick={() => buyBuilding(building.id)}
                        disabled={!affordable}
                        className="action-btn text-[10px] px-3 py-1.5 w-[70px]"
                      >
                        BUY
                      </button>
                      <div className="flex items-center gap-0.5 justify-end">
                        <span className="coin-icon" style={{ width: 8, height: 8 }} />
                        <span className={`text-[9px] font-bold ${affordable ? 'text-[#8a7a5a]' : 'text-red-400/70'}`}>
                          {formatNumber(cost)}
                        </span>
                      </div>
                      {/* Buy ×10 — always visible, greyed when unaffordable */}
                      <button
                        onClick={() => canBuy10 && buyBuilding(building.id, 10)}
                        disabled={!canBuy10}
                        className="text-[8px] font-black px-2 py-0.5 rounded w-[70px] transition-opacity"
                        style={{
                          background: canBuy10
                            ? 'linear-gradient(180deg, #ffaa33 0%, #d4a017 100%)'
                            : 'rgba(100,80,40,0.25)',
                          border: canBuy10 ? '1px solid #ffe88a' : '1px solid rgba(100,80,40,0.3)',
                          color: canBuy10 ? '#1a1208' : '#5a4a2a',
                          letterSpacing: '0.5px',
                          opacity: canBuy10 ? 1 : 0.55,
                        }}
                      >
                        ×10
                      </button>
                    </>
                  ) : (
                    <div className="text-center px-2 py-2 rounded-lg bg-black/20 border border-[rgba(100,80,40,0.15)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mx-auto mb-1 text-[#4a3a2a]">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span className="text-[9px] text-[#4a3a2a] font-bold block">Lv.{building.unlockLevel}</span>
                      <span className="text-[8px] text-[#3a2a1a] block mt-0.5">
                        {building.unlockLevel - state.level} lvls
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
