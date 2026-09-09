// Build en un seul fichier HTML (aperçu partageable). Les images de public/
// sont incrustées en data URI par scripts/single.py après le build.
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', target: 'es2019', assetsInlineLimit: 100000000, cssCodeSplit: false }
})
