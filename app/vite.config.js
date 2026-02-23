import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/roadmap-api': {
        target: 'https://roadmap.sh',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roadmap-api/, '/api'),
      },
      '/roadmap-content': {
        target: 'https://roadmap.sh',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roadmap-content/, ''),
      },
    },
  },
})

