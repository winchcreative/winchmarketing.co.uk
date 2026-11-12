# winchmarketing.co.uk

The Winch Marketing site, hosted on GitHub Pages and deployed by GitHub Actions (`.github/workflows/pages.yml`).

## How it fits together

- `index.html`, `fifteen.html`, `marketing-for-window-companies/index.html`: the source pages. They still work
  in a browser served from the repo root (Babel and the Tailwind CDN run in the browser), which is handy for quick edits.
- `shared.jsx`: the header, footer, contact band, mobile sticky bar, tracking and WhatsApp link, used by every React page.
- Question-and-answer sections are rendered from each page's FAQPage JSON-LD (`id="ld-faq"` in the head), so edit the
  copy there and the visible text and the schema stay in step.
- `npm run build` turns them into the deployed site in `dist/`:
  - Tailwind CSS built with the CLI (only the classes the pages use; theme read from the page's `tailwind.config`)
  - the JSX in `index.html` compiled ahead of time with esbuild, so Babel isn't loaded on the live site
  - each React page loaded in headless Chromium (no query string, tracking blocked) and the rendered
    content saved into the HTML, so search and AI crawlers that don't run JavaScript see the real page.
    React still loads and takes over (banner from `?n=`, tracking, proof cards, WhatsApp).
  - `sitemap.xml` generated (lastmod from git), plus `robots.txt`, `llms.txt`, images and `admin.html` copied
- `npm run check` fails if the built pages are missing content or have leaked anything they shouldn't.
- `site.js`: the anonymous visit tracking (`track()`) and the WhatsApp number, as plain JavaScript. The React pages and
  the quote demo load it with `<script src="/site.js">`, so there is one copy of the tracking keys.
- `work/dc-flooring-quote/`: the DC Flooring quote demo, a standalone page published as it is (`STANDALONE` in
  `scripts/build.mjs`). `noindex`, not in `sitemap.xml`, and fully disconnected: the build and the check both fail if
  anything in that folder mentions Supabase. Its own tracking goes through `/site.js` only.
- `admin.html` is private: `noindex` and blocked in `robots.txt`.
- `supabase/`: SQL to run by hand in the Supabase SQL Editor. Not published.

## Local build

    npm ci
    npx playwright install chromium
    npm run build && npm run check

Pull requests build and check the site and attach it as a downloadable `site-preview` artifact.
Pushes to `main` deploy it.
