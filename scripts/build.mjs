// Builds the site into dist/ for GitHub Pages.
//
// The HTML files in the repo root stay the source and still work on their own (Babel and the
// Tailwind CDN run in the browser). This script turns them into fast, crawlable pages:
//   1. Tailwind CSS is built with the CLI from the classes the pages use (theme read from the page).
//   2. The JSX in index.html is compiled ahead of time with esbuild, so Babel is no longer loaded.
//   3. Each React page is loaded in Playwright (no query string, tracking blocked) and the rendered
//      markup is written into its empty <div id="root">, so crawlers that do not run JavaScript
//      (GPTBot, ClaudeBot, PerplexityBot) get the real content. React still loads and takes over.
//   4. sitemap.xml is generated, and the public files are copied across. Nothing else is published.
//   5. Standalone demo folders (STANDALONE) are copied as they are: noindex, not in the sitemap, and
//      the build fails if one mentions Supabase anywhere.

import { readFile, writeFile, mkdir, rm, copyFile, readdir, cp } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { prerender } from './prerender.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(ROOT, '.build');
const SITE = 'https://winchmarketing.co.uk';

// Public pages: built, pre-rendered and listed in the sitemap (path on the site -> source file).
const PAGES = [
  { file: 'index.html', url: SITE + '/' },
  { file: 'fifteen.html', url: SITE + '/fifteen.html' },
  { file: 'marketing-for-window-companies/index.html', url: SITE + '/marketing-for-window-companies/' }
];
// JSX shared by the React pages; loaded with <script type="text/babel" src="/shared.jsx">.
const SHARED = ['shared.jsx'];
// Published as-is. admin.html is private (noindex, blocked in robots.txt) and keeps its CDN setup.
// site.js is the plain-JS visit tracking the React pages and the quote demo load with <script src="/site.js">.
const STATIC = ['admin.html', 'CNAME', 'robots.txt', 'llms.txt', 'site.js'];
// Self-contained pages published folder by folder, exactly as they are in the repo. Their HTML is written out in full
// (nothing for the pre-render step to fill in), they are noindex and they are never listed in sitemap.xml.
const STANDALONE = ['work/dc-flooring-quote'];
const ASSET_EXT = /\.(jpe?g|png|webp|svg|ico|gif)$/i;

const TAILWIND_CDN = /<script src="https:\/\/cdn\.tailwindcss\.com\/[^"]*"><\/script>\s*/;
const TAILWIND_CONFIG = /<script>\s*tailwind\.config\s*=\s*([\s\S]*?);?\s*<\/script>\s*/;
const BABEL_CDN = /<script src="[^"]*babel-standalone[^"]*"><\/script>\s*/;
// Every Babel script on a page, in order: <script type="text/babel" src="/shared.jsx"> and inline ones.
const BABEL_SCRIPT = /<script type="text\/babel"([^>]*)>([\s\S]*?)<\/script>\s*/g;

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const one = (re, html, file, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`${file}: could not find ${what}`);
  return m;
};

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await rm(TMP, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await mkdir(TMP, { recursive: true });

  const sources = {};
  for (const p of PAGES) sources[p.file] = await readFile(path.join(ROOT, p.file), 'utf8');

  // 1. Tailwind: one shared stylesheet, theme taken from the config the pages already use.
  const configLiteral = one(TAILWIND_CONFIG, sources['index.html'], 'index.html', 'tailwind.config')[1];
  const config = vm.runInNewContext('(' + configLiteral + ')');
  const twConfig = path.join(TMP, 'tailwind.config.cjs');
  await writeFile(twConfig, 'module.exports = ' + JSON.stringify({
    content: PAGES.map((p) => path.join(ROOT, p.file)).concat(SHARED.map((f) => path.join(ROOT, f))),
    theme: config.theme || {}
  }, null, 2) + ';\n');
  await writeFile(path.join(TMP, 'input.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  const cssOut = path.join(TMP, 'site.css');
  execFileSync(path.join(ROOT, 'node_modules/.bin/tailwindcss'),
    ['-c', twConfig, '-i', path.join(TMP, 'input.css'), '-o', cssOut, '--minify'], { stdio: 'inherit' });
  const css = await readFile(cssOut, 'utf8');
  const cssName = `assets/site-${hash(css)}.css`;
  await writeFile(path.join(DIST, cssName), css);

  // 2 + 3. Rewrite each page, compile its JSX if it has any.
  const built = {};
  for (const p of PAGES) {
    let html = sources[p.file];
    one(TAILWIND_CDN, html, p.file, 'the Tailwind CDN script');
    html = html.replace(TAILWIND_CDN, `<link rel="stylesheet" href="/${cssName}">\n`).replace(TAILWIND_CONFIG, '');

    // Compile all the page's Babel scripts (shared ones first, as on the page) into one bundle.
    const scripts = [...html.matchAll(BABEL_SCRIPT)];
    if (scripts.length) {
      const parts = [];
      for (const [, attrs, inline] of scripts) {
        const src = (attrs.match(/\bsrc="([^"]+)"/) || [])[1];
        parts.push(src ? await readFile(path.join(ROOT, src.replace(/^\//, '')), 'utf8') : inline);
      }
      const { code } = await esbuild.transform(parts.join('\n;\n'), { loader: 'jsx', target: 'es2018', minify: true, legalComments: 'none' });
      const jsName = `assets/app-${hash(code)}.js`;
      await writeFile(path.join(DIST, jsName), code);
      let first = true;
      html = html.replace(BABEL_CDN, '').replace(BABEL_SCRIPT, () => {
        if (!first) return '';
        first = false;
        return `<script src="/${jsName}"></script>\n`;
      });
    }
    for (const bad of ['cdn.tailwindcss.com', 'babel-standalone', 'text/babel', 'tailwind.config']) {
      if (html.includes(bad)) throw new Error(`${p.file}: "${bad}" is still in the built page`);
    }
    built[p.file] = html;
    await mkdir(dirname(path.join(DIST, p.file)), { recursive: true });
    await writeFile(path.join(DIST, p.file), html);
  }

  // 4a. Static files and images.
  for (const f of STATIC) await copyFile(path.join(ROOT, f), path.join(DIST, f));
  for (const f of await readdir(ROOT)) if (ASSET_EXT.test(f)) await copyFile(path.join(ROOT, f), path.join(DIST, f));
  for (const dir of STANDALONE) {
    await cp(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
    const html = await readFile(path.join(DIST, dir, 'index.html'), 'utf8');
    if (!/<meta name="robots" content="noindex/.test(html)) throw new Error(`${dir}: missing noindex`);
    for (const f of await readdir(path.join(DIST, dir), { recursive: true })) {
      if (/supabase/i.test(f) || (/\.(html|js|css|txt)$/.test(f) && /supabase/i.test(await readFile(path.join(DIST, dir, f), 'utf8')))) {
        throw new Error(`${dir}/${f}: mentions Supabase. The demo must not connect to anything.`);
      }
    }
  }

  // 3. Pre-render React pages into their empty root.
  const reactPages = PAGES.filter((p) => built[p.file].includes('<div id="root"></div>'));
  const rendered = await prerender(DIST, reactPages.map((p) => p.file));
  for (const p of reactPages) {
    const html = built[p.file].replace('<div id="root"></div>', () => `<div id="root">${rendered[p.file]}</div>`);
    await writeFile(path.join(DIST, p.file), html);
  }

  // 4b. Sitemap, with lastmod from the last commit that touched each page.
  const lastmod = (file) => {
    try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT }).toString().trim() || today(); }
    catch (e) { return today(); }
  };
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    PAGES.map((p) => `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${lastmod(p.file)}</lastmod>\n  </url>\n`).join('') +
    '</urlset>\n';
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap);

  await rm(TMP, { recursive: true, force: true });
  console.log(`Built ${PAGES.length} pages into dist/ (${reactPages.map((p) => p.file).join(', ')} pre-rendered).`);
}

const today = () => new Date().toISOString().slice(0, 10);

main().catch((e) => { console.error(e); process.exit(1); });
