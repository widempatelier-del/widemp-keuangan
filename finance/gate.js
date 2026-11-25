/* Saklar jarak jauh situs demo WIDEMP FINANCE.
   Membaca status.json: { "aktif": true/false, "aktif_sampai": "YYYY-MM-DD" atau "YYYY-MM-DDTHH:MM" (WIB), "pesan": "..." } */
(function () {
  'use strict';
  const me = document.currentScript, BASE = (me && me.dataset.base) || '';
  const KEY = 'wfd_gate', WA = '6282251613598';
  // aktif_sampai: "2026-12-31" (tutup setelah tanggal itu) atau "2026-11-25T14:30" (tutup pada jam itu), waktu WIB
  function deadline(c) {
    const v = c && typeof c.aktif_sampai === 'string' ? c.aktif_sampai.trim() : '';
    let m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/);
    if (m) return new Date(`${m[1]}T${m[2]}:${m[3]}:00+07:00`).getTime();
    m = v.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m) return new Date(`${m[1]}T00:00:00+07:00`).getTime() + 86400000;
    return null;
  }
  const isOff = (c) => { if (!c) return false; if (c.aktif === false) return true; const d = deadline(c); return d != null && Date.now() >= d; };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

  let box = null;
  function show(c) {
    if (!document.body) return document.addEventListener('DOMContentLoaded', () => show(c), { once: true });
    if (!box) {
      box = document.createElement('div'); box.id = 'wfdGate';
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#f1eee9;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Montserrat,system-ui,sans-serif;color:#1f1d1a;text-align:center';
      document.body.appendChild(box);
    }
    const msg = c.pesan || 'Demo sedang ditutup sementara. Hubungi kami lewat WhatsApp untuk mencoba atau membeli WIDEMP FINANCE.';
    const wa = `https://wa.me/${WA}?text=${encodeURIComponent('Halo, saya ingin mencoba / membeli WIDEMP FINANCE. Demo di situs sedang ditutup.')}`;
    box.innerHTML = `<div style="max-width:440px"><img src="${BASE}app/assets/logo-mark.png" alt="" style="height:54px;margin-bottom:14px">
      <div style="letter-spacing:.22em;font-weight:600;font-size:15px;margin-bottom:22px">WIDEMP FINANCE</div>
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">Demo sedang tidak aktif</h1>
      <p style="color:#6e6a63;margin:0 0 24px;line-height:1.6">${esc(msg)}</p>
      <a href="${wa}" target="_blank" rel="noopener" style="display:inline-block;background:#1f7a4d;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px">Hubungi via WhatsApp</a></div>`;
    document.documentElement.style.overflow = 'hidden';
  }
  function hide() { if (box) { box.remove(); box = null; } document.documentElement.style.overflow = ''; }
  let timer = null;
  function apply(c) {
    if (isOff(c)) show(c); else hide();
    // tutup tepat pada jamnya walau halaman sedang terbuka
    clearTimeout(timer); const d = deadline(c);
    if (d != null && Date.now() < d && d - Date.now() < 2147483000) timer = setTimeout(() => apply(c), d - Date.now() + 500);
  }

  // pakai status terakhir dulu supaya tidak sempat terlihat, lalu periksa yang terbaru
  try { apply(JSON.parse(localStorage.getItem(KEY))); } catch (e) { /* abaikan */ }
  function check() {
    fetch(`${BASE}status.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status ' + r.status))))
      .then((c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* abaikan */ } apply(c); })
      .catch(() => { /* offline: tetap pakai status terakhir */ });
  }
  check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
})();
