import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
await copyFile('cloudflare/gateway.mjs', 'dist/_worker.js');
await writeFile('dist/_routes.json', JSON.stringify({ version: 1, include: ['/.netlify/*', '/.site/*'], exclude: [] }, null, 2));
await writeFile('dist/_headers', '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/.netlify/*\n  Cache-Control: no-store\n');
const entries = {}; let count = 0;
async function visit(dir) { for (const item of await readdir(dir, { withFileTypes: true })) {
  const path = join(dir, item.name), name = relative('dist', path).replaceAll('\\', '/');
  if (item.isDirectory()) await visit(path); else {
    if (/\.(map|pem|env|local|gs)$/.test(path) || /(^|\/)(?:node_modules|\.git|\.env|key firebase|\.netlify)(\/|$)/.test(name)) throw new Error('Unexpected artifact: ' + name);
    if ((await stat(path)).size > 25 * 1024 * 1024) throw new Error('Pages asset exceeds 25 MiB: ' + name);
    const bytes = await readFile(path);
    if (/\.(?:js|mjs|html|json|css)$/.test(path)) {
      const text = bytes.toString('utf8');
      if (/-----BEGIN (?:RSA )?PRIVATE KEY-----|sb_secret_|"private_key"\s*:/.test(text)) throw new Error('Server secret in build: ' + name);
      if (/BẢN THỬ CLOUDFLARE|khl-cloudflare-sandbox-docs|sandbox-teacher-session/.test(text)) throw new Error('Sandbox code in live build: ' + name);
    }
    entries[name] = new Uint8Array(bytes); count++;
  }
} }
await visit('dist');
const index = new TextDecoder().decode(entries['index.html']);
if (!index.includes('TTHTCĐ phường Trung Mỹ Tây') || !entries['_worker.js']) throw new Error('Invalid live package');
await mkdir('.cloudflare-artifacts', { recursive: true });
const archive = zipSync(entries, { level: 6 });
await writeFile('.cloudflare-artifacts/htcdtrungmytay.zip', archive);
const manifest = { site: 'https://tthtcdtrungmytay.pages.dev', files: count, bytes: archive.length,
  sha256: createHash('sha256').update(archive).digest('hex'), mode: 'live-existing-data',
  backend: 'https://phocaptmt.netlify.app', serverSecretsCopied: false,
  netlifyDeploymentRequired: process.argv.includes('--requires-backend-update'),
  appsScriptDeploymentRequired: process.argv.includes('--requires-apps-script-update') };
await writeFile('.cloudflare-artifacts/manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
