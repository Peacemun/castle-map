import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A relative base path lets the same build run from GitHub Pages
// (https://<user>.github.io/<repo>/), any other static host, or a local folder.
// Deep links use query parameters only, so no server-side routing is needed.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('maplibre-gl') ? 'maplibre' : undefined),
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
