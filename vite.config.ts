/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from https://grabych-jr3.github.io/fitness-dashboard/
const base = '/fitness-dashboard/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0.0.0'} · ${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Фітнес-дашборд',
        short_name: 'Фітнес',
        description: 'Заміри InBody, тренування і прогрес',
        lang: 'uk',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b12',
        theme_color: '#0b0b12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
