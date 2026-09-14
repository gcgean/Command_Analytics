import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' e não 'autoUpdate': com autoUpdate, todo deploy recarregava sozinho as abas abertas
      // (checagem a cada 5 min) e fechava o formulário no meio do lançamento. Agora aparece o aviso
      // "Nova versão disponível" e a pessoa atualiza quando terminar o que está fazendo.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      devOptions: { enabled: true },
      manifest: {
        name: 'Command Analytics',
        short_name: 'CmdAnalytics',
        description: 'Plataforma de gestão e analytics — Cilos Sistema',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // A versão nova só assume quando a pessoa clica em "Atualizar agora" (o botão manda o
        // SKIP_WAITING). Assumir sozinha trocaria os arquivos por baixo de uma página já aberta.
        skipWaiting: false,
        clientsClaim: false,
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api') || url.port === '3333',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
})
