'use client';

import React from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Thematic fantasy SVG icons
const HeroIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Crossed swords */}
    <line x1="4" y1="4" x2="22" y2="22" />
    <line x1="22" y1="4" x2="4" y2="22" />
    <line x1="4" y1="2" x2="4" y2="6" />
    <line x1="2" y1="4" x2="6" y2="4" />
    <line x1="22" y1="20" x2="22" y2="24" />
    <line x1="20" y1="22" x2="24" y2="22" />
  </svg>
);

const BuildingsIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Castle tower */}
    <rect x="7" y="10" width="12" height="14" />
    <rect x="5" y="7" width="4" height="5" />
    <rect x="17" y="7" width="4" height="5" />
    <line x1="5" y1="7" x2="5" y2="4" />
    <line x1="7" y1="7" x2="7" y2="4" />
    <line x1="9" y1="7" x2="9" y2="4" />
    <line x1="17" y1="7" x2="17" y2="4" />
    <line x1="19" y1="7" x2="19" y2="4" />
    <line x1="21" y1="7" x2="21" y2="4" />
    <rect x="11" y="16" width="4" height="8" />
  </svg>
);

const ExpeditionIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Compass */}
    <circle cx="13" cy="13" r="9" />
    <polygon points="13,5 15.5,13 13,11 10.5,13" fill="currentColor" stroke="none" opacity="0.9" />
    <polygon points="13,21 10.5,13 13,15 15.5,13" fill="currentColor" stroke="none" opacity="0.4" />
    <circle cx="13" cy="13" r="1.2" fill="currentColor" stroke="none" />
    <line x1="13" y1="2" x2="13" y2="4" />
    <line x1="13" y1="22" x2="13" y2="24" />
    <line x1="2" y1="13" x2="4" y2="13" />
    <line x1="22" y1="13" x2="24" y2="13" />
  </svg>
);

const LeaderboardIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Crown */}
    <path d="M4 18 L4 10 L9 14 L13 6 L17 14 L22 10 L22 18 Z" />
    <line x1="4" y1="21" x2="22" y2="21" />
    <circle cx="13" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="22" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const ProfileIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Shield */}
    <path d="M13 3 L21 6.5 L21 13 C21 17.5 17.5 21 13 23 C8.5 21 5 17.5 5 13 L5 6.5 Z" />
    <path d="M10 13 L12 15 L16 11" />
  </svg>
);

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const items: NavItem[] = [
    { id: 'hero',        label: 'Hero',       icon: <HeroIcon /> },
    { id: 'buildings',   label: 'Forge',      icon: <BuildingsIcon /> },
    { id: 'expedition',  label: 'Expedition', icon: <ExpeditionIcon /> },
    { id: 'leaderboard', label: 'Ranks',      icon: <LeaderboardIcon /> },
    { id: 'profile',     label: 'Profile',    icon: <ProfileIcon /> },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] sm:max-w-[540px] z-50">
      <div className="bottom-nav px-1 pt-1.5" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-around">
          {items.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="relative flex flex-col items-center gap-1 py-1.5 px-4 transition-all duration-200 rounded-xl"
                style={{
                  color: isActive ? '#f0c040' : '#5a4a2a',
                  background: isActive ? 'rgba(212,160,23,0.08)' : 'transparent',
                }}
              >
                {/* Active glow behind icon */}
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      boxShadow: '0 0 16px rgba(212,160,23,0.15)',
                      border: '1px solid rgba(212,160,23,0.2)',
                    }}
                  />
                )}
                {item.icon}
                <span
                  className="text-[9px] font-bold tracking-widest uppercase font-cinzel"
                  style={{ color: isActive ? '#d4a017' : '#4a3a1a' }}
                >
                  {item.label}
                </span>
                {/* Fire indicator dot */}
                {isActive && (
                  <span
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #f0c040, transparent)',
                      boxShadow: '0 0 6px rgba(255,200,40,0.6)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
