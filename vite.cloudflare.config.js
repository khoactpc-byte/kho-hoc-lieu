import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.config.js';
export default mergeConfig(base, {
  envDir: fileURLToPath(new URL('./.cloudflare-public-env', import.meta.url)),
  envPrefix: 'VITE_', build: { sourcemap: false }
});
