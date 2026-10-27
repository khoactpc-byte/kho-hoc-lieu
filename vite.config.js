import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scorebookTemplatePlugin from './scripts/scorebook-template-plugin.mjs'
import pwaPlugin from './scripts/pwa-plugin.mjs'

export default defineConfig({
  plugins: [react(), scorebookTemplatePlugin(), pwaPlugin()],
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/key firebase/**', '**/identity-bridge.local'] },
    // Match the existing Cloudflare essay API bridge when developing with Vite.
    proxy: { '^/\\.netlify/functions/essay-work$': {
      target: 'https://phocaptmt.netlify.app', changeOrigin: true,
      timeout: 50000, proxyTimeout: 50000
    } }
  },
  build: {
    target: ['chrome80', 'edge80', 'firefox78', 'safari13'],
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          icons: ['lucide-react']
        }
      }
    }
  }
})
