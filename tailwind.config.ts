import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dragon: {
          gold: '#d4a017',
          'gold-light': '#f0c040',
          'gold-dark': '#a07010',
          fire: '#ff6b1a',
          'fire-dark': '#cc3300',
          ember: '#ff4500',
          blood: '#8b0000',
          dark: '#0a0a0a',
          darker: '#050505',
          panel: '#1a1208',
          'panel-border': '#3d2e0a',
          'panel-light': '#2a1e0c',
        },
      },
      fontFamily: {
        medieval: ['Georgia', 'Times New Roman', 'serif'],
      },
      animation: {
        'fire-glow': 'fireGlow 2s ease-in-out infinite alternate',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'shake': 'shake 0.3s ease-in-out',
        'coin-fly': 'coinFly 0.8s ease-out forwards',
        'ember-rise': 'emberRise 2s ease-out infinite',
      },
      keyframes: {
        fireGlow: {
          '0%': { boxShadow: '0 0 20px rgba(255, 107, 26, 0.3), 0 0 60px rgba(255, 107, 26, 0.1)' },
          '100%': { boxShadow: '0 0 40px rgba(255, 107, 26, 0.5), 0 0 80px rgba(255, 107, 26, 0.2)' },
        },
        pulseGold: {
          '0%, 100%': { opacity: '0.8' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
        coinFly: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-80px) scale(0.5)', opacity: '0' },
        },
        emberRise: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0.8' },
          '100%': { transform: 'translateY(-100px) scale(0)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
export default config
