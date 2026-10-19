import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@excalidraw/excalidraw'],
  },
  server: {
    proxy: {
      '/oauth2': {
        target: 'https://oauth2.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oauth2/, ''),
      },
      '/google-drive-upload': {
        target: 'https://www.googleapis.com/upload',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-drive-upload/, ''),
      },
      '/google-drive': {
        target: 'https://www.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-drive/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/oauth2': {
        target: 'https://oauth2.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oauth2/, ''),
      },
      '/google-drive-upload': {
        target: 'https://www.googleapis.com/upload',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-drive-upload/, ''),
      },
      '/google-drive': {
        target: 'https://www.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-drive/, ''),
      },
    },
  },
})


