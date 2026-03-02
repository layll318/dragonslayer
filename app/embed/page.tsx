'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import HeroTab from '@/components/HeroTab';
import BuildingsTab from '@/components/BuildingsTab';
import BottomNav from '@/components/BottomNav';
import { useGame } from '@/contexts/GameContext';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '';
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://dragonslayer-production.up.railway.app';

function EmbedContent() {
  const searchParams = useSearchParams();
  const walletParam = searchParams.get('wallet');
  const { state } = useGame();

  const [tab, setTab] = useState<'hero' | 'buildings'>('hero');
  const [originAllowed, setOriginAllowed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  // Check if the parent page origin is whitelisted
  useEffect(() => {
    const checkOrigin = async () => {
      const parentOrigin =
        typeof window !== 'undefined' && window.location !== window.parent.location
          ? document.referrer
            ? new URL(document.referrer).origin
            : 'unknown'
          : window.location.origin;

      if (!API_URL) {
        setOriginAllowed(true);
        setChecking(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/embed/check?origin=${encodeURIComponent(parentOrigin)}`);
        const data = await res.json();
        setOriginAllowed(data.allowed);
      } catch {
        // If API unreachable, allow (fail open for dev)
        setOriginAllowed(true);
      } finally {
        setChecking(false);
      }
    };

    checkOrigin();
  }, []);

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#f0c040] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (originAllowed === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="text-5xl">🔒</span>
        <h2 className="font-cinzel font-black text-[#f0c040] text-lg">Embed Not Authorized</h2>
        <p className="text-[#9a8a6a] text-sm">
          This site is not permitted to embed DragonSlayer.
        </p>
        <a
          href={FRONTEND_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="action-btn px-4 py-2 text-sm font-cinzel font-bold"
        >
          Play Directly ⚔️
        </a>
      </div>
    );
  }

  return (
    <>
      <main className="flex-1 flex flex-col overflow-y-auto">
        {tab === 'hero'      && <HeroTab />}
        {tab === 'buildings' && <BuildingsTab />}
      </main>
      {/* Compact 2-tab embed nav */}
      <nav className="top-bar flex items-center justify-around px-4 py-2 flex-shrink-0">
        <button
          onClick={() => setTab('hero')}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${tab === 'hero' ? 'text-[#f0c040]' : 'text-[#6b5a3a]'}`}
        >
          <span className="text-lg">⚔️</span>
          <span className="font-cinzel text-[9px] font-bold tracking-widest uppercase">Hero</span>
        </button>
        <button
          onClick={() => setTab('buildings')}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${tab === 'buildings' ? 'text-[#f0c040]' : 'text-[#6b5a3a]'}`}
        >
          <span className="text-lg">🏰</span>
          <span className="font-cinzel text-[9px] font-bold tracking-widest uppercase">Forge</span>
        </button>
        <a
          href={FRONTEND_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-0.5 px-4 py-1"
        >
          <span className="text-lg">🔗</span>
          <span className="font-cinzel text-[9px] font-bold tracking-widest uppercase text-[#6b5a3a]">Full Game</span>
        </a>
      </nav>
    </>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#f0c040] border-t-transparent animate-spin" />
      </div>
    }>
      <EmbedContent />
    </Suspense>
  );
}
