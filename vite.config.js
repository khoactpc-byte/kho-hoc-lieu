import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scorebookTemplatePlugin from './scripts/scorebook-template-plugin.mjs'

export default defineConfig({
  plugins: [react(), scorebookTemplatePlugin()],
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
