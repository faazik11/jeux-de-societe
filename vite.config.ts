import { defineConfig } from 'vite';

// Le site est servi sur https://faazik11.github.io/jeux-de-societe/
export default defineConfig({
  base: '/jeux-de-societe/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
