import type { Metadata, Viewport } from 'next';
import { Cinzel } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { GameProvider } from '@/contexts/GameContext';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-cinzel',
});

export const metadata: Metadata = {
  title: 'DragonSlayer',
  description: 'Tap, build, and raise your DragonSlayer hero',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cinzel.variable}>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="fire-bg min-h-screen">
        <GameProvider>
          <div className="w-full max-w-[430px] sm:max-w-[540px] mx-auto min-h-screen relative flex flex-col">
            {children}
          </div>
        </GameProvider>
      </body>
    </html>
  );
}
