import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// /latest.json is the download server's pointer to the newest standard installer. In production
// vercel.json rewrites it there; the dev and preview servers proxy it the same way.
const latest = {
  '/latest.json': { target: 'https://asdesk-api.raiapp.dev', changeOrigin: true, rewrite: () => '/downloads/latest.json' },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022' },
  server: { proxy: latest },
  preview: { proxy: latest },
});
