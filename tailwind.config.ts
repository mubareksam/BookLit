import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        serif: [
          'Charter',
          '"Bitstream Charter"',
          '"Sitka Text"',
          'Cambria',
          'Georgia',
          'serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        paper: {
          50: '#FCFBF8',
          100: '#F6F3EC',
          200: '#ECE6DA',
          300: '#DDD4C3',
        },
        ink: {
          950: '#090A0D',
          900: '#111318',
          800: '#1A1D24',
          700: '#262B35',
        },
      },
    },
  },
  plugins: [],
};

export default config;
