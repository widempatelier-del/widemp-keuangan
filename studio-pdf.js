/* PDF penawaran harga & RAB/BOQ — mengikuti format dokumen Widemp Atelier */
(function () {
  'use strict';
  const W = self.WidempPDF, S = self.SCore;
  const { Doc, COL, wrap } = W;
  const PW = W.PW, PH = W.PH;
  const label = (d, s, x, y, o = {}) => d.text(s, x, y, Object.assign({ font: 'B', size: 7, color: COL.tan, spacing: 0.3, upper: true }, o));
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const cf4 = (n) => { const [i, d] = String(Math.round((Number(n) || 0) * 10000) / 10000).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : ''); };

  function numberPages(d, draw) {
    const n = d.pages.length;
    d.pages.forEach((ops, i) => { d.ops = ops; draw(i + 1, n); });
  }

  /* =================== PENAWARAN =================== */
  function quote(q, biz, F, cfg) {
    const T = S.quoteTotals(q), TPL = S.TEMPLATES[q.tpl];
    const d = new Doc(), X0 = 46, X1 = PW - 46, BOT = PH - 66;
    const rp = F.rp, nf = F.num, fill = (s) => S.fillTokens(s, q, cfg)
      .replace(/\{jenis\}/g, q.buildingType || 'bangunan').replace(/\{lokasi\}/g, q.location || 'lokasi proyek').replace(/\{fee\}/g, feePct());
    function feePct() { const f = (q.sections[0] && q.sections[0].items.find((x) => x.calc === 'fee')); return f ? nf(f.qty) : '…'; }
    let y = 0;
    const header = () => { d.logo(PW / 2 - 62, 22, 124); d.line(X0, 112, X1, 112, COL.tan, 0.8); y = 132; };
    const footer = () => {
      d.line(X0, PH - 50, X1, PH - 50, COL.line, 0.8);
      d.text([biz.address, biz.phone, biz.email, biz.instagram].filter(Boolean).join('  ·  '), PW / 2, PH - 38, { size: 7, color: COL.gray, align: 'center' });
      d.text((biz.tagline || '').toUpperCase(), PW / 2, PH - 28, { font: 'B', size: 6.5, color: COL.tan, align: 'center', spacing: 0.3 });
    };
    const room = (h) => { if (y + h > BOT) { d.addPage(); header(); return true; } return false; };
    const section = (title) => { room(40); label(d, title, X0, y + 10, { size: 7.5 }); y += 20; };
    const para = (s, o = {}) => { const ls = wrap(s, o.font || 'R', o.size || 8.5, o.w || X1 - X0); for (const l of ls) { room(13); d.text(l, o.x || X0, y + 9, Object.assign({ size: 8.5 }, o)); y += o.lh || 12.5; } };

    header();
    d.text('QUOTATION', X0, y + 18, { font: 'B', size: 22, color: COL.dark });
    label(d, 'Surat Penawaran Harga', X0, y + 34);
    d.text(TPL.subtitle, X0, y + 46, { size: 8.5 });
    y += 58; d.line(X0, y, X1, y, COL.line, 0.8); y += 18;
    // kepada & detail
    const MX = 318, VX = 398;
    label(d, 'Ditujukan kepada', X0, y);
    let ly = y + 16;
    d.text(q.client || '-', X0, ly, { font: 'B', size: 11, color: COL.dark }); ly += 14;
    for (const s of [q.attn, q.address, q.contact].filter(Boolean)) { const ls = wrap(s, 'R', 8.5, MX - X0 - 20); ls.forEach((l) => { d.text(l, X0, ly, { size: 8.5 }); ly += 11.5; }); }
    label(d, 'Detail penawaran', MX, y);
    let my = y + 16;
    const valid = q.date ? addDays(q.date, q.validDays || 14) : '';
    const rows = [['No. Penawaran', q.number], ['Tanggal', F.tanggal(q.date)], ['Berlaku Hingga', F.tanggal(valid)], ['Proyek', q.projectName], ['Lokasi', q.location], ['Luas Area', q.area ? '± ' + nf(q.area) + ' m²' : '']].filter((r) => r[1]);
    for (const [k, v] of rows) {
      label(d, k, MX, my, { size: 6.5 });
      const ls = wrap(v, 'R', 8.5, X1 - VX); ls.forEach((l, i) => d.text(l, VX, my + i * 11, { size: 8.5, color: COL.dark }));
      my += Math.max(13, ls.length * 11 + 2);
    }
    y = Math.max(ly, my) + 6; d.line(X0, y, X1, y, COL.line, 0.8); y += 18;
    // lingkup
    section('Lingkup pekerjaan');
    para(fill(q.scope)); y += 12;

    // rincian biaya
    section('Rincian biaya');
    const CX = { no: X0 + 12, desc: X0 + 34, vol: 342, sat: 372, price: 470, amt: X1 - 6 }, DW = CX.vol - CX.desc - 30;
    const thead = () => {
      d.rect(X0, y, X1 - X0, 22, COL.dark);
      const o = { font: 'B', size: 7, color: COL.white, spacing: 0.3 };
      d.text('NO.', CX.no, y + 14, Object.assign({ align: 'center' }, o)); d.text('URAIAN PEKERJAAN', CX.desc, y + 14, o);
      d.text('VOL.', CX.vol, y + 14, Object.assign({ align: 'right' }, o)); d.text('SAT.', CX.sat, y + 14, o);
      d.text('HARGA SATUAN', CX.price, y + 14, Object.assign({ align: 'right' }, o)); d.text('JUMLAH', CX.amt, y + 14, Object.assign({ align: 'right' }, o));
      y += 22;
    };
    thead();
    let no = 0;
    T.secs.forEach((s, si) => {
      if (!s.items.length) return;
      if (room(22 + 34)) thead();
      d.rect(X0, y, X1 - X0, 20, COL.cream); d.text(`${LET[si]}. ${s.title}`, X0 + 6, y + 13.5, { font: 'B', size: 7.8, color: COL.dark }); y += 20;
      for (const it of s.items) {
        no++;
        const tl = wrap(it.title || '', 'B', 8.3, DW), dl = wrap(fill(it.desc || ''), 'R', 7.4, DW);
        const h = 10 + tl.length * 11 + dl.length * 9.5 + 6;
        if (room(h)) thead();
        let ry = y + 14;
        d.text(String(no), CX.no, ry, { size: 8.3, align: 'center' });
        tl.forEach((l, k) => d.text(l, CX.desc, ry + k * 11, { font: 'B', size: 8.3, color: COL.dark }));
        dl.forEach((l, k) => d.text(l, CX.desc, ry + tl.length * 11 + k * 9.5 - 1, { size: 7.4, color: COL.gray }));
        d.text(nf(it.qty), CX.vol, ry, { size: 8.3, align: 'right' }); d.text(it.unit || '', CX.sat, ry, { size: 8.3 });
        d.text(it.price ? rp(it.price) : '-', CX.price, ry, { size: 8.3, align: 'right' }); d.text(it.amount ? rp(it.amount) : '-', CX.amt, ry, { size: 8.3, align: 'right' });
        y += h; d.line(X0, y, X1, y, COL.line, 0.6);
      }
      room(20);
      d.text('Subtotal ' + LET[si], CX.price, y + 13, { font: 'B', size: 7.5, color: COL.tan, align: 'right' });
      d.text(rp(s.total), CX.amt, y + 13, { font: 'B', size: 8.5, color: COL.dark, align: 'right' }); y += 20;
      d.line(X0, y, X1, y, COL.line, 0.6);
    });
    y += 8;
    const tnote = q.tableNote != null ? q.tableNote : TPL.tableNote;
    if (tnote) para(tnote, { font: 'I', size: 7.5, color: COL.gray, lh: 10.5 });
    y += 10;
    // total
    const letters = T.secs.map((s, i) => (s.items.length ? LET[i] : '')).filter(Boolean).join(' + ');
    const trows = q.tpl === 'cf'
      ? [['Total Fee Jasa (A)', T.fee], ...(T.discount ? [['Diskon fee', -T.discount]] : []), ['Estimasi Biaya Proyek (B)', T.cost], [Number(q.taxPct) ? `PPN atas fee (${nf(q.taxPct)}%)` : 'PPN atas fee (jika berlaku)', T.tax]]
      : [[`Subtotal (${letters})`, T.subtotal], ['Diskon', -T.discount], [Number(q.taxPct) ? `PPN (${nf(q.taxPct)}%)` : 'PPN (jika berlaku)', T.tax]];
    room(trows.length * 20 + 60);
    const TX = 300;
    for (const [k, v] of trows) {
      d.text(k, 460, y + 13, { size: 8.3, color: COL.gray, align: 'right' });
      d.text(v < 0 ? '- ' + rp(-v) : rp(v), X1 - 6, y + 13, { size: 8.3, align: 'right' });
      y += 20; d.line(TX, y, X1, y, COL.line, 0.6);
    }
    d.rect(TX, y + 2, X1 - TX, 24, COL.dark);
    d.text(TPL.totalLabel, 460, y + 17.5, { font: 'B', size: 8, color: COL.white, align: 'right', spacing: 0.3 });
    d.text(rp(T.total), X1 - 6, y + 17.5, { font: 'B', size: 9, color: COL.white, align: 'right' });
    y += 34;
    const tb = 'Terbilang: ' + F.terbilang(T.total).toLowerCase();
    wrap(tb, 'I', 8, X1 - TX).forEach((l) => { d.text(l, X1 - 6, y + 8, { font: 'I', size: 8, color: COL.dark, align: 'right' }); y += 11; });
    if (TPL.perM2 && Number(q.area)) { y += 4; d.text(`Setara dengan ± ${rp(Math.round(T.total / Number(q.area)))} / m² untuk luas bangunan ${nf(q.area)} m².`, X1 - 6, y + 8, { size: 8, color: COL.gray, align: 'right' }); y += 12; }
    y += 18;

    // tahapan (jasa desain)
    const table = (title, cols, rowsData, note) => {
      room(110);
      section(title);
      const th = () => {
        d.rect(X0, y, X1 - X0, 22, COL.dark);
        cols.forEach((c) => d.text(c.h, c.align === 'right' ? c.x + c.w : c.x, y + 14, { font: 'B', size: 7, color: COL.white, spacing: 0.3, align: c.align }));
        y += 22;
      };
      room(60); th();
      rowsData.forEach((r, ri) => {
        const cells = cols.map((c, i) => wrap(r[i] == null ? '' : String(r[i]), c.b ? 'B' : 'R', 8, c.w));
        const h = Math.max(...cells.map((x) => x.length)) * 11 + 12;
        if (room(h)) th();
        if (ri % 2) d.rect(X0, y, X1 - X0, h, COL.cream);
        cols.forEach((c, i) => cells[i].forEach((l, k) => d.text(l, c.align === 'right' ? c.x + c.w : c.x, y + 14 + k * 11, { font: c.b ? 'B' : 'R', size: 8, color: COL.dark, align: c.align })));
        y += h; d.line(X0, y, X1, y, COL.line, 0.6);
      });
      y += 6;
      if (note) para(note, { font: 'I', size: 7.5, color: COL.gray, lh: 10.5 });
      y += 14;
    };
    if (q.tpl === 'desain' && (q.stages || []).length) {
      table('Tahapan & hasil pekerjaan', [{ h: 'TAHAP', x: X0 + 10, w: 30, b: true }, { h: 'PEKERJAAN', x: X0 + 52, w: 105 }, { h: 'HASIL (DELIVERABLES)', x: X0 + 165, w: 215 }, { h: 'ESTIMASI WAKTU', x: X0 + 392, w: X1 - X0 - 400 }],
        q.stages.map((s, i) => [i + 1, s.name, s.result, s.time]), TPL.stagesNote);
    }
    if (q.tpl === 'cf') {
      table('Mekanisme pembayaran', [{ h: 'KOMPONEN', x: X0 + 8, w: 120, b: true }, { h: 'WAKTU PEMBAYARAN', x: X0 + 138, w: 135 }, { h: 'KETERANGAN', x: X0 + 284, w: X1 - X0 - 292 }],
        (q.mechanism || []).map((m) => [m.comp, m.when, fill(m.note)]));
    } else if ((q.schedule || []).length) {
      const sc = S.scheduleAmounts(q, T.contract);
      table('Jadwal pembayaran', [{ h: 'TERMIN', x: X0 + 10, w: 34, b: true }, { h: 'KETENTUAN', x: X0 + 56, w: 250 }, { h: '%', x: X0 + 316, w: 40, align: 'right' }, { h: 'JUMLAH', x: X0 + 366, w: X1 - X0 - 372, align: 'right' }],
        sc.map((r, i) => [i + 1, r.desc, nf(r.percent) + '%', rp(r.amount)]), TPL.scheduleNote);
    }

    // syarat & ketentuan
    section('Syarat & ketentuan');
    for (const t of S.parseTerms(fill(q.terms))) {
      if (t.h) { room(30); y += 4; d.text(`${t.no}. ${t.text}`, X0, y + 9, { font: 'B', size: 8.3, color: COL.dark }); y += 14; continue; }
      const ls = wrap(t.text, 'R', 7.9, X1 - X0 - 26);
      ls.forEach((l, k) => { room(11); if (!k && t.no) d.text(t.no + '.', X0 + 12, y + 8, { size: 7.9 }); d.text(l, X0 + 24, y + 8, { size: 7.9 }); y += 10.8; });
      y += 2;
    }
    y += 14;
    // informasi pembayaran
    room(110);
    section('Informasi pembayaran');
    const bh = 56;
    d.rect(X0, y, X1 - X0, bh, COL.cream);
    const kv = (k, v, x, yy, w) => { const kw = d.text(k + ' :', x, yy, { font: 'B', size: 7.8, color: COL.dark }); wrap(v || '-', 'R', 7.8, w - kw - 6).slice(0, 2).forEach((l, i) => d.text(l, x + kw + 5, yy + i * 10, { size: 7.8 })); };
    kv('Bank', biz.bank, X0 + 10, y + 16, 230); kv('Atas Nama', biz.accName, X0 + 10, y + 30, 230); kv('No. Rekening', biz.accNo, X0 + 10, y + 44, 230);
    kv('Metode', 'Transfer Bank', 300, y + 16, X1 - 306); kv('Berita Transfer', q.number, 300, y + 30, X1 - 306); kv('Kontak', [biz.phone, biz.email].filter(Boolean).join(' / '), 300, y + 44, X1 - 306);
    y += bh + 6;
    para('Pembayaran dianggap sah hanya jika ditransfer ke rekening di atas. Widemp Atelier tidak pernah meminta pembayaran ke rekening pribadi lain.', { font: 'I', size: 7.3, color: COL.gray, lh: 10 });
    y += 12;
    // tanda tangan
    room(170);
    para('Dengan menandatangani penawaran ini, Klien menyatakan telah membaca, memahami, dan menyetujui seluruh rincian biaya serta Syarat & Ketentuan di atas.', { size: 8.3 });
    y += 4; d.text(`${(cfg && cfg.city) || 'Cianjur'}, ${F.tanggal(q.date)}`, X0, y + 9, { size: 8.3 }); y += 26;
    const L1 = X0 + (X1 - X0) / 4, L2 = X0 + (X1 - X0) * 3 / 4;
    label(d, 'Klien', L1, y, { align: 'center', size: 7.5 }); label(d, (biz.name || 'Widemp Atelier'), L2, y, { align: 'center', size: 7.5 });
    d.text('Disetujui oleh,', L1, y + 13, { size: 8, align: 'center' }); d.text('Hormat kami,', L2, y + 13, { size: 8, align: 'center' });
    d.logo(L2 - 40, y + 22, 80);
    y += 90;
    d.line(L1 - 75, y, L1 + 75, y, COL.dark, 0.6); d.line(L2 - 75, y, L2 + 75, y, COL.dark, 0.6);
    d.text(q.signClient || q.client || '', L1, y + 12, { font: 'B', size: 8.5, color: COL.dark, align: 'center' });
    d.text(q.signerName || '', L2, y + 12, { font: 'B', size: 8.5, color: COL.dark, align: 'center' });
    d.text(q.attnTitle || '', L1, y + 23, { size: 7.8, color: COL.gray, align: 'center' });
    d.text(q.signerTitle || '', L2, y + 23, { size: 7.8, color: COL.gray, align: 'center' });

    numberPages(d, (i, n) => { footer(); if (n > 1) d.text(`${q.number || ''}  ·  ${i}/${n}`, X1, PH - 38, { size: 6.5, color: COL.gray, align: 'right' }); });
    return d.build(q.number || 'Penawaran');
  }
  function addDays(iso, n) { const t = new Date(iso + 'T00:00:00'); t.setDate(t.getDate() + (Number(n) || 0)); const p = (x) => String(x).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; }

  /* =================== RAB / BOQ (A4 landscape) =================== */
  function rab(r, biz, F, opts = {}) {
    const LW = PH, LH = PW; // landscape
    const d = new Doc({ w: LW, h: LH }), X0 = 30, X1 = LW - 30, BOT = LH - 44;
    const T = S.rabTotals(r), rp = F.rp, nf = F.num;
    let y = 0, curT = null, curS = null;
    const header = (title, sub) => {
      if (title !== undefined) { curT = title; curS = sub; } else { title = curT; sub = curS; }
      d.rect(X0, 20, X1 - X0, 70, COL.cream);
      d.logo(X0 + 14, 26, 88);
      d.text(title || 'RAB / BOQ', X1 - 14, 54, { font: 'B', size: 20, color: COL.dark, align: 'right' });
      label(d, sub || 'Project cost estimate & bill of quantities', X1 - 14, 76, { align: 'right' });
      y = 100;
      const info = [['Project', r.projectName], ['Location', r.location], ['Prepared by', (biz.name || 'Widemp Atelier').toUpperCase()]];
      const info2 = [['Client', r.client], ['Date', F.tanggal(r.date)], ['Version', r.version || 'V1.0']];
      info.forEach(([k, v], i) => { d.rect(X0, y + i * 17, 330, 16, COL.cream); label(d, k, X0 + 6, y + i * 17 + 11, { size: 6.5 }); d.text(v || '-', X0 + 82, y + i * 17 + 11.5, { size: 8, color: COL.dark }); });
      info2.forEach(([k, v], i) => { d.rect(X1 - 330, y + i * 17, 330, 16, COL.cream); label(d, k, X1 - 324, y + i * 17 + 11, { size: 6.5 }); d.text(v || '-', X1 - 250, y + i * 17 + 11.5, { size: 8, color: COL.dark }); });
      y += 3 * 17 + 12;
    };
    const room = (h, again) => { if (y + h > BOT) { d.addPage(); header(); if (again) again(); return true; } return false; };
    const C = { no: X0 + 16, div: X0 + 34, desc: X0 + 130, unit: 455, qty: 520, price: 610, total: 700, rem: 712 };
    const thead = () => {
      d.rect(X0, y, X1 - X0, 22, COL.dark); d.line(X0, y + 22, X1, y + 22, COL.tan, 1.2);
      const o = { font: 'B', size: 7, color: COL.white, spacing: 0.3 };
      d.text('NO', C.no, y + 14, Object.assign({ align: 'center' }, o)); d.text('DIVISION', C.div, y + 14, o); d.text('DESCRIPTION / ITEM', C.desc, y + 14, o);
      d.text('UNIT', C.unit, y + 14, o); d.text('QTY', C.qty, y + 14, Object.assign({ align: 'right' }, o)); d.text('UNIT PRICE', C.price, y + 14, Object.assign({ align: 'right' }, o));
      d.text('TOTAL', C.total, y + 14, Object.assign({ align: 'right' }, o)); d.text('REMARKS', C.rem, y + 14, o);
      y += 24;
    };
    header(); thead();
    let no = 0;
    for (const g of T.divs) {
      for (const it of g.items) {
        no++;
        const dl = wrap(it.desc || '', 'R', 7.8, C.unit - C.desc - 10).concat(it.spec ? wrap(it.spec, 'I', 7, C.unit - C.desc - 10) : []);
        const divl = wrap(g.name, 'R', 7.5, C.desc - C.div - 6), rl = wrap(it.remark || '', 'R', 7, X1 - C.rem - 4);
        const h = Math.max(dl.length, divl.length, rl.length) * 10 + 8;
        room(h, thead);
        if (no % 2) d.rect(X0, y, X1 - X0, h, COL.cream);
        const ry = y + 12;
        d.text(String(no), C.no, ry, { size: 7.8, align: 'center' });
        divl.forEach((l, k) => d.text(l, C.div, ry + k * 10, { size: 7.5, color: COL.gray }));
        dl.forEach((l, k) => d.text(l, C.desc, ry + k * 10, { size: 7.8, color: COL.dark, font: it.spec && k >= dl.length - wrap(it.spec, 'I', 7, C.unit - C.desc - 10).length ? 'I' : 'R' }));
        d.text(it.unit || '', C.unit, ry, { size: 7.8 }); d.text(nf(it.qty), C.qty, ry, { size: 7.8, align: 'right' });
        d.text(rp(it.price), C.price, ry, { size: 7.8, align: 'right' }); d.text(rp(it.total), C.total, ry, { size: 7.8, align: 'right' });
        rl.forEach((l, k) => d.text(l, C.rem, ry + k * 10, { size: 7, color: COL.gray }));
        y += h; d.line(X0, y, X1, y, COL.line, 0.5);
      }
    }
    if (!no) { d.text('Belum ada item.', X0 + 10, y + 14, { size: 8, color: COL.gray }); y += 24; }
    // ringkasan biaya
    const sumRows = [['Subtotal BOQ', T.subtotal], [`Contingency / Overhead${Number(r.ohPct) ? ' (' + nf(r.ohPct) + '%)' : ''}`, T.overhead], [`Profit / Fee${Number(r.profitPct) ? ' (' + nf(r.profitPct) + '%)' : ''}`, T.profit], [`Tax${Number(r.taxPct) ? ' (' + nf(r.taxPct) + '%)' : ' (if applicable)'}`, T.tax]];
    room(sumRows.length * 18 + 70);
    y += 14; label(d, 'Cost summary', X0, y + 8, { size: 8 }); y += 14;
    for (const [k, v] of sumRows) {
      d.rect(X1 - 330, y, 330, 17, COL.cream); d.line(X1 - 330, y + 17, X1, y + 17, COL.white, 1);
      d.text(k, X1 - 320, y + 12, { size: 8, color: COL.gray }); d.text(rp(v), X1 - 10, y + 12, { size: 8, align: 'right' }); y += 18;
    }
    d.rect(X1 - 330, y, 330, 22, COL.dark);
    d.text('GRAND TOTAL', X1 - 320, y + 15, { font: 'B', size: 8.5, color: COL.white, spacing: 0.3 }); d.text(rp(T.grand), X1 - 10, y + 15, { font: 'B', size: 9, color: COL.white, align: 'right' });
    y += 30;
    d.text('Terbilang: ' + F.terbilang(T.grand).toLowerCase(), X1 - 10, y + 6, { font: 'I', size: 7.8, color: COL.dark, align: 'right' }); y += 20;
    if (r.notes) {
      room(40); label(d, 'Notes / assumptions', X0, y + 8, { size: 8 }); y += 16;
      for (const l of wrap(r.notes, 'R', 8, X1 - X0)) { room(12); d.text(l, X0, y + 8, { size: 8 }); y += 11.5; }
    }

    // halaman rekap per divisi
    d.addPage(); header('PROJECT COST SUMMARY', 'Rekap biaya per divisi');
    const SC = { no: X0 + 20, div: X0 + 50, tot: 560, pct: 680 };
    const sh = () => {
      d.rect(X0, y, X1 - X0, 22, COL.dark);
      const o = { font: 'B', size: 7, color: COL.white, spacing: 0.3 };
      d.text('NO', SC.no, y + 14, Object.assign({ align: 'center' }, o)); d.text('DIVISION', SC.div, y + 14, o);
      d.text('TOTAL', SC.tot, y + 14, Object.assign({ align: 'right' }, o)); d.text('PERCENTAGE', SC.pct, y + 14, Object.assign({ align: 'right' }, o)); y += 24;
    };
    sh();
    T.divs.forEach((g, i) => {
      room(18, sh);
      if (i % 2 === 0) d.rect(X0, y, X1 - X0, 18, COL.cream);
      d.text(String(i + 1), SC.no, y + 12, { size: 8, align: 'center' }); d.text(g.name, SC.div, y + 12, { size: 8, color: COL.dark });
      d.text(rp(g.total), SC.tot, y + 12, { size: 8, align: 'right' }); d.text(nf(Math.round(g.pct * 100) / 100) + '%', SC.pct, y + 12, { size: 8, align: 'right' });
      d.rect(SC.pct + 14, y + 6, 100 * g.pct / 100, 6, COL.tan);
      y += 18;
    });
    d.rect(X0, y + 2, X1 - X0, 20, COL.dark);
    d.text('TOTAL BOQ', SC.div, y + 15, { font: 'B', size: 8, color: COL.white }); d.text(rp(T.subtotal), SC.tot, y + 15, { font: 'B', size: 8, color: COL.white, align: 'right' }); d.text('100%', SC.pct, y + 15, { font: 'B', size: 8, color: COL.white, align: 'right' });
    y += 34;
    const R = S.rabResources(r);
    if (R.list.length) {
      label(d, 'Komposisi biaya (sebelum overhead & profit)', X0, y + 8, { size: 7.5 }); y += 16;
      Object.keys(S.KINDS).forEach((k) => { if (!R.by[k]) return; d.text(`${S.KINDS[k]}`, SC.div, y + 10, { size: 8 }); d.text(rp(R.by[k]), SC.tot, y + 10, { size: 8, align: 'right' }); d.text(nf(Math.round(R.by[k] / (T.subtotal || 1) * 10000) / 100) + '%', SC.pct, y + 10, { size: 8, align: 'right' }); y += 15; });
    }

    // lampiran analisa harga satuan
    if (opts.analysis) {
      const withComps = T.items.filter((it) => (it.comps || []).length);
      if (withComps.length) {
        d.addPage(); header('ANALISA HARGA SATUAN', 'Rincian material, upah & alat per item');
        const AC = { k: X0 + 10, name: X0 + 80, coef: 430, unit: 440, price: 590, tot: 700 };
        withComps.forEach((it) => {
          const rows = it.comps;
          room(40 + rows.length * 14);
          d.rect(X0, y, X1 - X0, 20, COL.dark);
          d.text(`${it.desc}`, X0 + 8, y + 13.5, { font: 'B', size: 8, color: COL.white });
          d.text(`per ${it.unit}  ·  ${rp(it.price)}`, X1 - 8, y + 13.5, { font: 'B', size: 8, color: COL.white, align: 'right' }); y += 22;
          let sum = 0;
          rows.forEach((x, i) => {
            if (i % 2) d.rect(X0, y, X1 - X0, 14, COL.cream);
            const tot = Number(x.coef) * Number(x.price); sum += tot;
            d.text(S.KINDS[x.kind] || x.kind, AC.k, y + 10, { size: 7, color: COL.tan });
            d.text(x.name, AC.name, y + 10, { size: 7.6, color: COL.dark }); d.text(cf4(x.coef), AC.coef, y + 10, { size: 7.6, align: 'right' });
            d.text(x.unit, AC.unit, y + 10, { size: 7.6 }); d.text(rp(x.price), AC.price, y + 10, { size: 7.6, align: 'right' }); d.text(rp(tot), AC.tot, y + 10, { size: 7.6, align: 'right' });
            y += 14;
          });
          d.line(X0, y, X1, y, COL.line, 0.6);
          d.text('Harga satuan', AC.price, y + 11, { font: 'B', size: 7.5, color: COL.tan, align: 'right' }); d.text(rp(Math.round(sum)), AC.tot, y + 11, { font: 'B', size: 7.8, align: 'right' });
          y += 24;
        });
      }
    }
    // lampiran rekap kebutuhan
    if (opts.resources && R.list.length) {
      d.addPage(); header('REKAP KEBUTUHAN', 'Material, upah & alat untuk seluruh RAB');
      const KC = { k: X0 + 10, name: X0 + 90, qty: 470, unit: 480, price: 610, tot: 720 };
      const kh = () => {
        d.rect(X0, y, X1 - X0, 22, COL.dark);
        const o = { font: 'B', size: 7, color: COL.white, spacing: 0.3 };
        d.text('JENIS', KC.k, y + 14, o); d.text('URAIAN', KC.name, y + 14, o); d.text('KEBUTUHAN', KC.qty, y + 14, Object.assign({ align: 'right' }, o));
        d.text('SAT.', KC.unit, y + 14, o); d.text('HARGA SATUAN', KC.price, y + 14, Object.assign({ align: 'right' }, o)); d.text('JUMLAH', KC.tot, y + 14, Object.assign({ align: 'right' }, o)); y += 24;
      };
      kh();
      R.list.forEach((x, i) => {
        room(15, kh);
        if (i % 2 === 0) d.rect(X0, y, X1 - X0, 15, COL.cream);
        d.text(S.KINDS[x.kind] || x.kind, KC.k, y + 10.5, { size: 7, color: COL.tan }); d.text(x.name, KC.name, y + 10.5, { size: 7.8, color: COL.dark });
        d.text(nf(Math.round(x.qty * 100) / 100), KC.qty, y + 10.5, { size: 7.8, align: 'right' }); d.text(x.unit, KC.unit, y + 10.5, { size: 7.8 });
        d.text(rp(x.price), KC.price, y + 10.5, { size: 7.8, align: 'right' }); d.text(rp(x.cost), KC.tot, y + 10.5, { size: 7.8, align: 'right' }); y += 15;
      });
      if (R.by.subkon) { y += 6; d.text('Item lump sum / borongan tanpa analisa', KC.name, y + 10, { size: 7.8, color: COL.gray }); d.text(rp(R.by.subkon), KC.tot, y + 10, { size: 7.8, align: 'right' }); y += 15; }
    }

    numberPages(d, (i, n) => {
      d.text((biz.tagline || '').toUpperCase(), LW / 2, LH - 22, { font: 'B', size: 6.5, color: COL.tan, align: 'center', spacing: 0.3 });
      d.text(`${r.projectName || ''}  ·  Hal. ${i}/${n}`, X1, LH - 22, { size: 6.5, color: COL.gray, align: 'right' });
    });
    return d.build('RAB ' + (r.projectName || ''));
  }

  self.StudioPDF = { quote, rab, addDays };
})();
