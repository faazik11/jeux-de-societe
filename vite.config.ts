import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Le site est servi sur https://faazik11.github.io/jeux-de-societe/
export default defineConfig({
  base: '/jeux-de-societe/',
  plugins: [
    // Appli installable (PWA) : icône sur l'écran d'accueil, plein écran, fonctionne hors ligne (sauf le jeu en ligne)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'Enquête — jeux de société',
        short_name: 'Enquête',
        description: "Jeu d'enquête en ligne de 2 à 6 joueurs, avec plateau 3D.",
        lang: 'fr',
        start_url: '/jeux-de-societe/',
        scope: '/jeux-de-societe/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1d24',
        theme_color: '#1b1d24',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,glb,webmanifest,webp}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/jeux-de-societe/index.html',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
