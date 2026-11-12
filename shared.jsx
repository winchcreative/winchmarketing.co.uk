// Shared by every React page on the site (index.html, marketing-for-window-companies/index.html):
// WhatsApp link, helpers, banner, header, contact band, footer and the mobile sticky bar.
// Each page loads this before its own script. The build compiles it into each page's bundle.

const { useState, useRef, useEffect } = React;
const LOGO = '/logo.png';

/* ---------- visit tracking: track(), REF and WA_NUMBER come from /site.js ---------- */

// Optional display name for outreach links (?n=Vision+PVC). Letters, numbers, spaces and & ' . - only, max 40.
// Used as plain text only, and never sent to Supabase.
const NAME = (() => {
  try {
    const raw = new URLSearchParams(location.search).get('n');
    if (raw == null) return '';
    let bad;
    try { bad = new RegExp("[^\\p{L}\\p{N} &'.\\-]", 'gu'); } catch (e) { bad = /[^A-Za-z0-9 &'.\-]/g; }
    return raw.replace(/\s+/g, ' ').replace(bad, '').replace(/ {2,}/g, ' ').trim().slice(0, 40).trim();
  } catch (e) { return ''; }
})();

/* ---------- WhatsApp (wa.me link, number is never shown as text) ---------- */

const WA_URL = (() => {
  const msg = NAME
    ? "Hi Alex, it's " + NAME.replace(/\.+$/, '') + ". I've just seen your website and fancy a chat."
    : "Hi Alex, I've just seen your website and fancy a chat." + (REF !== 'direct' ? ' (ref: ' + REF + ')' : '');
  const enc = encodeURIComponent(msg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return 'https://wa.me/' + WA_NUMBER + '?text=' + enc;
})();

function useTracking() {
  useEffect(() => {
    let human = false;
    const markHuman = () => { if (!human && document.visibilityState === 'visible') { human = true; track('view'); } };
    const timer = setTimeout(markHuman, 5000);
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      const p = window.scrollY / h;
      if (window.scrollY > 40) markHuman();
      if (p > 0.5) track('scroll', '50');
      if (p > 0.9) track('scroll', '90');
    };
    const onClick = (e) => {
      const a = e.target.closest && e.target.closest('a[href^="https://calendar.app.google"]');
      if (a) track('cta', (a.textContent || '').trim().slice(0, 30));
      const w = e.target.closest && e.target.closest('a[data-wa]');
      if (w) track('whatsapp', w.getAttribute('data-wa'));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); document.removeEventListener('click', onClick); };
  }, []);
}

/* ---------- helpers ---------- */

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

function useInView(threshold) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window) || reduced()) { setOn(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: threshold || 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on];
}

function Reveal({ children, className = '', delay = 0 }) {
  const [ref, on] = useInView(0.12);
  return <div ref={ref} className={'rv ' + (on ? 'in ' : '') + className} style={{ transitionDelay: delay + 'ms' }}>{children}</div>;
}

function CountUp({ to, suffix = '', prefix = '' }) {
  const [ref, on] = useInView(0.4);
  const [n, setN] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (!on || reduced()) { if (on) setN(to); return; }
    let raf; const t0 = performance.now(); const dur = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return <span ref={ref}>{prefix}{n}{suffix}</span>;
}

function Logo({ w = 130 }) {
  return <img src={LOGO} alt="Winch Marketing" width={w} height={Math.round(w * 0.484)} style={{ width: w, height: 'auto', display: 'block' }} />;
}

function Label({ children, dark = false }) {
  return <p className={'font-mono text-[12px] uppercase tracking-[0.14em] ' + (dark ? 'text-black/60' : 'text-hi')}>{'{' + children + '}'}</p>;
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="M9 8.2h2l1 2.4-1.3.9a5 5 0 0 0 2.2 2.2l.9-1.3 2.4 1v2a.8.8 0 0 1-.8.8A7.6 7.6 0 0 1 8.2 9a.8.8 0 0 1 .8-.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// A phone frame with a screenshot in it (homepage proof cards, window page quote card).
function Phone({ src, name, alt }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="mx-auto w-full max-w-[210px] shrink-0 rounded-[30px] border-[6px] border-[#1c1c1f] bg-black shadow-[0_24px_40px_-24px_rgba(0,0,0,0.55)] md:max-w-[220px] md:rounded-[34px] md:border-[7px]" style={{ aspectRatio: '9 / 18.5' }}>
      <div className="relative h-full w-full overflow-hidden rounded-[24px] bg-[#141416] md:rounded-[26px]">
        {failed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#1b1b1e] to-[#0e0e10] px-4 text-center">
            <span className="h-8 w-8 border-2 border-hi"></span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Screenshot<br />{name}</span>
          </div>
        ) : (
          <img src={src} alt={alt || name + ' screenshot'} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
        )}
        <span className="absolute left-1/2 top-2 h-[16px] w-[58px] -translate-x-1/2 rounded-full bg-black" aria-hidden="true"></span>
      </div>
    </div>
  );
}

/* ---------- welcome banner (only for ?n= visitors) ---------- */

function Banner() {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem('wm_bn') !== '1'; } catch (e) { return true; }
  });
  if (!NAME || !open) return null;
  const close = () => {
    setOpen(false);
    try { sessionStorage.setItem('wm_bn', '1'); } catch (e) {}
  };
  return (
    <aside aria-label="Welcome" className="bn-in bg-hi text-black">
      <div className="gutter mx-auto flex min-h-[44px] max-w-[1280px] items-center justify-between gap-3 py-2">
        <p className="min-w-0 break-words font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.14em] md:text-[12px]">
          Hi {NAME} 👋 Thanks for taking a look. Here's what I do, in 2 minutes.
        </p>
        <button type="button" onClick={close} aria-label="Dismiss message" className="-my-2 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center font-mono text-[20px] font-bold leading-none hover:bg-black hover:text-hi focus-visible:outline-black">×</button>
      </div>
    </aside>
  );
}

/* ---------- header ---------- */

// On the homepage the nav jumps to its sections; on other pages it links back to them.
function Header({ home = true }) {
  const to = (id) => (home ? '#' : '/#') + id;
  return (
    <header className="sticky z-40 border-b border-white/10 bg-ink" style={{ top: 0 }}>
      <div className="gutter mx-auto flex max-w-[1280px] items-center justify-between py-2">
        <a href={home ? '#top' : '/'} aria-label="Winch Marketing, home"><Logo w={120} /></a>
        <nav aria-label="Main" className="hidden items-center gap-8 font-mono text-[12px] uppercase tracking-[0.14em] md:flex">
          <a className="text-mute hover:text-hi" href={to('proof')}>Proof</a>
          <a className="text-mute hover:text-hi" href={to('about')}>About</a>
          <a className="text-mute hover:text-hi" href={to('what')}>What you get</a>
          <a className="text-mute hover:text-hi" href={to('how')}>How it runs</a>
          <a className="inline-flex min-h-[48px] items-center text-mute hover:text-hi" href={WA_URL} data-wa="header" target="_blank" rel="noopener" aria-label="Message Alex on WhatsApp">WhatsApp</a>
          <a className="btn rounded-[4px] bg-hi px-5 py-3 font-bold text-black hover:bg-white" href="https://calendar.app.google/YAN5EEpMBqcntsB66" target="_blank" rel="noopener">Book a call</a>
        </nav>
      </div>
    </header>
  );
}

/* ---------- contact (yellow band) ---------- */

// The yellow contact band. Other pages can give it their own heading (with an id for jump links) and a line under it.
function Contact({ title, titleId, titleClass, children }) {
  const [copied, setCopied] = useState(false);
  const email = 'hello@winchmarketing.co.uk';
  const copy = () => {
    track('copy_email');
    try {
      navigator.clipboard.writeText(email).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
        () => setCopied(false)
      );
    } catch (e) { setCopied(false); }
  };
  return (
    <section id="contact" className="bg-hi text-black">
      <div className="gutter mx-auto flex max-w-[1280px] flex-col gap-10 py-16 md:py-24 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <Reveal className="flex flex-col gap-5">
          <Label dark>Contact</Label>
          <h2 id={titleId} className={'font-hd font-bold uppercase leading-[0.94] tracking-[-0.01em] ' + (titleClass || 'text-[clamp(44px,10vw,120px)]')}>{title || <>15 minutes.<br />Straight answers.</>}</h2>
          {children}
        </Reveal>
        <Reveal delay={120} className="flex w-full flex-col gap-4 md:w-auto md:min-w-[300px] md:self-start lg:shrink-0 lg:self-auto">
          <div className="flex flex-col gap-3">
            <a href="https://calendar.app.google/YAN5EEpMBqcntsB66" target="_blank" rel="noopener" className="btn w-full whitespace-nowrap rounded-[4px] bg-black px-8 py-4 text-center font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-hi hover:bg-white hover:text-black min-[360px]:text-[13px] min-[360px]:tracking-[0.1em]">Book a 15-minute call</a>
            <a href={WA_URL} data-wa="contact" target="_blank" rel="noopener" aria-label="Rather message? WhatsApp me (opens WhatsApp in a new tab)" className="btn w-full whitespace-nowrap rounded-[4px] border-2 border-black px-4 py-[14px] text-center font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-black hover:bg-black hover:text-hi focus-visible:outline-black min-[360px]:px-8 min-[360px]:text-[13px] min-[360px]:tracking-[0.1em]">Rather message? WhatsApp me</a>
            <a href={REF === 'direct' ? '/fifteen.html' : '/fifteen.html?r=' + encodeURIComponent(REF)} className="self-start whitespace-nowrap font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-black underline decoration-black/40 underline-offset-4 hover:decoration-black focus-visible:outline-black">How long is 15 minutes, really? →</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap font-mono text-[13px] font-medium min-[360px]:text-[14px]">{email}</span>
            <button type="button" onClick={copy} className="shrink-0 rounded-[4px] border border-black px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-black hover:text-hi">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink">
      <div className="gutter mx-auto flex max-w-[1280px] flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
        <Logo w={110} />
        <p className="text-[15px] text-mute">Northallerton, North East England.</p>
        <p className="max-w-[320px] font-mono text-[11px] text-mute">© Winch Marketing. Anonymous visit tracking, no cookies.</p>
      </div>
    </footer>
  );
}

/* ---------- sticky bar (mobile only) ---------- */

function StickyBar() {
  const half = 'flex min-h-[56px] flex-1 items-center justify-center gap-3 font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-black';
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-hi md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex" style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <a href={WA_URL} data-wa="sticky" target="_blank" rel="noopener" aria-label="Message Alex on WhatsApp" className={half}>
          <WhatsAppIcon />
          WhatsApp
        </a>
        <a href="https://calendar.app.google/YAN5EEpMBqcntsB66" target="_blank" rel="noopener" className={half + ' border-l border-black/25'}>
          <PhoneIcon />
          Book a call
        </a>
      </div>
    </div>
  );
}

