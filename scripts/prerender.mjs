// Loads each built page in headless Chromium and returns the markup React rendered into #root.
//
// - No query string, so no ?n= banner and no ?r= ref ends up in the static HTML.
// - Reduced motion, so count-ups show their final numbers and every reveal is visible.
// - Nothing leaves the machine: React comes from node_modules (same version as the page's
//   cdnjs URL), everything else external is blocked, so no visit is ever logged to Supabase.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml' };
const pkgDir = (name) => path.dirname(require.resolve(name + '/package.json'));
const REACT = {
  'react.production.min.js': path.join(pkgDir('react'), 'umd/react.production.min.js'),
  'react-dom.production.min.js': path.join(pkgDir('react-dom'), 'umd/react-dom.production.min.js')
};
const REACT_VERSION = require('react/package.json').version;

function serve(dir) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(dir, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch (e) { res.writeHead(404).end(); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function prerender(dist, files) {
  const out = {};
  if (!files.length) return out;
  const server = await serve(path.resolve(dist));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const file of files) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const errors = [];
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.origin === origin) return route.continue();
        const name = path.basename(u.pathname);
        if (u.hostname === 'cdnjs.cloudflare.com' && REACT[name]) {
          if (!u.pathname.includes('/' + REACT_VERSION + '/')) {
            errors.push(`loads ${u.pathname}, but node_modules has React ${REACT_VERSION}`);
            return route.abort();
          }
          return route.fulfill({ path: REACT[name], contentType: 'application/javascript' });
        }
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin + '/' + (file === 'index.html' ? '' : file), { waitUntil: 'load' });
      // Content is ready once React has rendered the page and the winch loader has finished and been removed.
      await page.waitForFunction(() => !document.getElementById('ld') && document.querySelector('#root main h1'), null, { timeout: 30000 });
      if (errors.length) throw new Error(`${file}: page errors while pre-rendering: ${errors.join(' | ')}`);
      const html = await page.$eval('#root', (el) => el.innerHTML);
      if (html.includes('aria-label="Welcome"') || html.includes('(ref:')) throw new Error(`${file}: personalised content in the snapshot`);
      out[file] = html;
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}
