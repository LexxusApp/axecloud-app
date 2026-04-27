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
        injectRegister: false,
        includeAssets: ['axecloud_192.png', 'axecloud_512.png', 'sw-push.js'],
        devOptions: {
          enabled: true,
        },
        manifest: {
          id: '/',
          name: 'AxéCloud',
          short_name: 'AxéCloud',
          description: 'Gestão Inteligente para sua Comunidade',
          start_url: '/',
          scope: '/',
          lang: 'pt-BR',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          icons: [
            {
              src: '/axecloud_192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/axecloud_512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          /** Bump ao mudar estratégia de cache — força precache/runtime novos e abandona caches antigos (cleanupOutdatedCaches). */
          cacheId: 'axecloud-v2',
          cleanupOutdatedCaches: true,
          importScripts: ['/sw-push.js'],
          // Evita que o fallback do SPA (index.html) intercepte navegação para /api/*
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // GET /api/* — rede primeiro (deploy novo invalida cache velho no PWA); fallback ao cache se offline/lento
              urlPattern: ({url, sameOrigin}) => sameOrigin && url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              method: 'GET',
              options: {
                cacheName: 'axecloud-api-network-first-v2',
                networkTimeoutSeconds: 12,
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 12,
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
