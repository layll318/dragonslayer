import type { Metadata } from 'next';
import { Cinzel } from 'next/font/google';
import '../globals.css';
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

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cinzel.variable}>
      <body className="fire-bg" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        <GameProvider>
          <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
        </GameProvider>
      </body>
    </html>
  );
}
