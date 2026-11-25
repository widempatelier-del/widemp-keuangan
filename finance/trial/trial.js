/* WIDEMP FINANCE — edisi trial: kode akses + masa berlaku (diatur dari akses.json), banner, unggah logo */
(function () {
  'use strict';
  const WA = '6282251613598';
  const KEY_CODE = 'wft_code', KEY_OK = 'wft_access';
  const buyUrl = (ctx) => `https://wa.me/${WA}?text=${encodeURIComponent('Halo, saya sedang mencoba WIDEMP FINANCE (trial) dan ingin info versi lengkapnya.' + (ctx ? '\n\n(' + ctx + ')' : ''))}`;
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  window.TrialBuyUrl = buyUrl;
  window.WF_EDITION = 'trial';

  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s).trim().toUpperCase()));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function deadline(e) {
    const v = e && typeof e.aktif_sampai === 'string' ? e.aktif_sampai.trim() : '';
    let m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/);
    if (m) return new Date(`${m[1]}T${m[2]}:${m[3]}:00+07:00`).getTime();
    m = v.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m) return new Date(`${m[1]}T00:00:00+07:00`).getTime() + 86400000;
    return null;
  }
  const fmtDeadline = (e) => {
    const d = deadline(e); if (d == null) return '';
    const x = new Date(d - (/T/.test(e.aktif_sampai) ? 0 : 1));
    const w = new Date(x.getTime() + 7 * 3600000); // tampilkan dalam WIB
    return `${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} ${w.getUTCFullYear()}` + (/T/.test(e.aktif_sampai) ? ` ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB` : '');
  };
  const valid = (e) => !!e && e.aktif !== false && (deadline(e) == null || Date.now() < deadline(e));

  /* ---------- layar kunci ---------- */
  let box = null;
  function screen(html) {
    const put = () => {
      if (!box) { box = document.createElement('div'); box.id = 'wftGate'; box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#f1eee9;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Montserrat,system-ui,sans-serif;color:#1f1d1a;text-align:center;overflow:auto'; document.body.appendChild(box); }
      box.innerHTML = `<div style="max-width:420px;width:100%"><img src="assets/logo-mark.png" alt="" style="height:50px;margin-bottom:12px"><div style="letter-spacing:.22em;font-weight:600;font-size:15px;margin-bottom:22px">WIDEMP FINANCE</div>${html}</div>`;
      document.documentElement.style.overflow = 'hidden';
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put, { once: true });
  }
  const waBtn = (t) => `<a href="${buyUrl(t)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;color:#1f7a4d;font-weight:600">Hubungi via WhatsApp</a>`;
  function askCode(err) {
    screen(`<h1 style="font-size:22px;margin:0 0 8px">Masuk versi trial</h1>
      <p style="color:#6e6a63;margin:0 0 18px">Masukkan kode trial yang Anda terima.</p>
      <form id="wftForm"><input id="wftCode" autocomplete="off" autocapitalize="characters" placeholder="Contoh: WF-XXXX-XXXX" style="width:100%;font:inherit;font-size:17px;padding:12px 14px;border:1px solid #dcd6cc;border-radius:10px;text-align:center;letter-spacing:.08em">
      ${err ? `<div style="color:#9b5a3c;font-size:14px;margin-top:10px">${esc(err)}</div>` : ''}
      <button style="margin-top:14px;width:100%;background:#4a5034;color:#fff;border:0;border-radius:10px;padding:13px;font:inherit;font-weight:600;font-size:16px">Masuk</button></form>${waBtn('minta kode trial')}`);
    setTimeout(() => {
      const f = document.getElementById('wftForm'); if (!f) return;
      f.onsubmit = (ev) => { ev.preventDefault(); const c = document.getElementById('wftCode').value.trim(); if (c) { localStorage.setItem(KEY_CODE, c.toUpperCase()); check(true); } };
      document.getElementById('wftCode').focus();
    }, 30);
  }
  function ended(e, msg) {
    screen(`<h1 style="font-size:22px;margin:0 0 10px">Masa trial telah berakhir</h1>
      <p style="color:#6e6a63;margin:0 0 6px">${esc(msg || 'Terima kasih sudah mencoba WIDEMP FINANCE. Data Anda tetap aman di Google Drive akun Anda dan bisa dilanjutkan di versi lengkap.')}</p>
      ${waBtn('trial berakhir' + (e && e.nama ? ' - ' + e.nama : ''))}
      <div><button id="wftOther" style="margin-top:16px;background:none;border:0;color:#6e6a63;text-decoration:underline;font:inherit;cursor:pointer">Pakai kode lain</button></div>`);
    setTimeout(() => { const b = document.getElementById('wftOther'); if (b) b.onclick = () => { localStorage.removeItem(KEY_CODE); localStorage.removeItem(KEY_OK); askCode(); }; }, 30);
  }
  function open(e) {
    if (box) { box.remove(); box = null; } document.documentElement.style.overflow = '';
    const b = document.getElementById('wftBar'); if (b) b.querySelector('.wft-until').textContent = e && deadline(e) != null ? 'berlaku sampai ' + fmtDeadline(e) : 'masa trial';
  }

  let timer = null;
  function apply(e, msg) {
    clearTimeout(timer);
    if (valid(e)) {
      open(e);
      const d = deadline(e); if (d != null && d - Date.now() < 2147483000) timer = setTimeout(() => apply(e, msg), d - Date.now() + 500);
    } else ended(e, msg);
  }

  async function check(fromForm) {
    const code = localStorage.getItem(KEY_CODE);
    if (!code) { askCode(); return; }
    let data;
    try {
      const r = await fetch(`akses.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('status ' + r.status);
      data = await r.json();
    } catch (err) {
      // offline: pakai status terakhir yang diketahui
      let last = null; try { last = JSON.parse(localStorage.getItem(KEY_OK)); } catch (e) { /* abaikan */ }
      if (last) apply(last); else if (fromForm) askCode('Perlu internet untuk memeriksa kode pertama kali.');
      return;
    }
    const e = (data.kode || {})[await sha(code)];
    if (!e) { localStorage.removeItem(KEY_OK); localStorage.removeItem(KEY_CODE); askCode(fromForm ? 'Kode tidak dikenali. Periksa lagi atau hubungi kami.' : 'Kode trial tidak berlaku lagi.'); return; }
    localStorage.setItem(KEY_OK, JSON.stringify(e));
    apply(e, data.pesan_berakhir);
  }

  // tampilkan status terakhir dulu (tanpa kedip), lalu periksa
  (function () {
    let last = null; try { last = JSON.parse(localStorage.getItem(KEY_OK)); } catch (e) { /* abaikan */ }
    if (!localStorage.getItem(KEY_CODE)) askCode(); else if (last && !valid(last)) ended(last); else if (!last) screen('<p style="color:#6e6a63">Memeriksa kode trial…</p>');
    check(false);
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(false); });
  setInterval(() => check(false), 5 * 60 * 1000);

  /* ---------- banner trial ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div'); b.id = 'wftBar'; b.className = 'demo-bar';
    b.innerHTML = `<div class="demo-in"><span><b>TRIAL</b> · <span class="wft-until">masa trial</span> · data tersimpan di Google Drive akun Anda.</span>
      <span class="demo-act"><a class="btn sm primary" target="_blank" rel="noopener" href="${buyUrl('dari banner trial')}">Beli WIDEMP FINANCE</a></span></div>`;
    document.querySelector('header.top').after(b);
  });

  /* ---------- logo usaha untuk PDF ---------- */
  async function deflate(bytes) {
    if (!window.CompressionStream) throw new Error('Browser ini belum mendukung; pakai Chrome atau Edge terbaru');
    const cs = new CompressionStream('deflate');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  window.TrialMakeLogo = async function (file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibaca')); i.src = URL.createObjectURL(file); });
    const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3), al = new Uint8Array(w * h);
    for (let i = 0, j = 0, k = 0; i < px.length; i += 4, j += 3, k++) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; al[k] = px[i + 3]; }
    return { w, h, rgb: await deflate(rgb), alpha: await deflate(al) };
  };
})();
