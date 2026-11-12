# winchmarketing.co.uk

The Winch Marketing site, hosted on GitHub Pages and deployed by GitHub Actions (`.github/workflows/pages.yml`).

## How it fits together

- `index.html`, `fifteen.html`: the source pages. They still work on their own if you open them in a
  browser (Babel and the Tailwind CDN run in the browser), which is handy for quick edits.
- `npm run build` turns them into the deployed site in `dist/`:
  - Tailwind CSS built with the CLI (only the classes the pages use; theme read from the page's `tailwind.config`)
  - the JSX in `index.html` compiled ahead of time with esbuild, so Babel isn't loaded on the live site
  - each React page loaded in headless Chromium (no query string, tracking blocked) and the rendered
    content saved into the HTML, so search and AI crawlers that don't run JavaScript see the real page.
    React still loads and takes over (banner from `?n=`, tracking, proof cards, WhatsApp).
  - `sitemap.xml` generated (lastmod from git), plus `robots.txt`, `llms.txt`, images and `admin.html` copied
- `npm run check` fails if the built pages are missing content or have leaked anything they shouldn't.
- `admin.html` is private: `noindex` and blocked in `robots.txt`.
- `supabase/`: SQL to run by hand in the Supabase SQL Editor. Not published.

## Local build

    npm ci
    npx playwright install chromium
    npm run build && npm run check

Pull requests build and check the site and attach it as a downloadable `site-preview` artifact.
Pushes to `main` deploy it.
