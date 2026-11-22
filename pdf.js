/* Pembuat PDF ringan (tanpa pustaka luar): invoice & kwitansi Widemp Atelier */
(function () {
  'use strict';
  const A = self.PDF_ASSETS;
  const BASE = (document.currentScript && document.currentScript.src) || location.href;
  const PW = 595.28, PH = 841.89;
  const COL = { dark: '#36302b', tan: '#a3896f', cream: '#f4efe7', line: '#d8cbbb', text: '#3b3835', gray: '#6f6a64', white: '#ffffff' };

  /* ---------- teks: unicode -> WinAnsi ---------- */
  const SPECIAL = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
  function codes(str) {
    const out = [];
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) out.push(c);
      else if (c >= 160 && c <= 255) out.push(c);
      else if (SPECIAL[ch]) out.push(SPECIAL[ch]);
      else if (ch === '\t') out.push(32);
      else out.push(63); // '?'
    }
    return out;
  }
  const pdfStr = (str) => '(' + codes(str).map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 127 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0'))).join('') + ')';
  function width(str, font, size, spacing = 0) {
    const w = A.fonts[font].widths; const cs = codes(str);
    return cs.reduce((s, c) => s + (w[c - 32] || 0), 0) * size / 1000 + spacing * cs.length;
  }
  function wrap(str, font, size, maxW) {
    const out = [];
    for (const para of String(str || '').split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const t = line ? line + ' ' + word : word;
        if (width(t, font, size) <= maxW || !line) line = t; else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
  const f2 = (n) => (Math.round(n * 100) / 100).toString();

  /* ---------- dokumen ---------- */
  class Doc {
    constructor(size) { this.pw = (size && size.w) || PW; this.ph = (size && size.h) || PH; this.pages = []; this.addPage(); }
    addPage() { this.ops = []; this.pages.push(this.ops); }
    // koordinat: y dihitung dari atas halaman
    text(str, x, y, o = {}) {
      const font = o.font || 'R', size = o.size || 9, sp = o.spacing || 0;
      let s = String(str == null ? '' : str);
      if (o.upper) s = s.toUpperCase();
      const w = width(s, font, size, sp);
      if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
      this.ops.push(`BT /F${font} ${size} Tf ${f2(sp)} Tc ${rgb(o.color || COL.text)} rg ${f2(x)} ${f2(this.ph - y)} Td ${pdfStr(s)} Tj ET`);
      return w;
    }
    lines(str, x, y, maxW, o = {}) {
      const lh = o.lh || (o.size || 9) * 1.35;
      const ls = wrap(str, o.font || 'R', o.size || 9, maxW);
      ls.forEach((l, i) => this.text(l, x, y + i * lh, o));
      return ls.length * lh;
    }
    rect(x, y, w, h, fill, stroke, lw = 0.6) {
      let op = `${f2(x)} ${f2(this.ph - y - h)} ${f2(w)} ${f2(h)} re`;
      if (fill) op = `${rgb(fill)} rg ` + op;
      if (stroke) op = `${rgb(stroke)} RG ${lw} w ` + op;
      this.ops.push('q ' + op + (fill && stroke ? ' B' : fill ? ' f' : ' S') + ' Q');
    }
    line(x1, y1, x2, y2, color = COL.line, lw = 0.6, dash) {
      this.ops.push(`q ${rgb(color)} RG ${lw} w ${dash ? '[' + dash + '] 0 d ' : ''}${f2(x1)} ${f2(this.ph - y1)} m ${f2(x2)} ${f2(this.ph - y2)} l S Q`);
    }
    logo(x, y, w) {
      const h = w * A.logo.h / A.logo.w;
      this.ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(this.ph - y - h)} cm /Logo Do Q`);
      this.usesLogo = true;
      return h;
    }
    async build(title) {
      const fonts = await loadFonts();
      const parts = []; let len = 0; const offs = [];
      const push = (p) => { const b = typeof p === 'string' ? latin1(p) : p; parts.push(b); len += b.length; };
      const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
      const stream = (dict, data) => [`<< ${dict} /Length ${data.length} >>\nstream\n`, data, '\nendstream'];
      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const keys = Object.keys(A.fonts);
      // nomor objek: 1 katalog, 2 pages, 3 info, 4.. font(3 per font), lalu logo(2), lalu halaman(2 per halaman)
      let n = 4; const fontRef = {};
      for (const k of keys) {
        const m = A.fonts[k], ttf = fonts[k];
        const [fo, fd, ff] = [n, n + 1, n + 2]; n += 3; fontRef[k] = fo;
        obj(fo, [`<< /Type /Font /Subtype /TrueType /BaseFont /${m.name} /FirstChar 32 /LastChar 255 /Widths [${m.widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${fd} 0 R >>`]);
        obj(fd, [`<< /Type /FontDescriptor /FontName /${m.name} /Flags ${m.italic ? 96 : 32} /FontBBox [${m.bbox.join(' ')}] /ItalicAngle ${m.italic ? -10 : 0} /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV 80 /FontFile2 ${ff} 0 R >>`]);
        obj(ff, stream(`/Length1 ${ttf.length}`, ttf));
      }
      const logoN = n, maskN = n + 1; n += 2;
      obj(maskN, stream(`/Type /XObject /Subtype /Image /Width ${A.logo.w} /Height ${A.logo.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, b64(A.logo.alpha)));
      obj(logoN, stream(`/Type /XObject /Subtype /Image /Width ${A.logo.w} /Height ${A.logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${maskN} 0 R`, b64(A.logo.rgb)));
      const res = `<< /Font << ${keys.map((k) => `/F${k} ${fontRef[k]} 0 R`).join(' ')} >> /XObject << /Logo ${logoN} 0 R >> >>`;
      const kids = [];
      for (const ops of this.pages) {
        const pn = n, cn = n + 1; n += 2; kids.push(pn);
        obj(cn, stream('', latin1(ops.join('\n'))));
        obj(pn, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(this.pw)} ${f2(this.ph)}] /Resources ${res} /Contents ${cn} 0 R >>`]);
      }
      obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
      obj(2, [`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`]);
      obj(3, [`<< /Title ${pdfStr(title || '')} /Producer (Widemp Keuangan) /Creator (Widemp Keuangan) >>`]);
      const xref = len;
      let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
      for (let i = 1; i < n; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
      push(x + `trailer\n<< /Size ${n} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(parts, { type: 'application/pdf' });
    }
  }
  function latin1(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function b64(s) { const bin = atob(s); return latin1(bin); }
  let fontCache = null;
  async function loadFonts() {
    if (fontCache) return fontCache;
    const out = {};
    for (const k of Object.keys(A.fonts)) {
      const r = await fetch(new URL(`assets/montserrat-${k}.ttf`, BASE));
      if (!r.ok) throw new Error('Font tidak bisa dimuat');
      out[k] = new Uint8Array(await r.arrayBuffer());
    }
    return (fontCache = out);
  }

  /* ---------- template ---------- */
  const label = (d, s, x, y, o = {}) => d.text(s, x, y, Object.assign({ font: 'B', size: 7.5, color: COL.tan, spacing: 0.3, upper: true }, o));

  function invoice(inv, biz, F) {
    const d = new Doc(), X0 = 40, X1 = PW - 40;
    const T = F.invoiceTotals(inv), rp = F.rp;
    const footer = () => {
      d.text([biz.phone, biz.email].filter(Boolean).join('  |  '), PW / 2, PH - 44, { size: 7, color: COL.gray, align: 'center' });
      d.text(biz.tagline || '', PW / 2, PH - 32, { font: 'B', size: 7, color: COL.tan, align: 'center', spacing: 0.3 });
    };
    // kop
    d.rect(X0 - 12, 30, X1 - X0 + 24, 80, COL.cream);
    d.line(X0 - 12, 110, X1 + 12, 110, COL.tan, 1.6);
    d.logo(X0 - 4, 35, 108);
    d.text('INVOICE', X1, 70, { font: 'B', size: 26, color: COL.dark, align: 'right' });
    d.text((biz.name || '').toUpperCase(), X1, 99, { font: 'B', size: 8.5, color: COL.tan, align: 'right', spacing: 0.3 });
    // tagihan kepada & info
    let y = 138;
    label(d, 'Bill to', X0, y);
    d.text(inv.billTo || '', X0, y + 15, { font: 'B', size: 12, color: COL.dark });
    let ly = y + 30;
    if (inv.attn) { d.text(inv.attn, X0, ly, { size: 9 }); ly += 13; }
    if (inv.address) ly += 6 + d.lines(inv.address, X0, ly + 6, 250, { size: 9 });
    const MX = 330;
    const meta = [['Invoice No.', inv.number], ['Date', F.tanggal(inv.date)]];
    if (inv.dueDate) meta.push(['Due date', F.tanggal(inv.dueDate)]);
    meta.push(['Project', inv.projectLabel || '']);
    let my = y;
    for (const [k, v] of meta) {
      label(d, k, MX, my);
      const ls = wrap(v, 'R', 8.5, X1 - MX - 70);
      ls.forEach((l, i) => d.text(l, X1, my + i * 10.5, { size: 8.5, align: 'right' }));
      my += Math.max(14, ls.length * 10.5 + 3);
    }
    y = Math.max(ly, my) + 12;
    d.line(X0, y, X1, y, COL.line, 1); y += 24;
    d.text(inv.intro || 'Please find below the details of our services and charges.', X0, y, { font: 'I', size: 8.5, color: COL.gray });
    y += 16;
    // tabel item
    const C = { no: X0 + 10, desc: X0 + 34, qty: 300, price: 440, amt: X1 - 8 };
    const head = () => {
      d.rect(X0, y, X1 - X0, 24, COL.dark); d.line(X0, y + 24, X1, y + 24, COL.tan, 1.4);
      const o = { font: 'B', size: 7.5, color: COL.white, spacing: 0.3 };
      d.text('NO.', C.no, y + 15, o); d.text('DESCRIPTION', C.desc, y + 15, o); d.text('QTY', C.qty, y + 15, o);
      d.text('UNIT PRICE', C.price, y + 15, Object.assign({ align: 'right' }, o)); d.text('AMOUNT', C.amt, y + 15, Object.assign({ align: 'right' }, o));
      y += 24;
    };
    head();
    (inv.items || []).forEach((it, i) => {
      const descL = wrap(it.desc || '', 'R', 9, C.qty - C.desc - 14);
      const det = String(it.details || '').split('\n').map((s) => s.trim()).filter(Boolean).flatMap((s) => wrap('• ' + s.replace(/^[•\-*·]\s*/, ''), 'R', 8.5, C.qty - C.desc - 20));
      const h = 12 + descL.length * 12 + det.length * 11 + 10;
      if (y + h > PH - 140) { footer(); d.addPage(); y = 50; head(); }
      d.rect(X0, y, X1 - X0, h, COL.cream);
      let ry = y + 15;
      d.text(String(i + 1), C.no, ry, { size: 9 });
      descL.forEach((l, k) => d.text(l, C.desc, ry + k * 12, { size: 9, color: COL.dark }));
      det.forEach((l, k) => d.text(l, C.desc + 2, ry + descL.length * 12 + k * 11, { size: 8.5 }));
      d.text(F.num(it.qty) + (it.unit ? ' ' + it.unit : ''), C.qty, ry, { size: 9 });
      d.text(rp(it.price), C.price, ry, { size: 9, align: 'right' });
      d.text(rp(T.lines[i]), C.amt, ry, { size: 9, align: 'right' });
      y += h; d.line(X0, y, X1, y, COL.line, 0.8);
    });
    // total
    if (y + 250 > PH - 60) { footer(); d.addPage(); y = 50; }
    y += 20;
    const TX = 330, rows = [['Subtotal', T.subtotal], ['Discount', -T.discount]];
    rows.push([Number(inv.taxPct) ? `Tax / VAT (${F.num(inv.taxPct)}%)` : 'Tax / VAT (if applicable)', T.tax]);
    for (const [k, v] of rows) {
      d.rect(TX, y, X1 - TX, 21, COL.cream); d.line(TX, y + 21, X1, y + 21, COL.white, 1.2);
      d.text(k, 455, y + 14, { size: 8.5, color: COL.gray, align: 'right' });
      d.text(v < 0 ? '- ' + rp(-v) : rp(v), X1 - 2, y + 14, { size: 8.5, align: 'right' });
      y += 21;
    }
    d.rect(TX, y, X1 - TX, 23, COL.dark); d.line(TX, y + 23, X1, y + 23, COL.tan, 1.4);
    d.text('TOTAL DUE', 455, y + 15, { font: 'B', size: 8.5, color: COL.white, align: 'right', spacing: 0.3 });
    d.text(rp(T.total), X1 - 2, y + 15, { font: 'B', size: 9, color: COL.white, align: 'right' });
    y += 50;
    // terbilang
    label(d, 'Amount in words', X0, y); y += 18;
    y += d.lines(F.terbilang(T.total), X0, y, X1 - X0, { font: 'I', size: 9.5, color: COL.dark });
    d.line(X0, y - 4, X1, y - 4, COL.line, 0.8); y += 18;
    // pembayaran
    label(d, 'Payment details', X0, y); y += 6;
    const pay = [['Bank', biz.bank], ['Account Name', biz.accName], ['Account No.', biz.accNo]].filter((r) => r[1]);
    d.rect(X0, y, X1 - X0, 14 + pay.length * 20, COL.cream); d.line(X0, y, X1, y, COL.line, 0.8); d.line(X0, y + 14 + pay.length * 20, X1, y + 14 + pay.length * 20, COL.line, 0.8);
    pay.forEach((r, i) => d.text(`${r[0]} : ${r[1]}`, X0 + 2, y + 18 + i * 20, { size: 8.5 }));
    y += 14 + pay.length * 20 + 24;
    // catatan
    if (inv.notes) {
      label(d, 'Notes', X0, y); y += 12;
      y += d.lines(inv.notes, X0, y, X1 - X0, { size: 8, color: COL.text, lh: 11 });
      d.line(X0, y + 2, X1, y + 2, COL.line, 0.8);
    }
    // tanda tangan
    const sy = Math.max(y + 20, PH - 175);
    d.text('Regards,', 415, sy + 8, { size: 10, color: COL.dark });
    d.logo(398, sy + 6, 120);
    footer();
    return d.build(inv.number);
  }

  function receipt(r, biz, F) {
    const d = new Doc(), X0 = 62, X1 = PW - 62, rp = F.rp;
    d.logo(X0 + 2, 30, 155);
    d.line(X0, 138, X1, 138, COL.tan, 0.8);
    d.text('KWITANSI', PW / 2, 172, { font: 'B', size: 22, color: COL.dark, align: 'center' });
    d.text('PAYMENT RECEIPT', PW / 2, 189, { font: 'B', size: 7, color: COL.tan, align: 'center', spacing: 0.4 });
    label(d, 'No. Kwitansi', X0 + 7, 216); label(d, 'Date', X1 - 7, 216, { align: 'right' });
    d.text(r.number, X0 + 7, 234, { font: 'B', size: 10, color: COL.dark });
    d.text(F.tanggal(r.date), X1 - 7, 234, { size: 10, align: 'right' });
    d.line(X0, 245, X1, 245, COL.line, 0.8);
    label(d, 'Telah diterima dari', X0, 263);
    d.text(r.from || '', X0, 283, { font: 'B', size: 12, color: COL.dark });
    d.rect(X0, 297, X1 - X0, 58, COL.cream, COL.tan, 0.8);
    label(d, 'Jumlah', X0 + 9, 314);
    d.text(rp(r.amount), X0 + 9, 340, { font: 'B', size: 20, color: COL.dark });
    label(d, 'Terbilang', X0, 373);
    let y = 390 + d.lines(F.terbilang(r.amount), X0, 390, X1 - X0, { font: 'I', size: 10, color: COL.dark }) + 6;
    label(d, 'Untuk pembayaran', X0, y); y += 9;
    const rows = [['Proyek', r.projectLabel], ['Uraian pembayaran', r.desc], ['Metode pembayaran', r.method]];
    for (const [k, v] of rows) {
      const ls = wrap(v || '-', 'R', 9.5, X1 - 192 - 8); const h = Math.max(23, 10 + ls.length * 12);
      d.rect(X0 + 1, y, 122, h, COL.cream); d.line(X0 + 1, y + h, X1, y + h, COL.line, 0.8);
      label(d, k, X0 + 8, y + 15, { size: 7 });
      ls.forEach((l, i) => d.text(l, X0 + 130, y + 15 + i * 12, { size: 9.5 }));
      y += h;
    }
    y += 18;
    d.text(`${biz.city || 'Cianjur'}, ${F.tanggal(r.date)}`, X0, y, { size: 9.5 });
    d.text((biz.name || '').toUpperCase(), X1, y + 16, { font: 'B', size: 8, color: COL.tan, align: 'right', spacing: 0.3 });
    d.logo(X1 - 82, y + 24, 82);
    if (Number(r.amount) >= 5000000) {
      d.rect(X1 - 172, y + 30, 66, 44, null, COL.line, 0.8);
      d.text('Meterai', X1 - 139, y + 50, { size: 7, color: COL.gray, align: 'center' });
      d.text('Rp10.000', X1 - 139, y + 60, { size: 7, color: COL.gray, align: 'center' });
    }
    d.line(X0, PH - 46, X1, PH - 46, COL.line, 0.8);
    d.text([biz.email, biz.name].filter(Boolean).join(' · '), PW / 2, PH - 36, { size: 7, color: COL.gray, align: 'center' });
    d.text(biz.tagline || '', PW / 2, PH - 27, { font: 'B', size: 6.5, color: COL.tan, align: 'center', spacing: 0.3 });
    return d.build(r.number);
  }

  self.WidempPDF = { invoice, receipt, wrap, width, Doc, COL, label, PW, PH };
})();
