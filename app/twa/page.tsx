'use client';

import { useEffect } from 'react';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import Page from '../page';

export default function TWAPage() {
  const { expand } = useTelegramWebApp();

  useEffect(() => {
    expand();
  }, [expand]);

  // Renders the exact same game but inside Telegram's chrome
  return <Page />;
}
