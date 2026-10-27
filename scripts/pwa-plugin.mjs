import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export default function pwaPlugin() {
  return {
    name: 'school-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const revision = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        revision.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const file of ['offline.html', 'manifest.webmanifest', 'logo/icon-192.png', 'logo/icon-512.png', 'logo/icon-maskable-512.png']) {
        revision.update(readFileSync(new URL(`../public/${file}`, import.meta.url)));
      }
      const worker = readFileSync(new URL('./pwa-worker.js', import.meta.url), 'utf8')
        .replace('__PWA_BUILD_ID__', revision.digest('hex').slice(0, 16));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
    }
  };
}
