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
        // O index.html fica FORA do precache e a navegação vai sempre à rede.
        //
        // Com ele precachado e skipWaiting desligado, a versão nova ficava esperando enquanto
        // o service worker antigo continuava servindo o index.html antigo — que aponta para o
        // JS antigo. Recarregar não trocava nada, nem com Ctrl+Shift+R, e quem tivesse
        // dispensado o aviso ficava preso na versão velha sem saída.
        //
        // O custo é não abrir sem rede. Para este sistema isso quase não existe: toda tela
        // depende da API, então sem rede não há o que mostrar de qualquer jeito.
        globPatterns: ['**/*.{js,css,svg,ico}'],
        // Sem isto o plugin registra a rota de navegação apontando para um index.html que
        // não está mais no precache, e aí nenhuma navegação carrega.
        navigateFallback: null,
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
