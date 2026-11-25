/* WIDEMP FINANCE — lapisan mode demo: data contoh, banner, batasan, tombol beli */
(function () {
  'use strict';
  const WA = '6282251613598';
  const BUY_TEXT = 'Halo, saya tertarik membeli WIDEMP FINANCE (aplikasi keuangan proyek). Boleh info harga dan cara pemasangannya?';
  const buyUrl = (ctx) => `https://wa.me/${WA}?text=${encodeURIComponent(BUY_TEXT + (ctx ? '\n\n(' + ctx + ')' : ''))}`;
  const MAX_PROJECTS = 6;

  // Sinkron Google Drive tidak tersedia di demo
  window.DriveSync = {
    K: { client: 'wfd_client' }, clientId: () => '', isConnected: () => false, hasToken: () => false, lastSync: () => 0,
    connect: async () => { throw new Error('Sinkron tersedia di versi lengkap'); }, disconnect() {}, sync: async () => ({}),
    uploadFile: async () => { throw new Error('Simpan ke Drive tersedia di versi lengkap'); }, refreshToken: () => Promise.resolve(), warmup: () => Promise.resolve(),
  };
  self.PDF_WATERMARK = 'DEMO';
  window.WF_EDITION = 'demo';

  /* ---------- data contoh (semua fiktif), tanggal mengikuti hari ini ---------- */
  function seed() {
    const now = Date.now(), recs = [];
    const pad = (n) => String(n).padStart(2, '0');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = (monthsAgo, d) => { const x = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1); x.setDate(Math.min(d, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); if (x > today) x.setTime(today.getTime()); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const ahead = (days) => { const x = new Date(today); x.setDate(x.getDate() + days); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    let n = 0; const add = (type, data) => { const r = Object.assign({ id: 'demo-' + type + '-' + (++n), type, updatedAt: now - 100000 + n }, data); recs.push(r); return r; };

    recs.push({ id: 'config', type: 'config', updatedAt: now - 200000, businessName: 'Studio Arsitek Nusantara', city: 'Bandung', phone: '0812-0000-0000', email: 'halo@studionusantara.contoh',
      tagline: 'DESAIN YANG BERCERITA', bank: 'Bank Contoh', accName: 'Studio Arsitek Nusantara', accNo: '1234567890', invPrefix: 'INV/SAN', kwPrefix: 'KW/SAN', payDays: 7,
      invNotes: 'Harga belum termasuk pajak.\nPembayaran paling lambat 7 hari setelah invoice diterima.', catsV2: true, catsV3: true,
      cats: { in: ['Pembayaran proyek', 'Jasa konsultasi', 'Lainnya'], out: ['Gaji & honor', 'Transportasi', 'Material', 'Tukang / subkon', 'Software & langganan', 'Operasional kantor', 'Cicilan kendaraan', 'Pajak', 'Lainnya'] } });
    recs.push({ id: 'acc-bank', type: 'account', updatedAt: now - 200000, name: 'Rekening usaha', scope: 'usaha', opening: 12000000 });
    recs.push({ id: 'acc-cash', type: 'account', updatedAt: now - 200000, name: 'Kas tunai', scope: 'usaha', opening: 1500000 });

    const P = (d, terms) => {
      const p = add('project', Object.assign({ status: 'aktif', createdAt: now - 9e9 + n * 1e6 }, d));
      const T = terms.map(([label, pct, o = {}], i) => add('term', { projectId: p.id, no: i + 1, label, percent: pct, billed: !!(o.billed || o.pay), billedDate: o.billed || o.pay ? o.pay || o.billed : '', dueDate: o.due || '' }));
      terms.forEach(([, pct, o = {}], i) => { if (o.pay) add('tx', { kind: 'in', date: o.pay, amount: o.amt || Math.round(p.contract * pct / 100), category: 'Pembayaran proyek', accountId: 'acc-bank', projectId: p.id, termId: T[i].id, note: T[i].label }); });
      return { p, T };
    };
    const out = (date, amount, category, projectId, note, acc) => add('tx', { kind: 'out', date, amount, category, accountId: acc || 'acc-bank', projectId: projectId || '', note });

    const a = P({ name: 'Rumah Tinggal Bp. Hendra', client: 'Bp. Hendra Wijaya', address: 'Bandung', service: 'Desain + pengawasan', progress: 70, contract: 48000000 },
      [['Uang muka (DP)', 30, { pay: day(5, 6) }], ['Termin 2', 40, { pay: day(2, 12) }], ['Pelunasan', 30, { due: ahead(20) }]]);
    const b = P({ name: 'Kafe Kopi Senja', client: 'CV Senja Abadi', attn: 'Ibu Laras', address: 'Lembang', service: 'Desain interior', progress: 90, contract: 32000000 },
      [['Uang muka (DP)', 50, { pay: day(3, 4) }], ['Pelunasan', 50, { billed: day(0, 2), due: day(0, 9) }]]);
    const c = P({ name: 'Renovasi Kantor PT Maju Jaya', client: 'PT Maju Jaya', address: 'Cimahi', service: 'Desain & RAB', progress: 35, contract: 27500000 },
      [['Uang muka (DP)', 30, { pay: day(1, 15) }], ['Termin 2', 40], ['Pelunasan', 30]]);
    const d = P({ name: 'Villa Puncak Asri', client: 'Bp. Andre Saputra', address: 'Ciwidey', service: 'Desain arsitektur', progress: 15, contract: 65000000 },
      [['Uang muka (DP)', 30, { pay: day(0, 3) }], ['Termin 2', 30], ['Termin 3', 30], ['Pelunasan', 10]]);
    P({ name: 'Interior Apartemen Ibu Rina', client: 'Ibu Rina Kartika', address: 'Jakarta Selatan', service: 'Desain interior', progress: 100, contract: 18000000, status: 'selesai' },
      [['Pembayaran penuh', 100, { pay: day(4, 20) }]]);

    // biaya proyek & kantor beberapa bulan terakhir
    out(day(5, 10), 1250000, 'Transportasi', a.p.id, 'Survei lokasi & ukur');
    out(day(4, 2), 3200000, 'Gaji & honor', a.p.id, 'Honor drafter');
    out(day(4, 25), 2100000, 'Tukang / subkon', '', 'Maket presentasi');
    out(day(3, 8), 4500000, 'Material', b.p.id, 'Sampel material & finishing');
    out(day(3, 18), 2800000, 'Gaji & honor', b.p.id, 'Honor visualiser 3D');
    out(day(2, 14), 6200000, 'Tukang / subkon', a.p.id, 'Pengawasan lapangan & tukang');
    out(day(1, 20), 1850000, 'Transportasi', c.p.id, 'Survei & rapat klien');
    out(day(0, 5), 2400000, 'Gaji & honor', d.p.id, 'Honor drafter');
    out(day(0, 6), 450000, 'Transportasi', d.p.id, 'Survei lokasi villa', 'acc-cash');
    for (let m = 5; m >= 0; m--) {
      out(day(m, 1), 1350000, 'Software & langganan', '', 'Lisensi software desain');
      out(day(m, 5), 1800000, 'Operasional kantor', '', 'Listrik, internet, ATK');
      out(day(m, 10), 2750000, 'Cicilan kendaraan', '', 'Cicilan mobil operasional', 'acc-bank');
    }
    // kewajiban
    const L = add('liability', { name: 'Cicilan mobil operasional', total: 99000000, paidBefore: 49500000, monthly: 2750000, category: 'Cicilan kendaraan', note: '36 bulan' });
    recs.filter((r) => r.type === 'tx' && r.category === 'Cicilan kendaraan').forEach((r) => { r.liabilityId = L.id; });
    // dokumen contoh
    const inv = add('invoice', { number: 'INV/SAN/001/' + ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][today.getMonth()] + '/' + today.getFullYear(), seq: 1, date: day(0, 2), dueDate: day(0, 9),
      projectId: b.p.id, termId: b.T[1].id, billTo: 'CV Senja Abadi', attn: 'Ibu Laras', address: 'Lembang', projectLabel: 'Kafe Kopi Senja',
      items: [{ desc: 'Pelunasan (50%) – Desain interior Kafe Kopi Senja', details: 'Gambar kerja interior\nRender 3D 12 view\nDetail furnitur', qty: 1, price: 16000000 }], discount: 0, taxPct: 0,
      notes: 'Harga belum termasuk pajak.\nPembayaran paling lambat 7 hari setelah invoice diterima.' });
    void inv;
    const dpTx = recs.find((r) => r.type === 'tx' && r.projectId === d.p.id && r.kind === 'in');
    add('receipt', { number: 'KW/SAN/001/' + ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][today.getMonth()] + '/' + today.getFullYear(), seq: 1, date: dpTx.date, projectId: d.p.id, txId: dpTx.id,
      from: 'Bp. Andre Saputra', amount: dpTx.amount, projectLabel: 'Villa Puncak Asri', desc: 'Uang muka (DP)', method: 'Transfer' });
    return recs;
  }

  function resetDemo() {
    if (!confirm('Kembalikan data demo ke contoh awal? Semua yang Anda coba ketik akan dihapus.')) return;
    const req = indexedDB.deleteDatabase('widemp-finance-demo');
    req.onsuccess = req.onerror = req.onblocked = () => location.reload();
  }

  function banner() {
    const b = document.createElement('div');
    b.className = 'demo-bar';
    b.innerHTML = `<div class="demo-in"><span><b>MODE DEMO</b> · data contoh fiktif, tersimpan di browser ini saja. PDF bertanda “DEMO”.</span>
      <span class="demo-act"><button type="button" class="btn sm" id="demoReset">Reset demo</button><a class="btn sm primary" id="demoBuy" target="_blank" rel="noopener" href="${buyUrl('dari aplikasi demo')}">Beli WIDEMP FINANCE</a></span></div>`;
    document.querySelector('header.top').after(b);
    b.querySelector('#demoReset').onclick = resetDemo;
  }

  function upsell(title, why) {
    const sheet = document.getElementById('sheet');
    sheet.innerHTML = `<form data-form="view"><h3>${title}</h3><div class="muted s" style="margin:6px 0 14px">${why}</div>
      <div class="note">Versi lengkap WIDEMP FINANCE: proyek tanpa batas, sinkron otomatis HP–laptop lewat Google Drive milik Anda, PDF tanpa tanda demo dengan logo usaha Anda sendiri, cadangan &amp; impor data.</div>
      <div class="actions"><a class="btn primary" target="_blank" rel="noopener" href="${buyUrl(title)}">Tanya harga via WhatsApp</a><button class="btn" type="button" data-act="close">Nanti saja</button></div></form>`;
    if (!sheet.open) sheet.showModal();
  }

  // cegat aksi yang dibatasi di demo (sebelum app.js menanganinya)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, R = window.__app && window.__app.R;
    const projects = R ? [...R.values()].filter((r) => r.type === 'project' && !r.deleted).length : 0;
    let block = null;
    if (a === 'new-project' && projects >= MAX_PROJECTS) block = ['Batas proyek demo tercapai', `Versi demo dibatasi ${MAX_PROJECTS} proyek.`];
    else if (a === 'drive-connect' || a === 'pdf-drive' || a === 'rep-drive') block = ['Sinkron & Google Drive', 'Di versi lengkap, data otomatis sama di HP, tablet, dan laptop, dan PDF bisa langsung disimpan ke Drive Anda.'];
    else if (a === 'export') block = ['Cadangan data', 'Ekspor dan impor cadangan data tersedia di versi lengkap.'];
    if (block) { e.stopImmediatePropagation(); e.preventDefault(); upsell(block[0], block[1]); }
  }, true);

  window.DemoSeed = seed;
  window.DemoUpsell = upsell;
  window.DemoBuyUrl = buyUrl;
  document.addEventListener('DOMContentLoaded', banner);
})();
