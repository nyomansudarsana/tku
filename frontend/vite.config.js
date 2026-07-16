import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// backend/run.py writes the port it actually bound to here — it falls back
// to 8001/8002/8003 when 8000 is unavailable (e.g. Windows "WinError
// 10013"). Reading it keeps this proxy pointed at a live backend instead of
// a hardcoded port that may no longer be the one in use.
function resolveBackendPort() {
  try {
    const portFile = fileURLToPath(new URL('../backend/.dev-port', import.meta.url))
    return readFileSync(portFile, 'utf-8').trim()
  } catch {
    return '8000'
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: `http://localhost:${resolveBackendPort()}`,
        changeOrigin: true,
      }
    }
  }
})
