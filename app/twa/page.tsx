'use client';

import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import Page from '../page';

export default function TWAPage() {
  // useTelegramWebApp already calls tg.ready() + tg.expand() on mount
  useTelegramWebApp();

  // Renders the exact same game but inside Telegram's chrome
  return <Page />;
}
