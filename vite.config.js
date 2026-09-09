import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900
  }
})
