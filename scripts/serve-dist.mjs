#!/usr/bin/env node
// Serve dist/ the way GitHub Pages does (node:http + zlib, no dependencies): directory index.html, a 301 to the
// trailing-slash URL for directories, /name -> name.html, 404.html with status 404 for anything else, gzip for text,
// and Pages' 10-minute cache. Lighthouse and every harness run against this, never against a dev server.
// Usage: node scripts/serve-dist.mjs [--port 4322] [--root dist] [--quiet]
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8', '.wasm': 'application/wasm', '.opus': 'audio/ogg', '.m4a': 'audio/mp4',
};
const COMPRESS = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

export function startServer({ root = 'dist', port = 4322, quiet = true } = {}) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      rel = '/';
    }
    const target = normalize(join(base, rel));
    if (target !== base && !target.startsWith(base + sep)) return send(res, req, 404, join(base, '404.html'));

    let file = null;
    let status = 200;
    if (existsSync(target) && statSync(target).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      if (existsSync(join(target, 'index.html'))) file = join(target, 'index.html');
    } else if (existsSync(target)) {
      file = target;
    } else if (existsSync(`${target}.html`)) {
      file = `${target}.html`;
    }
    if (!file) {
      status = 404;
      file = join(base, '404.html');
    }
    if (!quiet) console.log(status, url.pathname);
    send(res, req, status, file);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

function send(res, req, status, file) {
  if (!existsSync(file)) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(status === 404 ? 'Not found' : '');
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', 'Access-Control-Allow-Origin': '*' };
  const gzip = COMPRESS.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (gzip) {
    const body = gzipSync(readFileSync(file), { level: 6 });
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(status, { ...headers, 'Content-Length': statSync(file).size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const port = Number(opt('--port', process.env.PORT || 4322));
  const root = opt('--root', 'dist');
  await startServer({ root, port, quiet: args.includes('--quiet') });
  console.log(`serve-dist: http://127.0.0.1:${port}/ (${root}, gzip, Pages rules)`);
}
