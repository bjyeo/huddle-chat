import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
