import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    host: true,
  },
});
