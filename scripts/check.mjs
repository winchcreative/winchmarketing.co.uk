// Checks the built site in dist/ before it is deployed. Fails the build if crawlers would not get
// the real content, if personalised or dev-only bits leaked in, or if the SEO files are wrong.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const read = (f) => readFile(path.join(DIST, f), 'utf8');
const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };
// Visible text only: scripts, styles and tags removed, entities decoded.
const text = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

const index = await read('index.html');
const body = text(index);
for (const s of ['Marketing that pulls the work in.', 'Tracked enquiries', 'Ads that book visits', 'Booking form', 'Follow-up',
  'Monthly report', 'Alex James', 'Northallerton', 'Who do you work with?', 'How does pricing work?', '15 minutes.']) {
  expect(body.includes(s), `index.html: "${s}" is not in the served HTML`);
}
expect(index.includes('<title>Winch Marketing | Marketing for home improvement firms, Northallerton</title>'), 'index.html: title');
const desc = (index.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
expect(desc && desc.length < 155, `index.html: meta description missing or ${desc.length} characters`);
expect(index.includes('<link rel="canonical" href="https://winchmarketing.co.uk/">'), 'index.html: canonical');
for (const bad of ['cdn.tailwindcss.com', 'babel', 'text/babel', 'aria-label="Welcome"', '(ref:', '<div id="root"></div>']) {
  expect(!index.includes(bad), `index.html: should not contain "${bad}"`);
}
const blocks = [...index.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
expect(blocks.length === 2, `index.html: expected 2 JSON-LD blocks, found ${blocks.length}`);
for (const b of blocks) { try { JSON.parse(b); } catch (e) { failures.push('index.html: JSON-LD does not parse: ' + e.message); } }
const faq = JSON.parse(blocks.find((b) => b.includes('FAQPage')) || '{"mainEntity":[]}');
for (const q of faq.mainEntity) {
  expect(body.includes(q.name) && body.includes(q.acceptedAnswer.text.replace(/\s+/g, ' ')), `index.html: FAQ "${q.name}" is not visible on the page`);
}
expect(!/\b0?7403\b|447403|205318/.test(body), 'index.html: phone number appears as text');

// Marketing for window and door companies: copy, schema and the six jump-link sections.
const WIN = 'marketing-for-window-companies/index.html';
const win = await read(WIN);
const winBody = text(win);
for (const s of ['Marketing for window and door companies', "I help owner-run window and door companies turn more surveys into signed orders.", "That's the deal.", 'Winch Marketing']) {
  expect(winBody.includes(s), `${WIN}: "${s}" is not in the served HTML`);
}
expect(win.includes('<title>Marketing for window and door companies | Winch Marketing</title>'), `${WIN}: title`);
expect(win.includes('<link rel="canonical" href="https://winchmarketing.co.uk/marketing-for-window-companies/">'), `${WIN}: canonical`);
const winDesc = (win.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
expect(winDesc && winDesc.length < 160, `${WIN}: meta description missing or ${winDesc.length} characters`);
for (const bad of ['cdn.tailwindcss.com', 'babel', 'text/babel', '<div id="root"></div>', 'aria-label="Welcome"']) expect(!win.includes(bad), `${WIN}: should not contain "${bad}"`);
const winLd = [...win.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const svc = (winLd.find((b) => b['@graph']) || { '@graph': [] })['@graph'].find((n) => n['@type'] === 'Service');
expect(svc && svc.serviceType === 'Marketing for window and door companies' && svc.provider && svc.areaServed.length === 8, `${WIN}: Service JSON-LD`);
const winFaq = winLd.find((b) => b['@type'] === 'FAQPage') || { mainEntity: [] };
expect(winFaq.mainEntity.length === 6, `${WIN}: expected 6 questions, found ${winFaq.mainEntity.length}`);
for (const q of winFaq.mainEntity) {
  const id = q['@id'].split('#')[1];
  expect(new RegExp(`<h2[^>]*id="${id}"`).test(win) && win.includes(`href="#${id}"`), `${WIN}: H2 #${id} or its jump link is missing`);
  expect(winBody.includes(q.name) && winBody.includes(text(q.acceptedAnswer.text).trim()), `${WIN}: "${q.name}" answer is not visible on the page`);
}
expect(!/[\u2013\u2014!]| - /.test(winBody), `${WIN}: dash used as punctuation or an exclamation mark in the copy`);
expect(index.includes('href="/marketing-for-window-companies/"'), 'index.html: no link to the window companies page');

// The DC Flooring quote demo: noindex, not in the sitemap, linked from the homepage and the window page,
// uses the site's tracking (/site.js), and nothing in its folder mentions Supabase.
const DEMO = 'work/dc-flooring-quote/';
const demo = await read(DEMO + 'index.html');
expect(/<meta name="robots" content="noindex/.test(demo), `${DEMO}: missing noindex`);
expect(demo.includes('Example quote I built for DC Flooring. The customer and prices are made up.'), `${DEMO}: banner text`);
expect(demo.includes('Mr &amp; Mrs Taylor') && demo.includes('£3,108.00'), `${DEMO}: the made-up quote is not in the HTML`);
expect(demo.includes('<script src="/site.js"></script>'), `${DEMO}: does not load /site.js for tracking`);
for (const f of await readdir(path.join(DIST, DEMO), { recursive: true })) {
  const full = path.join(DIST, DEMO, f);
  const isText = /\.(html|js|css|txt|json|svg)$/.test(f);
  expect(!/supabase/i.test(f) && !(isText && /supabase/i.test(await readFile(full, 'utf8'))), `${DEMO}${f}: mentions Supabase`);
}
for (const [file, html] of [['index.html', index], [WIN, win]]) {
  expect(/<a href="\/work\/dc-flooring-quote\/"[^>]*>See a real quote tool I built/.test(html), `${file}: no "See a real quote tool I built" link to the demo`);
}
expect((await read('site.js')).includes('function track('), 'site.js: tracking is missing');

const fifteen = await read('fifteen.html');
for (const s of ['15 minutes.', 'Less than you think.', 'Macarenas', "That's all I'm asking."]) {
  expect(text(fifteen).includes(s), `fifteen.html: "${s}" is not in the served HTML`);
}
expect(fifteen.includes('<link rel="canonical" href="https://winchmarketing.co.uk/fifteen.html">'), 'fifteen.html: canonical');
expect(!fifteen.includes('cdn.tailwindcss.com'), 'fifteen.html: still loads the Tailwind CDN');

const admin = await read('admin.html');
expect(/<meta name="robots" content="noindex/.test(admin), 'admin.html: missing noindex');

const robots = await read('robots.txt');
for (const bot of ['*', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot']) {
  const group = robots.split(/\n(?=User-agent:)/).find((g) => g.startsWith('User-agent: ' + bot + '\n'));
  expect(group && group.includes('Allow: /') && group.includes('Disallow: /admin.html'), `robots.txt: ${bot} group`);
}
expect(robots.includes('Sitemap: https://winchmarketing.co.uk/sitemap.xml'), 'robots.txt: sitemap line');

const sitemap = await read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
expect(JSON.stringify(locs) === JSON.stringify(['https://winchmarketing.co.uk/', 'https://winchmarketing.co.uk/fifteen.html', 'https://winchmarketing.co.uk/marketing-for-window-companies/']), 'sitemap.xml: ' + locs.join(', '));
expect(!sitemap.includes('dc-flooring'), 'sitemap.xml: the quote demo must not be listed');
expect((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length === locs.length, 'sitemap.xml: lastmod');
expect((await read('llms.txt')).startsWith('# Winch Marketing'), 'llms.txt');

const published = await readdir(DIST);
for (const f of ['supabase', 'scripts', 'node_modules', 'README.md', 'claude.md', 'package.json', 'shared.jsx']) {
  expect(!published.includes(f), `dist/ should not contain ${f}`);
}

if (failures.length) {
  console.error('Site check failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Site check passed: content, titles, JSON-LD, robots.txt, sitemap.xml, llms.txt.');
