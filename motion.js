/* Widemp – animasi & mode gelap bersama (Keuangan & Pemantau Proyek) */
(function () {
  'use strict';
  const KEY = 'wd_theme';
  const root = document.documentElement;
  const pref = () => { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } };
  function apply(t) {
    root.setAttribute('data-theme', t);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t === 'dark' ? '#0b0b0b' : '#ececeb');
    document.querySelectorAll('.wd-theme').forEach((b) => { b.innerHTML = t === 'dark' ? SUN : MOON; b.title = t === 'dark' ? 'Mode terang' : 'Mode gelap'; });
  }
  const MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  apply(pref());
  function toggle(ev) {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    const x = ev && ev.clientX != null ? ev.clientX : innerWidth - 40, y = ev && ev.clientY != null ? ev.clientY : 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return; }
    const vt = document.startViewTransition(() => apply(next));
    vt.ready.then(() => root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
      { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  }
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(pref()); });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.wd-theme'); if (b) { e.preventDefault(); toggle(e); } });

  /* angka berhitung naik: “Rp12.345.678”, “75%”, “12” */
  function countUp(el) {
    if (el.dataset.wdc) return; el.dataset.wdc = '1';
    const txt = el.textContent; const m = txt.match(/-?[\d.]+(?:,\d+)?/);
    if (!m) return;
    const raw = m[0], isDot = /\.\d{3}/.test(raw), val = parseFloat(isDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.'));
    if (!isFinite(val) || Math.abs(val) < 2) return;
    const dec = (raw.split(',')[1] || '').length, pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length);
    const fmt = (v) => (isDot || Math.abs(val) >= 1000 ? v.toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec).replace('.', ','));
    const t0 = performance.now(), D = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(val * e) + post; if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  }
  /* animasi masuk saat pindah halaman */
  let lastKey = '';
  function animateView(view) {
    const key = (location.hash || '') + '|' + ((view.querySelector('h1,h2,.wd-greet') || {}).textContent || '').slice(0, 40);
    if (key === lastKey) return; lastKey = key;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const blocks = []; const pick = (el) => { if (el.classList.contains('grid') || el.classList.contains('cols') || /^grid|kan/.test(el.className)) [...el.children].forEach((c) => blocks.push(c)); else blocks.push(el); };
    [...view.children].forEach(pick);
    blocks.slice(0, 24).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.remove('wd-in'); void el.offsetWidth; el.classList.add('wd-in'); });
    view.querySelectorAll('.kpi .v, .kpi b, .wd-count').forEach(countUp);
    view.querySelectorAll('.wd-hero .h-bar i[data-w]').forEach((b) => requestAnimationFrame(() => requestAnimationFrame(() => { b.style.width = b.dataset.w; })));
  }
  function watch() {
    const view = document.getElementById('view'); if (!view) return;
    new MutationObserver(() => animateView(view)).observe(view, { childList: true });
    if (view.children.length) animateView(view);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  window.WDMotion = { toggle, apply, countUp, greet: () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; } };
})();
