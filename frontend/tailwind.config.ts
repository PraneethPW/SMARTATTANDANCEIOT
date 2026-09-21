import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        ink: '#08111f',
        mint: '#81f8d4',
        cyan: '#50c7ff',
        violet: '#8974ff',
      },
    },
  },
  plugins: [],
} satisfies Config;

