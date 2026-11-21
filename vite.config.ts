/// <reference types="vitest/config" />
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from https://grabych-jr3.github.io/fitness-dashboard/
const base = '/fitness-dashboard/'

// --- Tesseract.js assets, served from our own origin for offline OCR -------
// <base>tesseract/<versions>/worker.min.js, core/*.wasm.js, lang/eng.traineddata.gz
// The versioned folder keeps the CacheFirst runtime cache from mixing a new
// worker with an old wasm core after a dependency upgrade.
const require = createRequire(import.meta.url)
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`))
const pkgVersion = (name: string) =>
  (JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')) as { version: string }).version
const tesseractDir = `tesseract/${['tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng'].map(pkgVersion).join('_')}/`

function tesseractFiles(): Record<string, string> {
  const tess = pkgDir('tesseract.js')
  const core = pkgDir('tesseract.js-core')
  const eng = pkgDir('@tesseract.js-data/eng')
  const files: Record<string, string> = {
    'worker.min.js': join(tess, 'dist/worker.min.js'),
    // best_int model: what tesseract.js uses for the LSTM-only engine
    'lang/eng.traineddata.gz': join(eng, '4.0.0_best_int/eng.traineddata.gz'),
  }
  // The worker picks one of these at runtime by WebAssembly feature support (OEM LSTM_ONLY).
  for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
    files[`core/tesseract-core-${variant}.wasm.js`] = join(core, `tesseract-core-${variant}.wasm.js`)
  }
  return files
}

function tesseractAssets(): Plugin {
  const files = tesseractFiles()
  return {
    name: 'tesseract-assets',
    config: () => ({ define: { __TESSERACT_DIR__: JSON.stringify(tesseractDir) } }),
    configureServer(server) {
      const prefix = `${base}${tesseractDir}`
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const src = url.startsWith(prefix) ? files[url.slice(prefix.length)] : undefined
        if (!src) return next()
        res.setHeader('Content-Type', src.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.setHeader('Content-Length', statSync(src).size)
        createReadStream(src).pipe(res)
      })
    },
    generateBundle() {
      for (const [name, src] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `${tesseractDir}${name}`, source: readFileSync(src) })
      }
    },
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0.0.0'} · ${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    tesseractAssets(),
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
        background_color: '#07070c',
        theme_color: '#07070c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // OCR assets (~10 MB) are not precached: they are fetched on the first
        // scan and then kept by the CacheFirst rule below.
        globIgnores: ['**/tesseract/**'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/tesseract\//],
        runtimeCaching: [
          {
            // A RegExp, not a function: workbox serialises the handler into sw.js,
            // where closure variables like `base` would not exist.
            urlPattern: new RegExp(`${base}tesseract/`.replace(/[/.]/g, '\\$&')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-assets',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
