import type { Config } from 'tailwindcss';

/**
 * Knowledge Sales Platform — "Sumi & Cinnabar Editorial" design system.
 *
 * 思想:
 *   - 編集的: numbered metadata, hairline rules, generous breathing room
 *   - 業務 SaaS の信頼感: 抑制された motion、controlled density
 *   - 日本らしさ: 墨 (sumi) と朱 (cinnabar) のコントラスト、落款風 active state
 *   - グラデーションを使わず paper grain と多層 shadow で depth 表現
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/**/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '2.5rem',
      },
      screens: {
        '2xl': '1240px',
      },
    },
    screens: {
      xs: '375px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'var(--font-jp)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-jp)', 'system-ui', 'sans-serif'],
        jp: ['var(--font-jp)', '"Hiragino Sans"', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // 編集的 type scale (1.250 perfect fourth × 文字粒度補正)
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['0.9375rem', { lineHeight: '1.55' }],
        lg: ['1.0625rem', { lineHeight: '1.5' }],
        xl: ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.005em' }],
        '2xl': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        '3xl': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.018em' }],
        '4xl': ['2.375rem', { lineHeight: '1.12', letterSpacing: '-0.025em' }],
        '5xl': ['3rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        '6xl': ['3.75rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
        // Numeric display (KPI / metric heroes)
        'metric-sm': ['1.875rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'metric': ['2.625rem', { lineHeight: '1', letterSpacing: '-0.025em' }],
        'metric-lg': ['3.5rem', { lineHeight: '0.95', letterSpacing: '-0.035em' }],
      },
      colors: {
        // sumi = 墨 (deep ink), cinnabar = 朱, chitose = 千歳緑
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // 表面 surfaces
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          raised: 'hsl(var(--surface-raised))',
          inset: 'hsl(var(--surface-inset))',
        },
        // ブランド primary
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // 朱色 — CTA / brand active accent
        cinnabar: {
          DEFAULT: 'hsl(var(--cinnabar))',
          foreground: 'hsl(var(--cinnabar-foreground))',
          muted: 'hsl(var(--cinnabar-muted))',
        },
        // 千歳緑 — success / 商談 closed-won
        chitose: {
          DEFAULT: 'hsl(var(--chitose))',
          foreground: 'hsl(var(--chitose-foreground))',
          muted: 'hsl(var(--chitose-muted))',
        },
        // ochre — warning
        ochre: {
          DEFAULT: 'hsl(var(--ochre))',
          foreground: 'hsl(var(--ochre-foreground))',
          muted: 'hsl(var(--ochre-muted))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--chitose))',
          foreground: 'hsl(var(--chitose-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--ochre))',
          foreground: 'hsl(var(--ochre-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        'xs': '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // 編集的 multi-layer shadows. 単色不透明より多層の方が paper-like 質感
        'rule': '0 1px 0 0 hsl(var(--border))',
        'edge': 'inset 0 0 0 1px hsl(var(--border) / 0.6)',
        'sumi-sm':
          '0 1px 0 hsl(var(--shadow-color) / 0.04), 0 1px 2px hsl(var(--shadow-color) / 0.06)',
        'sumi':
          '0 1px 0 hsl(var(--shadow-color) / 0.05), 0 4px 12px -2px hsl(var(--shadow-color) / 0.08), 0 2px 4px hsl(var(--shadow-color) / 0.04)',
        'sumi-lg':
          '0 1px 0 hsl(var(--shadow-color) / 0.06), 0 12px 32px -8px hsl(var(--shadow-color) / 0.12), 0 4px 8px hsl(var(--shadow-color) / 0.06)',
        'sumi-xl':
          '0 24px 56px -16px hsl(var(--shadow-color) / 0.18), 0 8px 16px hsl(var(--shadow-color) / 0.08)',
        'inset-rule': 'inset 0 -1px 0 hsl(var(--border) / 0.6)',
        'inset-top': 'inset 0 1px 0 hsl(var(--surface-highlight) / 0.06)',
        'cinnabar-glow':
          '0 0 0 1px hsl(var(--cinnabar) / 0.18), 0 8px 24px -8px hsl(var(--cinnabar) / 0.32)',
        'focus-ring':
          '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring) / 0.45)',
        'focus-ring-cinnabar':
          '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--cinnabar) / 0.4)',
      },
      transitionTimingFunction: {
        'sumi': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'sumi-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'sumi-in': 'cubic-bezier(0.36, 0, 0.66, 1)',
      },
      transitionDuration: {
        'fast': '160ms',
        'med': '240ms',
        'slow': '360ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'sheet-down': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ink': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
        'inkan-pop': {
          '0%': { transform: 'scale(0.8) rotate(-3deg)', opacity: '0' },
          '50%': { transform: 'scale(1.06) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-up': 'fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'shimmer': 'shimmer 2.4s linear infinite',
        'pulse-ink': 'pulse-ink 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'inkan-pop': 'inkan-pop 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      backgroundImage: {
        // 紙の質感 — turbulence ベース、light でのみ visible
        'paper-grain': 'var(--paper-grain)',
        // editorial column rule
        'column-rule':
          'linear-gradient(to right, transparent 0, hsl(var(--border)) 0, hsl(var(--border)) 1px, transparent 1px)',
      },
      letterSpacing: {
        'crisp': '-0.018em',
        'editorial': '0.06em',
        'kicker': '0.18em',
      },
    },
  },
  plugins: [],
};

export default config;
