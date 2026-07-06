import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Honour the port assigned by the launch harness (autoPort), else default.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
    // Proxy API calls to the backend so the SPA is same-origin (no CORS).
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
