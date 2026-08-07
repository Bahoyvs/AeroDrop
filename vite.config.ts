import { defineConfig } from 'vite';

// CrazyGames serves the build from a nested path, so every asset URL must be
// relative. `assetsInlineLimit: 0` keeps the bundle predictable for their
// packaging step (no surprise data-URIs inflating index.html).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
  },
});
