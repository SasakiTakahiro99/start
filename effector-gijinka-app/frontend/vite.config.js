import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 開発中は /api を Spring Boot (8080) にプロキシする。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
