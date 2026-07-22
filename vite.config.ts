import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

// Release builds get FIREBIN_VERSION injected by CI (e.g. "26.7.1"). Dev builds
// auto-compute "{YY}.{M}.DEV" so an uninjected build is visibly distinct.
// Mirrors the api repo's version.go logic.
function computeVersion(): string {
  const injected = process.env.FIREBIN_VERSION?.trim()
  if (injected) return injected
  const now = new Date()
  const yy = now.getUTCFullYear() % 100
  const m = now.getUTCMonth() + 1
  return `${yy}.${m}.DEV`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(computeVersion()),
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
