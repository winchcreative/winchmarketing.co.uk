// Plain JavaScript shared by every page on the site, loaded with <script src="/site.js"> before anything else:
// anonymous visit tracking and the WhatsApp number. Kept out of the JSX bundles so non-React pages
// (the quote demo in /work/) use exactly the same tracking without carrying their own copy of the keys.
// Top-level consts here are visible to every later script on the page (React pages read track, REF, WA_NUMBER).

/* ---------- visit tracking (insert-only, no IPs, no cookies) ---------- */

const SB_URL = 'https://esnopodsswwtsbavjwen.supabase.co';
const SB_KEY = 'sb_publishable_IA0R66sBAt21zEDL0Vw7dQ_ybJNJDhF';
const REF = (() => {
  try { return (new URLSearchParams(location.search).get('r') || 'direct').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'direct'; }
  catch (e) { return 'direct'; }
})();
const SESSION = (() => {
  try {
    let id = sessionStorage.getItem('wm_s');
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('wm_s', id); }
    return id;
  } catch (e) { return Math.random().toString(36).slice(2, 10); }
})();
const sent = {};
// Where the visit came from, domain only (google.com, chatgpt.com, ...). Sent with the view event; own-site navigation counts as none.
const REFERRER = (() => {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === location.hostname.toLowerCase().replace(/^www\./, '')) return null;
    return host.slice(0, 100);
  } catch (e) { return null; }
})();
function track(type, detail) {
  const key = type + (detail || '');
  if (sent[key] || SB_URL.indexOf('__') === 0) return;
  sent[key] = true;
  const row = { ref: REF, session: SESSION, type: type, detail: detail || null, path: location.pathname, device: window.innerWidth < 768 ? 'mobile' : 'desktop' };
  if (type === 'view' && REFERRER) row.referrer = REFERRER;
  const send = (body) => fetch(SB_URL + '/rest/v1/visits', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
  try {
    send(row).then((res) => {
      // Until the referrer column exists (supabase/migrations), the insert is rejected: send the view again without it.
      if (!res.ok && row.referrer) { const { referrer, ...rest } = row; send(rest).catch(() => {}); }
    }).catch(() => {});
  } catch (e) {}
}

/* ---------- WhatsApp number (wa.me links are built per page; the number is never shown as text) ---------- */

const WA_NUMBER = '447403205318';

// For plain pages: window.winchTrack(type, detail)
window.winchTrack = track;
