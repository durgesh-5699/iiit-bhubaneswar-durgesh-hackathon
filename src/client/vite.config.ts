import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Express API runs on :4000. The proxy lets the browser call /api/... without CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
})
