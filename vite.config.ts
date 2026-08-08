import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

// Release builds get FIREBIN_VERSION injected by CI (e.g. "26.8.1"). Anything
// else is a local build and says so.
//
// The release scheme has exactly three shapes and all three describe something
// published: 26.8.1, 26.8.1-rc.1, 26.8.1-nightly.202608080642. A build from
// someone's laptop is none of them, so it claims no version rather than
// inventing a YY.M string for a release that does not exist. Mirrors
// internal/version in the Go repos.
function computeVersion(): string {
  const injected = process.env.FIREBIN_VERSION?.trim()
  if (injected) return injected
  return '0.0.0-dev'
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
        // Keep long-lived SSE (/api/events) from being idle-closed by the proxy.
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
