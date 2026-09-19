/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Neutral scale — the interface is built almost entirely from these. */
        /* Driven by CSS variables so a single theme switch repaints the whole
           interface, instead of every component carrying a `dark:` twin. */
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
        },
        /* The colour a card sits on. White in light, a raised slate in dark. */
        surface: 'rgb(var(--surface) / <alpha-value>)',
        /* Restrained accent — deep pine. Used for primary actions and active state only. */
        brand: {
          50: '#EDF6F3',
          100: '#D3E9E2',
          200: '#A7D3C5',
          300: '#6FB6A2',
          400: '#3E9580',
          500: '#1F7A63',
          600: '#166352',
          700: '#124F42',
          800: '#0E3D34',
          900: '#0A2B25',
        },
        success: {
          50: '#ECF7F0',
          100: '#D2ECDC',
          500: '#177F4B',
          600: '#12693D',
          700: '#0E5231',
        },
        warning: {
          50: '#FDF5E9',
          100: '#F8E7C5',
          500: '#B26A00',
          600: '#935700',
          700: '#744500',
        },
        danger: {
          50: '#FDF1F0',
          100: '#F8D8D4',
          500: '#B42318',
          600: '#951C13',
          700: '#77160F',
        },
        info: {
          50: '#EEF4FA',
          100: '#D2E3F2',
          500: '#1D6FA5',
          600: '#175A87',
          700: '#12476B',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '"IBM Plex Sans Arabic"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        arabic: ['"IBM Plex Sans Arabic"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }],
        '3xl': ['1.875rem', { lineHeight: '2.375rem', letterSpacing: '-0.015em' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        sm: '0.5rem',
        DEFAULT: '0.625rem',
        md: '0.75rem',
        lg: '0.875rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(20 24 29 / 0.04)',
        sm: '0 1px 3px 0 rgb(20 24 29 / 0.06), 0 1px 2px -1px rgb(20 24 29 / 0.04)',
        DEFAULT: '0 2px 6px -1px rgb(20 24 29 / 0.07), 0 1px 3px -1px rgb(20 24 29 / 0.05)',
        md: '0 6px 16px -4px rgb(20 24 29 / 0.09), 0 2px 6px -2px rgb(20 24 29 / 0.05)',
        lg: '0 16px 32px -8px rgb(20 24 29 / 0.12), 0 4px 10px -4px rgb(20 24 29 / 0.06)',
        overlay: '0 24px 48px -12px rgb(20 24 29 / 0.18)',
        none: 'none',
      },
      spacing: {
        '4.5': '1.125rem',
        18: '4.5rem',
        22: '5.5rem',
        68: '17rem',
        76: '19rem',
      },
      zIndex: {
        header: '30',
        sidebar: '40',
        overlay: '50',
        modal: '60',
        toast: '70',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-end': {
          from: { transform: 'translateX(var(--slide-from, 100%))' },
          to: { transform: 'translateX(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'scale-in': 'scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-end': 'slide-in-end 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
