/* Widemp Keuangan — antarmuka & penyimpanan lokal (IndexedDB) */
(() => {
  'use strict';
  const C = window.Core, DS = window.DriveSync;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = C.fmtRp;
  const fmtDate = (d) => { if (!d) return '-'; const [y, m, dd] = d.split('-'); return `${Number(dd)} ${C.BULAN[Number(m) - 1]} ${y}`; };
  const short = (n) => { const a = Math.abs(n); const s = n < 0 ? '-' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(1).replace('.', ',') + ' M' : a >= 1e6 ? s + (a / 1e6).toFixed(1).replace('.', ',') + ' jt' : a >= 1e3 ? s + Math.round(a / 1e3) + ' rb' : s + a; };
  const fmtMoneyInput = (v) => { const n = C.parseNum(v); return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''; };

  /* ---------------- Penyimpanan lokal ---------------- */
  const R = new Map();
  let db = null;
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open('widemp-keuangan', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idbPut = (recs) => new Promise((res, rej) => {
    const tx = db.transaction('records', 'readwrite'); const st = tx.objectStore('records');
    recs.forEach((r) => st.put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const idbAll = () => new Promise((res, rej) => {
    const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  const all = () => [...R.values()];
  const of = (type) => C.live(all(), type);

  async function save(type, data) {
    const rec = Object.assign({}, data, { id: data.id || C.uid(), type, updatedAt: Date.now() });
    R.set(rec.id, rec); await idbPut([rec]); queueSync(); return rec;
  }
  async function del(id) {
    const rec = Object.assign({}, R.get(id), { deleted: true, updatedAt: Date.now() });
    R.set(id, rec); await idbPut([rec]); queueSync();
  }
  async function applyMerged(records) {
    const changed = [];
    for (const r of records) { const cur = R.get(r.id); if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { R.set(r.id, r); changed.push(r); } }
    if (changed.length) await idbPut(changed);
    render();
  }

  const DEFAULT_CATS = {
    in: ['Pembayaran proyek', 'Jasa konsultasi', 'Lainnya'],
    out: ['Gaji & honor', 'Transportasi', 'Material', 'Tukang / subkon', 'Software & langganan', 'Operasional kantor', 'Pajak', 'Lainnya'],
  };
  // Seed pakai id tetap & updatedAt 0 agar tidak menimpa data asli dan tidak dobel antar perangkat.
  async function seed() {
    const seeds = [];
    const add = (r) => { if (!R.has(r.id)) { R.set(r.id, r); seeds.push(r); } };
    add({ id: 'config', type: 'config', updatedAt: 0, businessName: 'Widemp Atelier', cats: DEFAULT_CATS });
    add({ id: 'acc-bank', type: 'account', updatedAt: 0, name: 'Rekening bank', scope: 'usaha', opening: 0 });
    add({ id: 'acc-cash', type: 'account', updatedAt: 0, name: 'Kas tunai', scope: 'usaha', opening: 0 });
    if (seeds.length) await idbPut(seeds);
  }
  const cfg = () => R.get('config') || { businessName: 'Widemp Atelier', cats: DEFAULT_CATS };
  const cats = (kind) => (cfg().cats && cfg().cats[kind]) || DEFAULT_CATS[kind];

  /* ---------------- UI state ---------------- */
  const ui = { tab: 'dash', pid: null, month: C.monthKey(C.isoDate()), kind: '', q: '' };
  const view = $('#view'), sheet = $('#sheet');
  const byId = (id) => R.get(id);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function openSheet(html) { sheet.innerHTML = html; if (!sheet.open) sheet.showModal(); setTimeout(() => { const f = sheet.querySelector('input:not([type=hidden]),select'); if (f && !f.value && !sheet.contains(document.activeElement)) f.focus(); }, 50); }
  const closeSheet = () => { if (sheet.open) sheet.close(); };
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  /* ---------------- Render ---------------- */
  function render() {
    $('#biz').firstChild.textContent = cfg().businessName || 'Widemp Atelier';
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const fn = { dash: vDash, proj: ui.pid ? vProjectDetail : vProjects, cash: vCash, set: vSettings }[ui.tab];
    const keepScroll = window.scrollY;
    view.innerHTML = fn();
    window.scrollTo(0, keepScroll);
    paintSync();
  }

  const accName = (id) => (byId(id) && byId(id).name) || '(akun dihapus)';
  const projName = (id) => (byId(id) && !byId(id).deleted ? byId(id).name : '');
  const statusBadge = (t, today) => {
    if (t.remaining <= 0 && t.amount > 0) return '<span class="badge ok">Lunas</span>';
    if (t.billed) return t.dueDate && t.dueDate < today ? '<span class="badge late">Terlambat</span>' : '<span class="badge bill">Ditagih</span>';
    return '<span class="badge">Belum ditagih</span>';
  };

  /* ----- Ringkasan ----- */
  function vDash() {
    const accounts = of('account'), txs = of('tx'), projects = of('project'), terms = of('term');
    const today = C.isoDate(), mk = C.monthKey(today);
    const bal = C.balances(accounts, txs).filter((a) => a.scope !== 'pribadi');
    const saldo = bal.reduce((s, a) => s + a.balance, 0);
    const mt = C.monthTotals(accounts, txs, mk);
    const pi = C.piutangList(projects, terms, txs, today);
    const piTotal = pi.reduce((s, i) => s + i.remaining, 0);
    const series = C.monthlySeries(accounts, txs, 6);
    const active = projects.filter((p) => p.status === 'aktif');

    const sumOf = (p) => C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs);
    return `
    <div class="grid g4">
      <div class="stat"><div class="l">Saldo kas usaha</div><div class="v">${rp(saldo)}</div></div>
      <div class="stat"><div class="l">Piutang (ditagih)</div><div class="v ${piTotal ? 'warn' : ''}">${rp(piTotal)}</div></div>
      <div class="stat"><div class="l">Masuk bulan ini</div><div class="v in">${rp(mt.in)}</div></div>
      <div class="stat"><div class="l">Keluar bulan ini</div><div class="v out">${rp(mt.out)}</div></div>
    </div>
    <h2>Arus kas 6 bulan</h2>
    <div class="card">${chart(series)}</div>
    <div class="cols"><div>
      <h2>Piutang termin</h2>
      <div class="card">${pi.length ? pi.map((i) => `
        <div class="row click" data-act="open-project" data-id="${i.project.id}">
          <div class="grow"><div class="t">${esc(i.project.name)} · ${esc(i.term.label)}</div>
          <div class="s">Jatuh tempo ${fmtDate(i.term.dueDate)} ${i.overdue ? '<span class="badge late">Terlambat</span>' : ''}</div></div>
          <div class="amt">${rp(i.remaining)}</div></div>`).join('') : '<div class="empty">Tidak ada termin yang menunggu pembayaran.</div>'}</div>
    </div><div>
      <h2>Proyek aktif</h2>
      <div class="card">${active.length ? active.map((p) => { const s = sumOf(p); const pct = s.contract ? Math.min(100, Math.round((s.received / s.contract) * 100)) : 0; return `
        <div class="row click" data-act="open-project" data-id="${p.id}">
          <div class="grow"><div class="t">${esc(p.name)}</div>
          <div class="s">Diterima ${rp(s.received)} dari ${rp(s.contract)} (${pct}%)</div>
          <div class="bar"><i style="width:${pct}%"></i></div></div></div>`; }).join('') : '<div class="empty">Belum ada proyek aktif.</div>'}</div>
    </div></div>`;
  }

  function chart(series) {
    const max = Math.max(1, ...series.flatMap((s) => [s.in, s.out]));
    const W = 320, H = 150, pad = 22, bw = 14, gap = (W - pad) / series.length;
    let g = '';
    series.forEach((s, i) => {
      const x = pad + i * gap + (gap - bw * 2 - 3) / 2;
      const hi = (s.in / max) * (H - 40), ho = (s.out / max) * (H - 40);
      g += `<rect x="${x}" y="${H - 20 - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--in)"><title>${s.label}: masuk ${rp(s.in)}</title></rect>
            <rect x="${x + bw + 3}" y="${H - 20 - ho}" width="${bw}" height="${ho}" rx="3" fill="var(--out)"><title>${s.label}: keluar ${rp(s.out)}</title></rect>
            <text x="${x + bw + 1.5}" y="${H - 6}" text-anchor="middle">${s.label}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Pemasukan dan pengeluaran 6 bulan terakhir">
      <line x1="${pad}" y1="${H - 20}" x2="${W}" y2="${H - 20}" stroke="var(--line)"/>
      <text x="0" y="12">${short(max)}</text>${g}</svg>
      <div class="legend"><span><i style="background:var(--in)"></i>Masuk</span><span><i style="background:var(--out)"></i>Keluar</span></div>`;
  }

  /* ----- Proyek ----- */
  function vProjects() {
    const projects = of('project').sort((a, b) => (a.status === 'aktif' ? 0 : 1) - (b.status === 'aktif' ? 0 : 1) || (b.createdAt || 0) - (a.createdAt || 0));
    const terms = of('term'), txs = of('tx'), today = C.isoDate();
    return `<h2>Proyek</h2>` + (projects.length ? projects.map((p) => {
      const s = C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs);
      const next = s.sched.find((t) => t.remaining > 0);
      const pct = s.contract ? Math.min(100, Math.round((s.received / s.contract) * 100)) : 0;
      return `<div class="card click" data-act="open-project" data-id="${p.id}" style="cursor:pointer">
        <div class="row" style="border:0;padding:0"><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.client || 'Tanpa klien')}</div></div>
        <span class="badge ${p.status === 'aktif' ? 'bill' : ''}">${esc(p.status)}</span></div>
        <div class="s" style="margin-top:8px">Kontrak ${rp(s.contract)} · diterima ${rp(s.received)}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${next ? `<div class="s" style="margin-top:6px">Berikutnya: ${esc(next.label)} ${rp(next.remaining)} ${statusBadge(next, today)}</div>` : ''}</div>`;
    }).join('') : '<div class="empty">Belum ada proyek.<br>Ketuk + untuk membuat proyek pertama.</div>') +
      `<button class="fab" data-act="new-project" aria-label="Proyek baru">+</button>`;
  }

  function vProjectDetail() {
    const p = byId(ui.pid);
    if (!p || p.deleted) { ui.pid = null; return vProjects(); }
    const terms = of('term').filter((t) => t.projectId === p.id), allTx = of('tx');
    const s = C.projectSummary(p, terms, allTx), today = C.isoDate();
    const ptx = allTx.filter((t) => t.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
    const pctSum = s.sched.reduce((x, t) => x + (Number(t.percent) || 0), 0);
    return `
    <div class="actions" style="margin-top:0"><button class="btn sm" data-act="back">← Proyek</button><button class="btn sm" data-act="edit-project" data-id="${p.id}">Ubah</button></div>
    <h2 style="margin-top:0">${esc(p.name)} <span class="badge">${esc(p.status)}</span></h2>
    <div class="muted" style="margin-bottom:10px">${esc(p.client || 'Tanpa klien')}${p.note ? ' · ' + esc(p.note) : ''}</div>
    <div class="grid g4">
      <div class="stat"><div class="l">Nilai kontrak</div><div class="v">${rp(s.contract)}</div></div>
      <div class="stat"><div class="l">Diterima</div><div class="v in">${rp(s.received)}</div></div>
      <div class="stat"><div class="l">Belum diterima</div><div class="v">${rp(s.remaining)}</div></div>
      <div class="stat"><div class="l">Biaya proyek</div><div class="v out">${rp(s.expense)}</div></div>
    </div>
    <div class="stat" style="margin-top:10px"><div class="l">Laba kasar (diterima − biaya)</div><div class="v ${s.profit < 0 ? 'out' : ''}">${rp(s.profit)}</div></div>
    <h2>Termin pembayaran</h2>
    <div class="card">
      ${s.sched.length ? s.sched.map((t) => `
      <div class="row" style="align-items:flex-start">
        <div class="grow"><div class="t">${esc(t.label)} · ${t.percent}% ${statusBadge(t, today)}</div>
          <div class="s">${rp(t.amount)} · dibayar ${rp(t.paid)} · jatuh tempo ${fmtDate(t.dueDate)}</div>
          <div class="actions" style="margin:6px 0 0">
            ${t.remaining > 0 ? `<button class="btn sm primary" data-act="pay-term" data-id="${t.id}">Catat pembayaran</button>` : ''}
            ${t.remaining > 0 ? `<button class="btn sm" data-act="bill-term" data-id="${t.id}">${t.billed ? 'Batal tandai ditagih' : 'Tandai ditagih'}</button>` : ''}
          </div></div><div class="amt ${t.remaining ? '' : 'in'}">${rp(t.remaining ? t.remaining : t.amount)}</div></div>`).join('') : '<div class="empty">Belum ada termin.</div>'}
      ${s.sched.length && Math.abs(pctSum - 100) > 0.001 ? `<div class="note">Total persen termin ${pctSum}%, belum 100%.</div>` : ''}
      <div class="actions"><button class="btn sm" data-act="edit-terms" data-id="${p.id}">Atur termin</button></div>
    </div>
    <h2>Transaksi proyek</h2>
    <div class="card">${ptx.length ? ptx.map(txRow).join('') : '<div class="empty">Belum ada transaksi.</div>'}
      <div class="actions"><button class="btn sm" data-act="new-tx" data-kind="out" data-project="${p.id}">Catat pengeluaran proyek</button></div></div>`;
  }

  /* ----- Kas ----- */
  function txRow(t) {
    const acc = byId(t.accountId);
    return `<div class="row click" data-act="edit-tx" data-id="${t.id}">
      <div class="grow"><div class="t">${esc(t.category || (t.kind === 'in' ? 'Pemasukan' : 'Pengeluaran'))}${acc && acc.scope === 'pribadi' ? ' <span class="badge">pribadi</span>' : ''}</div>
      <div class="s">${fmtDate(t.date)} · ${esc(accName(t.accountId))}${projName(t.projectId) ? ' · ' + esc(projName(t.projectId)) : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="amt ${t.kind === 'in' ? 'in' : 'out'}">${t.kind === 'in' ? '+' : '−'}${rp(t.amount)}</div></div>`;
  }
  function vCash() {
    const accounts = of('account');
    let txs = of('tx');
    if (ui.month) txs = txs.filter((t) => C.monthKey(t.date) === ui.month);
    if (ui.kind) txs = txs.filter((t) => t.kind === ui.kind);
    if (ui.q) { const q = ui.q.toLowerCase(); txs = txs.filter((t) => [t.category, t.note, accName(t.accountId), projName(t.projectId)].join(' ').toLowerCase().includes(q)); }
    txs.sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
    const u = C.usahaTxs(accounts, txs);
    const inn = u.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0), out = u.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
    return `<h2>Kas masuk &amp; keluar</h2>
    <div class="filters">
      <input type="month" id="fMonth" value="${esc(ui.month)}" aria-label="Bulan">
      <select id="fKind" aria-label="Jenis"><option value="">Semua</option><option value="in" ${ui.kind === 'in' ? 'selected' : ''}>Masuk</option><option value="out" ${ui.kind === 'out' ? 'selected' : ''}>Keluar</option></select>
      <input type="search" id="fQ" placeholder="Cari…" value="${esc(ui.q)}">
    </div>
    <div class="grid"><div class="stat"><div class="l">Masuk</div><div class="v in">${rp(inn)}</div></div><div class="stat"><div class="l">Keluar</div><div class="v out">${rp(out)}</div></div></div>
    <div class="card" style="margin-top:12px">${txs.length ? txs.map(txRow).join('') : '<div class="empty">Tidak ada transaksi pada filter ini.</div>'}</div>
    <div class="muted" style="font-size:12px">Akun bertanda “pribadi” tidak dihitung di total.</div>
    <button class="fab" data-act="new-tx" aria-label="Catat transaksi">+</button>`;
  }

  /* ----- Pengaturan ----- */
  function vSettings() {
    const accs = C.balances(of('account'), of('tx'));
    const c = cfg(), conn = DS.isConnected();
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return `
    <h2>Usaha</h2><div class="card">
      <label>Nama usaha (tampil di kop)</label><input id="sBiz" value="${esc(c.businessName)}">
      <div class="actions"><button class="btn sm primary" data-act="save-biz">Simpan</button></div></div>
    <h2>Akun kas</h2><div class="card">${accs.map((a) => `
      <div class="row click" data-act="edit-account" data-id="${a.id}"><div class="grow"><div class="t">${esc(a.name)} ${a.scope === 'pribadi' ? '<span class="badge">pribadi</span>' : ''}</div><div class="s">Saldo awal ${rp(a.opening)}</div></div><div class="amt">${rp(a.balance)}</div></div>`).join('')}
      <div class="actions"><button class="btn sm" data-act="new-account">+ Tambah akun</button></div></div>
    <h2>Kategori</h2><div class="card">
      <label>Pemasukan (pisahkan dengan koma)</label><textarea id="cIn" rows="2">${esc(cats('in').join(', '))}</textarea>
      <label>Pengeluaran (pisahkan dengan koma)</label><textarea id="cOut" rows="3">${esc(cats('out').join(', '))}</textarea>
      <div class="actions"><button class="btn sm primary" data-act="save-cats">Simpan kategori</button></div></div>
    <h2>Sinkron Google Drive</h2><div class="card">
      <div class="s muted">Data tersimpan di folder “Widemp Atelier” pada Drive akun Google Anda dan disamakan antar perangkat. Tanpa internet, aplikasi tetap jalan; perubahan dikirim saat online.</div>
      <label>Google OAuth Client ID</label><input id="sClient" placeholder="xxxx.apps.googleusercontent.com" value="${esc(DS.clientId())}" autocapitalize="off" autocorrect="off">
      <div class="actions">
        <button class="btn primary" data-act="drive-connect">${conn ? 'Sinkron sekarang' : 'Hubungkan Drive'}</button>
        ${conn ? '<button class="btn danger" data-act="drive-off">Putuskan</button>' : ''}</div>
      <div class="s">${DS.lastSync() ? 'Terakhir sinkron: ' + new Date(DS.lastSync()).toLocaleString('id-ID') : 'Belum pernah sinkron.'}</div>
      ${ios ? '<div class="note">iPhone: tambahkan aplikasi ke Layar Utama (Bagikan → Tambah ke Layar Utama) agar data lokal tidak dibersihkan iOS. Jika login Google gagal dari ikon Layar Utama, hubungkan sekali lewat tab Safari biasa.</div>' : ''}</div>
    <h2>Cadangan</h2><div class="card">
      <div class="s muted">Salinan data dalam satu file JSON. Impor menggabungkan, tidak menghapus data yang ada.</div>
      <div class="actions"><button class="btn" data-act="export">Ekspor JSON</button><label class="btn" style="margin:0;color:var(--ink)">Impor JSON<input type="file" id="fImport" accept="application/json,.json" hidden></label></div></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Widemp Keuangan · tahap 1 (proyek, termin, kas, ringkasan, sinkron)</div>`;
  }

  /* ---------------- Form ---------------- */
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
  const head = (t) => `<h3>${t}</h3>`;
  const foot = (extra = '') => `<div class="actions" style="margin-top:16px"><button class="btn primary" type="submit">Simpan</button><button class="btn" type="button" data-act="close">Batal</button>${extra}</div>`;

  function projectForm(p) {
    const presets = C.PRESETS.map((x, i) => opt(i, x.name, i === 0)).join('');
    openSheet(`<form data-form="project" data-id="${p ? p.id : ''}">${head(p ? 'Ubah proyek' : 'Proyek baru')}
      <label>Nama proyek</label><input name="name" required value="${esc(p ? p.name : '')}">
      <label>Klien</label><input name="client" value="${esc(p ? p.client : '')}">
      <label>Nilai kontrak (Rp)</label><input name="contract" class="money" inputmode="numeric" required value="${fmtMoneyInput(p ? p.contract : '')}">
      ${p ? `<label>Status</label><select name="status">${['aktif', 'selesai', 'batal'].map((s) => opt(s, s, p.status === s)).join('')}</select>` : `<label>Skema termin</label><select name="preset">${presets}</select>`}
      <label>Catatan</label><input name="note" value="${esc(p ? p.note : '')}">
      ${foot(p ? '<button class="btn danger" type="button" data-act="del-project" data-id="' + p.id + '">Hapus</button>' : '')}</form>`);
  }

  function termRow(t = {}) {
    return `<div class="termrow" data-tid="${t.id || ''}"><input name="label" placeholder="Nama" value="${esc(t.label || '')}">
      <input name="percent" inputmode="decimal" placeholder="%" value="${t.percent != null ? t.percent : ''}">
      <input name="due" type="date" value="${esc(t.dueDate || '')}"><button class="btn sm danger" type="button" data-act="rm-term">✕</button></div>`;
  }
  function termsForm(p) {
    const rows = C.scheduleAmounts(p, of('term').filter((t) => t.projectId === p.id));
    openSheet(`<form data-form="terms" data-id="${p.id}">${head('Atur termin')}
      <div class="muted s">Nilai kontrak ${rp(p.contract)}. Total persen harus 100%.</div>
      <label>Isi dari skema</label><select id="tPreset"><option value="">— pilih untuk mengganti —</option>${C.PRESETS.map((x, i) => opt(i, x.name)).join('')}</select>
      <div id="tRows" style="margin-top:10px">${rows.map(termRow).join('')}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="add-term">+ Termin</button><span class="s" id="tSum"></span></div>${foot()}</form>`);
    updTermSum();
  }
  function updTermSum() {
    const el = $('#tSum'); if (!el) return;
    const sum = [...sheet.querySelectorAll('.termrow [name=percent]')].reduce((s, i) => s + (parseFloat(String(i.value).replace(',', '.')) || 0), 0);
    el.textContent = 'Total ' + (Math.round(sum * 100) / 100) + '%'; el.className = 's ' + (Math.abs(sum - 100) < 0.001 ? 'in' : 'out');
  }

  function accountOptions(sel) { return of('account').map((a) => opt(a.id, a.name + (a.scope === 'pribadi' ? ' (pribadi)' : ''), a.id === sel)).join(''); }

  function txForm(t, preset = {}) {
    const kind = (t && t.kind) || preset.kind || 'in';
    const tx = t || {};
    openSheet(`<form data-form="tx" data-id="${tx.id || ''}">${head(t ? 'Ubah transaksi' : 'Catat transaksi')}
      <input type="hidden" name="kind" value="${kind}">
      <div class="seg" style="margin-top:8px"><button type="button" data-act="kind" data-k="in" class="${kind === 'in' ? 'on in' : ''}">Masuk</button><button type="button" data-act="kind" data-k="out" class="${kind === 'out' ? 'on out' : ''}">Keluar</button></div>
      <label>Tanggal</label><input type="date" name="date" required value="${esc(tx.date || C.isoDate())}">
      <label>Jumlah (Rp)</label><input name="amount" class="money" inputmode="numeric" required value="${fmtMoneyInput(tx.amount)}">
      <label>Kategori</label><select name="category"></select>
      <label>Akun</label><select name="accountId">${accountOptions(tx.accountId || 'acc-bank')}</select>
      <label>Proyek (opsional)</label><select name="projectId"><option value="">— tanpa proyek —</option>${of('project').map((p) => opt(p.id, p.name, p.id === (tx.projectId || preset.projectId))).join('')}</select>
      <div id="termWrap"><label>Untuk termin</label><select name="termId"></select></div>
      <label>Catatan</label><input name="note" value="${esc(tx.note || '')}">
      ${foot(t ? '<button class="btn danger" type="button" data-act="del-tx" data-id="' + tx.id + '">Hapus</button>' : '')}</form>`);
    const f = sheet.querySelector('form'); f.dataset.cat = tx.category || ''; f.dataset.term = tx.termId || '';
    refreshTx(f);
  }
  function refreshTx(f) {
    const kind = f.kind.value, catSel = f.category, cur = f.dataset.cat || catSel.value;
    const list = cats(kind).slice(); if (cur && !list.includes(cur)) list.push(cur);
    catSel.innerHTML = list.map((c) => opt(c, c, c === cur)).join('');
    const wrap = $('#termWrap', f), pid = f.projectId.value;
    wrap.hidden = !(kind === 'in' && pid);
    if (!wrap.hidden) {
      const p = byId(pid), s = C.projectSummary(p, of('term').filter((t) => t.projectId === pid), of('tx'));
      const keep = f.termId.value || f.dataset.term;
      f.termId.innerHTML = '<option value="">— tidak terkait termin —</option>' + s.sched.filter((t) => t.remaining > 0 || t.id === keep).map((t) => opt(t.id, `${t.label} (sisa ${rp(t.remaining)})`, t.id === keep)).join('');
    } else f.termId.innerHTML = '';
    f.dataset.cat = '';
  }

  function payForm(term) {
    const p = byId(term.projectId);
    const s = C.projectSummary(p, of('term').filter((t) => t.projectId === p.id), of('tx')).sched.find((t) => t.id === term.id);
    openSheet(`<form data-form="pay" data-id="${term.id}">${head('Catat pembayaran')}
      <div class="muted s">${esc(p.name)} · ${esc(term.label)} · sisa ${rp(s.remaining)}</div>
      <label>Tanggal diterima</label><input type="date" name="date" required value="${C.isoDate()}">
      <label>Jumlah (Rp)</label><input name="amount" class="money" inputmode="numeric" required value="${fmtMoneyInput(s.remaining)}">
      <label>Masuk ke akun</label><select name="accountId">${accountOptions('acc-bank')}</select>
      <label>Catatan</label><input name="note" placeholder="mis. transfer BCA">${foot()}</form>`);
  }

  function accountForm(a) {
    openSheet(`<form data-form="account" data-id="${a ? a.id : ''}">${head(a ? 'Ubah akun' : 'Akun baru')}
      <label>Nama akun</label><input name="name" required value="${esc(a ? a.name : '')}">
      <label>Lingkup</label><select name="scope">${opt('usaha', 'Usaha', !a || a.scope !== 'pribadi')}${opt('pribadi', 'Pribadi (tidak masuk laporan usaha)', a && a.scope === 'pribadi')}</select>
      <label>Saldo awal (Rp)</label><input name="opening" class="money" inputmode="numeric" value="${fmtMoneyInput(a ? a.opening : '')}">
      ${foot(a ? '<button class="btn danger" type="button" data-act="del-account" data-id="' + a.id + '">Hapus</button>' : '')}</form>`);
  }

  /* ---------------- Submit form ---------------- */
  sheet.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f)), id = f.dataset.id || undefined, kind = f.dataset.form;
    try {
      if (kind === 'project') {
        const old = id ? byId(id) : null;
        const p = await save('project', Object.assign({}, old, { id, name: d.name.trim(), client: d.client.trim(), contract: C.parseNum(d.contract), note: d.note.trim(), status: d.status || (old && old.status) || 'aktif', createdAt: (old && old.createdAt) || Date.now() }));
        if (!old) {
          const pcts = C.PRESETS[Number(d.preset) || 0].percents, labels = C.makeTermLabels(pcts);
          for (let i = 0; i < pcts.length; i++) await save('term', { projectId: p.id, no: i + 1, label: labels[i], percent: pcts[i], billed: false, dueDate: '' });
          ui.pid = p.id; history.pushState({ pid: p.id }, '');
        }
      } else if (kind === 'terms') {
        const rows = [...f.querySelectorAll('.termrow')].map((r) => ({ tid: r.dataset.tid, label: r.querySelector('[name=label]').value.trim(), percent: parseFloat(r.querySelector('[name=percent]').value.replace(',', '.')) || 0, due: r.querySelector('[name=due]').value }));
        const sum = rows.reduce((s, r) => s + r.percent, 0);
        if (!rows.length || Math.abs(sum - 100) > 0.001) return toast('Total persen harus 100% (sekarang ' + sum + '%)');
        if (rows.some((r) => !r.label)) return toast('Nama termin tidak boleh kosong');
        const txs = of('tx'), keep = new Set(rows.map((r) => r.tid).filter(Boolean));
        const dropped = of('term').filter((t) => t.projectId === id && !keep.has(t.id));
        if (dropped.some((t) => C.paidFor(txs, t.id) > 0)) return toast('Termin yang sudah ada pembayarannya tidak bisa dihapus');
        for (const t of dropped) await del(t.id);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i], old = r.tid ? byId(r.tid) : null;
          await save('term', Object.assign({}, old, { id: r.tid || undefined, projectId: id, no: i + 1, label: r.label, percent: r.percent, dueDate: r.due, billed: old ? !!old.billed : false }));
        }
      } else if (kind === 'tx') {
        const amount = C.parseNum(d.amount); if (!amount) return toast('Jumlah belum diisi');
        const old = id ? byId(id) : null;
        await save('tx', Object.assign({}, old, { id, kind: d.kind, date: d.date, amount, category: d.category, accountId: d.accountId, projectId: d.projectId || '', termId: d.kind === 'in' && d.projectId ? d.termId || '' : '', note: d.note.trim() }));
        if (d.kind === 'in' && d.termId) await markBilled(d.termId);
      } else if (kind === 'pay') {
        const term = byId(id), amount = C.parseNum(d.amount); if (!amount) return toast('Jumlah belum diisi');
        await save('tx', { kind: 'in', date: d.date, amount, category: 'Pembayaran proyek', accountId: d.accountId, projectId: term.projectId, termId: term.id, note: (d.note.trim() ? d.note.trim() + ' · ' : '') + term.label });
        await markBilled(term.id);
      } else if (kind === 'account') {
        const old = id ? byId(id) : null;
        await save('account', Object.assign({}, old, { id, name: d.name.trim(), scope: d.scope, opening: C.parseNum(d.opening) }));
      }
      closeSheet(); render(); toast('Tersimpan');
    } catch (err) { console.error(err); toast('Gagal menyimpan: ' + err.message); }
  });
  async function markBilled(termId) {
    const t = byId(termId); if (t && !t.billed) await save('term', Object.assign({}, t, { billed: true, billedDate: C.isoDate() }));
  }

  /* ---------------- Klik & input ---------------- */
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('#tabs button');
    if (tab) { ui.tab = tab.dataset.tab; ui.pid = null; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id;
    switch (a) {
      case 'close': closeSheet(); break;
      case 'open-project': ui.tab = 'proj'; ui.pid = id; history.pushState({ pid: id }, ''); render(); window.scrollTo(0, 0); break;
      case 'back': history.back(); break;
      case 'new-project': projectForm(null); break;
      case 'edit-project': projectForm(byId(id)); break;
      case 'del-project': {
        if (of('tx').some((t) => t.projectId === id)) return toast('Proyek punya transaksi. Ubah statusnya menjadi “batal”.');
        if (!confirm('Hapus proyek ini beserta termin-nya?')) return;
        for (const t of of('term').filter((t) => t.projectId === id)) await del(t.id);
        await del(id); closeSheet(); ui.pid = null; render(); break;
      }
      case 'edit-terms': termsForm(byId(id)); break;
      case 'add-term': $('#tRows').insertAdjacentHTML('beforeend', termRow()); updTermSum(); break;
      case 'rm-term': el.closest('.termrow').remove(); updTermSum(); break;
      case 'pay-term': payForm(byId(id)); break;
      case 'bill-term': { const t = byId(id); await save('term', Object.assign({}, t, { billed: !t.billed, billedDate: t.billed ? '' : C.isoDate() })); render(); break; }
      case 'new-tx': txForm(null, { kind: el.dataset.kind, projectId: el.dataset.project }); break;
      case 'edit-tx': txForm(byId(id)); break;
      case 'del-tx': if (confirm('Hapus transaksi ini?')) { await del(id); closeSheet(); render(); toast('Dihapus'); } break;
      case 'kind': { const f = el.closest('form'); f.kind.value = el.dataset.k; f.category.innerHTML = ''; f.querySelectorAll('.seg button').forEach((b) => { b.className = b.dataset.k === el.dataset.k ? 'on ' + b.dataset.k : ''; }); refreshTx(f); break; }
      case 'new-account': accountForm(null); break;
      case 'edit-account': accountForm(byId(id)); break;
      case 'del-account':
        if (of('tx').some((t) => t.accountId === id)) return toast('Akun sudah dipakai transaksi, tidak bisa dihapus');
        if (confirm('Hapus akun ini?')) { await del(id); closeSheet(); render(); } break;
      case 'save-biz': await save('config', Object.assign({}, cfg(), { id: 'config', businessName: $('#sBiz').value.trim() || 'Widemp Atelier' })); render(); toast('Tersimpan'); break;
      case 'save-cats': {
        const split = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
        await save('config', Object.assign({}, cfg(), { id: 'config', cats: { in: split($('#cIn').value), out: split($('#cOut').value) } })); toast('Kategori tersimpan'); break;
      }
      case 'drive-connect': driveConnect(); break;
      case 'drive-off': DS.disconnect(); render(); toast('Terputus dari Drive (data lokal tetap ada)'); break;
      case 'export': exportJson(); break;
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('money')) t.value = fmtMoneyInput(t.value);
    if (t.matches('.termrow [name=percent]')) updTermSum();
    if (t.id === 'fQ') { ui.q = t.value; clearTimeout(render._t); render._t = setTimeout(() => { render(); const q = $('#fQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'fMonth') { ui.month = t.value; render(); }
    else if (t.id === 'fKind') { ui.kind = t.value; render(); }
    else if (t.id === 'fImport') importJson(t.files[0]);
    else if (t.id === 'tPreset' && t.value !== '') {
      const pcts = C.PRESETS[Number(t.value)].percents, labels = C.makeTermLabels(pcts), box = $('#tRows');
      const used = [...box.querySelectorAll('.termrow')].some((r) => r.dataset.tid && C.paidFor(of('tx'), r.dataset.tid) > 0);
      if (used) { toast('Sudah ada pembayaran; ubah persen manual saja'); t.value = ''; return; }
      box.innerHTML = pcts.map((p, i) => termRow({ label: labels[i], percent: p })).join(''); updTermSum();
    } else if (t.name === 'projectId' && t.form) { t.form.dataset.term = ''; refreshTx(t.form); }
  });
  window.addEventListener('popstate', (e) => { ui.pid = (e.state && e.state.pid) || null; closeSheet(); render(); });

  /* ---------------- Cadangan ---------------- */
  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'widemp-keuangan', schema: 1, exportedAt: Date.now(), records: all() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `widemp-backup-${C.isoDate()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function importJson(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'widemp-keuangan' || !Array.isArray(data.records)) throw new Error('Bukan file cadangan Widemp');
      const recs = data.records.filter((r) => r && r.id && r.type);
      const m = C.mergeRecords(all(), recs);
      await applyMerged(m.records); toast(`Impor selesai (${m.toLocal} data diperbarui)`); queueSync();
    } catch (err) { toast('Impor gagal: ' + err.message); }
  }

  /* ---------------- Sinkron Drive ---------------- */
  let syncing = false, syncState = { kind: '', text: 'Siap sinkron' }, syncTimer = null;
  function paintSync() {
    const p = $('#syncPill'); if (!p) return;
    let s = syncState;
    if (!DS.isConnected()) s = { kind: '', text: 'Belum terhubung' };
    p.className = 'sync-pill ' + (s.kind || ''); p.textContent = s.text;
  }
  async function runSync(interactive) {
    if (syncing || !DS.isConnected()) return;
    if (!navigator.onLine) { syncState = { kind: '', text: 'Offline · tersimpan lokal' }; return paintSync(); }
    syncing = true; syncState = { kind: 'busy', text: 'Menyinkron…' }; paintSync();
    try {
      await DS.sync(all, applyMerged, interactive);
      syncState = { kind: 'ok', text: 'Tersinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) };
      if (interactive) toast('Sinkron selesai');
    } catch (err) {
      console.warn('sync', err);
      syncState = { kind: 'err', text: /login|Izin/i.test(err.message) ? 'Ketuk untuk sinkron' : 'Gagal sinkron' };
      if (interactive) toast(err.message);
    } finally { syncing = false; paintSync(); if (ui.tab === 'set') render(); }
  }
  function queueSync() { if (!DS.isConnected()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(false), 2500); }
  async function driveConnect() {
    const id = ($('#sClient') && $('#sClient').value.trim()) || '';
    if (id) localStorage.setItem(DS.K.client, id);
    if (!DS.clientId()) return toast('Isi Client ID Google dulu (lihat panduan)');
    try {
      if (!DS.isConnected()) { await DS.connect(); }
      await runSync(true);
    } catch (err) { toast(err.message); }
  }
  $('#syncPill').addEventListener('click', () => { if (!DS.isConnected()) { ui.tab = 'set'; ui.pid = null; render(); } else runSync(true); });
  window.addEventListener('online', () => runSync(false));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DS.isConnected() && Date.now() - DS.lastSync() > 60000) runSync(false); });

  /* ---------------- Mulai ---------------- */
  (async function init() {
    try {
      db = await openDB();
      (await idbAll()).forEach((r) => R.set(r.id, r));
      await seed();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (err) {
      view.innerHTML = '<div class="card">Penyimpanan lokal tidak bisa dibuka: ' + esc(err.message) + '<br>Jangan gunakan mode privat/penyamaran.</div>';
      return;
    }
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (DS.isConnected()) setTimeout(() => runSync(false), 600);
    window.__app = { R, ui, render, runSync };
  })();
})();
