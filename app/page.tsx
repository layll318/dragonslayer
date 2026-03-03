'use client';

import React, { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeroTab from '@/components/HeroTab';
import BuildingsTab from '@/components/BuildingsTab';
import LeaderboardTab from '@/components/LeaderboardTab';
import ProfileTab from '@/components/ProfileTab';
import ExpeditionTab from '@/components/ExpeditionTab';

export default function Home() {
  const [activeTab, setActiveTab] = useState('hero');

  return (
    <>
      <main className="flex-1 flex flex-col overflow-y-auto" style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom))' }}>
        {activeTab === 'hero' && <HeroTab />}
        {activeTab === 'buildings' && <BuildingsTab />}
        {activeTab === 'expedition' && <ExpeditionTab />}
        {activeTab === 'leaderboard' && <LeaderboardTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
