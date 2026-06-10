import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // SSE потребує щоб проксі не буферував — важливо для /api/events
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/events')) {
              proxyRes.headers['cache-control'] = 'no-cache'
            }
          })
        },
      },
    },
  },
})
