import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { splashLinks } from './scripts/ios-splash';

// Project Pages serve from /<repo>/; the deploy workflow sets BASE_PATH. A custom domain uses '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    { name: 'ios-splash', transformIndexHtml: () => splashLinks() },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Solo Microscope',
        short_name: 'Microscope',
        description: 'Play Microscope solo with the Lens hack — a structured writing exercise.',
        theme_color: '#7a4b1e',
        background_color: '#f6f3ee',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // iOS reads launch images when the app is added to the Home Screen; caching ~60 of them
        // offline would only slow the first load.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
});
