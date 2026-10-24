import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { Readable } from 'node:stream';
import worker from '../cloudflare/gateway.mjs';
const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
async function assets(request) {
  const path = resolve(root, '.' + decodeURIComponent(new URL(request.url).pathname));
  if (path !== root && !path.startsWith(root + '\\') && !path.startsWith(root + '/')) return new Response('', { status: 403 });
  let target = path;
  try { if (!(await stat(target)).isFile()) target = resolve(root, 'index.html'); }
  catch { target = resolve(root, 'index.html'); }
  return new Response(await readFile(target), { headers: { 'Content-Type': types[extname(target)] || 'application/octet-stream' } });
}
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:5185${incoming.url}`, { method: incoming.method,
      headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
    const response = await worker.fetch(request, { ASSETS: { fetch: assets } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
  } catch { outgoing.writeHead(500); outgoing.end('Local preview failed'); }
}).listen(5185, '127.0.0.1', () => console.log('Cloudflare live preview: http://127.0.0.1:5185/'));
