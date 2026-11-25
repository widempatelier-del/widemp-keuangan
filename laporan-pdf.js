/* Laporan keuangan per proyek & rekap semua proyek (PDF) */
(function () {
  'use strict';
  const W = self.WidempPDF;
  const { Doc, COL, wrap } = W;
  const label = (d, s, x, y, o = {}) => d.text(s, x, y, Object.assign({ font: 'B', size: 7, color: COL.tan, spacing: 0.3, upper: true }, o));

  // tabel sederhana dengan pindah halaman otomatis
  function table(ctx, cols, rows, opt = {}) {
    const { d } = ctx, X0 = ctx.X0, X1 = ctx.X1, fs = opt.size || 8;
    const xs = []; let x = X0; const tot = cols.reduce((s, c) => s + c.w, 0);
    for (const c of cols) { const w = (c.w / tot) * (X1 - X0); xs.push({ x, w }); x += w; }
    const head = () => {
      d.rect(X0, ctx.y, X1 - X0, 20, COL.dark);
      cols.forEach((c, i) => d.text(c.h, c.align === 'right' ? xs[i].x + xs[i].w - 5 : xs[i].x + 5, ctx.y + 13, { font: 'B', size: 6.8, color: COL.white, spacing: 0.2, align: c.align === 'right' ? 'right' : 'left' }));
      ctx.y += 20;
    };
    head();
    rows.forEach((r, ri) => {
      const cells = cols.map((c, i) => wrap(r.cells[i] == null ? '' : String(r.cells[i]), r.bold ? 'B' : 'R', fs, xs[i].w - 10));
      const h = Math.max(...cells.map((l) => l.length)) * (fs + 3) + 9;
      if (ctx.y + h > ctx.BOT) { ctx.newPage(); head(); }
      if (r.bold) d.rect(X0, ctx.y, X1 - X0, h, COL.cream); else if (ri % 2) d.rect(X0, ctx.y, X1 - X0, h, '#faf8f4');
      cells.forEach((ls, i) => ls.forEach((l, k) => d.text(l, cols[i].align === 'right' ? xs[i].x + xs[i].w - 5 : xs[i].x + 5, ctx.y + 12 + k * (fs + 3),
        { size: fs, font: r.bold ? 'B' : 'R', color: (r.colors && r.colors[i]) || COL.text, align: cols[i].align === 'right' ? 'right' : 'left' })));
      ctx.y += h; d.line(X0, ctx.y, X1, ctx.y, COL.line, 0.5);
    });
    ctx.y += 14;
  }

  function frame(d, biz, title, sub, size) {
    const PW = d.pw, PH = d.ph, X0 = 40, X1 = PW - 40;
    const ctx = { d, X0, X1, y: 0, BOT: PH - 60 };
    ctx.header = (first) => {
      d.logo(X0, 24, first ? 86 : 60);
      d.text(title, X1, first ? 50 : 42, { font: 'B', size: first ? 18 : 12, color: COL.dark, align: 'right' });
      d.text(sub, X1, first ? 66 : 56, { size: 8, color: COL.gray, align: 'right' });
      const ly = first ? 88 : 72; d.line(X0, ly, X1, ly, COL.tan, 1);
      ctx.y = ly + 22;
    };
    ctx.newPage = () => { d.addPage(); ctx.header(false); };
    ctx.footer = () => {
      const n = d.pages.length;
      d.pages.forEach((ops, i) => {
        d.ops = ops;
        d.line(X0, PH - 40, X1, PH - 40, COL.line, 0.6);
        d.text([biz.name, biz.phone, biz.email].filter(Boolean).join('  ·  '), X0, PH - 28, { size: 6.8, color: COL.gray });
        d.text(`Halaman ${i + 1} dari ${n}`, X1, PH - 28, { size: 6.8, color: COL.gray, align: 'right' });
      });
    };
    ctx.header(true);
    return ctx;
  }

  function boxes(ctx, items) {
    const { d } = ctx, gap = 8, n = items.length, w = (ctx.X1 - ctx.X0 - gap * (n - 1)) / n;
    items.forEach(([k, v, color], i) => {
      const x = ctx.X0 + i * (w + gap);
      d.rect(x, ctx.y, w, 44, COL.cream);
      label(d, k, x + 8, ctx.y + 14, { size: 6.3 });
      d.text(v, x + 8, ctx.y + 32, { font: 'B', size: n > 4 ? 9.5 : 11, color: color || COL.dark });
    });
    ctx.y += 60;
  }
  const section = (ctx, s) => { if (ctx.y + 50 > ctx.BOT) ctx.newPage(); label(ctx.d, s, ctx.X0, ctx.y, { size: 7.5 }); ctx.y += 10; };

  /** data: { project, summary, terms, txs, docs, catTotals, printedAt } */
  function project(data, biz, F) {
    const { project: p, summary: s } = data, rp = F.rp;
    const d = new Doc();
    const ctx = frame(d, biz, 'LAPORAN PROYEK', 'Dicetak ' + F.tanggal(data.printedAt), null);
    // identitas
    d.text(p.name, ctx.X0, ctx.y + 4, { font: 'B', size: 15, color: COL.dark });
    const meta = [p.client && 'Klien: ' + p.client + (p.attn ? ' (' + p.attn + ')' : ''), p.service && 'Layanan: ' + p.service, 'Status: ' + (p.status || '-'), 'Progres pekerjaan: ' + (Number(p.progress) || 0) + '%'].filter(Boolean).join('   ·   ');
    ctx.y += 20; wrap(meta, 'R', 8.5, ctx.X1 - ctx.X0).forEach((l) => { d.text(l, ctx.X0, ctx.y, { size: 8.5, color: COL.gray }); ctx.y += 12; });
    if (p.address) { d.text('Alamat: ' + p.address, ctx.X0, ctx.y, { size: 8.5, color: COL.gray }); ctx.y += 12; }
    if (p.note) { wrap('Catatan: ' + p.note, 'R', 8.5, ctx.X1 - ctx.X0).forEach((l) => { d.text(l, ctx.X0, ctx.y, { size: 8.5, color: COL.gray }); ctx.y += 12; }); }
    ctx.y += 10;
    boxes(ctx, [['Nilai kontrak', rp(s.contract)], ['Sudah diterima', rp(s.received), '#4f6a33'], ['Sisa tagihan', rp(s.remaining)], ['Biaya proyek', rp(s.expense), '#9b5a3c'], ['Laba kasar', rp(s.profit), s.profit < 0 ? '#9b5a3c' : COL.dark]]);
    // progres bayar
    const pct = s.contract ? Math.min(100, Math.round((s.received / s.contract) * 100)) : 0;
    label(d, `Pembayaran ${pct}% dari nilai kontrak`, ctx.X0, ctx.y, { size: 6.5 }); ctx.y += 6;
    d.rect(ctx.X0, ctx.y, ctx.X1 - ctx.X0, 5, COL.line); d.rect(ctx.X0, ctx.y, (ctx.X1 - ctx.X0) * pct / 100, 5, '#4a5034'); ctx.y += 22;

    section(ctx, 'Termin pembayaran');
    if (data.terms.length) table(ctx, [
      { h: 'NO', w: 4 }, { h: 'TERMIN', w: 22 }, { h: '%', w: 6, align: 'right' }, { h: 'NILAI', w: 13, align: 'right' }, { h: 'DIBAYAR', w: 13, align: 'right' },
      { h: 'SISA', w: 13, align: 'right' }, { h: 'STATUS', w: 11 }, { h: 'JATUH TEMPO', w: 12 },
    ], data.terms.map((t, i) => ({ cells: [i + 1, t.label, F.num(t.percent), rp(t.amount), rp(t.paid), rp(t.remaining), t.status, t.dueDate ? F.tanggal(t.dueDate) : '-'] }))
      .concat([{ bold: true, cells: ['', 'Total', '', rp(data.terms.reduce((a, t) => a + t.amount, 0)), rp(data.terms.reduce((a, t) => a + t.paid, 0)), rp(data.terms.reduce((a, t) => a + t.remaining, 0)), '', ''] }]));
    else { d.text('Belum ada termin.', ctx.X0, ctx.y + 6, { size: 8.5, color: COL.gray }); ctx.y += 24; }

    section(ctx, 'Transaksi');
    if (data.txs.length) {
      const inn = data.txs.filter((t) => t.kind === 'in').reduce((a, t) => a + t.amount, 0), out = data.txs.filter((t) => t.kind === 'out').reduce((a, t) => a + t.amount, 0);
      table(ctx, [{ h: 'TANGGAL', w: 12 }, { h: 'KATEGORI', w: 17 }, { h: 'KETERANGAN', w: 37 }, { h: 'MASUK', w: 14, align: 'right' }, { h: 'KELUAR', w: 14, align: 'right' }],
        data.txs.map((t) => ({ cells: [F.tanggal(t.date), t.category || '', [t.termLabel, t.note].filter(Boolean).join(' · '), t.kind === 'in' ? rp(t.amount) : '', t.kind === 'out' ? rp(t.amount) : ''], colors: [null, null, null, '#4f6a33', '#9b5a3c'] }))
          .concat([{ bold: true, cells: ['', 'Total', '', rp(inn), rp(out)] }]), { size: 7.8 });
    } else { d.text('Belum ada transaksi.', ctx.X0, ctx.y + 6, { size: 8.5, color: COL.gray }); ctx.y += 24; }

    if (data.catTotals.length) {
      section(ctx, 'Biaya per kategori');
      const tot = data.catTotals.reduce((a, c) => a + c[1], 0);
      table(ctx, [{ h: 'KATEGORI', w: 50 }, { h: 'JUMLAH', w: 25, align: 'right' }, { h: 'PORSI', w: 25, align: 'right' }],
        data.catTotals.map(([k, v]) => ({ cells: [k, rp(v), (tot ? Math.round((v / tot) * 1000) / 10 : 0).toString().replace('.', ',') + '%'] })).concat([{ bold: true, cells: ['Total biaya', rp(tot), '100%'] }]));
    }
    if (data.docs.length) {
      section(ctx, 'Dokumen');
      table(ctx, [{ h: 'JENIS', w: 14 }, { h: 'NOMOR', w: 30 }, { h: 'TANGGAL', w: 18 }, { h: 'KETERANGAN', w: 20 }, { h: 'JUMLAH', w: 18, align: 'right' }],
        data.docs.map((x) => ({ cells: [x.kind, x.number, F.tanggal(x.date), x.desc || '', rp(x.amount)] })));
    }
    ctx.footer();
    return d.build('Laporan ' + p.name);
  }

  /** rows: [{ project, summary }] */
  function allProjects(rows, totals, biz, F, printedAt) {
    const rp = F.rp, d = new Doc({ w: W.PH, h: W.PW });
    const ctx = frame(d, biz, 'REKAP KEUANGAN PROYEK', 'Dicetak ' + F.tanggal(printedAt));
    boxes(ctx, [['Total nilai kontrak', rp(totals.contract)], ['Sudah diterima', rp(totals.received), '#4f6a33'], ['Sisa tagihan', rp(totals.remaining)], ['Total biaya proyek', rp(totals.expense), '#9b5a3c'], ['Laba kasar', rp(totals.profit)]]);
    table(ctx, [{ h: 'PROYEK', w: 20 }, { h: 'KLIEN', w: 12 }, { h: 'STATUS', w: 8 }, { h: 'PROGRES', w: 7, align: 'right' }, { h: 'NILAI KONTRAK', w: 11, align: 'right' },
      { h: 'DITERIMA', w: 11, align: 'right' }, { h: 'SISA', w: 11, align: 'right' }, { h: 'BIAYA', w: 10, align: 'right' }, { h: 'LABA KASAR', w: 10, align: 'right' }],
    rows.map(({ project: p, summary: s }) => ({ cells: [p.name, p.client || '-', p.status, (Number(p.progress) || 0) + '%', rp(s.contract), rp(s.received), rp(s.remaining), rp(s.expense), rp(s.profit)] }))
      .concat([{ bold: true, cells: ['Total', '', '', '', rp(totals.contract), rp(totals.received), rp(totals.remaining), rp(totals.expense), rp(totals.profit)] }]), { size: 7.8 });
    ctx.footer();
    return d.build('Rekap keuangan proyek');
  }

  self.LaporanPDF = { project, allProjects };
})();
