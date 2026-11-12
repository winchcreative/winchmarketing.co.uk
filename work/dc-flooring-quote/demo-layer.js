/* The Winch layer on top of DC Flooring's flipbook: numbered hotspots, note cards, the guided tour and visit tracking.
 *
 * - Hotspots: small numbered circles pinned to the feature each note explains. Only the current page's are shown.
 * - Note cards: beside the book on wide screens, a sheet from the bottom on phones. The page scrolls so the sheet
 *   never covers the thing it is explaining.
 * - Tour: every note in order with Back, Next and Skip, then a final card. Starts on the first visit (remembered in
 *   localStorage) and from the "How it works" button.
 * - Tracking: the site's normal visit tracking from /site.js. A view, then cta "demo-signed" and cta "demo-tour".
 */
(function(){
'use strict';

const BOOKING_URL = 'https://calendar.app.google/YAN5EEpMBqcntsB66';
const TOUR_KEY = 'wm_dcq_toured';
const SIDE_CARD_W = 340, SIDE_GAP = 28;          // the card sits beside the book when there is room for it
const reduced = ()=>{ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
const track = (type, detail)=>{ try{ if(typeof window.winchTrack === 'function') window.winchTrack(type, detail); }catch(e){} };

/* ---------------- the notes ----------------
   page: the flipbook page the note belongs to (0 is the cover). pin: where its hotspot goes, as a selector plus a point on
   that element (ax, ay from 0 to 1) and a nudge in pixels. inPage: look for the selector inside that page only.
   tourPins: used by the tour when the main pin's element is not on screen (for example after the quote is signed). */
const NOTES = [
  { title:'The cover', page:0, pin:{ sel:'.cf-name', inPage:true, ax:0, ay:.5, dx:-20 },
    text:'Your customer opens this from a text or email link. No app, no download, no PDF to lose in their inbox.' },
  { title:'Turning the page', page:0, pin:{ sel:'#nextBtn', ax:1, ay:0, dx:2, dy:-2 },
    text:'It reads like a brochure, not a spreadsheet. They swipe through at their own pace, at the kitchen table, after your surveyor has gone.' },
  { title:'About the business', page:1, pin:{ sel:'.page-bg', inPage:true, ax:.15, ay:.33 },
    text:'This is where you get to be human. Your team, your guarantee, why you do it. The bit a PDF never has room for.' },
  { title:'The price', page:3, pin:{ sel:'.totals .grand', inPage:true, ax:0, ay:.5, dx:-20 },
    text:'The price is laid out clearly, room by room, so nothing looks hidden.' },
  { title:'The zoom button', page:3, pin:{ sel:'#zoomBtn', ax:0, ay:.5, dx:-22 },
    text:'One tap to zoom in on the small print. Built after real customers struggled to pinch zoom on their phones.' },
  { title:'Signing', page:4, pin:{ sel:'#signBtn', ax:1, ay:0, dx:-6 },
    tourPins:[{ sel:'.signed-stamp', ax:1, ay:.5, dx:18 }, { sel:'#decidedState .badge', ax:1, ay:.5, dx:18, extra:'Tap Try it again on this page to see the signing button.' }],
    text:'They can say yes there and then, with a signature on screen. No printing, scanning or posting anything back.' },
  { title:'Saying no', page:4, pin:{ sel:'#declineBtn', ax:1, ay:0, dx:-6 },
    tourPins:[{ sel:'#decidedState .badge', ax:1, ay:.5, dx:18, extra:'Tap Try it again on this page to see the Decline button.' }],
    text:'They can say no too. That sounds odd, but a clear no beats chasing a quote for three weeks.' },
  { title:'Save a copy', page:4, pin:{ sel:'#saveCopyBtn', ax:1, ay:0, dx:-6 },
    tourPins:[{ sel:'#signBtn', ax:1, ay:0, dx:-6, extra:'This button appears once they have signed. Try it.' },
              { sel:'#decidedState .badge', ax:1, ay:.5, dx:18, extra:'This button appears once they have signed.' }],
    text:"They keep a tidy copy for their records, which helps when they're showing it to a partner." },
  { title:'Behind the scenes', page:4, pin:{ sel:'.decision-contact', inPage:true, ax:1, ay:0, dx:-6 },
    text:"In the live version, the business is told when a quote is opened and when it's signed, so they know exactly when to follow up." }
];
const FINAL = {
  title:'Your turn',
  text:'Want something like this for your quotes? It takes about 4 times listening to the Macarena to talk it through.'
};

/* ---------------- WhatsApp link, as on the homepage (number from /site.js, never shown as text) ---------------- */
const WA_URL = (()=>{
  let num = '', ref = 'direct';
  try{ num = WA_NUMBER; }catch(e){}
  try{ ref = REF; }catch(e){}
  if(!num) return '';
  const msg = "Hi Alex, I've just tried your quote demo and fancy a chat." + (ref && ref !== 'direct' ? ' (ref: ' + ref + ')' : '');
  const enc = encodeURIComponent(msg).replace(/[!'()*]/g, c=> '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return 'https://wa.me/' + num + '?text=' + enc;
})();

/* ---------------- state ---------------- */
const layer = document.getElementById('hsLayer');
const customer = document.getElementById('customer');
const stageEl = document.getElementById('custStage');
const notesBtn = document.getElementById('wmNotesBtn');
const tourBtn = document.getElementById('wmTourBtn');
let hotspotsOn = true;
let flipping = false;
let card = null;          // { el, mode:'tour'|'single', index, opener }
let tourIndex = -1;       // 0..NOTES.length (the last one is the final card)
let hotspotEls = [];

const getBook = ()=> window.dcQuote && window.dcQuote.book;
const currentPage = ()=>{ const b = getBook(); return b ? b.pageFlip.getCurrentPageIndex() : 0; };

/* ---------------- finding the thing a note is about ---------------- */
function visible(el){
  if(!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
// Long pages (the quote on a small phone, the signed last page) scroll inside the book. These find that scroll box,
// scroll a feature into view in it, and tell whether a feature is currently scrolled out of sight.
function scrollBoxOf(el){
  for(let n = el.parentElement; n && n.id !== 'book'; n = n.parentElement){
    if(/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
  }
  return null;
}
function scrolledOut(el){
  const box = scrollBoxOf(el);
  if(!box) return false;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  return r.bottom < b.top + 4 || r.top > b.bottom - 4;
}
function revealInBook(el){
  const box = scrollBoxOf(el);
  if(!box) return;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if(r.top < b.top + 12 || r.bottom > b.bottom - 12) box.scrollTop += (r.top - b.top) - Math.max(12, (box.clientHeight - r.height) / 2);
}
function findPin(pin, page, evenIfScrolledOut){
  const b = getBook();
  const scope = pin.inPage && b ? b.pages[page] : document;
  if(!scope) return null;
  const el = Array.from(scope.querySelectorAll(pin.sel)).find(n=> visible(n) && (evenIfScrolledOut || !scrolledOut(n)));
  return el ? { el, pin } : null;
}
// The pin for a note: its own, or during the tour the first fallback that is on screen.
function resolve(note, forTour, evenIfScrolledOut){
  const own = findPin(note.pin, note.page, evenIfScrolledOut);
  if(own || !forTour || !note.tourPins) return own;
  for(const p of note.tourPins){ const f = findPin(p, note.page, evenIfScrolledOut); if(f) return f; }
  return null;
}
function pointFor(found){
  const r = found.el.getBoundingClientRect(), c = customer.getBoundingClientRect(), p = found.pin;
  let x = r.left + r.width * (p.ax || 0) + (p.dx || 0) - c.left;
  let y = r.top + r.height * (p.ay || 0) + (p.dy || 0) - c.top;
  x = Math.max(16, Math.min(c.width - 16, x));
  return { x, y };
}

/* ---------------- hotspots ---------------- */
function buildHotspots(){
  layer.innerHTML = '';
  hotspotEls = NOTES.map((n, i)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hs'; b.hidden = true;
    b.textContent = String(i + 1);
    b.setAttribute('aria-label', 'Note ' + (i + 1) + ': ' + n.title);
    b.addEventListener('click', ()=> openSingle(i, b));
    layer.appendChild(b);
    return b;
  });
}
let raf = 0;
function refresh(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(place); }
function place(){
  const page = currentPage();
  const activeIdx = card && card.mode === 'tour' ? tourIndex : (card ? card.index : -1);
  NOTES.forEach((n, i)=>{
    const b = hotspotEls[i];
    if(!b) return;
    const isActive = i === activeIdx;
    const found = n.page === page && !flipping ? resolve(n, isActive && card && card.mode === 'tour') : null;
    const show = !!found && (hotspotsOn || isActive);
    b.hidden = !show;
    b.classList.toggle('is-active', isActive);
    if(!show) return;
    const pt = pointFor(found);
    b.style.left = pt.x + 'px'; b.style.top = pt.y + 'px';
  });
  if(card) positionCard(false);
}

function setHotspots(on){
  hotspotsOn = on;
  notesBtn.textContent = on ? 'Hide notes' : 'Show notes';
  notesBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
  refresh();
}

/* ---------------- note card / bottom sheet ---------------- */
const sideMode = ()=>{
  const s = stageEl.getBoundingClientRect();
  return window.innerWidth >= 900 && (window.innerWidth - s.right) >= SIDE_CARD_W + SIDE_GAP + 16;
};

function cardHtml(mode, i){
  const total = NOTES.length;
  if(i === total){
    return `
      <div class="nc-head"><span class="nc-count">Tour finished</span>
        <button class="nc-x" type="button" data-act="close" aria-label="Close">&times;</button></div>
      <h2 class="nc-title" tabindex="-1">${FINAL.title}</h2>
      <p class="nc-text">${FINAL.text}</p>
      <div class="nc-ctas">
        <a class="nc-btn nc-primary" href="${BOOKING_URL}" target="_blank" rel="noopener">Book a 15-minute call</a>
        ${WA_URL ? `<a class="nc-btn nc-outline" href="${WA_URL}" data-wa="demo" target="_blank" rel="noopener" aria-label="Rather message? WhatsApp me (opens WhatsApp in a new tab)">Rather message? WhatsApp me</a>` : ''}
      </div>
      <div class="nc-nav"><button class="nc-link" type="button" data-act="back">Back</button><button class="nc-link" type="button" data-act="close">Close</button></div>`;
  }
  const n = NOTES[i];
  const found = resolve(n, mode === 'tour');
  const extra = found && found.pin.extra ? `<p class="nc-extra">${found.pin.extra}</p>` : '';
  const nav = mode === 'tour'
    ? `<div class="nc-nav">
         <button class="nc-link" type="button" data-act="skip">Skip tour</button>
         <span class="nc-spacer"></span>
         <button class="nc-btn nc-outline" type="button" data-act="back"${i === 0 ? ' disabled' : ''}>Back</button>
         <button class="nc-btn nc-primary" type="button" data-act="next">${i === total - 1 ? 'Finish' : 'Next'}</button>
       </div>`
    : `<div class="nc-nav"><span class="nc-spacer"></span><button class="nc-btn nc-primary" type="button" data-act="close">Got it</button></div>`;
  return `
    <div class="nc-head"><span class="nc-num" aria-hidden="true">${i + 1}</span><span class="nc-count">${mode === 'tour' ? `Note ${i + 1} of ${total}` : 'Note ' + (i + 1)}</span>
      <button class="nc-x" type="button" data-act="${mode === 'tour' ? 'skip' : 'close'}" aria-label="${mode === 'tour' ? 'Skip the tour' : 'Close'}">&times;</button></div>
    <h2 class="nc-title" tabindex="-1">${n.title}</h2>
    <p class="nc-text">${n.text}</p>${extra}${nav}`;
}

function showCard(mode, i, opener, quiet){
  const fresh = !card;
  if(!card){
    const el = document.createElement('div');
    el.className = 'nc';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.addEventListener('click', onCardClick);
    // keep taps on the card away from the flipbook underneath
    ['mousedown', 'touchstart', 'pointerdown'].forEach(t=> el.addEventListener(t, e=> e.stopPropagation()));
    document.body.appendChild(el);
    card = { el, mode, index:i, opener: opener || document.activeElement };
  }
  card.mode = mode; card.index = i;
  card.el.classList.toggle('is-final', i === NOTES.length);
  card.el.setAttribute('aria-label', i === NOTES.length ? FINAL.title : 'Note ' + (i + 1) + ': ' + NOTES[i].title);
  if(i < NOTES.length && NOTES[i].page === currentPage()){
    const f = resolve(NOTES[i], mode === 'tour', true);
    if(f) revealInBook(f.el);
  }
  card.el.innerHTML = cardHtml(mode, i);
  if(!reduced() && !quiet){ card.el.classList.remove('is-in'); void card.el.offsetWidth; card.el.classList.add('is-in'); }
  place();
  positionCard(true);
  const h = card.el.querySelector('.nc-title');
  if(h && !quiet) h.focus({ preventScroll:true });
  if(fresh) document.addEventListener('keydown', onKey, true);
}

function closeCard(){
  if(!card) return;
  const { el, opener } = card;
  card = null; tourIndex = -1;
  el.remove();
  document.removeEventListener('keydown', onKey, true);
  document.body.style.paddingBottom = '';
  refresh();
  if(opener && opener.isConnected && opener.focus) opener.focus({ preventScroll:true });
}
function onKey(e){
  if(e.key === 'Escape' && card && !(window.dcQuote && window.dcQuote.busy)){ e.preventDefault(); closeCard(); }
}
function onCardClick(e){
  const t = e.target.closest('[data-act]');
  if(t){
    const act = t.getAttribute('data-act');
    if(act === 'close' || act === 'skip') closeCard();
    else if(act === 'next') goTo(tourIndex + 1);
    else if(act === 'back') goTo(Math.max(0, (card.mode === 'tour' ? tourIndex : card.index) - 1));
    return;
  }
  const a = e.target.closest('a[href]');
  if(a && a.href.indexOf('https://calendar.app.google') === 0) track('cta', (a.textContent || '').trim().slice(0, 30));
  if(a && a.hasAttribute('data-wa')) track('whatsapp', a.getAttribute('data-wa'));
}

// Where the card goes. Wide screens: beside the book, level with the hotspot. Phones and tablets: a sheet from the
// bottom, and the page scrolls so the thing being explained sits above it.
function positionCard(scroll){
  if(!card) return;
  const el = card.el;
  const i = card.mode === 'tour' ? tourIndex : card.index;
  const hs = hotspotEls[i];
  const target = hs && !hs.hidden ? hs : null;
  if(sideMode()){
    el.classList.remove('nc-sheet'); el.classList.add('nc-side');
    document.body.style.paddingBottom = '';
    const s = stageEl.getBoundingClientRect();
    const left = s.right + SIDE_GAP + window.scrollX;
    const ch = el.offsetHeight;
    let anchorY = target ? target.getBoundingClientRect().top + 13 : s.top + s.height / 2;
    let top = anchorY - 36;
    const minTop = window.scrollY + 12, maxTop = window.scrollY + window.innerHeight - ch - 12;
    top = top + window.scrollY;
    if(scroll){
      // bring the hotspot and the card into view first
      const want = target ? target.getBoundingClientRect() : s;
      if(want.top < 70 || want.bottom > window.innerHeight - 40){
        const y = window.scrollY + want.top - window.innerHeight / 2.5;
        window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
        setTimeout(()=> positionCard(false), reduced() ? 0 : 420);
      }
    }
    top = Math.max(minTop, Math.min(maxTop, top));
    el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.width = SIDE_CARD_W + 'px';
    const arrow = target ? (target.getBoundingClientRect().top + window.scrollY + 13 - top) : -100;
    el.style.setProperty('--arrow-y', Math.max(18, Math.min(ch - 18, arrow)) + 'px');
    el.classList.toggle('no-arrow', !target);
    return;
  }
  el.classList.remove('nc-side'); el.classList.add('nc-sheet');
  el.style.left = ''; el.style.top = ''; el.style.width = '';
  const sh = el.offsetHeight;
  document.body.style.paddingBottom = (sh + 16) + 'px';   // room to scroll the page above the sheet
  if(!scroll) return;
  const thing = target ? target : stageEl;
  const r = thing.getBoundingClientRect();
  // the hotspot sits on the thing it explains: keep it plus some of its surroundings visible above the sheet
  const room = window.innerHeight - sh - 16;
  const wantTop = 64, wantBottom = room - 40;
  let dy = 0;
  if(r.bottom + 40 > wantBottom + 40 || r.top < wantTop){
    dy = (r.top + r.height / 2) - Math.min(room / 2, room - 90);
    if(target && target === hs) dy = r.top - Math.max(wantTop, room * 0.45);
  }
  if(Math.abs(dy) > 4) window.scrollTo({ top: Math.max(0, window.scrollY + dy), behavior: reduced() ? 'auto' : 'smooth' });
}

/* ---------------- tour ---------------- */
let tourSeq = 0;
let flipWaiter = null;    // resolves the tour's wait when the book reports a finished flip
// (StPageFlip's off() drops every listener for an event, so the tour keeps one listener and swaps this instead)
function flipTo(page){
  const b = getBook();
  if(!b || currentPage() === page) return Promise.resolve();
  return new Promise(resolve=>{
    let done = false;
    const finish = ()=>{ if(done) return; done = true; flipWaiter = null; resolve(); };
    flipWaiter = ()=> setTimeout(finish, 60);
    setTimeout(finish, 1600);
    try{ b.pageFlip.flip(page); }catch(e){ finish(); }
  });
}
async function goTo(i){
  const seq = ++tourSeq;
  if(i >= NOTES.length){
    const finished = tourIndex === NOTES.length - 1;
    tourIndex = NOTES.length;
    if(finished) track('cta', 'demo-tour');
    showCard('tour', NOTES.length);
    return;
  }
  tourIndex = i;
  const turning = currentPage() !== NOTES[i].page;
  showCard('tour', i);              // the new note shows straight away, while the page turns
  if(!turning) return;
  await flipTo(NOTES[i].page);
  if(seq !== tourSeq || !card) return;
  flipping = false;
  showCard('tour', i, null, true);  // again, now its hotspot (and any fallback line) is on screen
}
function startTour(){
  if(window.dcQuote && window.dcQuote.busy) return;
  if(card && card.mode === 'single') closeCard();
  goTo(0);
}
function openSingle(i, opener){
  tourSeq++;
  tourIndex = -1;
  showCard('single', i, opener);
}

/* ---------------- wiring ---------------- */
function init(){
  const b = getBook();
  buildHotspots();
  if(b){
    b.pageFlip.on('changeState', e=>{
      flipping = e.data !== 'read';
      refresh();
    });
    b.pageFlip.on('flip', ()=>{ flipping = false; refresh(); if(flipWaiter) flipWaiter(); });
  }
  window.addEventListener('resize', refresh);
  document.addEventListener('scroll', refresh, { capture:true, passive:true });   // the window and the scroll boxes in the book
  if('ResizeObserver' in window) new ResizeObserver(refresh).observe(stageEl);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);
  document.addEventListener('dcq:change', refresh);
  document.addEventListener('dcq:signed', ()=> track('cta', 'demo-signed'));
  notesBtn.addEventListener('click', ()=> setHotspots(!hotspotsOn));
  tourBtn.addEventListener('click', ()=>{ tourBtn.blur(); startTour(); });
  refresh();

  // First visit: start the tour once. Remembered in localStorage; if that can't be read, it starts every time.
  let seen = false;
  try{ seen = localStorage.getItem(TOUR_KEY) === '1'; }catch(e){}
  if(!seen){
    try{ localStorage.setItem(TOUR_KEY, '1'); }catch(e){}
    setTimeout(()=>{ if(!card) startTour(); }, 900);
  }
}

/* ---------------- visit tracking: a view once someone is really here (5 seconds, or they touch the page) ---------------- */
(function(){
  let human = false;
  const mark = ()=>{
    if(human || document.visibilityState !== 'visible') return;
    human = true; track('view');
    ['pointerdown', 'keydown', 'scroll'].forEach(t=> window.removeEventListener(t, mark, true));
  };
  setTimeout(mark, 5000);
  ['pointerdown', 'keydown', 'scroll'].forEach(t=> window.addEventListener(t, mark, { capture:true, passive:true }));
})();

if(getBook()) init(); else document.addEventListener('dcq:ready', init, { once:true });
})();
