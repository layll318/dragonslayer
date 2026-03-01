'use client';

import React, { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import HeroTab from '@/components/HeroTab';
import BuildingsTab from '@/components/BuildingsTab';
import LeaderboardTab from '@/components/LeaderboardTab';
import ProfileTab from '@/components/ProfileTab';

export default function Home() {
  const [activeTab, setActiveTab] = useState('hero');

  return (
    <>
      <main className="flex-1 flex flex-col overflow-y-auto pb-20">
        {activeTab === 'hero' && <HeroTab />}
        {activeTab === 'buildings' && <BuildingsTab />}
        {activeTab === 'leaderboard' && <LeaderboardTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
