import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: { guide: 'index.html', histoire: 'histoire/index.html' } },
    target: 'es2019',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900
  }
})
