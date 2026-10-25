/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/; override with BASE=/ for other hosts.
const base = process.env.BASE ?? '/Russian-learner/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Медведь: Russian A2 → C1',
        short_name: 'Медведь',
        description: 'An offline Russian course from upper beginner to advanced.',
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6efe1',
        theme_color: '#8e1c1c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app, core lexicon (A1–C2) and A1–B1 sentences; the rare-word tail (chunks and its search index)
        // and B2/C1 sentences are cached on first use.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/lex/X*', '**/index-ext-*', '**/sent/B2*', '**/sent/C1*'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(lex\/X|index-ext-|sent\/(B2|C1)).*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'lexicon-ext', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 4000, // lexicon chunks are large by design and lazy-loaded
    rollupOptions: {
      output: {
        // keep lexicon chunks recognisable so the service worker can treat them separately
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.includes('/data/sentences/')
            ? 'assets/sent/[name]-[hash].js'
            : /^[ABCX]\d$/.test(chunk.name)
              ? 'assets/lex/[name]-[hash].js'
              : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
