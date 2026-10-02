import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // scripts/prerender.mjs reads the manifest to modulepreload each page's own
    // chunk, then deletes it from dist/ — it is a build input, not an asset.
    manifest: true,
  },
})
