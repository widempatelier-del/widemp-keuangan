/* Widemp Keuangan — antarmuka & penyimpanan lokal (IndexedDB) */
(() => {
  'use strict';
  const C = window.Core, DS = window.DriveSync;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = C.fmtRp;
  const fmtDate = (d) => { if (!d) return '-'; const [y, m, dd] = d.split('-'); return `${Number(dd)} ${C.BULAN[Number(m) - 1]} ${y}`; };
  const short = (n) => { const a = Math.abs(n); const s = n < 0 ? '-' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(1).replace('.', ',') + ' M' : a >= 1e6 ? s + (a / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' jt' : a >= 1e3 ? s + Math.round(a / 1e3) + ' rb' : s + a; };
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
  async function saveMany(list) {
    const now = Date.now();
    const recs = list.map(([type, data], i) => Object.assign({}, data, { id: data.id || C.uid(), type, updatedAt: now + i }));
    recs.forEach((r) => R.set(r.id, r)); await idbPut(recs); queueSync(); return recs;
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
    out: ['Gaji & honor', 'Transportasi', 'Material', 'Tukang / subkon', 'Software & langganan', 'Operasional kantor', 'Pembangunan kantor', 'Cicilan rumah kantor', 'Cicilan hutang', 'Pajak', 'Lainnya'],
  };
  // Seed pakai id tetap & updatedAt 0 agar tidak menimpa data asli dan tidak dobel antar perangkat.
  async function seed() {
    const seeds = [];
    const add = (r) => { if (!R.has(r.id)) { R.set(r.id, r); seeds.push(r); } };
    add({ id: 'config', type: 'config', updatedAt: 0, businessName: 'Widemp Atelier', cats: DEFAULT_CATS });
    add({ id: 'acc-bank', type: 'account', updatedAt: 0, name: 'Rekening bank', scope: 'usaha', opening: 0 });
    add({ id: 'acc-cash', type: 'account', updatedAt: 0, name: 'Kas tunai', scope: 'usaha', opening: 0 });
    if (window.Studio) window.Studio.SEEDS().forEach(add);
    if (seeds.length) await idbPut(seeds);
  }
  const DEFAULT_BIZ = {
    businessName: 'Widemp Atelier', city: 'Cianjur', phone: '082251613598', email: '',
    tagline: 'THOUGHTFUL DESIGN. MEANINGFUL SPACES.', bank: 'Bank Central Asia', accName: 'Imandika Rinaldy Pasha', accNo: '4020336167',
    invPrefix: 'INV/WA', kwPrefix: 'KWC/WA', payDays: 3,
    invNotes: 'Harga tersebut belum termasuk pajak\nHarap dibayarkan maksimal 3 hari setelah invoice diberikan',
  };
  const cfg = () => Object.assign({ cats: DEFAULT_CATS }, DEFAULT_BIZ, R.get('config') || {});
  const bizInfo = () => { const c = cfg(); return { name: c.businessName, city: c.city, phone: c.phone, email: c.email, tagline: c.tagline, bank: c.bank, accName: c.accName, accNo: c.accNo }; };
  const cats = (kind) => (cfg().cats && cfg().cats[kind]) || DEFAULT_CATS[kind];

  /* ---------------- UI state ---------------- */
  const ui = { proj: '', period: (() => { try { return localStorage.getItem('wk_period') || 'm3'; } catch (e) { return 'm3'; } })(), tab: 'dash', pid: null, month: C.monthKey(C.isoDate()), kind: '', q: '', docKind: 'invoice' };
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
    $('#biz').textContent = (cfg().businessName || 'Widemp Atelier').toUpperCase();
    self.PDF_LOGO = cfg().logo || null;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const ST = window.Studio;
    const fn = { dash: vDash, proj: ui.pid ? vProjectDetail : vProjects, cash: vCash, doc: vDocs, set: vSettings, quote: ST ? ST.vQuotes : vDash, data: ST ? ST.vData : vSettings }[ui.tab] || vDash;
    const keepScroll = window.scrollY;
    view.innerHTML = fn();
    window.scrollTo(0, keepScroll);
    paintSync();
  }

  const scopeBadge = (a) => (a && a.scope === 'pribadi' ? ' <span class="badge">pribadi</span>' : a && a.scope === 'arsip' ? ' <span class="badge">arsip</span>' : '');
  const accName = (id) => (byId(id) && byId(id).name) || '(akun dihapus)';
  const projName = (id) => (byId(id) && !byId(id).deleted ? byId(id).name : '');
  const statusBadge = (t, today) => {
    if (t.remaining <= 0 && t.amount > 0) return '<span class="badge ok">Lunas</span>';
    if (t.billed) return t.dueDate && t.dueDate < today ? '<span class="badge late">Terlambat</span>' : '<span class="badge bill">Ditagih</span>';
    return '<span class="badge">Belum ditagih</span>';
  };

  /* ----- Ringkasan ----- */
  const ICON = {
    up: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 7-7M15 8h5v5"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h10.2L20 8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><path d="M4 7a2 2 0 012-2h11v3M4 7v11a2 2 0 002 2h13V8H6a2 2 0 01-2-1zM16 14h.01"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><path d="M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  };
  function delta(cur, prev, goodWhenUp = true) {
    const p = C.pctChange(cur, prev);
    if (p === null) return '<span class="muted">Belum ada data periode sebelumnya</span>';
    const up = p >= 0, good = up === goodWhenUp;
    return `<span class="${good ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${up ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%</span> dari periode sebelumnya`;
  }
  function kpi(icon, label, value, sub) {
    return `<div class="stat kpi"><div class="ic">${icon}</div><div class="b"><div class="l">${label}</div><div class="v">${value}</div><div class="d">${sub}</div></div></div>`;
  }
  function liabPanel(compact) {
    const ls = of('liability'), mk = C.monthKey(C.isoDate()), txs = of('tx');
    if (!ls.length && compact) return '';
    const rows = ls.map((l) => Object.assign({ l }, C.liabilitySummary(l, txs, mk))).sort((a, b) => b.remaining - a.remaining);
    const total = rows.reduce((s, r) => s + r.remaining, 0), dueNow = rows.filter((r) => r.dueThisMonth).reduce((s, r) => s + Math.min(r.monthly, r.remaining) - r.thisMonth, 0);
    return `<div class="panel"><div class="panel-h"><h3>Kewajiban &amp; Cicilan</h3><span style="font-weight:700">${rp(total)}</span></div>
      ${dueNow ? `<div class="s muted" style="margin:-4px 0 6px">Cicilan bulan ini belum dibayar: <b class="warn">${rp(dueNow)}</b></div>` : ''}
      ${rows.length ? rows.map((r) => { const pct = r.total ? Math.round((r.paid / r.total) * 100) : 0; return `
        <div class="row" style="align-items:flex-start"><div class="grow"><div class="t click" data-act="edit-liab" data-id="${r.l.id}" style="cursor:pointer">${esc(r.l.name)} ${r.remaining <= 0 ? '<span class="badge ok">Lunas</span>' : r.dueThisMonth ? '<span class="badge bill">Bulan ini belum</span>' : r.monthly ? '<span class="badge ok">Bulan ini ✓</span>' : ''}</div>
          <div class="s">Sisa ${rp(r.remaining)} dari ${rp(r.total)}${r.monthly ? ` · ${rp(r.monthly)}/bulan${r.monthsLeft ? ' · ±' + (r.monthsLeft >= 24 ? Math.round(r.monthsLeft / 12) + ' tahun' : r.monthsLeft + ' bulan') + ' lagi' : ''}` : ''}</div>
          <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
          ${r.remaining > 0 ? `<div class="actions" style="margin:8px 0 0"><button class="btn sm primary" data-act="pay-liab" data-id="${r.l.id}">Bayar cicilan</button></div>` : ''}</div>
          <div class="amt">${pct}%</div></div>`; }).join('') : '<div class="empty">Belum ada kewajiban.</div>'}
      ${compact ? '' : '<div class="actions"><button class="btn sm" data-act="new-liab">+ Tambah kewajiban</button></div>'}</div>`;
  }
  function liabForm(l) {
    const outCats = cats('out');
    openSheet(`<form data-form="liab" data-id="${l ? l.id : ''}">${head(l ? 'Ubah kewajiban' : 'Kewajiban baru')}
      <label>Nama</label><input name="name" required value="${esc(l ? l.name : '')}" placeholder="mis. Cicilan rumah kantor">
      <div class="cols"><div><label>Total kewajiban (Rp)</label><input name="total" class="money" inputmode="numeric" required value="${fmtMoneyInput(l ? l.total : '')}"></div>
      <div><label>Sudah dibayar sebelum aplikasi (Rp)</label><input name="paidBefore" class="money" inputmode="numeric" value="${fmtMoneyInput(l ? l.paidBefore : '')}"></div></div>
      <div class="cols"><div><label>Cicilan per bulan (Rp, kosongkan bila tidak tetap)</label><input name="monthly" class="money" inputmode="numeric" value="${fmtMoneyInput(l ? l.monthly : '')}"></div>
      <div><label>Kategori pengeluaran</label><select name="category">${outCats.map((c) => opt(c, c, l ? l.category === c : c === 'Cicilan hutang')).join('')}</select></div></div>
      <label>Catatan</label><input name="note" value="${esc(l ? l.note : '')}">
      <div class="note">Pembayaran yang dicatat lewat "Bayar cicilan" otomatis mengurangi sisa.</div>
      ${foot(l ? '<button class="btn danger" type="button" data-act="del-liab" data-id="' + l.id + '">Hapus</button>' : '')}</form>`);
  }
  function billingTotals() {
    const terms = of('term'), txs = of('tx');
    let contract = 0, received = 0, billed = 0;
    for (const p of of('project')) {
      if (p.status === 'batal') continue;
      const s = C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs);
      contract += s.contract; received += s.received; billed += s.billedOutstanding;
    }
    return { contract, received, remaining: Math.max(0, contract - received), billed };
  }
  function billingCards() {
    const b = billingTotals(), pct = b.contract ? Math.round((b.received / b.contract) * 100) : 0;
    return `<div class="grid g3" style="margin-top:16px">
      ${kpi(ICON.layers, 'Total Nilai Kontrak', rp(b.contract), 'Semua proyek, kecuali yang batal')}
      ${kpi(ICON.up, 'Sudah Terbayar', rp(b.received), `<span class="up">${pct}%</span> dari nilai kontrak<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>`)}
      ${kpi(ICON.wallet, 'Sisa Tagihan', rp(b.remaining), b.billed ? `${rp(b.billed)} sudah ditagih, menunggu bayar` : 'Belum ada yang sedang ditagih')}
    </div>`;
  }
  function vDash() {
    const sumOfP = (p) => C.projectSummary(p, of('term').filter((t) => t.projectId === p.id), of('tx'));
    const accounts = of('account'), txs = of('tx'), projects = of('project'), terms = of('term');
    const today = C.isoDate();
    const { cur, prev } = C.periodRange(ui.period);
    const T = C.rangeTotals(accounts, txs, cur), P = C.rangeTotals(accounts, txs, prev);
    const saldo = C.balanceAt(accounts, txs, '9999-12-31'), saldoPrev = C.balanceAt(accounts, txs, prev.end);
    const active = projects.filter((p) => p.status === 'aktif');
    const newP = projects.filter((p) => p.createdAt && C.isoDate(new Date(p.createdAt)) >= cur.start).length;
    const series = cur.months.map((m) => Object.assign({ label: m.label }, C.monthTotals(accounts, txs, m.key)));
    const pi = C.piutangList(projects, terms, txs, today), piTotal = pi.reduce((s, i) => s + i.remaining, 0);
    let unbilled = 0, unbilledN = 0;
    for (const p of projects) { if (p.status === 'batal') continue; for (const t of sumOfP(p).sched) if (!t.billed && t.remaining > 0) { unbilled += t.remaining; unbilledN++; } }
    const recent = C.usahaTxs(accounts, txs).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);
    const sumOf = (p) => C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs);
    const opts = [['m1', 'Bulan ini'], ['m3', '3 bulan terakhir'], ['m6', '6 bulan terakhir'], ['y', 'Tahun ini']];
    return `
    <button class="fab" data-act="daily" aria-label="Catat transaksi harian">+</button>
    <div class="ptitle"><div class="tx"><h1>Keuangan Proyek</h1><p>Pantau arus kas dan performa proyek dalam satu ruang.</p><div class="rule"></div></div>
      <label class="period" title="Periode">${ICON.cal}<select id="fPeriod" aria-label="Periode">${opts.map(([k, l]) => `<option value="${k}" ${ui.period === k ? 'selected' : ''}>${k === ui.period ? cur.label : l}</option>`).join('')}</select></label></div>
    <div class="grid g4">
      ${kpi(ICON.up, 'Total Pendapatan', rp(T.in), delta(T.in, P.in, true))}
      ${kpi(ICON.cart, 'Pengeluaran', rp(T.out), delta(T.out, P.out, false))}
      ${kpi(ICON.wallet, 'Saldo Kas', rp(saldo), delta(saldo, saldoPrev, true))}
      ${kpi(ICON.layers, 'Proyek Aktif', String(active.length), newP ? `+${newP} proyek baru` : 'Tidak ada proyek baru')}
    </div>
    ${billingCards()}
    <div class="cols wide" style="margin-top:16px">
      <div class="panel"><div class="panel-h"><h3>Arus Kas</h3><div class="legend"><span><i style="background:var(--accent)"></i>Pemasukan</span><span><i style="background:#c9c3b8"></i>Pengeluaran</span></div></div>${lineChart(series)}</div>
      <div class="panel"><div class="panel-h"><h3>Aktivitas Terbaru</h3><button class="linkbtn" data-act="go-cash">Lihat Semua →</button></div>
        ${recent.length ? `<table class="act"><thead><tr><th>Tanggal</th><th>Proyek</th><th>Kategori</th><th>Nominal</th></tr></thead><tbody>${recent.map((t) => `
          <tr class="click" data-act="edit-tx" data-id="${t.id}"><td>${fmtDate(t.date)}</td><td>${esc(projName(t.projectId) || t.category || '-')}${projName(t.projectId) ? `<span class="muted-s">${esc(t.category || '')}</span>` : ''}</td>
          <td><span class="chip ${t.kind}">${t.kind === 'in' ? 'Pemasukan' : 'Pengeluaran'}</span></td><td>${t.kind === 'out' ? '− ' : ''}${rp(t.amount)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Belum ada transaksi. Catat dari tab Kas.</div>'}</div>
    </div>
    <div class="cols">
      <div class="panel"><div class="panel-h"><h3>Piutang Termin</h3><span class="${piTotal ? 'warn' : 'muted'}" style="font-weight:700">${rp(piTotal)}</span></div>
        ${unbilled ? `<div class="s muted" style="margin:-4px 0 6px">Belum ditagih: <b style="color:var(--ink)">${rp(unbilled)}</b> dari ${unbilledN} termin</div>` : ''}
        ${pi.length ? pi.map((i) => `<div class="row click" data-act="open-project" data-id="${i.project.id}"><div class="grow"><div class="t">${esc(i.project.name)} · ${esc(i.term.label)}</div>
          <div class="s">Jatuh tempo ${fmtDate(i.term.dueDate)} ${i.overdue ? '<span class="badge late">Terlambat</span>' : ''}</div></div><div class="amt">${rp(i.remaining)}</div></div>`).join('') : '<div class="empty">Tidak ada termin yang menunggu pembayaran.</div>'}</div>
      <div>${liabPanel(true)}<div class="panel"><div class="panel-h"><h3>Proyek Aktif</h3></div>
        ${active.length ? active.map((p) => { const s = sumOf(p); const pct = s.contract ? Math.min(100, Math.round((s.received / s.contract) * 100)) : 0; return `
          <div class="row click" data-act="open-project" data-id="${p.id}"><div class="grow"><div class="t">${esc(p.name)}</div>
          <div class="s">Dibayar ${rp(s.received)} dari ${rp(s.contract)} (${pct}%) · progres kerja ${Number(p.progress) || 0}%</div><div class="bar"><i style="width:${pct}%"></i></div></div></div>`; }).join('') : '<div class="empty">Belum ada proyek aktif.</div>'}</div></div>
    </div>`;
  }

  function niceMax(v) {
    if (v <= 0) return 1000000;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * p;
  }
  function lineChart(series) {
    const W = 560, H = 330, L = 56, R = 34, Tp = 14, B = 40;
    const top = Math.max(...series.flatMap((s) => [s.in, s.out]));
    const stepV = top > 0 ? niceMax(top / 5) : 1000000, ticks = top > 0 ? Math.max(2, Math.ceil(top / stepV + 0.05)) : 5, max = stepV * ticks;
    const n = series.length, step = n > 1 ? (W - L - R) / (n - 1) : 0;
    const X = (i) => (n > 1 ? L + i * step : (L + W - R) / 2), Y = (v) => Tp + (H - Tp - B) * (1 - v / max);
    const path = (k) => series.map((s, i) => {
      if (!i) return `M${X(0)},${Y(s[k])}`;
      const x0 = X(i - 1), x1 = X(i), y0 = Y(series[i - 1][k]), y1 = Y(s[k]), cx = (x1 - x0) / 2;
      return `C${x0 + cx},${y0} ${x1 - cx},${y1} ${x1},${y1}`;
    }).join(' ');
    let g = '';
    for (let i = 0; i <= ticks; i++) {
      const v = stepV * i, y = Y(v);
      g += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="var(--line)" stroke-width="${i ? 0.7 : 1}"/><text x="${L - 10}" y="${y + 4}" text-anchor="end">${short(v)}</text>`;
    }
    const area = (k) => n > 1 ? `${path(k)} L${X(n - 1)},${Y(0)} L${X(0)},${Y(0)} Z` : '';
    const every = Math.ceil(n / 6);
    const labels = series.map((s, i) => (i % every === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 12}" text-anchor="${n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'}">${s.label}</text>` : '')).join('');
    const dots = (k, c) => series.map((s, i) => `<circle cx="${X(i)}" cy="${Y(s[k])}" r="4.5" fill="var(--card)" stroke="${c}" stroke-width="2"><title>${s.label}: ${k === 'in' ? 'pemasukan' : 'pengeluaran'} ${rp(s[k])}</title></circle>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Grafik pemasukan dan pengeluaran">
      <defs><linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5034" stop-opacity=".22"/><stop offset="1" stop-color="#4a5034" stop-opacity=".04"/></linearGradient></defs>
      ${g}<line x1="${L}" y1="${Tp}" x2="${L}" y2="${Y(0)}" stroke="var(--line)"/>
      <path d="${area('in')}" fill="url(#gIn)"/>
      <path d="${path('out')}" fill="none" stroke="#a8a297" stroke-width="2"/><path d="${path('in')}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
      ${dots('out', '#a8a297')}${dots('in', 'var(--accent)')}${labels}</svg>`;
  }

  /* ----- Proyek ----- */
  const STORD = { aktif: 0, tunda: 1, selesai: 2, batal: 3 };
  function vProjects() {
    const projects = of('project').sort((a, b) => (STORD[a.status] ?? 9) - (STORD[b.status] ?? 9) || (b.createdAt || 0) - (a.createdAt || 0));
    const terms = of('term'), txs = of('tx'), today = C.isoDate();
    return `<div class="panel-h" style="margin:4px 0 10px"><h3 style="font-size:16px">Proyek</h3>${projects.length ? '<button class="btn sm" data-act="report-all">Rekap semua proyek (PDF)</button>' : ''}</div>` + (projects.length ? billingCards().replace('margin-top:16px', 'margin:0 0 16px') : '') + (projects.length ? projects.map((p) => {
      const s = C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs);
      const next = s.sched.find((t) => t.remaining > 0);
      const pct = s.contract ? Math.min(100, Math.round((s.received / s.contract) * 100)) : 0;
      return `<div class="card click" data-act="open-project" data-id="${p.id}" style="cursor:pointer">
        <div class="row" style="border:0;padding:0"><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.client || 'Tanpa klien')}</div></div>
        <span class="badge ${p.status === 'aktif' ? 'bill' : ''}">${esc(p.status)}</span></div>
        <div class="s" style="margin-top:8px">Kontrak ${rp(s.contract)} · diterima ${rp(s.received)} · progres kerja ${Number(p.progress) || 0}%</div>
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
    <div class="actions" style="margin-top:0"><button class="btn sm" data-act="back">← Proyek</button><button class="btn sm" data-act="edit-project" data-id="${p.id}">Ubah</button><button class="btn sm primary" data-act="report" data-id="${p.id}">Laporan PDF</button></div>
    <h2 style="margin-top:0">${esc(p.name)} <span class="badge">${esc(p.status)}</span></h2>
    <div class="muted" style="margin-bottom:10px">${esc(p.client || 'Tanpa klien')}${p.service ? ' · ' + esc(p.service) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div>
    ${window.Studio ? window.Studio.projectLinks(p) : ''}
    <div class="card"><div class="row" style="padding:0;border:0"><div class="grow"><div class="s">Progres pekerjaan</div><div class="bar" style="height:8px"><i style="width:${Number(p.progress) || 0}%"></i></div></div><div class="amt">${Number(p.progress) || 0}%</div></div></div>
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
        <div class="grow"><div class="t">${esc(t.label)} · ${C.fmtNum(t.percent)}% ${statusBadge(t, today)}</div>
          <div class="s">${rp(t.amount)} · dibayar ${rp(t.paid)} · jatuh tempo ${fmtDate(t.dueDate)}</div>
          <div class="actions" style="margin:6px 0 0">
            ${t.remaining > 0 ? `<button class="btn sm primary" data-act="pay-term" data-id="${t.id}">Catat pembayaran</button>` : ''}
            ${termInvoice(t.id) ? `<button class="btn sm" data-act="view-doc" data-id="${termInvoice(t.id).id}">Invoice ${esc(termInvoice(t.id).number)}</button>` : `<button class="btn sm" data-act="new-invoice" data-term="${t.id}">Buat invoice</button>`}
            ${t.remaining > 0 && !termInvoice(t.id) ? `<button class="btn sm" data-act="bill-term" data-id="${t.id}">${t.billed ? 'Batal tandai ditagih' : 'Tandai ditagih'}</button>` : ''}
          </div></div><div class="amt ${t.remaining ? '' : 'in'}">${rp(t.remaining ? t.remaining : t.amount)}</div></div>`).join('') : '<div class="empty">Belum ada termin.</div>'}
      ${s.sched.length && Math.abs(pctSum - 100) > 0.01 ? `<div class="note">Total persen termin ${C.fmtNum(pctSum)}%, belum 100%.</div>` : ''}
      <div class="actions"><button class="btn sm" data-act="edit-terms" data-id="${p.id}">Atur termin</button><button class="btn sm" data-act="new-invoice" data-project="${p.id}">Invoice nilai penuh</button></div>
    </div>
    <h2>Transaksi proyek</h2>
    <div class="card">${ptx.length ? ptx.map(txRow).join('') : '<div class="empty">Belum ada transaksi.</div>'}
      <div class="actions"><button class="btn sm primary" data-act="daily" data-kind="out" data-project="${p.id}">+ Pengeluaran proyek</button><button class="btn sm" data-act="daily" data-kind="in" data-project="${p.id}">+ Pemasukan proyek</button></div></div>`;
  }

  /* ----- Kas ----- */
  function txRow(t) {
    const acc = byId(t.accountId);
    return `<div class="row click" data-act="edit-tx" data-id="${t.id}">
      <div class="grow"><div class="t">${esc(t.category || (t.kind === 'in' ? 'Pemasukan' : 'Pengeluaran'))}${scopeBadge(acc)}</div>
      <div class="s">${fmtDate(t.date)} · ${esc(accName(t.accountId))}${projName(t.projectId) ? ' · ' + esc(projName(t.projectId)) : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="amt ${t.kind === 'in' ? 'in' : 'out'}">${t.kind === 'in' ? '+' : '−'}${rp(t.amount)}${t.kind === 'in' ? `<div><span class="badge ${txReceipt(t.id) ? 'ok' : ''}" data-act="${txReceipt(t.id) ? 'view-doc' : 'new-receipt'}" data-id="${txReceipt(t.id) ? txReceipt(t.id).id : ''}" data-tx="${t.id}" style="cursor:pointer">${txReceipt(t.id) ? 'Kwitansi ✓' : '+ Kwitansi'}</span></div>` : ''}</div></div>`;
  }
  function dayGroups(txs) {
    const days = new Map();
    for (const t of txs) { if (!days.has(t.date)) days.set(t.date, []); days.get(t.date).push(t); }
    return [...days].map(([d, list]) => {
      const u = C.usahaTxs(of('account'), list), i = u.filter((t) => t.kind === 'in').reduce((a, t) => a + t.amount, 0), o = u.filter((t) => t.kind === 'out').reduce((a, t) => a + t.amount, 0);
      return `<div class="card"><div class="row" style="padding:0 0 8px;border:0"><div class="grow t">${fmtDate(d)}</div><div class="s">${i ? `<span class="in">+${rp(i)}</span>` : ''}${i && o ? ' · ' : ''}${o ? `<span class="out">−${rp(o)}</span>` : ''}</div></div>${list.map(txRow).join('')}</div>`;
    }).join('');
  }
  function vCash() {
    const accounts = of('account');
    let txs = of('tx');
    if (ui.month) txs = txs.filter((t) => C.monthKey(t.date) === ui.month);
    if (ui.kind) txs = txs.filter((t) => t.kind === ui.kind);
    if (ui.proj) txs = txs.filter((t) => (ui.proj === '-' ? !t.projectId : t.projectId === ui.proj));
    if (ui.acc) txs = txs.filter((t) => t.accountId === ui.acc);
    if (ui.q) { const q = ui.q.toLowerCase(); txs = txs.filter((t) => [t.category, t.note, accName(t.accountId), projName(t.projectId)].join(' ').toLowerCase().includes(q)); }
    txs.sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
    const u = C.usahaTxs(accounts, txs);
    const inn = u.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0), out = u.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
    return `<h2>Kas masuk &amp; keluar</h2>
    <div class="filters">
      <input type="month" id="fMonth" value="${esc(ui.month)}" aria-label="Bulan">
      <select id="fKind" aria-label="Jenis"><option value="">Semua</option><option value="in" ${ui.kind === 'in' ? 'selected' : ''}>Masuk</option><option value="out" ${ui.kind === 'out' ? 'selected' : ''}>Keluar</option></select>
      <select id="fAcc" aria-label="Akun kas"><option value="">Semua akun</option>${of('account').map((a) => opt(a.id, a.name, ui.acc === a.id)).join('')}</select>
      <select id="fProj" aria-label="Proyek"><option value="">Semua proyek</option><option value="-" ${ui.proj === '-' ? 'selected' : ''}>Tanpa proyek (kantor)</option>${of('project').map((p) => opt(p.id, p.name, ui.proj === p.id)).join('')}</select>
      <input type="search" id="fQ" placeholder="Cari…" value="${esc(ui.q)}">
    </div>
    <div class="actions" style="margin-top:0"><button class="btn primary" data-act="daily">+ Catat transaksi harian</button><button class="btn" data-act="cash-report">Cetak laporan kas</button></div>
    <div class="grid"><div class="stat"><div class="l">Masuk</div><div class="v in">${rp(inn)}</div></div><div class="stat"><div class="l">Keluar</div><div class="v out">${rp(out)}</div></div></div>
    <div style="margin-top:12px">${txs.length ? dayGroups(txs) : '<div class="card empty">Tidak ada transaksi pada filter ini.</div>'}</div>
    <div class="muted" style="font-size:12px;margin-bottom:16px">Akun bertanda “pribadi” atau “arsip” tidak dihitung di total dan saldo.</div>
    ${liabPanel(false)}
    <button class="fab" data-act="daily" aria-label="Catat transaksi harian">+</button>`;
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
    <!--logo--><h2>Logo usaha</h2><div class="card">
      <div class="s muted">Dipakai di kop invoice, kwitansi, penawaran, dan laporan PDF. Gunakan PNG berlatar transparan bila ada.</div>
      <div class="s" style="margin-top:8px">${c.logo ? 'Logo unggahan sedang dipakai.' : 'Memakai logo bawaan.'}</div>
      <div class="actions"><label class="btn sm primary" style="margin:0;color:#fff">Unggah logo<input type="file" id="fLogo" accept="image/png,image/jpeg,image/webp" hidden></label>${c.logo ? '<button class="btn sm danger" data-act="logo-del">Kembali ke logo bawaan</button>' : ''}</div></div><!--/logo-->
    <h2>Invoice &amp; kwitansi</h2><div class="card">
      <div class="cols"><div><label>Kota (tanda tangan kwitansi)</label><input id="bCity" value="${esc(c.city)}"></div><div><label>Telepon</label><input id="bPhone" value="${esc(c.phone)}" inputmode="tel"></div></div>
      <div class="cols"><div><label>Email</label><input id="bEmail" value="${esc(c.email)}" inputmode="email"></div><div><label>Tagline</label><input id="bTag" value="${esc(c.tagline)}"></div></div>
      <div class="cols"><div><label>Bank</label><input id="bBank" value="${esc(c.bank)}"></div><div><label>Atas nama</label><input id="bAccName" value="${esc(c.accName)}"></div></div>
      <div class="cols"><div><label>No. rekening</label><input id="bAccNo" value="${esc(c.accNo)}" inputmode="numeric"></div><div><label>Jatuh tempo invoice (hari)</label><input id="bDays" value="${esc(c.payDays)}" inputmode="numeric"></div></div>
      <div class="cols"><div><label>Awalan nomor invoice</label><input id="bInvP" value="${esc(c.invPrefix)}"></div><div><label>Awalan nomor kwitansi</label><input id="bKwP" value="${esc(c.kwPrefix)}"></div></div>
      <div class="s muted" style="margin-top:6px">Contoh nomor: ${esc(C.docNumber(c.invPrefix, 1, C.isoDate()))} · ${esc(C.docNumber(c.kwPrefix, 1, C.isoDate()))}</div>
      <label>Catatan bawaan invoice</label><textarea id="bNotes" rows="3">${esc(c.invNotes)}</textarea>
      <div class="actions"><button class="btn sm primary" data-act="save-docset">Simpan</button></div></div>
    ${window.Studio ? window.Studio.settingsCard() : ''}
    <h2>Akun kas</h2><div class="card">${accs.map((a) => `
      <div class="row click" data-act="edit-account" data-id="${a.id}"><div class="grow"><div class="t">${esc(a.name)}${scopeBadge(a)}</div><div class="s">Saldo awal ${rp(a.opening)}</div></div><div class="amt">${rp(a.balance)}</div></div>`).join('')}
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
    <div class="muted" style="font-size:12px;margin-top:6px">Widemp Atelier · tahap 3 (keuangan, invoice &amp; kwitansi, penawaran, RAB, database)</div>`;
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
      <label>Kontak / PIC (opsional)</label><input name="attn" placeholder="mis. Pa Arif (Owner)" value="${esc(p ? p.attn : '')}">
      <label>Alamat klien (opsional)</label><input name="address" value="${esc(p ? p.address : '')}">
      <div class="cols"><div><label>Jenis layanan</label><input name="service" placeholder="mis. Desain + pengawasan" value="${esc(p ? p.service : '')}"></div>
      <div><label>Progres pekerjaan (%)</label><input name="progress" inputmode="numeric" placeholder="0–100" value="${esc(p && p.progress != null ? p.progress : '')}"></div></div>
      <label>Nilai kontrak (Rp)</label><input name="contract" class="money" inputmode="numeric" required value="${fmtMoneyInput(p ? p.contract : '')}">
      ${p ? `<label>Status</label><select name="status">${['aktif', 'tunda', 'selesai', 'batal'].map((s) => opt(s, s, p.status === s)).join('')}</select>` : `<label>Skema termin</label><select name="preset">${presets}</select>`}
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
    el.textContent = 'Total ' + (Math.round(sum * 100) / 100) + '%'; el.className = 's ' + (Math.abs(sum - 100) < 0.01 ? 'in' : 'out');
  }

  function accountOptions(sel) { return of('account').map((a) => opt(a.id, a.name + (a.scope === 'pribadi' ? ' (pribadi)' : a.scope === 'arsip' ? ' (arsip)' : ''), a.id === sel)).join(''); }

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
      <div id="rabWrap"><label>Item RAB (untuk kurva S &amp; kontrol biaya)</label><select name="rabItemId"></select></div>
      <div id="liabWrap"><label>Bayar kewajiban (opsional)</label><select name="liabilityId"><option value="">— bukan cicilan —</option>${of('liability').map((l) => opt(l.id, l.name, l.id === (tx.liabilityId || preset.liabilityId))).join('')}</select></div>
      <label>Catatan</label><input name="note" value="${esc(tx.note || '')}">
      ${foot(t ? '<button class="btn danger" type="button" data-act="del-tx" data-id="' + tx.id + '">Hapus</button>' : '')}</form>`);
    const f = sheet.querySelector('form'); f.dataset.cat = tx.category || preset.category || ''; f.dataset.term = tx.termId || ''; f.dataset.rab = tx.rabItemId || '';
    if (!t && preset.amount) f.amount.value = fmtMoneyInput(preset.amount);
    refreshTx(f);
  }
  function curRab(pid) {
    const l = of('rab').filter((r) => r.projectId === pid);
    if (!l.length) return null;
    const vn = (r) => { const m = String(r.version || '').match(/^V?(\d+)(?:\.(\d+))?/i); return m ? Number(m[1]) * 1000 + Number(m[2] || 0) : 0; };
    const fin = l.find((r) => r.final), after = l.filter((r) => r.cco);
    if (after.length) return after.sort((a, b) => vn(b) - vn(a) || (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    return fin || l.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  }
  function refreshTx(f) {
    const kind = f.kind.value, catSel = f.category, cur = f.dataset.cat || catSel.value;
    const list = cats(kind).slice(); if (cur && !list.includes(cur)) list.push(cur);
    catSel.innerHTML = list.map((c) => opt(c, c, c === cur)).join('');
    $('#liabWrap', f).hidden = kind !== 'out' || !of('liability').length;
    const wrap = $('#termWrap', f), pid = f.projectId.value;
    wrap.hidden = !(kind === 'in' && pid);
    if (!wrap.hidden) {
      const p = byId(pid), s = C.projectSummary(p, of('term').filter((t) => t.projectId === pid), of('tx'));
      let keep = f.termId.value || f.dataset.term;
      if (!keep && !f.dataset.id) { const open = s.sched.find((t) => t.remaining > 0); if (open) keep = open.id; }
      f.termId.innerHTML = '<option value="">— tidak terkait termin —</option>' + s.sched.filter((t) => t.remaining > 0 || t.id === keep).map((t) => opt(t.id, `${t.label} (sisa ${rp(t.remaining)})`, t.id === keep)).join('');
    } else f.termId.innerHTML = '';
    const rw = $('#rabWrap', f), rab = kind === 'out' && pid ? curRab(pid) : null;
    rw.hidden = !rab;
    if (rab) {
      const keep = f.rabItemId.value || f.dataset.rab, divs = [];
      (rab.items || []).forEach((it) => { const d = it.division || 'Lain-lain'; let g = divs.find((x) => x.n === d); if (!g) divs.push(g = { n: d, l: [] }); g.l.push(it); });
      f.rabItemId.innerHTML = '<option value="">— bukan item RAB —</option>' + divs.map((g) => `<optgroup label="${esc(g.n)}">${g.l.map((it) => { const k = it.baseId || it.id; return opt(k, (it.desc || '(tanpa uraian)') + (it.room ? ' · ' + it.room : ''), k === keep); }).join('')}</optgroup>`).join('');
    } else f.rabItemId.innerHTML = '';
    f.dataset.cat = '';
  }

  const lastProj = () => { try { return localStorage.getItem('wk_last_proj') || ''; } catch (e) { return ''; } };
  function dayRow(pre = {}) {
    const kind = pre.kind || 'out', pid = pre.projectId != null ? pre.projectId : lastProj();
    return `<div class="dayrow card" style="padding:10px;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 1.6fr auto;gap:6px;align-items:end">
        <div><label style="margin-top:0">Jenis</label><select name="d_kind">${opt('out', 'Keluar', kind === 'out')}${opt('in', 'Masuk', kind === 'in')}</select></div>
        <div><label style="margin-top:0">Proyek</label><select name="d_proj"><option value="">— kantor / umum —</option>${of('project').filter((p) => p.status !== 'batal').map((p) => opt(p.id, p.name, p.id === pid)).join('')}</select></div>
        <button class="btn sm danger" type="button" data-act="rm-dayrow" style="margin-bottom:4px">✕</button></div>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:6px">
        <div><label>Kategori</label><select name="d_cat"></select></div>
        <div><label>Jumlah (Rp)</label><input name="d_amt" class="money" inputmode="numeric" value=""></div></div>
      <div class="d_term"><label>Masuk ke termin</label><select name="d_term"></select></div>
      <label>Catatan</label><input name="d_note" placeholder="mis. beli semen, ongkos tukang">
    </div>`;
  }
  function refreshDayRow(r) {
    const kind = r.querySelector('[name=d_kind]').value, pid = r.querySelector('[name=d_proj]').value, cs = r.querySelector('[name=d_cat]');
    const cur = cs.dataset.kind === kind && cs.dataset.touched ? cs.value : '';
    const def = kind === 'in' ? (pid ? 'Pembayaran proyek' : '') : (pid ? 'Material' : 'Operasional kantor');
    cs.innerHTML = cats(kind).map((c) => opt(c, c, c === (cur || def))).join(''); cs.dataset.kind = kind;
    const tw = r.querySelector('.d_term'), ts = r.querySelector('[name=d_term]');
    tw.hidden = !(kind === 'in' && pid);
    if (!tw.hidden) {
      const p = byId(pid), sm = C.projectSummary(p, of('term').filter((t) => t.projectId === pid), of('tx')), open = sm.sched.filter((t) => t.remaining > 0);
      ts.innerHTML = '<option value="">— tidak terkait termin —</option>' + open.map((t, i) => opt(t.id, `${t.label} (sisa ${rp(t.remaining)})`, i === 0)).join('');
    } else ts.innerHTML = '';
  }
  function dailyForm(pre = {}) {
    openSheet(`<form data-form="daily">${head('Transaksi harian')}
      <div class="muted s">Catat beberapa transaksi sekaligus. Yang dipilih proyeknya langsung masuk ke proyek itu.</div>
      <div class="cols"><div><label>Tanggal</label><input type="date" name="date" required value="${C.isoDate()}"></div>
      <div><label>Akun</label><select name="accountId">${accountOptions('acc-bank')}</select></div></div>
      <div id="dayRows" style="margin-top:12px">${dayRow(pre)}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="add-dayrow">+ Baris</button><span class="s" id="dayTotal"></span></div>
      ${foot()}</form>`);
    sheet.querySelectorAll('.dayrow').forEach(refreshDayRow); updDayTotal();
  }
  function updDayTotal() {
    const el = $('#dayTotal'); if (!el) return;
    let i = 0, o = 0;
    sheet.querySelectorAll('.dayrow').forEach((r) => { const a = C.parseNum(r.querySelector('[name=d_amt]').value); if (r.querySelector('[name=d_kind]').value === 'in') i += a; else o += a; });
    el.innerHTML = `${i ? `<span class="in">Masuk ${rp(i)}</span>` : ''}${i && o ? ' · ' : ''}${o ? `<span class="out">Keluar ${rp(o)}</span>` : ''}`;
  }
  async function submitDaily(f) {
    const rows = [...f.querySelectorAll('.dayrow')].map((r) => ({
      kind: r.querySelector('[name=d_kind]').value, projectId: r.querySelector('[name=d_proj]').value, category: r.querySelector('[name=d_cat]').value,
      amount: C.parseNum(r.querySelector('[name=d_amt]').value), termId: r.querySelector('[name=d_term]').value, note: r.querySelector('[name=d_note]').value.trim(),
    })).filter((r) => r.amount > 0);
    if (!rows.length) { toast('Isi jumlah minimal satu baris'); return false; }
    const date = f.date.value, accountId = f.accountId.value;
    const list = rows.map((r) => ['tx', { kind: r.kind, date, amount: r.amount, category: r.category, accountId, projectId: r.projectId, termId: r.kind === 'in' && r.projectId ? r.termId : '', liabilityId: '', note: r.note }]);
    const billed = new Set(rows.filter((r) => r.kind === 'in' && r.termId).map((r) => r.termId));
    billed.forEach((tid) => { const t = byId(tid); if (t && !t.billed) list.push(['term', Object.assign({}, t, { billed: true, billedDate: C.isoDate() })]); });
    await saveMany(list);
    const lp = rows[rows.length - 1].projectId; try { localStorage.setItem('wk_last_proj', lp); } catch (e) { /* abaikan */ }
    return rows.length;
  }

  function payForm(term) {
    const p = byId(term.projectId);
    const s = C.projectSummary(p, of('term').filter((t) => t.projectId === p.id), of('tx')).sched.find((t) => t.id === term.id);
    openSheet(`<form data-form="pay" data-id="${term.id}">${head('Catat pembayaran')}
      <div class="muted s">${esc(p.name)} · ${esc(term.label)} · sisa ${rp(s.remaining)}</div>
      <label>Tanggal diterima</label><input type="date" name="date" required value="${C.isoDate()}">
      <label>Jumlah (Rp)</label><input name="amount" class="money" inputmode="numeric" required value="${fmtMoneyInput(s.remaining)}">
      <label>Masuk ke akun</label><select name="accountId">${accountOptions('acc-bank')}</select>
      <label>Catatan</label><input name="note" placeholder="mis. transfer BCA">
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink);font-size:14px"><input type="checkbox" name="mkReceipt" checked style="width:auto"> Buat kwitansi setelah disimpan</label>${foot()}</form>`);
  }

  function accountForm(a) {
    openSheet(`<form data-form="account" data-id="${a ? a.id : ''}">${head(a ? 'Ubah akun' : 'Akun baru')}
      <label>Nama akun</label><input name="name" required value="${esc(a ? a.name : '')}">
      <label>Lingkup</label><select name="scope">${opt('usaha', 'Usaha', !a || !a.scope || a.scope === 'usaha')}${opt('pribadi', 'Pribadi (tidak masuk laporan usaha)', a && a.scope === 'pribadi')}${opt('arsip', 'Arsip (penerimaan lama, tidak menambah saldo)', a && a.scope === 'arsip')}</select>
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
        const p = await save('project', Object.assign({}, old, { id, name: d.name.trim(), client: d.client.trim(), attn: (d.attn || '').trim(), address: (d.address || '').trim(), service: (d.service || '').trim(), progress: Math.max(0, Math.min(100, Math.round(C.parseDec(d.progress)))), contract: C.parseNum(d.contract), note: d.note.trim(), status: d.status || (old && old.status) || 'aktif', createdAt: (old && old.createdAt) || Date.now() }));
        if (!old) {
          const pcts = C.PRESETS[Number(d.preset) || 0].percents, labels = C.makeTermLabels(pcts);
          for (let i = 0; i < pcts.length; i++) await save('term', { projectId: p.id, no: i + 1, label: labels[i], percent: pcts[i], billed: false, dueDate: '' });
          ui.pid = p.id; history.pushState({ pid: p.id }, '');
        }
      } else if (kind === 'terms') {
        const rows = [...f.querySelectorAll('.termrow')].map((r) => ({ tid: r.dataset.tid, label: r.querySelector('[name=label]').value.trim(), percent: parseFloat(r.querySelector('[name=percent]').value.replace(',', '.')) || 0, due: r.querySelector('[name=due]').value }));
        const sum = rows.reduce((s, r) => s + r.percent, 0);
        if (!rows.length || Math.abs(sum - 100) > 0.01) return toast('Total persen harus 100% (sekarang ' + C.fmtNum(sum) + '%)');
        if (rows.some((r) => !r.label)) return toast('Nama termin tidak boleh kosong');
        const txs = of('tx'), keep = new Set(rows.map((r) => r.tid).filter(Boolean));
        const dropped = of('term').filter((t) => t.projectId === id && !keep.has(t.id));
        if (dropped.some((t) => C.paidFor(txs, t.id) > 0)) return toast('Termin yang sudah ada pembayarannya tidak bisa dihapus');
        for (const t of dropped) await del(t.id);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i], old = r.tid ? byId(r.tid) : null;
          await save('term', Object.assign({}, old, { id: r.tid || undefined, projectId: id, no: i + 1, label: r.label, percent: r.percent, fixed: old && old.fixed != null && C.fmtNum(old.percent) === C.fmtNum(r.percent) ? old.fixed : null, dueDate: r.due, billed: old ? !!old.billed : false }));
        }
      } else if (kind === 'tx') {
        const amount = C.parseNum(d.amount); if (!amount) return toast('Jumlah belum diisi');
        const old = id ? byId(id) : null;
        await save('tx', Object.assign({}, old, { id, kind: d.kind, date: d.date, amount, category: d.category, accountId: d.accountId, projectId: d.projectId || '', termId: d.kind === 'in' && d.projectId ? d.termId || '' : '', liabilityId: d.kind === 'out' ? d.liabilityId || '' : '', rabItemId: d.kind === 'out' && d.projectId ? d.rabItemId || '' : '', note: d.note.trim() }));
        if (d.kind === 'in' && d.termId) await markBilled(d.termId);
      } else if (kind === 'pay') {
        const term = byId(id), amount = C.parseNum(d.amount); if (!amount) return toast('Jumlah belum diisi');
        const tx = await save('tx', { kind: 'in', date: d.date, amount, category: 'Pembayaran proyek', accountId: d.accountId, projectId: term.projectId, termId: term.id, note: (d.note.trim() ? d.note.trim() + ' · ' : '') + term.label });
        await markBilled(term.id);
        if (d.mkReceipt) { render(); receiptForm(null, tx); return; }
      } else if (kind === 'invoice' || kind === 'receipt') {
        const rec = await (kind === 'invoice' ? submitInvoice(f, d, id) : submitReceipt(d, id));
        if (!rec) return;
        render(); docView(rec); toast('Tersimpan'); return;
      } else if (kind === 'daily') {
        const n = await submitDaily(f); if (!n) return;
        closeSheet(); render(); toast(`${n} transaksi tersimpan`); return;
      } else if (kind === 'liab') {
        const old = id ? byId(id) : null;
        await save('liability', Object.assign({}, old, { id, name: d.name.trim(), total: C.parseNum(d.total), paidBefore: C.parseNum(d.paidBefore), monthly: C.parseNum(d.monthly), category: d.category, note: d.note.trim() }));
      } else if (kind === 'account') {
        const old = id ? byId(id) : null;
        await save('account', Object.assign({}, old, { id, name: d.name.trim(), scope: d.scope, opening: C.parseNum(d.opening) }));
      } else if (window.Studio) {
        const r = await window.Studio.submit(kind, f, d, id);
        if (r !== 'done') return;
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
    if (tab) { ui.tab = tab.dataset.tab; ui.pid = null; ui.qid = null; ui.rid = null; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id;
    switch (a) {
      case 'close': closeSheet(); break;
      case 'go-dash': e.preventDefault(); ui.tab = 'dash'; ui.pid = null; ui.qid = null; ui.rid = null; render(); window.scrollTo(0, 0); break;
      case 'go-cash': ui.tab = 'cash'; ui.pid = null; ui.month = ''; ui.kind = ''; render(); window.scrollTo(0, 0); break;
      case 'open-project': closeSheet(); ui.tab = 'proj'; ui.qid = null; ui.rid = null; ui.pid = id; history.pushState({ pid: id }, ''); render(); window.scrollTo(0, 0); break;
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
      case 'new-invoice': e.stopPropagation(); invoiceForm(null, { termId: el.dataset.term, projectId: el.dataset.project }); break;
      case 'new-receipt': e.stopPropagation(); receiptForm(null, el.dataset.tx ? byId(el.dataset.tx) : null); break;
      case 'view-doc': e.stopPropagation(); docView(byId(id)); break;
      case 'edit-doc': { const r = byId(id); r.type === 'invoice' ? invoiceForm(r) : receiptForm(r); break; }
      case 'del-doc': if (confirm('Hapus dokumen ini?')) { await del(id); closeSheet(); render(); toast('Dihapus'); } break;
      case 'pdf-dl': case 'pdf-share': case 'pdf-drive': pdfAction(a, byId(id), el); break;
      case 'add-item': $('#items').insertAdjacentHTML('beforeend', itemRow({ qty: 1 })); updInvTotal(); break;
      case 'rm-item': el.closest('.itemrow').remove(); updInvTotal(); break;
      case 'doc-kind': ui.docKind = el.dataset.k; render(); break;
      case 'save-docset': {
        const v = (i) => $(i).value.trim();
        await save('config', Object.assign({}, R.get('config') || {}, { id: 'config', city: v('#bCity'), phone: v('#bPhone'), email: v('#bEmail'), tagline: v('#bTag'), bank: v('#bBank'), accName: v('#bAccName'), accNo: v('#bAccNo'), payDays: Number(v('#bDays')) || 0, invPrefix: v('#bInvP') || 'INV', kwPrefix: v('#bKwP') || 'KWC', invNotes: $('#bNotes').value.trim() }));
        render(); toast('Tersimpan'); break;
      }
      case 'daily': dailyForm({ projectId: el.dataset.project, kind: el.dataset.kind }); break;
      case 'add-dayrow': { const rows = $('#dayRows'), last = rows.lastElementChild; rows.insertAdjacentHTML('beforeend', dayRow(last ? { kind: last.querySelector('[name=d_kind]').value, projectId: last.querySelector('[name=d_proj]').value } : {})); refreshDayRow(rows.lastElementChild); rows.lastElementChild.querySelector('[name=d_amt]').focus(); break; }
      case 'rm-dayrow': if (sheet.querySelectorAll('.dayrow').length > 1) { el.closest('.dayrow').remove(); updDayTotal(); } break;
      case 'report': reportSheet('one', id); break;
      case 'report-all': reportSheet('all'); break;
      case 'cash-report': cashReportSheet(); break;
      case 'rep-dl': case 'rep-print': case 'rep-share': case 'rep-drive': reportAction(a, el); break;
      case 'logo-del': { const c = Object.assign({}, R.get('config') || {}, { id: 'config' }); delete c.logo; await save('config', c); render(); toast('Logo bawaan dipakai lagi'); break; }
      case 'new-liab': liabForm(null); break;
      case 'edit-liab': liabForm(byId(id)); break;
      case 'del-liab': if (of('tx').some((t) => t.liabilityId === id) && !confirm('Kewajiban ini punya pembayaran tercatat. Pembayarannya tetap ada sebagai pengeluaran. Hapus?')) return; if (confirm('Hapus kewajiban ini?')) { await del(id); closeSheet(); render(); } break;
      case 'pay-liab': { const l = byId(id), sm = C.liabilitySummary(l, of('tx'), C.monthKey(C.isoDate())); txForm(null, { kind: 'out', liabilityId: l.id, category: l.category, amount: Math.min(l.monthly || sm.remaining, sm.remaining) }); break; }
      case 'drive-connect': driveConnect(); break;
      case 'drive-off': DS.disconnect(); render(); toast('Terputus dari Drive (data lokal tetap ada)'); break;
      case 'export': exportJson(); break;
      default: if (window.Studio) await window.Studio.click(a, el, e);
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('money')) t.value = fmtMoneyInput(t.value);
    if (t.matches('.termrow [name=percent]')) updTermSum();
    if (t.closest('form[data-form=invoice]')) updInvTotal();
    if (t.closest('form[data-form=daily]')) updDayTotal();
    if (window.Studio) window.Studio.input(e);
    if (t.id === 'fQ') { ui.q = t.value; clearTimeout(render._t); render._t = setTimeout(() => { render(); const q = $('#fQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (window.Studio && window.Studio.change(e)) return;
    if (t.id === 'fPeriod') { ui.period = t.value; try { localStorage.setItem('wk_period', t.value); } catch (err) { /* abaikan */ } render(); }
    else if (t.id === 'fMonth') { ui.month = t.value; render(); }
    else if (t.id === 'fKind') { ui.kind = t.value; render(); }
    else if (t.id === 'fProj') { ui.proj = t.value; render(); }
    else if (t.id === 'fAcc') { ui.acc = t.value; render(); }
    else if (t.id === 'fLogo' && t.files[0]) {
      makeLogo(t.files[0]).then((logo) => save('config', Object.assign({}, R.get('config') || {}, { id: 'config', logo })))
        .then(() => { render(); toast('Logo tersimpan, dipakai di semua PDF'); }).catch((err) => toast('Logo gagal: ' + err.message));
    }
    else if (t.closest && t.closest('#cashRep')) updCashPrev();
    else if (t.matches && t.matches('.dayrow [name=d_cat]')) t.dataset.touched = '1';
    else if (t.matches && t.matches('.dayrow [name=d_kind], .dayrow [name=d_proj]')) refreshDayRow(t.closest('.dayrow'));
    else if (t.id === 'fImport') importJson(t.files[0]);
    else if (t.id === 'tPreset' && t.value !== '') {
      const pcts = C.PRESETS[Number(t.value)].percents, labels = C.makeTermLabels(pcts), box = $('#tRows');
      const used = [...box.querySelectorAll('.termrow')].some((r) => r.dataset.tid && C.paidFor(of('tx'), r.dataset.tid) > 0);
      if (used) { toast('Sudah ada pembayaran; ubah persen manual saja'); t.value = ''; return; }
      box.innerHTML = pcts.map((p, i) => termRow({ label: labels[i], percent: p })).join(''); updTermSum();
    } else if (t.name === 'projectId' && t.form && t.form.dataset.form === 'invoice') { invFillProject(t.form); }
    else if (t.name === 'projectId' && t.form && t.form.dataset.form === 'receipt') { const p = byId(t.value); if (p) { t.form.from.value = clientLine(p); t.form.projectLabel.value = p.name; } }
    else if (t.name === 'projectId' && t.form) { t.form.dataset.term = ''; refreshTx(t.form); }
    else if (t.name === 'liabilityId' && t.form) { const l = byId(t.value); if (l) { t.form.dataset.cat = l.category || ''; refreshTx(t.form); if (!C.parseNum(t.form.amount.value) && l.monthly) t.form.amount.value = fmtMoneyInput(l.monthly); } }
  });
  window.addEventListener('popstate', (e) => { const st = e.state || {}; ui.pid = st.pid || null; ui.qid = st.qid || null; ui.rid = st.rid || null; closeSheet(); render(); });

  /* ---------------- Invoice & kwitansi ---------------- */
  const termInvoice = (termId) => of('invoice').find((i) => i.termId === termId);
  const txReceipt = (txId) => of('receipt').find((r) => r.txId === txId);
  const clientLine = (p) => (p.client || '') + (p.attn ? ` (${p.attn.replace(/\s*\(.*\)$/, '')})` : '');
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + (Number(n) || 0)); return C.isoDate(d); };
  const PDFF = { rp: C.fmtRp, num: C.fmtNum, terbilang: C.terbilang, tanggal: C.tanggalPanjang, invoiceTotals: C.invoiceTotals };

  function vDocs() {
    const k = ui.docKind;
    const list = of(k).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.seq || 0) - (a.seq || 0));
    return `<h2>Invoice &amp; kwitansi</h2>
    <div class="seg" style="margin-bottom:12px"><button data-act="doc-kind" data-k="invoice" class="${k === 'invoice' ? 'on in' : ''}">Invoice</button><button data-act="doc-kind" data-k="receipt" class="${k === 'receipt' ? 'on in' : ''}">Kwitansi</button></div>
    <div class="card">${list.length ? list.map((d) => {
      const amt = d.type === 'invoice' ? C.invoiceTotals(d).total : d.amount;
      const who = d.type === 'invoice' ? d.billTo : d.from;
      return `<div class="row click" data-act="view-doc" data-id="${d.id}"><div class="grow"><div class="t">${esc(d.number)}</div>
        <div class="s">${fmtDate(d.date)} · ${esc(who || '-')}${d.projectLabel ? ' · ' + esc(d.projectLabel) : ''}</div></div><div class="amt">${rp(amt)}</div></div>`;
    }).join('') : `<div class="empty">Belum ada ${k === 'invoice' ? 'invoice' : 'kwitansi'}.<br>${k === 'invoice' ? 'Buat dari halaman proyek (per termin) atau ketuk +.' : 'Buat saat mencatat pembayaran, atau ketuk +.'}</div>`}</div>
    <button class="fab" data-act="${k === 'invoice' ? 'new-invoice' : 'new-receipt'}" aria-label="Dokumen baru">+</button>`;
  }

  function itemRow(it = {}) {
    return `<div class="itemrow card" style="padding:10px;margin-bottom:8px">
      <label style="margin-top:0">Uraian</label><input name="i_desc" value="${esc(it.desc || '')}" placeholder="mis. Design Arsitektural / DED / RAB (m²)">
      <label>Rincian (satu per baris, opsional)</label><textarea name="i_det" rows="2" placeholder="Modeling 2D&#10;Modeling 3D">${esc(it.details || '')}</textarea>
      <div style="display:grid;grid-template-columns:1fr .8fr 1.6fr auto;gap:6px;align-items:end">
        <div><label>Qty</label><input name="i_qty" inputmode="decimal" value="${esc(it.qty != null ? C.fmtNum(it.qty) : '1')}"></div>
        <div><label>Satuan</label><input name="i_unit" value="${esc(it.unit || '')}" placeholder="m²"></div>
        <div><label>Harga satuan (Rp)</label><input name="i_price" class="money" inputmode="numeric" value="${fmtMoneyInput(it.price)}"></div>
        <button class="btn sm danger" type="button" data-act="rm-item" style="margin-bottom:4px">✕</button></div></div>`;
  }
  function readItems(f) {
    return [...f.querySelectorAll('.itemrow')].map((r) => ({
      desc: r.querySelector('[name=i_desc]').value.trim(), details: r.querySelector('[name=i_det]').value.trim(),
      qty: C.parseDec(r.querySelector('[name=i_qty]').value), unit: r.querySelector('[name=i_unit]').value.trim(), price: C.parseNum(r.querySelector('[name=i_price]').value),
    })).filter((i) => i.desc || i.price);
  }
  function updInvTotal() {
    const f = sheet.querySelector('form[data-form=invoice]'); const el = $('#invTotal'); if (!f || !el) return;
    const t = C.invoiceTotals({ items: readItems(f), discount: C.parseNum(f.discount.value), taxPct: C.parseDec(f.taxPct.value) });
    el.textContent = 'Total ' + rp(t.total);
  }

  function invoiceForm(inv, pre = {}) {
    const c = cfg(), today = C.isoDate();
    let d = inv;
    if (!d) {
      const term = pre.termId ? byId(pre.termId) : null;
      const p = byId((term && term.projectId) || pre.projectId) || null;
      d = { date: today, dueDate: c.payDays ? addDays(today, c.payDays) : '', projectId: p ? p.id : '', termId: term ? term.id : '', notes: c.invNotes, discount: 0, taxPct: 0, items: [] };
      if (p) Object.assign(d, { billTo: p.client || '', attn: p.attn || '', address: p.address || '', projectLabel: p.name });
      if (term) {
        const s = C.projectSummary(p, of('term').filter((t) => t.projectId === p.id), of('tx')).sched.find((t) => t.id === term.id);
        d.items = [{ desc: `${term.label} (${C.fmtNum(term.percent)}%) – ${p.name}`, details: `Nilai kontrak ${rp(p.contract)}`, qty: 1, price: s ? s.remaining || s.amount : 0 }];
      } else if (p) d.items = [{ desc: p.name, qty: 1, price: p.contract }];
      else d.items = [{ qty: 1 }];
    }
    const seq = inv ? inv.seq : C.nextSeq(of('invoice'), d.date);
    const number = inv ? inv.number : C.docNumber(c.invPrefix, seq, d.date);
    const projects = of('project');
    const terms = d.projectId ? C.scheduleAmounts(byId(d.projectId), of('term').filter((t) => t.projectId === d.projectId)) : [];
    openSheet(`<form data-form="invoice" data-id="${inv ? inv.id : ''}" data-seq="${seq}">${head(inv ? 'Ubah invoice' : 'Invoice baru')}
      <label>Nomor invoice</label><input name="number" required value="${esc(number)}">
      <div class="cols"><div><label>Tanggal</label><input type="date" name="date" required value="${esc(d.date)}"></div><div><label>Jatuh tempo</label><input type="date" name="dueDate" value="${esc(d.dueDate || '')}"></div></div>
      <label>Proyek</label><select name="projectId"><option value="">— tanpa proyek —</option>${projects.map((p) => opt(p.id, p.name, p.id === d.projectId)).join('')}</select>
      <label>Untuk termin</label><select name="termId"><option value="">— tidak terkait termin —</option>${terms.map((t) => opt(t.id, `${t.label} (${t.percent}%)`, t.id === d.termId)).join('')}</select>
      <label>Ditagihkan kepada (Bill to)</label><input name="billTo" required value="${esc(d.billTo || '')}">
      <label>Kontak / PIC</label><input name="attn" value="${esc(d.attn || '')}">
      <label>Alamat</label><input name="address" value="${esc(d.address || '')}">
      <label>Nama proyek di invoice</label><input name="projectLabel" value="${esc(d.projectLabel || '')}">
      <h3 style="margin-top:16px;font-size:15px">Item</h3><div id="items">${d.items.map(itemRow).join('')}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="add-item">+ Item</button></div>
      <div class="cols"><div><label>Diskon (Rp)</label><input name="discount" class="money" inputmode="numeric" value="${fmtMoneyInput(d.discount)}"></div><div><label>Pajak (%)</label><input name="taxPct" inputmode="decimal" value="${esc(d.taxPct ? C.fmtNum(d.taxPct) : '')}" placeholder="0"></div></div>
      <div class="stat" style="margin-top:10px"><div class="v" id="invTotal"></div></div>
      <label>Catatan</label><textarea name="notes" rows="3">${esc(d.notes || '')}</textarea>
      ${foot()}</form>`);
    updInvTotal();
  }
  function invFillProject(f) {
    const p = byId(f.projectId.value);
    const terms = p ? C.scheduleAmounts(p, of('term').filter((t) => t.projectId === p.id)) : [];
    f.termId.innerHTML = '<option value="">— tidak terkait termin —</option>' + terms.map((t) => opt(t.id, `${t.label} (${t.percent}%)`)).join('');
    if (p) { f.billTo.value = p.client || ''; f.attn.value = p.attn || ''; f.address.value = p.address || ''; f.projectLabel.value = p.name; }
  }
  async function submitInvoice(f, d, id) {
    const items = readItems(f);
    if (!items.length) { toast('Isi minimal satu item'); return null; }
    const old = id ? byId(id) : null;
    const dup = of('invoice').find((x) => x.number === d.number.trim() && x.id !== id);
    if (dup && !confirm(`Nomor ${d.number} sudah dipakai. Tetap simpan?`)) return null;
    const rec = await save('invoice', Object.assign({}, old, {
      id, number: d.number.trim(), seq: old ? old.seq : Number(f.dataset.seq) || 1, date: d.date, dueDate: d.dueDate, projectId: d.projectId, termId: d.projectId ? d.termId : '',
      billTo: d.billTo.trim(), attn: d.attn.trim(), address: d.address.trim(), projectLabel: d.projectLabel.trim(),
      items, discount: C.parseNum(d.discount), taxPct: C.parseDec(d.taxPct), notes: d.notes.trim(),
    }));
    if (rec.termId) {
      const t = byId(rec.termId);
      if (t) await save('term', Object.assign({}, t, { billed: true, billedDate: t.billedDate || rec.date, dueDate: rec.dueDate || t.dueDate }));
    }
    return rec;
  }

  function receiptForm(r, tx) {
    const c = cfg();
    let d = r;
    if (!d) {
      d = { date: C.isoDate(), method: 'Transfer' };
      if (tx) {
        const p = byId(tx.projectId), t = byId(tx.termId), acc = byId(tx.accountId);
        Object.assign(d, { date: tx.date, amount: tx.amount, txId: tx.id, projectId: tx.projectId || '', desc: t ? t.label : tx.category, method: acc && /tunai|cash/i.test(acc.name) ? 'Tunai' : 'Transfer' });
        if (p) Object.assign(d, { from: clientLine(p), projectLabel: p.name });
      }
    }
    const seq = r ? r.seq : C.nextSeq(of('receipt'), d.date);
    const number = r ? r.number : C.docNumber(c.kwPrefix, seq, d.date);
    openSheet(`<form data-form="receipt" data-id="${r ? r.id : ''}" data-seq="${seq}" data-tx="${esc(d.txId || '')}">${head(r ? 'Ubah kwitansi' : 'Kwitansi baru')}
      <label>Nomor kwitansi</label><input name="number" required value="${esc(number)}">
      <label>Tanggal</label><input type="date" name="date" required value="${esc(d.date)}">
      <label>Proyek</label><select name="projectId"><option value="">— tanpa proyek —</option>${of('project').map((p) => opt(p.id, p.name, p.id === d.projectId)).join('')}</select>
      <label>Telah diterima dari</label><input name="from" required value="${esc(d.from || '')}">
      <label>Jumlah (Rp)</label><input name="amount" class="money" inputmode="numeric" required value="${fmtMoneyInput(d.amount)}">
      <label>Proyek (tertulis di kwitansi)</label><input name="projectLabel" value="${esc(d.projectLabel || '')}">
      <label>Uraian pembayaran</label><input name="desc" value="${esc(d.desc || '')}" placeholder="mis. Termin 1">
      <label>Metode pembayaran</label><select name="method">${['Transfer', 'Tunai', 'QRIS', 'Cek / Giro'].map((m) => opt(m, m, m === d.method)).join('')}</select>
      ${d.txId ? '' : '<div class="note">Kwitansi ini tidak mencatat kas. Untuk mencatat uang masuk, gunakan “Catat pembayaran” di proyek.</div>'}
      ${foot()}</form>`);
  }
  async function submitReceipt(d, id) {
    const amount = C.parseNum(d.amount); if (!amount) { toast('Jumlah belum diisi'); return null; }
    const old = id ? byId(id) : null, f = sheet.querySelector('form');
    const dup = of('receipt').find((x) => x.number === d.number.trim() && x.id !== id);
    if (dup && !confirm(`Nomor ${d.number} sudah dipakai. Tetap simpan?`)) return null;
    return save('receipt', Object.assign({}, old, {
      id, number: d.number.trim(), seq: old ? old.seq : Number(f.dataset.seq) || 1, date: d.date, projectId: d.projectId, txId: (old && old.txId) || f.dataset.tx || '',
      from: d.from.trim(), amount, projectLabel: d.projectLabel.trim(), desc: d.desc.trim(), method: d.method,
    }));
  }

  function docView(r) {
    if (!r) return;
    const inv = r.type === 'invoice', amt = inv ? C.invoiceTotals(r).total : r.amount;
    const canShare = !!(navigator.canShare && navigator.share);
    openSheet(`<form data-form="view">${head(esc(r.number))}
      <div class="muted s">${inv ? 'Invoice' : 'Kwitansi'} · ${fmtDate(r.date)}</div>
      <div class="card" style="margin-top:10px">
        <div class="row"><div class="grow s">${inv ? 'Ditagihkan kepada' : 'Diterima dari'}</div><div class="t">${esc(inv ? r.billTo : r.from)}</div></div>
        ${r.projectLabel ? `<div class="row"><div class="grow s">Proyek</div><div>${esc(r.projectLabel)}</div></div>` : ''}
        ${inv && r.dueDate ? `<div class="row"><div class="grow s">Jatuh tempo</div><div>${fmtDate(r.dueDate)}</div></div>` : ''}
        <div class="row"><div class="grow s">${inv ? 'Total' : 'Jumlah'}</div><div class="amt">${rp(amt)}</div></div>
        <div class="s muted" style="padding-top:6px;font-style:italic">${esc(C.terbilang(amt))}</div></div>
      <div class="actions">
        <button class="btn primary" type="button" data-act="pdf-dl" data-id="${r.id}">Unduh PDF</button>
        ${canShare ? `<button class="btn" type="button" data-act="pdf-share" data-id="${r.id}">Bagikan</button>` : ''}
        ${DS.isConnected() ? `<button class="btn" type="button" data-act="pdf-drive" data-id="${r.id}">Simpan ke Drive</button>` : ''}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="edit-doc" data-id="${r.id}">Ubah</button><button class="btn sm danger" type="button" data-act="del-doc" data-id="${r.id}">Hapus</button><button class="btn sm" type="button" data-act="close">Tutup</button></div>
      ${r.driveSaved ? `<div class="s muted">Tersimpan di Drive: ${new Date(r.driveSaved).toLocaleString('id-ID')}</div>` : ''}</form>`);
  }
  /* ---------- Laporan PDF ---------- */
  const termStatus = (t, today) => (t.remaining <= 0 && t.amount > 0 ? 'Lunas' : t.billed ? (t.dueDate && t.dueDate < today ? 'Terlambat' : 'Ditagih') : 'Belum ditagih');
  function reportData(p) {
    const terms = of('term').filter((t) => t.projectId === p.id), txsAll = of('tx'), today = C.isoDate();
    const summary = C.projectSummary(p, terms, txsAll);
    const txs = txsAll.filter((t) => t.projectId === p.id).sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => Object.assign({}, t, { termLabel: t.termId && byId(t.termId) ? byId(t.termId).label : '' }));
    const cat = new Map(); txs.filter((t) => t.kind === 'out').forEach((t) => cat.set(t.category || 'Lainnya', (cat.get(t.category || 'Lainnya') || 0) + t.amount));
    const docs = of('invoice').filter((x) => x.projectId === p.id).map((x) => ({ kind: 'Invoice', number: x.number, date: x.date, desc: x.termId && byId(x.termId) ? byId(x.termId).label : '', amount: C.invoiceTotals(x).total }))
      .concat(of('receipt').filter((x) => x.projectId === p.id).map((x) => ({ kind: 'Kwitansi', number: x.number, date: x.date, desc: x.desc, amount: x.amount })))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { project: p, summary, terms: summary.sched.map((t) => Object.assign({}, t, { status: termStatus(t, today) })), txs, docs, catTotals: [...cat].sort((a, b) => b[1] - a[1]), printedAt: today };
  }
  function allReport() {
    const terms = of('term'), txs = of('tx');
    const rows = of('project').filter((p) => p.status !== 'batal').sort((a, b) => (STORD[a.status] ?? 9) - (STORD[b.status] ?? 9) || a.name.localeCompare(b.name))
      .map((p) => ({ project: p, summary: C.projectSummary(p, terms.filter((t) => t.projectId === p.id), txs) }));
    const tot = { contract: 0, received: 0, remaining: 0, expense: 0, profit: 0 };
    rows.forEach(({ summary: s }) => { for (const k in tot) tot[k] += s[k]; });
    return { rows, tot };
  }
  /* periode laporan kas: minggu (Senin–Minggu) atau bulan */
  function periodOf(kind, from, to) {
    const t = new Date(C.isoDate() + 'T00:00:00'), iso = C.isoDate;
    const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    if (kind === 'w0') return { start: iso(mon), end: iso(addD(mon, 6)), label: 'Minggu ini' };
    if (kind === 'w1') { const m = addD(mon, -7); return { start: iso(m), end: iso(addD(m, 6)), label: 'Minggu lalu' }; }
    if (kind === 'm0') { const a = new Date(t.getFullYear(), t.getMonth(), 1), b = new Date(t.getFullYear(), t.getMonth() + 1, 0); return { start: iso(a), end: iso(b), label: C.BULAN_PANJANG[a.getMonth()] + ' ' + a.getFullYear() }; }
    if (kind === 'm1') { const a = new Date(t.getFullYear(), t.getMonth() - 1, 1), b = new Date(t.getFullYear(), t.getMonth(), 0); return { start: iso(a), end: iso(b), label: C.BULAN_PANJANG[a.getMonth()] + ' ' + a.getFullYear() }; }
    if (kind === 'mm' && from) { const [y, m] = from.split('-').map(Number); const a = new Date(y, m - 1, 1), b = new Date(y, m, 0); return { start: iso(a), end: iso(b), label: C.BULAN_PANJANG[m - 1] + ' ' + y }; }
    if (kind === 'cr' && from && to) return from <= to ? { start: from, end: to, label: 'Periode pilihan' } : { start: to, end: from, label: 'Periode pilihan' };
    return null;
  }
  function cashData(r) {
    const accAll = of('account'), all = of('tx'), acc = r.accountId ? byId(r.accountId) : null;
    // satu akun: hitung akun itu saja (termasuk bila bertanda pribadi/arsip)
    const accounts = acc ? [Object.assign({}, acc, { scope: 'usaha' })] : accAll;
    const prevDay = (() => { const x = new Date(r.start + 'T00:00:00'); x.setDate(x.getDate() - 1); return C.isoDate(x); })();
    const byAccount = acc ? [] : accAll.filter((a) => (a.scope || 'usaha') === 'usaha').map((a) => {
      const one = [Object.assign({}, a)], tx = all.filter((t) => t.accountId === a.id && t.date >= r.start && t.date <= r.end);
      return { name: a.name, opening: C.balanceAt(one, all, prevDay), in: tx.filter((t) => t.kind === 'in').reduce((x, t) => x + t.amount, 0), out: tx.filter((t) => t.kind === 'out').reduce((x, t) => x + t.amount, 0), closing: C.balanceAt(one, all, r.end) };
    });
    const txs = C.usahaTxs(accounts, all).filter((t) => t.date >= r.start && t.date <= r.end)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.updatedAt || 0) - (b.updatedAt || 0))
      .map((t) => Object.assign({}, t, { projectName: projName(t.projectId), accName: (byId(t.accountId) || {}).name || '' }));
    const group = (kind) => { const m = new Map(); txs.filter((t) => t.kind === kind).forEach((t) => m.set(t.category || 'Lainnya', (m.get(t.category || 'Lainnya') || 0) + t.amount)); return [...m].sort((a, b) => b[1] - a[1]); };
    const pm = new Map();
    txs.forEach((t) => { const k = t.projectName || 'Kantor / umum'; const v = pm.get(k) || { name: k, in: 0, out: 0 }; v[t.kind] += t.amount; pm.set(k, v); });
    return Object.assign({}, r, { opening: C.balanceAt(accounts, all, prevDay), closing: C.balanceAt(accounts, all, r.end), txs, catIn: group('in'), catOut: group('out'),
      byProject: [...pm.values()].sort((a, b) => (b.in + b.out) - (a.in + a.out)), byAccount, accountName: acc ? acc.name : '', printedAt: C.isoDate() });
  }
  function cashReportSheet() {
    const canShare = !!(navigator.canShare && navigator.share);
    const btns = ['rep-dl:Unduh PDF:primary', 'rep-print:Buka / cetak:'].concat(canShare ? ['rep-share:Bagikan:'] : []).concat(DS.isConnected() ? ['rep-drive:Simpan ke Drive:'] : []);
    openSheet(`<form data-form="view" id="cashRep">${head('Laporan kas')}
      <div class="muted s">Pemasukan dan pengeluaran usaha dalam satu periode: saldo awal–akhir, per kategori, per proyek, dan rincian transaksi.</div>
      <label>Akun kas</label><select name="acc" id="cashAcc"><option value="">Semua akun usaha</option>${of('account').map((a) => opt(a.id, a.name + (a.scope === 'pribadi' ? ' (pribadi)' : a.scope === 'arsip' ? ' (arsip)' : ''), a.id === ui.cashAcc)).join('')}</select>
      <label>Periode</label><select name="per" id="cashPer">${[['w0', 'Minggu ini'], ['w1', 'Minggu lalu'], ['m0', 'Bulan ini'], ['m1', 'Bulan lalu'], ['mm', 'Pilih bulan…'], ['cr', 'Pilih tanggal…']].map(([k, l]) => opt(k, l, k === (ui.cashPer || 'm0'))).join('')}</select>
      <div id="cashMonth" hidden><label>Bulan</label><input type="month" name="month" value="${C.monthKey(C.isoDate())}"></div>
      <div id="cashRange" class="cols" hidden><div><label>Dari</label><input type="date" name="from" value="${C.isoDate()}"></div><div><label>Sampai</label><input type="date" name="to" value="${C.isoDate()}"></div></div>
      <div class="s" id="cashPrev" style="margin-top:8px"></div>
      <div class="actions" style="margin-top:14px">${btns.map((b) => { const [a, l, c] = b.split(':'); return `<button class="btn ${c}" type="button" data-act="${a}" data-kind="cash">${l}</button>`; }).join('')}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="close">Tutup</button></div></form>`);
    updCashPrev();
  }
  function cashRange() {
    const f = $('#cashRep'); if (!f) return null;
    const r = periodOf(f.per.value, f.per.value === 'mm' ? f.month.value : f.from.value, f.to.value);
    return r ? Object.assign(r, { accountId: f.acc.value }) : null;
  }
  function updCashPrev() {
    const f = $('#cashRep'); if (!f) return;
    ui.cashPer = f.per.value; ui.cashAcc = f.acc.value;
    $('#cashMonth').hidden = f.per.value !== 'mm'; $('#cashRange').hidden = f.per.value !== 'cr';
    const r = cashRange(), el = $('#cashPrev'); if (!r) { el.textContent = ''; return; }
    const dt = cashData(r), i = dt.txs.filter((t) => t.kind === 'in').reduce((a, t) => a + t.amount, 0), o = dt.txs.filter((t) => t.kind === 'out').reduce((a, t) => a + t.amount, 0);
    el.innerHTML = `${fmtDate(r.start)} – ${fmtDate(r.end)} · ${dt.txs.length} transaksi · <span class="in">masuk ${rp(i)}</span> · <span class="out">keluar ${rp(o)}</span>`;
  }
  const slug = (x) => String(x || '').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50);
  function reportSheet(kind, id) {
    const p = id ? byId(id) : null;
    const title = p ? 'Laporan ' + p.name : 'Rekap semua proyek';
    const canShare = !!(navigator.canShare && navigator.share);
    openSheet(`<form data-form="view">${head(esc(title))}
      <div class="muted s">${p ? 'Ringkasan keuangan, termin, semua transaksi, biaya per kategori, dan dokumen proyek ini.' : 'Nilai kontrak, pembayaran, sisa tagihan, biaya, dan laba semua proyek dalam satu tabel.'}</div>
      <div class="actions" style="margin-top:14px">
        <button class="btn primary" type="button" data-act="rep-dl" data-kind="${kind}" data-id="${id || ''}">Unduh PDF</button>
        <button class="btn" type="button" data-act="rep-print" data-kind="${kind}" data-id="${id || ''}">Buka / cetak</button>
        ${canShare ? `<button class="btn" type="button" data-act="rep-share" data-kind="${kind}" data-id="${id || ''}">Bagikan</button>` : ''}
        ${DS.isConnected() ? `<button class="btn" type="button" data-act="rep-drive" data-kind="${kind}" data-id="${id || ''}">Simpan ke Drive</button>` : ''}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="close">Tutup</button></div></form>`);
  }
  async function reportAction(a, el) {
    const kind = el.dataset.kind, p = el.dataset.id ? byId(el.dataset.id) : null;
    const printWin = a === 'rep-print' ? window.open('', '_blank') : null; // dibuka langsung saat diketuk agar tidak diblokir
    const label = el.textContent; el.disabled = true; el.textContent = 'Menyiapkan…';
    try {
      let blob, name;
      if (kind === 'cash') { const r = cashRange(); if (!r) throw new Error('Pilih periode dulu'); const dt = cashData(r); blob = await window.LaporanPDF.cashflow(dt, bizInfo(), PDFF); name = `Laporan_Kas_${dt.accountName ? slug(dt.accountName) + '_' : ''}${r.start}_sd_${r.end}.pdf`; }
      else if (kind === 'one') { blob = await window.LaporanPDF.project(reportData(p), bizInfo(), PDFF); name = `Laporan_${slug(p.name)}_${C.isoDate()}.pdf`; }
      else { const r = allReport(); blob = await window.LaporanPDF.allProjects(r.rows, r.tot, bizInfo(), PDFF, C.isoDate()); name = `Rekap_Keuangan_Proyek_${C.isoDate()}.pdf`; }
      const url = URL.createObjectURL(blob);
      if (a === 'rep-dl') { const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
      else if (a === 'rep-print') { if (printWin) printWin.location.href = url; else window.location.href = url; }
      else if (a === 'rep-share') { const file = new File([blob], name, { type: 'application/pdf' }); if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name }); else toast('Perangkat ini tidak mendukung berbagi file'); }
      else if (a === 'rep-drive') { if (!navigator.onLine) throw new Error('Sedang offline'); await DS.uploadFile('Laporan', name, blob); toast('Tersimpan di Drive: Widemp Atelier/Laporan'); }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      if (printWin) printWin.close();
      if (!(err && err.name === 'AbortError')) { console.error(err); toast('Gagal: ' + err.message); }
    } finally { el.disabled = false; el.textContent = label; }
  }
  const pdfName = (r) => `${r.type === 'invoice' ? 'Invoice' : 'Kwitansi'}_${r.number.replace(/[\\/:*?"<>|]+/g, '-')}_${(r.type === 'invoice' ? r.billTo : r.from || '').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)}.pdf`;
  const makePdf = (r) => (r.type === 'invoice' ? window.WidempPDF.invoice(r, bizInfo(), PDFF) : window.WidempPDF.receipt(r, bizInfo(), PDFF));
  async function pdfAction(a, r, btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Menyiapkan…';
    try {
      const blob = await makePdf(r), name = pdfName(r);
      if (a === 'pdf-dl') {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } else if (a === 'pdf-share') {
        const file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: r.number });
        else toast('Perangkat ini tidak mendukung berbagi file');
      } else if (a === 'pdf-drive') {
        if (!navigator.onLine) throw new Error('Sedang offline');
        await DS.uploadFile(r.type === 'invoice' ? 'Invoice' : 'Kwitansi', name, blob);
        const saved = await save(r.type, Object.assign({}, r, { driveSaved: Date.now() }));
        docView(saved); toast('Tersimpan di Drive'); return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err); toast('Gagal: ' + err.message);
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  /* ---------------- Logo unggahan → data gambar untuk PDF ---------------- */
  async function deflateB64(bytes) {
    if (!window.CompressionStream) throw new Error('Browser ini belum mendukung; pakai Chrome atau Edge terbaru');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function makeLogo(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibaca')); i.src = url; });
      const k = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      const px = g.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3), al = new Uint8Array(w * h);
      for (let i = 0, j = 0, n = 0; i < px.length; i += 4, j += 3, n++) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; al[n] = px[i + 3]; }
      return { w, h, rgb: await deflateB64(rgb), alpha: await deflateB64(al) };
    } finally { URL.revokeObjectURL(url); }
  }

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
  function paintPending() {
    let b = $('#pendingBar');
    const show = DS.isConnected() && syncState.kind === 'err';
    if (!show) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'pendingBar'; b.className = 'note'; b.style.cssText = 'max-width:1240px;margin:10px auto 0;display:flex;gap:10px;align-items:center;justify-content:space-between'; document.querySelector('header.top').after(b); }
    b.innerHTML = `<span>${dirtyAt() ? 'Ada perubahan yang belum terkirim ke perangkat lain.' : 'Sinkron berhenti sementara (login Google berakhir). Data tetap aman di perangkat ini.'}</span><button class="btn sm primary" type="button" id="pendingBtn">Sinkron sekarang</button>`;
    $('#pendingBtn').onclick = () => runSync(true);
  }
  function paintSync() {
    const p = $('#syncPill'); if (!p) return;
    let s = syncState;
    if (!DS.isConnected()) s = { kind: '', text: 'Belum terhubung' };
    p.className = 'avatar ' + (s.kind || ''); p.title = s.text; $('#syncText').textContent = s.text;
    p.firstChild.textContent = (cfg().businessName || 'WA').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
  let syncAgain = false;
  async function runSync(interactive) {
    if (!DS.isConnected()) return;
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { syncState = { kind: '', text: 'Offline · tersimpan lokal' }; return paintSync(); }
    syncing = true; syncState = { kind: 'busy', text: 'Menyinkron…' }; paintSync();
    const startedAt = Date.now();
    try {
      await DS.sync(all, applyMerged, interactive, { dirty: !!dirtyAt() });
      if (dirtyAt() && dirtyAt() <= startedAt) localStorage.removeItem(DIRTY);
      syncState = { kind: 'ok', text: 'Tersinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) };
      if (interactive) toast('Sinkron selesai');
    } catch (err) {
      console.warn('sync', err);
      syncState = { kind: 'err', text: /login|Izin/i.test(err.message) ? 'Ketuk untuk sinkron' : 'Gagal sinkron' };
      if (interactive) toast(err.message);
    } finally { syncing = false; paintSync(); paintPending(); if (syncAgain) { syncAgain = false; setTimeout(() => runSync(false), 50); } if (ui.tab === 'set' || (ui.tab === 'data' && ui.dataSeg === 'set')) render(); }
  }
  const DIRTY = 'wk_dirty_at';
  const dirtyAt = () => Number(localStorage.getItem(DIRTY)) || 0;
  function queueSync() {
    if (!DS.isConnected()) return;
    try { localStorage.setItem(DIRTY, String(Date.now())); } catch (e) { /* abaikan */ }
    clearTimeout(syncTimer); syncState = { kind: 'busy', text: 'Menyimpan…' }; paintSync(); syncTimer = setTimeout(() => runSync(false), 250);
  }
  setInterval(() => { if (!document.hidden && DS.isConnected() && DS.hasToken() && navigator.onLine) runSync(false); }, 20000);
  async function driveConnect() {
    const id = ($('#sClient') && $('#sClient').value.trim()) || '';
    if (id) localStorage.setItem(DS.K.client, id);
    if (!DS.clientId()) return toast('Isi Client ID Google dulu (lihat panduan)');
    try {
      if (!DS.isConnected()) { await DS.connect(); }
      await runSync(true);
    } catch (err) { toast(err.message); }
  }
  $('#syncPill').addEventListener('click', () => { if (!DS.isConnected()) { ui.tab = 'data'; ui.dataSeg = 'set'; ui.pid = null; ui.qid = null; ui.rid = null; render(); } else runSync(true); });
  window.addEventListener('online', () => runSync(false));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DS.isConnected() && Date.now() - DS.lastSync() > 15000) runSync(false); });
  window.addEventListener('focus', () => { if (DS.isConnected() && Date.now() - DS.lastSync() > 15000) runSync(false); });

  /* ---------------- API untuk modul Studio (penawaran, RAB, database) ---------------- */
  if (window.Studio) window.Studio.init({ R, ui, of, byId, save, del, cfg, bizInfo, openSheet, closeSheet, toast, render, esc, fmtDate, opt, head, foot, fmtMoneyInput, PDFF, DS, vSettings });

  /* ---------------- Mulai ---------------- */
  (async function init() {
    try {
      db = await openDB();
      (await idbAll()).forEach((r) => R.set(r.id, r));
      await seed();
      const cf = R.get('config');
      if (cf && cf.cats && !cf.catsV3 && cf.updatedAt > 0) {
        const out = cf.cats.out.slice(); for (const c of ['Pembangunan kantor', 'Cicilan rumah kantor', 'Cicilan hutang']) if (!out.includes(c)) out.splice(Math.max(0, out.length - 1), 0, c);
        await save('config', Object.assign({}, cf, { cats: Object.assign({}, cf.cats, { out }), catsV2: true, catsV3: true }));
      }
      if (!window.WF_EDITION && cf && cf.updatedAt > 0 && !cf.kasV1) {
        const cash = R.get('acc-cash');
        if (cash && !cash.deleted && cash.name === 'Kas tunai') await save('account', Object.assign({}, cash, { name: 'Petty Cash' }));
        if (!R.has('acc-pusat')) await save('account', { id: 'acc-pusat', name: 'Kas Pusat', scope: 'usaha', opening: 0 });
        if (!R.has('acc-ops')) await save('account', { id: 'acc-ops', name: 'Kas Operasional', scope: 'usaha', opening: 0 });
        await save('config', Object.assign({}, R.get('config'), { kasV1: true }));
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (err) {
      view.innerHTML = '<div class="card">Penyimpanan lokal tidak bisa dibuka: ' + esc(err.message) + '<br>Jangan gunakan mode privat/penyamaran.</div>';
      return;
    }
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      const hadSW = !!navigator.serviceWorker.controller; let reloading = false;
      // versi baru terpasang -> muat ulang sekali supaya menu & fitur baru langsung tampil
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadSW || reloading) return; reloading = true; location.reload(); });
      navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
    }
    if (DS.isConnected()) { DS.warmup(); setTimeout(() => runSync(false), 600); }
    window.__app = { R, ui, render, runSync };
  })();
})();
