import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon-192.svg', 'pwa-icon-512.svg', 'sw-push.js'],
        manifest: {
          name: 'AxéCloud',
          short_name: 'AxéCloud',
          description: 'Gestão Inteligente para sua Comunidade',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '/pwa-icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            {
              src: '/pwa-icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          importScripts: ['/sw-push.js'],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
