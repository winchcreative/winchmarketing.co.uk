/* DC Flooring quote flipbook, demo copy.
 *
 * The customer side of DC Flooring's quote tool (DCflipbook, index.html), cut down to run on its own:
 * page flips, single-finger swipes, the zoom view, the signing dialog, Decline and "Save a copy".
 *
 * Fully disconnected: there is no database, no login and no network call of any kind. The quote is the
 * made-up one in index.html, signing and declining happen only in this browser tab, and nothing is kept
 * after the page is closed. The demo layer (demo-layer.js) listens for the events this file sends:
 *   dcq:ready   the book is built           dcq:change  the last page was redrawn
 *   dcq:signed  a signature was confirmed   dcq:declined  the quote was declined
 */
(function(){
'use strict';

/* ---------------- the made-up quote ---------------- */
const BRAND = 'Floors for Living';
// Placeholder contact details for the shop. 01632 960xxx is an Ofcom drama number and example.com is reserved,
// so neither reaches anyone. They are shown as text, never as tel: or mailto: links.
const BUSINESS = { businessName: BRAND, phone: '01632 960 123', email: 'quotes@example.com' };
const VALID_DAYS = 14;
const ASSET = (f)=> new URL('/work/dc-flooring-quote/' + f, location.href).href;

function todayIso(){ return new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()); }
function addDays(dateStr, n){ const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const q = {
  ref: 'DEMO-001',
  customerName: 'Mr & Mrs Taylor',
  address: '12 Example Road, Northallerton',
  date: todayIso(),
  validUntil: addDays(todayIso(), VALID_DAYS),   // always in date, so the demo never shows as expired
  notes: (document.getElementById('quoteTerms') || {}).textContent || '',
  // read from the rows in index.html, so the page and the totals can never disagree
  lineItems: Array.from(document.querySelectorAll('#lineItems tr')).map(tr=> ({
    product: tr.cells[0].textContent, qtyLabel: tr.cells[1].textContent,
    qty: parseFloat(tr.dataset.qty) || 0, unitPrice: parseFloat(tr.dataset.price) || 0
  })),
  status: 'sent', response: null, _signature: null
};

/* ---------------- helpers ---------------- */
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}
function money(n){ return '£' + (isNaN(n) ? 0 : n).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function lineTotal(li){ return li.qty ? li.qty * li.unitPrice : li.unitPrice; }
function calcTotals(){
  const subtotal = q.lineItems.reduce((s, li)=> s + lineTotal(li), 0);
  const vat = subtotal * 0.2;
  return { subtotal, vat, total: subtotal + vat };
}
function fmtDate(s){ if(!s) return ''; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}); }
function fmtSignedDate(iso, withTime){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const o = { timeZone:'Europe/London', day:'numeric', month:'long', year:'numeric' };
  if(withTime){ o.hour = '2-digit'; o.minute = '2-digit'; }
  return d.toLocaleString('en-GB', o);
}
const sleep = ms=> new Promise(r=> setTimeout(r, ms));
const emit = (name, detail)=> document.dispatchEvent(new CustomEvent(name, { detail }));

/* ---------------- the last page: sign or decline ---------------- */
function phoneLineHtml(cls){
  return `<p class="${cls}">Prefer to accept over the phone? Call us on <b>${escapeHtml(BUSINESS.phone)}</b></p>`;
}
function decisionContactHtml(){
  return `<div class="decision-contact"><b>${escapeHtml(BUSINESS.businessName)}</b>${escapeHtml(BUSINESS.phone)}<span class="dc-sep" aria-hidden="true"> · </span>${escapeHtml(BUSINESS.email)}</div>`;
}
const DECISION_PAGENO = '<div class="pageno">05</div>';
const DEMO_NOTE = '<p class="demo-note">This is a demo, so nothing was saved.</p><button class="dbtn demo-reset" id="demoReset" type="button">Try it again</button>';

function renderDecisionPage(signed){
  const el = document.getElementById('decisionPage');
  if(q.response){
    const accepted = q.response.decision === 'accepted';
    el.innerHTML = `<div class="decision-inner"><div class="decided-state ${accepted ? 'accepted' : 'declined'}" id="decidedState" tabindex="-1">
      <div class="badge">${accepted ? 'Quote accepted' : 'Quote declined'}</div>
      <div class="decided-msg">
        ${accepted ? "Thanks — we've got your confirmation. We'll be in touch to get things booked in." : 'Thanks for letting us know.'}
        ${q.response.reason ? `<div style="margin-top:10px; font-style:italic;">"${escapeHtml(q.response.reason)}"</div>` : ''}
      </div>
      ${accepted ? '<div class="signed-box" id="signedBox" hidden></div>' : ''}
      ${DEMO_NOTE}
    </div>${decisionContactHtml()}</div>${DECISION_PAGENO}`;
    if(accepted) showSignedBox(signed);
    emit('dcq:change');
    return;
  }
  el.innerHTML = `
    <div class="decision-inner">
      <h2 class="title">What would you like to do?</h2>
      <p class="lead">Happy with the quote? Sign below and we'll get your fitting booked in. If it's not quite right, let us know why.</p>
      <div class="decision-btns">
        <button class="dbtn sign" id="signBtn" type="button">Sign to accept this quote</button>
        <button class="dbtn decline" id="declineBtn" type="button">Decline this quote</button>
      </div>
      <div class="decline-form" id="declineForm" style="display:none;">
        <textarea id="declineReason" placeholder="Tell us why — price, timing, changed your mind about the product..."></textarea>
        <button class="btn btn-primary" id="declineSubmit" type="button">Submit</button>
      </div>
      <div class="decision-error" id="decisionError" role="alert"></div>
      ${phoneLineHtml('phone-line')}
      ${decisionContactHtml()}
    </div>${DECISION_PAGENO}
  `;
  emit('dcq:change');
}

// The buttons on the last page are handled here, on the document, so it does not matter whether StPageFlip has
// moved or redrawn the page since it was rendered.
document.addEventListener('click', e=>{
  const t = e.target && e.target.closest ? e.target.closest('button') : null;
  if(!t) return;
  if(t.id === 'signBtn') openSignModal();
  else if(t.id === 'declineBtn'){
    const f = document.getElementById('declineForm');
    if(f){ f.style.display = 'block'; emit('dcq:change'); }
  }
  else if(t.id === 'declineSubmit') submitDecline((document.getElementById('declineReason') || {}).value || '');
  else if(t.id === 'saveCopyBtn') saveSignedCopy();
  else if(t.id === 'demoReset'){
    q.status = 'sent'; q.response = null; q._signature = null;
    renderDecisionPage();
    const b = document.getElementById('signBtn'); if(b) b.focus();
  }
  else if(t.id === 'zoomBtn') openZoomView();
});

/* ---------------- e-signature ---------------- */
// signature_pad 4.1.7 (MIT), served from this folder, loaded the first time the signing dialog opens.
const SIGNATURE_PAD_SRC = '/work/dc-flooring-quote/signature_pad.umd.min.js';
const SIGNATURE_PAD_SRI = 'sha384-dPowQo9uxJU703klzvnG+vzLHQDNmO/zREXw6BhCMupB54CE70wj6SWOGVPySK3s';
const SIGNATURE_MAX_WIDTH = 600;        // px width of the signature picture
let signaturePadPromise = null;
function loadSignaturePad(){
  if(window.SignaturePad) return Promise.resolve();
  if(signaturePadPromise) return signaturePadPromise;
  signaturePadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = SIGNATURE_PAD_SRC; s.integrity = SIGNATURE_PAD_SRI;
    s.onload = ()=> window.SignaturePad ? resolve() : (signaturePadPromise = null, reject(new Error('signature_pad missing')));
    s.onerror = ()=>{ signaturePadPromise = null; s.remove(); reject(new Error('signature_pad failed to load')); };
    document.head.appendChild(s);
  });
  return signaturePadPromise;
}

// Keeps the drawing sized to its box. On a rotation or resize the strokes are scaled to fit the new box (never cleared).
function fitSignaturePad(st){
  const rect = st.canvas.parentElement.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if(!w || !h || (w === st.w && h === st.h)) return;
  const data = st.pad.toData();
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  st.canvas.width = w * ratio; st.canvas.height = h * ratio;
  st.canvas.getContext('2d').scale(ratio, ratio);
  st.pad.clear();
  if(data.length && st.w){
    const k = Math.min(w / st.w, h / st.h), dx = (w - st.w * k) / 2, dy = (h - st.h * k) / 2;
    data.forEach(g=> g.points.forEach(p=>{ p.x = p.x * k + dx; p.y = p.y * k + dy; }));
    st.pad.fromData(data, { clear:false });
  }
  st.w = w; st.h = h;
  st.wrap.classList.toggle('has-ink', !st.pad.isEmpty());
}
// The drawing as a transparent PNG data URL, cropped to the ink. It only ever lives in this tab.
function signaturePng(st){
  const ratio = st.canvas.width / st.w;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  st.pad.toData().forEach(g=> g.points.forEach(p=>{ x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }));
  const pad = 14, minW = 200, minH = 80;
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max(x1 - x0 + pad * 2, minW), h = Math.max(y1 - y0 + pad * 2, minH);
  w = Math.min(w, st.w); h = Math.min(h, st.h);
  const left = Math.min(Math.max(cx - w / 2, 0), st.w - w), top = Math.min(Math.max(cy - h / 2, 0), st.h - h);
  const outW = Math.min(SIGNATURE_MAX_WIDTH, Math.round(w * ratio)), outH = Math.max(1, Math.round(outW * h / w));
  const out = document.createElement('canvas'); out.width = outW; out.height = outH;
  out.getContext('2d').drawImage(st.canvas, left * ratio, top * ratio, w * ratio, h * ratio, 0, 0, outW, outH);
  return out.toDataURL('image/png');
}

let signModal = null;     // the dialog's state while it is open
function openSignModal(){
  if(signModal || q.response) return;
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'sg-modal'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'sgH1');
  root.innerHTML = `
    <div class="sg-top"><img class="sg-logo" src="${escapeHtml(ASSET('floors-for-living-logo.png'))}" alt="${escapeHtml(BRAND)}">
      <button class="sg-x" id="sgClose" type="button" aria-label="Close without signing">&times;</button></div>
    <div class="sg-prog"><div class="sg-stepno" id="sgStepNo" aria-live="polite">Step 1 of 3</div>
      <div class="sg-bar" aria-hidden="true"><i class="on"></i><i></i><i></i></div></div>
    <div class="sg-scroll"><div class="sg-body">
      <section class="sg-step" id="sgS1" aria-labelledby="sgH1">
        <h2 id="sgH1" tabindex="-1">Your name</h2>
        <p id="sgL1">Type your full name below.</p>
        <input class="sg-input" id="sgName" type="text" aria-labelledby="sgH1 sgL1" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="100">
        <div class="sg-error" id="sgE1" role="alert"></div>
        <button class="sg-btn primary" id="sgNext1" type="button">Next</button>
      </section>
      <section class="sg-step" id="sgS2" aria-labelledby="sgH2" hidden>
        <h2 id="sgH2" tabindex="-1">Your signature</h2>
        <p>Sign with your finger in the white box.</p>
        <div class="sg-padwrap" id="sgPadWrap"><canvas id="sgCanvas" role="img" aria-label="Signature box. Draw your signature with your finger or mouse."></canvas><div class="sg-guide" aria-hidden="true"><span>Sign here</span></div></div>
        <div class="sg-error" id="sgE2" role="alert"></div>
        <div class="sg-btn-row"><button class="sg-btn" id="sgClear" type="button">Clear</button><button class="sg-btn primary" id="sgDone" type="button">Done</button></div>
      </section>
      <section class="sg-step" id="sgS3" aria-labelledby="sgH3" hidden>
        <h2 id="sgH3" tabindex="-1">Check and confirm</h2>
        <div class="sg-review">
          <div class="sg-row"><span>Name</span><span class="v" id="sgRevName"></span></div>
          <div class="sg-row sig"><span>Signature</span><img id="sgRevSig" alt="Your signature"></div>
          <div class="sg-row grand"><span>Total (incl. VAT)</span><span class="v">${escapeHtml(money(calcTotals().total))}</span></div>
        </div>
        <label class="sg-check"><input type="checkbox" id="sgTick"><span>I accept this quote and the terms and conditions</span></label>
        <div class="sg-error" id="sgE3" role="alert"></div>
        <button class="sg-btn primary" id="sgConfirm" type="button">Confirm and accept</button>
        <button class="sg-link" id="sgBack" type="button">Go back</button>
      </section>
      ${phoneLineHtml('sg-phone')}
    </div></div>`;
  document.body.appendChild(root);
  const $ = id=> root.querySelector('#' + id);
  const page = document.getElementById('customer');
  if(page) page.setAttribute('inert', '');
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  const st = { root, pad:null, canvas:$('sgCanvas'), wrap:$('sgPadWrap'), w:0, h:0, ro:null, name:'', png:'', step:1, busy:false };
  signModal = st;

  const showStep = n=>{
    const back = n < st.step;
    st.step = n;
    [1, 2, 3].forEach(i=> { $('sgS' + i).hidden = i !== n; });
    $('sgStepNo').textContent = `Step ${n} of 3`;
    root.querySelectorAll('.sg-bar i').forEach((seg, i)=> seg.classList.toggle('on', i < n));
    const cur = $('sgS' + n);
    cur.style.setProperty('--sg-from', back ? '-18px' : '18px');
    cur.classList.remove('is-in'); void cur.offsetWidth; cur.classList.add('is-in');
    root.setAttribute('aria-labelledby', 'sgH' + n);
    root.querySelector('.sg-scroll').scrollTop = 0;
    if(n === 1) $('sgName').focus(); else $('sgH' + n).focus();
    if(n === 2 && st.pad) fitSignaturePad(st);
  };
  const close = ()=>{
    if(st.busy) return;
    if(st.ro) st.ro.disconnect();
    signModal = null;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.remove();
    else{ root.classList.add('is-closing'); setTimeout(()=> root.remove(), 200); }
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = prevOverflow;
    if(page) page.removeAttribute('inert');
    const back = document.getElementById('signBtn') || opener;
    if(back && back.focus) back.focus();
  };

  // keyboard: Escape closes, Tab stays inside the dialog
  const onKey = e=>{
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if(e.key !== 'Tab') return;
    const items = Array.from(root.querySelectorAll('button, input, a[href], [tabindex="0"]')).filter(n=> !n.disabled && n.offsetParent !== null);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if(!root.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  // the flipbook listens for touches and the mouse on the page underneath: keep the dialog's events to itself
  ['mousedown', 'touchstart', 'pointerdown'].forEach(t=> root.addEventListener(t, e=> e.stopPropagation()));
  $('sgClose').addEventListener('click', close);

  // step 1: name
  const next1 = ()=>{
    const name = $('sgName').value.replace(/\s+/g, ' ').trim();
    if(name.length < 2){ $('sgE1').textContent = 'Please type your full name.'; $('sgName').focus(); return; }
    $('sgE1').textContent = ''; st.name = name;
    showStep(2);
  };
  $('sgNext1').addEventListener('click', next1);
  $('sgName').addEventListener('keydown', e=>{ if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); next1(); } });
  $('sgName').addEventListener('input', ()=>{ $('sgE1').textContent = ''; });

  // step 2: signature (the library loads while they type their name)
  loadSignaturePad().then(()=>{
    if(signModal !== st) return;
    const Pad = window.SignaturePad.default || window.SignaturePad;
    st.pad = new Pad(st.canvas, { penColor:'#000', minWidth:1.5, maxWidth:3.5, backgroundColor:'rgba(0,0,0,0)' });
    st.pad.addEventListener('beginStroke', ()=> { st.wrap.classList.add('has-ink'); $('sgE2').textContent = ''; });
    st.ro = new ResizeObserver(()=> fitSignaturePad(st));
    st.ro.observe(st.wrap);
    fitSignaturePad(st);
  }).catch(()=>{ st.loadFailed = true; });
  $('sgClear').addEventListener('click', ()=>{ if(st.pad) st.pad.clear(); st.wrap.classList.remove('has-ink'); $('sgE2').textContent = ''; });
  $('sgDone').addEventListener('click', ()=>{
    if(!st.pad){
      $('sgE2').textContent = st.loadFailed
        ? "The signing box couldn't load. Please check your connection and try again."
        : 'The signing box is still loading. Please wait a moment and try again.';
      return;
    }
    if(st.pad.isEmpty()){ $('sgE2').textContent = 'Please sign in the white box first.'; return; }
    $('sgE2').textContent = '';
    st.png = signaturePng(st);
    $('sgRevName').textContent = st.name; $('sgRevSig').src = st.png;
    $('sgTick').checked = false; $('sgE3').textContent = '';
    showStep(3);
  });

  // step 3: check and confirm. In the live tool this sends the signature to the shop; here it stays in this tab.
  $('sgBack').addEventListener('click', ()=> showStep(2));
  $('sgTick').addEventListener('change', ()=>{ $('sgE3').textContent = ''; });
  $('sgConfirm').addEventListener('click', async ()=>{
    if(st.busy) return;
    if(!$('sgTick').checked){ $('sgE3').textContent = 'Please tick the box to accept the quote.'; $('sgTick').focus(); return; }
    const setBusy = on=>{ st.busy = on; ['sgConfirm', 'sgBack', 'sgClose'].forEach(id=> { $(id).disabled = on; }); $('sgConfirm').textContent = on ? 'Please wait…' : 'Confirm and accept'; };
    $('sgE3').textContent = ''; setBusy(true);
    await sleep(600);   // the same short pause the customer sees in the live tool
    const signedAt = new Date().toISOString();
    q.status = 'accepted';
    q.response = { decision:'accepted', reason:'', respondedAt:signedAt };
    const signed = { name:st.name, signature:st.png, signedAt };
    setBusy(false);
    close();
    renderDecisionPage(signed);
    const done = document.getElementById('decidedState'); if(done) done.focus();
    emit('dcq:signed');
  });

  showStep(1);
}

// "Signed by <name> on <date>" with the signature and the "Save a copy" button.
function showSignedBox(signed){
  const sig = signed || q._signature;
  q._signature = sig || null;
  const box = document.getElementById('signedBox');
  if(!sig || !box) return;
  box.hidden = false;
  box.innerHTML = `<div class="signed-card">
      <div class="signed-stamp">Signed</div>
      <div class="signed-by">Signed by</div>
      <div class="signed-name">${escapeHtml(sig.name)}</div>
      <div class="signed-date">on ${escapeHtml(fmtSignedDate(sig.signedAt))}</div>
      <div class="signed-img"><img alt="${escapeHtml('Signature of ' + sig.name)}"></div>
      <button class="dbtn copy" id="saveCopyBtn" type="button">Save a copy</button>
    </div>`;
  box.querySelector('img').src = sig.signature;
}

// Decline: the reason stays in this tab.
async function submitDecline(reason){
  const busy = on=>{
    ['signBtn', 'declineBtn', 'declineSubmit'].forEach(id=>{ const b = document.getElementById(id); if(b) b.disabled = on; });
  };
  busy(true);
  await sleep(400);
  q.status = 'declined';
  q.response = { decision:'declined', reason:reason.trim(), respondedAt:new Date().toISOString() };
  renderDecisionPage();
  const done = document.getElementById('decidedState'); if(done) done.focus();
  emit('dcq:declined');
}

/* ---------------- "Save a copy": a clean, print-friendly page of the whole quote with the signature ---------------- */
function saveSignedCopy(){
  const sig = q._signature;
  if(!sig) return;
  const w = window.open('', '_blank');   // opened straight from the click so pop-up blockers allow it
  if(!w){ alert('Your browser blocked the new window. Allow pop-ups for this site and try again.'); return; }
  w.document.open();
  w.document.write(buildPrintHtml(sig));
  w.document.close();
}
function buildPrintHtml(sig){
  const {subtotal, vat, total} = calcTotals();
  const rows = q.lineItems.map(li=>
    `<tr><td>${escapeHtml(li.product)}</td><td class="num">${escapeHtml(li.qtyLabel)}</td><td class="num">${money(li.unitPrice)}</td><td class="num">${money(lineTotal(li))}</td></tr>`
  ).join('');
  const notes = (q.notes || '').trim();
  const icons = {
    phone:'<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    email:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>'
  };
  const contact = ['phone', 'email'].map(k=> `<span>${icons[k]}${escapeHtml(BUSINESS[k])}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="UTF-8">
<title>${escapeHtml('Quote ' + q.ref + ', ' + q.customerName)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap">
<style>
:root{ --accent:#b08d57; --dark:#272727; --ink:#272727; --muted:#6f6a62; --line:#e8e3da; --tint:#f8f4eb; }
@page{ size:A4; margin:0; }
*{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html,body{ margin:0; background:#fff; color:var(--ink); }
body{ font:10pt/1.5 "Work Sans","Helvetica Neue",Helvetica,Arial,sans-serif; }
.page{ width:210mm; margin:0 auto; background:#fff; }
h1,h2,h3,.signoff,.grand{ font-family:"Poppins","Helvetica Neue",Helvetica,Arial,sans-serif; }
.band{ background:var(--dark); color:#fff; padding:13mm 15mm 9mm; }
.band-top{ display:flex; justify-content:space-between; align-items:center; gap:10mm; }
h1{ margin:0; font-size:35pt; line-height:1.04; font-weight:700; text-transform:uppercase; letter-spacing:.01em; }
h1 span{ display:block; }
h1 .a{ color:var(--accent); } h1 .w{ color:#fff; }
.logo-panel{ flex:none; width:40mm; padding:2mm; background:#fff; border-radius:3mm; }
.logo{ display:block; width:100%; aspect-ratio:8/5; object-fit:cover; object-position:50% 46%; filter:invert(1) hue-rotate(180deg); }
.contact{ display:flex; flex-wrap:wrap; gap:2mm 8mm; margin-top:8mm; font-size:9pt; color:#ece8df; }
.contact span{ display:inline-flex; align-items:center; gap:2.2mm; }
.contact svg{ width:4.2mm; height:4.2mm; flex:none; fill:none; stroke:var(--accent); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.content{ padding:12mm 15mm 14mm; -webkit-box-decoration-break:clone; box-decoration-break:clone; }
.meta{ display:flex; justify-content:space-between; align-items:flex-start; gap:10mm; margin-bottom:9mm; }
.label{ margin:0 0 1.5mm; font-size:8pt; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--ink); }
.who{ font-size:15pt; font-weight:600; line-height:1.25; overflow-wrap:anywhere; }
.addr{ margin-top:1mm; color:var(--muted); }
.facts{ text-align:right; font-size:10pt; line-height:1.7; }
.facts span{ color:var(--muted); } .facts b{ font-weight:600; }
table.items{ width:100%; border-collapse:collapse; }
.items thead{ display:table-header-group; }
.items tr{ break-inside:avoid; page-break-inside:avoid; }
.items th{ background:var(--dark); color:#fff; padding:3.4mm 4mm; text-align:left; font-size:8.5pt; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
.items td{ padding:4.2mm 4mm; border-bottom:.6pt solid var(--line); vertical-align:top; overflow-wrap:anywhere; }
.items th.num, .items td.num{ text-align:right; white-space:nowrap; }
.items th:nth-child(2){ width:20mm; } .items th:nth-child(3), .items th:nth-child(4){ width:31mm; }
.closing{ margin-top:8mm; break-inside:avoid; page-break-inside:avoid; }
.totals{ width:78mm; margin-left:auto; }
.totals div{ display:flex; justify-content:space-between; padding:1.6mm 4mm; color:var(--muted); }
.totals .grand{ margin-top:2mm; padding-top:3.6mm; border-top:1.2pt solid var(--ink); font-size:16pt; font-weight:700; line-height:1.2; color:var(--accent); }
.terms{ margin-top:9mm; }
.terms p{ margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.signed{ margin-top:8mm; padding:5mm 6mm; border:.6pt solid #e6dcc8; border-left:1.6mm solid var(--accent); border-radius:2mm; break-inside:avoid; page-break-inside:avoid; }
.signed h3{ margin:0 0 1.5mm; font-size:11.5pt; font-weight:600; }
.signed p{ margin:0; }
.signed img{ display:block; max-width:70mm; max-height:28mm; margin-top:3mm; }
.signoff{ margin-top:10mm; font-size:10pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.demo{ margin-top:6mm; font-size:8.5pt; color:var(--muted); }
@media print{ .page{ width:auto; } }
@media screen{ body{ background:#e6e4df; } .page{ margin:8mm auto; box-shadow:0 2px 16px rgba(0,0,0,.25); min-height:297mm; } }
</style></head>
<body><div class="page">
<div class="band">
  <div class="band-top">
    <h1><span class="a">Your flooring</span><span class="w">Quote</span></h1>
    <div class="logo-panel"><img class="logo" src="${escapeHtml(ASSET('floors-for-living-logo.png'))}" alt="${escapeHtml(BRAND)}"></div>
  </div>
  <div class="contact">${contact}</div>
</div>
<div class="content">
  <div class="meta">
    <div><div class="label">Prepared for</div><div class="who">${escapeHtml(q.customerName)}</div><div class="addr">${escapeHtml(q.address)}</div></div>
    <div class="facts">
      <div><span>Quote no:</span> <b>${escapeHtml(q.ref)}</b></div>
      <div><span>Date:</span> <b>${escapeHtml(fmtDate(q.date))}</b></div>
      <div><span>Valid until:</span> <b>${escapeHtml(fmtDate(q.validUntil))}</b></div>
    </div>
  </div>
  <table class="items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="closing">
    <div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>VAT (20%)</span><span>${money(vat)}</span></div><div class="grand"><span>Total</span><span>${money(total)}</span></div></div>
    ${notes ? `<div class="terms"><div class="label">Terms</div><p>${escapeHtml(notes)}</p></div>` : ''}
    <div class="signed"><h3>Accepted and signed</h3><p>Signed by <b>${escapeHtml(sig.name)}</b> on <b>${escapeHtml(fmtSignedDate(sig.signedAt, true))}</b></p><img src="${escapeHtml(sig.signature)}" alt="${escapeHtml('Signature of ' + sig.name)}"></div>
    <div class="signoff">Thank you for choosing ${escapeHtml(BRAND)}</div>
    <p class="demo">Example quote from a demo by Winch Marketing. The customer and prices are made up, and nothing was saved.</p>
  </div>
</div>
</div>
<script>
window.addEventListener('load', function(){
  var go = function(){ setTimeout(function(){ window.focus(); window.print(); }, 150); };
  var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  var cap = new Promise(function(r){ setTimeout(r, 3000); });
  Promise.race([fonts, cap]).then(go);
});
<\/script>
</body></html>`;
}

/* ---------------- book (StPageFlip) ---------------- */
let book = null;   // { pageFlip, pages }
function wireBook(){
  const bookEl = document.getElementById('book');
  const pages = Array.from(bookEl.querySelectorAll('.page'));
  const total = pages.length;
  const dotsEl = document.getElementById('dots');
  dotsEl.innerHTML = pages.map((_, i)=> `<div class="dot" data-i="${i}"></div>`).join('');
  const dots = Array.from(dotsEl.children);
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  const PageFlipCtor = (window.St && window.St.PageFlip) || window.PageFlip;
  const pageFlip = new PageFlipCtor(bookEl, {
    width: 480, height: 672, size: 'stretch',
    minWidth: 260, maxWidth: 700, minHeight: 364, maxHeight: 980,
    maxShadowOpacity: 0.5, showCover: false, usePortrait: true, mobileScrollSupport: true
  });
  installSwipe(pageFlip);
  book = { pageFlip, pages };
  pageFlip.loadFromHTML(pages);

  function updateControls(){
    const idx = pageFlip.getCurrentPageIndex();
    dots.forEach((d, i)=> d.classList.toggle('active', i === idx));
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === total - 1;
  }
  pageFlip.on('flip', updateControls);
  updateControls();

  nextBtn.addEventListener('click', ()=> pageFlip.flipNext());
  prevBtn.addEventListener('click', ()=> pageFlip.flipPrev());
  dots.forEach(d=> d.addEventListener('click', ()=> pageFlip.flip(parseInt(d.dataset.i, 10))));
}

/* ---------------- page-turn swipe ---------------- */
// Only a single-finger, mostly horizontal swipe turns a page. A gesture that ever has two or more fingers down (a pinch) and
// any mostly vertical movement (scrolling) are ignored. StPageFlip's own touch handling is cut off in the capture phase.
const SWIPE_MIN_PX = 40, SWIPE_MAX_MS = 800, SWIPE_MAX_SLOPE = 0.5;
let swipePageFlip = null, swipeOn = false;
// StPageFlip also listens for touchmove / touchend on the whole window and calls preventDefault() whenever it thinks a page is
// mid-turn, which would stop the zoom view, the signing dialog or a note card from scrolling. These run first and hide every
// touch that is not on the book from it.
['touchmove', 'touchend', 'touchcancel'].forEach(t=> window.addEventListener(t, e=>{
  if(!(e.target && e.target.closest && e.target.closest('#book'))) e.stopImmediatePropagation();
}));
function installSwipe(pageFlip){
  swipePageFlip = pageFlip;
  if(swipeOn) return;
  swipeOn = true;
  let g = null;
  const inBook = e=> !!(e.target && e.target.closest && e.target.closest('#book'));
  window.addEventListener('touchstart', e=>{
    if(!inBook(e)) return;
    e.stopPropagation();
    const t = e.touches.length === 1 ? e.touches[0] : null;
    g = t ? { id:t.identifier, x:t.clientX, y:t.clientY, t:Date.now() } : null;
  }, true);
  window.addEventListener('touchmove', e=>{
    if(!inBook(e)) return;
    e.stopPropagation();
    if(e.touches.length > 1) g = null;
  }, true);
  window.addEventListener('touchcancel', e=>{
    if(!inBook(e)) return;
    e.stopPropagation();
    g = null;
  }, true);
  window.addEventListener('touchend', e=>{
    if(!inBook(e)) return;
    e.stopPropagation();
    const start = g; g = null;
    if(!start || e.touches.length) return;
    const t = Array.from(e.changedTouches).find(c=> c.identifier === start.id);
    if(!t) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if(Date.now() - start.t > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_SLOPE) return;
    if(dx < 0) swipePageFlip.flipNext('top'); else swipePageFlip.flipPrev('top');
  }, true);
}

/* ---------------- zoom button and zoom view ---------------- */
// The magnifier above the book opens the page being read, larger, full screen. Inside it the page scrolls and pinches like
// any web page and never turns. Close returns to the same page of the flipbook.
const ZOOM_LEVELS = [1, 1.5, 2, 2.5];
const ZOOM_START = 1;     // starts at 1.5x
let zoomView = null;
function openZoomView(){
  if(zoomView || signModal || !book) return;
  const { pageFlip, pages } = book;
  const i = pageFlip.getCurrentPageIndex();
  const shown = [pages[i]].filter(Boolean);
  const opener = document.getElementById('zoomBtn');
  const copies = shown.map(pageEl=>{
    const clone = pageEl.cloneNode(true);
    clone.removeAttribute('style'); clone.removeAttribute('id'); clone.removeAttribute('data-density');
    clone.className = Array.from(pageEl.classList).filter(c=> !/^(stf__|--)/.test(c)).join(' ');
    clone.querySelectorAll('[id]').forEach(n=> n.removeAttribute('id'));
    return { clone, w:pageEl.offsetWidth, h:pageEl.offsetHeight };
  });
  const w = copies.reduce((t, c)=> t + c.w, 0), h = Math.max(...copies.map(c=> c.h));
  if(!w || !h) return;

  const root = document.createElement('div');
  root.className = 'zv'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Zoomed page');
  root.innerHTML = `
    <div class="sg-top"><img class="sg-logo" src="${escapeHtml(ASSET('floors-for-living-logo.png'))}" alt="${escapeHtml(BRAND)}"></div>
    <div class="zv-scroll" tabindex="0" role="region" aria-label="Zoomed page. Drag to move around."><div class="zv-stage"><div class="zv-sheet"></div></div></div>
    <div class="zv-bar">
      <button class="sg-btn zv-step" id="zvOut" type="button" aria-label="Zoom out">&minus;</button>
      <span class="zv-level" id="zvLevel" role="status"></span>
      <button class="sg-btn zv-step" id="zvIn" type="button" aria-label="Zoom in">+</button>
      <button class="sg-btn primary zv-close" id="zvClose" type="button">Close</button>
    </div>`;
  const $ = id=> root.querySelector('#' + id);
  const scroller = root.querySelector('.zv-scroll'), stage = root.querySelector('.zv-stage'), sheet = root.querySelector('.zv-sheet');
  sheet.style.width = w + 'px';
  copies.forEach(c=>{ c.clone.style.width = c.w + 'px'; sheet.appendChild(c.clone); });
  document.body.appendChild(root);
  const hh = Math.max(h, ...copies.map(c=> c.clone.scrollHeight));
  sheet.style.height = hh + 'px';
  copies.forEach(c=>{ c.clone.style.height = hh + 'px'; });
  const page = document.getElementById('customer');
  if(page) page.setAttribute('inert', '');
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  zoomView = root;
  emit('dcq:zoom', { open:true });

  let level = ZOOM_START;
  const apply = (i, keepCentre)=>{
    const fx = stage.offsetWidth ? (scroller.scrollLeft + scroller.clientWidth / 2) / stage.offsetWidth : .5;
    const fy = stage.offsetHeight ? (scroller.scrollTop + scroller.clientHeight / 2) / stage.offsetHeight : 0;
    level = i;
    const k = ZOOM_LEVELS[i];
    stage.style.width = (w * k) + 'px'; stage.style.height = (hh * k) + 'px';
    sheet.style.transform = `scale(${k})`;
    $('zvOut').disabled = i === 0; $('zvIn').disabled = i === ZOOM_LEVELS.length - 1;
    $('zvLevel').textContent = k + '×';
    if(keepCentre){
      scroller.scrollLeft = fx * stage.offsetWidth - scroller.clientWidth / 2;
      scroller.scrollTop = fy * stage.offsetHeight - scroller.clientHeight / 2;
    }else{
      scroller.scrollLeft = 0; scroller.scrollTop = 0;
    }
  };
  apply(level, false);

  const close = ()=>{
    document.removeEventListener('keydown', onKey, true);
    zoomView = null;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.remove();
    else{ root.classList.add('is-closing'); setTimeout(()=> root.remove(), 200); }
    document.documentElement.style.overflow = prevOverflow;
    if(page) page.removeAttribute('inert');
    if(opener && opener.isConnected) opener.focus();
    emit('dcq:zoom', { open:false });
  };
  const onKey = e=>{
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if(e.key !== 'Tab') return;
    const items = Array.from(root.querySelectorAll('button, a[href], [tabindex="0"]')).filter(n=> !n.disabled && n.offsetParent !== null);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if(!root.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  $('zvClose').addEventListener('click', close);
  $('zvIn').addEventListener('click', ()=>{ if(level < ZOOM_LEVELS.length - 1) apply(level + 1, true); });
  $('zvOut').addEventListener('click', ()=>{ if(level > 0) apply(level - 1, true); });
  scroller.focus();
}

// StPageFlip cancels the mouse and touch events that would focus the decline reason box: let those reach it.
['mousedown', 'touchstart'].forEach(evt=>{
  document.addEventListener(evt, e=>{
    if(e.target && e.target.id === 'declineReason') e.stopPropagation();
  }, true);
});

/* ---------------- start ---------------- */
document.getElementById('cfDate').textContent = fmtDate(q.date);
renderDecisionPage();
wireBook();
window.dcQuote = {
  get book(){ return book; },
  get busy(){ return !!(signModal || zoomView); }
};
emit('dcq:ready');
})();
