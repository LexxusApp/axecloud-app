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
          id: '/',
          name: 'AxéCloud',
          short_name: 'AxéCloud',
          description: 'Gestão Inteligente para sua Comunidade',
          start_url: '/',
          scope: '/',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          icons: [
            {
              src: '/pwa-icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/pwa-icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
            {
              src: '/pwa-icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/pwa-icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          importScripts: ['/sw-push.js'],
          // Evita que o fallback do SPA (index.html) intercepte navegação para /api/*
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // GET same-origin: biblioteca, tenant-info, eventos, etc. — resposta imediata do cache + atualização em silêncio
              urlPattern: ({url, sameOrigin}) => sameOrigin && url.pathname.startsWith('/api/'),
              handler: 'StaleWhileRevalidate',
              method: 'GET',
              options: {
                cacheName: 'axecloud-api-swr',
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
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
