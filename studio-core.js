/* Widemp Studio — logika murni: database harga, analisa (AHSP), RAB, penawaran */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r0 = (n) => Math.round(Number(n) || 0);
  const num = (n) => Number(n) || 0;

  /* ---------- Divisi (sama dengan sheet SUMMARY template RAB) ---------- */
  const DIVISIONS = ['Persiapan', 'Pekerjaan Tanah', 'Pondasi', 'Struktur', 'Dinding', 'Atap', 'Plafon', 'Lantai', 'Pintu & Jendela', 'Finishing',
    'Interior', 'Furniture', 'MEP', 'Landscape', 'Pekerjaan Luar', 'Peralatan', 'Transportasi', 'Overhead', 'Lain-lain', 'Custom'];
  const INTERIOR_DIVS = ['Interior', 'Furniture'];
  const KINDS = { material: 'Material', upah: 'Upah', alat: 'Alat', subkon: 'Subkon / borongan' };

  /* ---------- Data awal: harga dasar (harga diisi sendiri) ---------- */
  const P = (id, kind, name, unit) => ({ id: 'pr-' + id, type: 'price', kind, name, unit, price: 0, seed: true });
  const SEED_PRICES = [
    P('pekerja', 'upah', 'Pekerja', 'OH'), P('tk-batu', 'upah', 'Tukang batu', 'OH'), P('tk-kayu', 'upah', 'Tukang kayu', 'OH'),
    P('tk-besi', 'upah', 'Tukang besi', 'OH'), P('tk-cat', 'upah', 'Tukang cat', 'OH'), P('tk-listrik', 'upah', 'Tukang listrik', 'OH'),
    P('tk-interior', 'upah', 'Tukang interior / furnitur', 'OH'), P('kepala', 'upah', 'Kepala tukang', 'OH'), P('mandor', 'upah', 'Mandor', 'OH'),
    P('semen', 'material', 'Semen Portland (PC)', 'kg'), P('pasir-pasang', 'material', 'Pasir pasang', 'm³'), P('pasir-beton', 'material', 'Pasir beton', 'm³'),
    P('pasir-urug', 'material', 'Pasir urug', 'm³'), P('split', 'material', 'Kerikil / split 1-2', 'm³'), P('batu-kali', 'material', 'Batu kali', 'm³'),
    P('air', 'material', 'Air kerja', 'liter'), P('bata', 'material', 'Bata merah', 'bh'), P('hebel', 'material', 'Bata ringan (hebel)', 'm³'),
    P('mortar', 'material', 'Mortar / perekat bata ringan', 'kg'), P('besi', 'material', 'Besi beton', 'kg'), P('kawat', 'material', 'Kawat beton', 'kg'),
    P('kayu3', 'material', 'Kayu kelas III (bekisting)', 'm³'), P('balok2', 'material', 'Balok kayu kelas II', 'm³'), P('plywood9', 'material', 'Plywood 9 mm', 'lbr'),
    P('dolken', 'material', 'Dolken / bambu penyangga', 'batang'), P('paku', 'material', 'Paku 5–12 cm', 'kg'), P('minyak', 'material', 'Minyak bekisting', 'liter'),
    P('semen-warna', 'material', 'Semen warna / nat', 'kg'), P('keramik40', 'material', 'Keramik lantai 40×40', 'm²'), P('keramik-dd', 'material', 'Keramik dinding 20×25', 'm²'),
    P('gypsum', 'material', 'Gypsum board 9 mm (120×240)', 'lbr'), P('rangka-plafon', 'material', 'Rangka plafon hollow galvanis', 'm²'), P('kompon', 'material', 'Kompon gypsum', 'kg'),
    P('plamir', 'material', 'Plamir tembok', 'kg'), P('cat-dasar', 'material', 'Cat dasar tembok', 'kg'), P('cat-tembok', 'material', 'Cat tembok', 'kg'),
    P('inst-lampu', 'material', 'Material titik lampu (kabel, pipa, fiting, saklar)', 'titik'), P('inst-stop', 'material', 'Material titik stop kontak', 'titik'),
    P('multiplek18', 'material', 'Multiplek 18 mm', 'lbr'), P('hpl', 'material', 'HPL', 'lbr'), P('edging', 'material', 'Edging PVC', 'm'),
    P('engsel', 'material', 'Engsel sendok', 'bh'), P('rel-laci', 'material', 'Rel laci', 'set'), P('handle', 'material', 'Handle', 'bh'), P('lem', 'material', 'Lem kuning / lem HPL', 'kg'),
    P('atap-bj', 'subkon', 'Rangka atap baja ringan + genteng metal terpasang', 'm²'),
  ];

  /* ---------- Data awal: analisa harga satuan ---------- */
  const c = (id, coef) => ({ priceId: 'pr-' + id, coef });
  const L = (pk, tk, kt, md, tukang = 'tk-batu') => [c('pekerja', pk), c(tukang, tk), c('kepala', kt), c('mandor', md)].filter((x) => x.coef);
  const A = (id, group, division, name, unit, comps, source = 'PUPR') => ({ id: 'ah-' + id, type: 'ahsp', group, division, name, unit, comps, source, overhead: 0, seed: true });
  const SEED_AHSP = [
    A('bersih', 'bangunan', 'Persiapan', 'Pembersihan lapangan ringan', 'm²', [c('pekerja', 0.05), c('mandor', 0.005)]),
    A('galian', 'bangunan', 'Pekerjaan Tanah', 'Galian tanah biasa sedalam 1 m', 'm³', [c('pekerja', 0.75), c('mandor', 0.025)]),
    A('urug-kembali', 'bangunan', 'Pekerjaan Tanah', 'Urugan tanah kembali', 'm³', [c('pekerja', 0.192), c('mandor', 0.0192)]),
    A('urug-pasir', 'bangunan', 'Pekerjaan Tanah', 'Urugan pasir bawah pondasi / lantai', 'm³', [c('pasir-urug', 1.2), c('pekerja', 0.3), c('mandor', 0.01)]),
    A('batu-kali', 'bangunan', 'Pondasi', 'Pasangan pondasi batu kali 1PC : 4PP', 'm³', [c('batu-kali', 1.2), c('semen', 163), c('pasir-pasang', 0.52), ...L(1.5, 0.75, 0.075, 0.075)]),
    A('lantai-kerja', 'bangunan', 'Pondasi', 'Beton lantai kerja K-100 (fc 7,4 MPa)', 'm³', [c('semen', 247), c('pasir-beton', 0.621), c('split', 0.74), c('air', 215), ...L(1.2, 0.2, 0.02, 0.06)]),
    A('beton175', 'bangunan', 'Struktur', 'Beton mutu K-175 (fc 14,5 MPa), manual', 'm³', [c('semen', 326), c('pasir-beton', 0.543), c('split', 0.762), c('air', 215), ...L(1.65, 0.275, 0.028, 0.083)]),
    A('beton225', 'bangunan', 'Struktur', 'Beton mutu K-225 (fc 19,3 MPa), manual', 'm³', [c('semen', 371), c('pasir-beton', 0.499), c('split', 0.776), c('air', 215), ...L(1.65, 0.275, 0.028, 0.083)]),
    A('besi', 'bangunan', 'Struktur', 'Pembesian besi polos / ulir', 'kg', [c('besi', 1.05), c('kawat', 0.015), ...L(0.007, 0.007, 0.0007, 0.0004, 'tk-besi')]),
    A('bek-sloof', 'bangunan', 'Struktur', 'Bekisting sloof', 'm²', [c('kayu3', 0.045), c('paku', 0.3), c('minyak', 0.1), ...L(0.52, 0.26, 0.026, 0.026, 'tk-kayu')]),
    A('bek-kolom', 'bangunan', 'Struktur', 'Bekisting kolom', 'm²', [c('kayu3', 0.04), c('paku', 0.4), c('minyak', 0.2), c('balok2', 0.015), c('plywood9', 0.35), c('dolken', 2), ...L(0.66, 0.33, 0.033, 0.033, 'tk-kayu')]),
    A('bek-balok', 'bangunan', 'Struktur', 'Bekisting balok', 'm²', [c('kayu3', 0.04), c('paku', 0.4), c('minyak', 0.2), c('balok2', 0.018), c('plywood9', 0.35), c('dolken', 2), ...L(0.66, 0.33, 0.033, 0.033, 'tk-kayu')]),
    A('bek-plat', 'bangunan', 'Struktur', 'Bekisting plat lantai', 'm²', [c('kayu3', 0.04), c('paku', 0.4), c('minyak', 0.2), c('balok2', 0.015), c('plywood9', 0.35), c('dolken', 6), ...L(0.66, 0.33, 0.033, 0.033, 'tk-kayu')]),
    A('bata14', 'bangunan', 'Dinding', 'Pasangan dinding ½ bata merah 1PC : 4PP', 'm²', [c('bata', 70), c('semen', 11.5), c('pasir-pasang', 0.043), ...L(0.3, 0.1, 0.01, 0.015)]),
    A('bata15', 'bangunan', 'Dinding', 'Pasangan dinding ½ bata merah 1PC : 5PP', 'm²', [c('bata', 70), c('semen', 9.68), c('pasir-pasang', 0.045), ...L(0.3, 0.1, 0.01, 0.015)]),
    A('hebel', 'bangunan', 'Dinding', 'Pasangan dinding bata ringan tebal 10 cm', 'm²', [c('hebel', 0.105), c('mortar', 3.5), ...L(0.3, 0.1, 0.01, 0.015)], 'Sendiri'),
    A('plester14', 'bangunan', 'Dinding', 'Plesteran 1PC : 4PP tebal 15 mm', 'm²', [c('semen', 6.24), c('pasir-pasang', 0.024), ...L(0.3, 0.15, 0.015, 0.015)]),
    A('plester15', 'bangunan', 'Dinding', 'Plesteran 1PC : 5PP tebal 15 mm', 'm²', [c('semen', 5.18), c('pasir-pasang', 0.026), ...L(0.3, 0.15, 0.015, 0.015)]),
    A('acian', 'bangunan', 'Dinding', 'Acian', 'm²', [c('semen', 3.25), ...L(0.2, 0.1, 0.01, 0.01)]),
    A('atap', 'bangunan', 'Atap', 'Rangka atap baja ringan + genteng metal (borongan)', 'm²', [c('atap-bj', 1)], 'Sendiri'),
    A('plafon', 'bangunan', 'Plafon', 'Plafon gypsum 9 mm rangka hollow', 'm²', [c('rangka-plafon', 1), c('gypsum', 0.364), c('kompon', 0.3), ...L(0.1, 0.05, 0.005, 0.005, 'tk-kayu')], 'Sendiri'),
    A('keramik40', 'bangunan', 'Lantai', 'Lantai keramik 40×40', 'm²', [c('keramik40', 1.06), c('semen', 10), c('pasir-pasang', 0.045), c('semen-warna', 1.5), ...L(0.7, 0.35, 0.035, 0.035)]),
    A('keramik-dd', 'bangunan', 'Lantai', 'Pelapis dinding keramik 20×25', 'm²', [c('keramik-dd', 1.05), c('semen', 9.3), c('pasir-pasang', 0.018), c('semen-warna', 1.94), ...L(0.9, 0.45, 0.045, 0.045)]),
    A('cat', 'bangunan', 'Finishing', 'Pengecatan tembok baru (plamir, 1 dasar, 2 penutup)', 'm²', [c('plamir', 0.1), c('cat-dasar', 0.1), c('cat-tembok', 0.26), ...L(0.02, 0.063, 0.0063, 0.0025, 'tk-cat')]),
    A('lampu', 'bangunan', 'MEP', 'Instalasi titik lampu', 'titik', [c('inst-lampu', 1), c('tk-listrik', 0.2), c('pekerja', 0.1)], 'Sendiri'),
    A('stop', 'bangunan', 'MEP', 'Instalasi titik stop kontak', 'titik', [c('inst-stop', 1), c('tk-listrik', 0.2), c('pekerja', 0.1)], 'Sendiri'),
    A('ks-bawah', 'interior', 'Furniture', 'Kitchen set bawah, multiplek 18 mm finish HPL', 'm', [c('multiplek18', 0.75), c('hpl', 1), c('edging', 6), c('engsel', 4), c('rel-laci', 0.5), c('handle', 2), c('lem', 0.6), c('tk-interior', 1), c('pekerja', 0.5)], 'Sendiri'),
    A('ks-atas', 'interior', 'Furniture', 'Kitchen set atas, multiplek 18 mm finish HPL', 'm', [c('multiplek18', 0.5), c('hpl', 0.75), c('edging', 5), c('engsel', 4), c('handle', 2), c('lem', 0.4), c('tk-interior', 0.8), c('pekerja', 0.4)], 'Sendiri'),
    A('lemari', 'interior', 'Furniture', 'Lemari pakaian HPL (luas tampak depan)', 'm²', [c('multiplek18', 0.9), c('hpl', 1.1), c('edging', 6), c('engsel', 3), c('rel-laci', 0.3), c('handle', 1.5), c('lem', 0.6), c('tk-interior', 1.2), c('pekerja', 0.6)], 'Sendiri'),
    A('backdrop', 'interior', 'Interior', 'Panel backdrop / wall panel HPL', 'm²', [c('multiplek18', 0.45), c('hpl', 0.45), c('edging', 2), c('lem', 0.3), c('tk-interior', 0.6), c('pekerja', 0.3)], 'Sendiri'),
  ];

  /* ---------- Analisa ---------- */
  // prices: Map id -> price record
  function ahspCalc(ahsp, prices) {
    const lines = (ahsp.comps || []).map((x) => {
      const p = prices.get(x.priceId);
      const ok = p && !p.deleted;
      const price = ok ? num(p.price) : 0;
      return { priceId: x.priceId, name: ok ? p.name : '(harga dihapus)', unit: ok ? p.unit : '', kind: ok ? p.kind : 'material', coef: num(x.coef), price, total: num(x.coef) * price, missing: !ok, empty: ok && !price };
    });
    const by = { material: 0, upah: 0, alat: 0, subkon: 0 };
    lines.forEach((l) => { by[l.kind] = (by[l.kind] || 0) + l.total; });
    const base = lines.reduce((s, l) => s + l.total, 0);
    const oh = base * num(ahsp.overhead) / 100;
    return { lines, by, base, overhead: oh, total: r0(base + oh), empties: lines.filter((l) => l.empty || l.missing).length };
  }
  // potret komponen untuk disimpan di item RAB
  function snapshot(ahsp, prices) {
    const k = ahspCalc(ahsp, prices);
    const f = 1 + num(ahsp.overhead) / 100;
    return { price: k.total, comps: k.lines.map((l) => ({ name: l.name, unit: l.unit, kind: l.kind, coef: l.coef, price: r0(l.price * f) })) };
  }

  /* ---------- RAB ---------- */
  function rabTotals(rab) {
    const items = (rab.items || []).map((it) => Object.assign({}, it, { total: r0(num(it.qty) * num(it.price)) }));
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const overhead = r0(subtotal * num(rab.ohPct) / 100);
    const profit = r0(subtotal * num(rab.profitPct) / 100);
    const tax = r0((subtotal + overhead + profit) * num(rab.taxPct) / 100);
    const grand = subtotal + overhead + profit + tax;
    const divs = [];
    for (const it of items) {
      const d = it.division || 'Lain-lain';
      let g = divs.find((x) => x.name === d);
      if (!g) { g = { name: d, total: 0, items: [] }; divs.push(g); }
      g.total += it.total; g.items.push(it);
    }
    divs.sort((a, b) => order(a.name) - order(b.name));
    divs.forEach((g) => { g.pct = subtotal ? g.total / subtotal * 100 : 0; });
    return { items, subtotal, overhead, profit, tax, grand, divs, markup: subtotal ? (overhead + profit) / subtotal : 0 };
  }
  const order = (d) => { const i = DIVISIONS.indexOf(d); return i < 0 ? 99 : i; };

  // Rekap kebutuhan sumber daya (material, upah, alat). Item tanpa analisa masuk "subkon / lump sum".
  function rabResources(rab) {
    const map = new Map();
    const by = { material: 0, upah: 0, alat: 0, subkon: 0 };
    for (const it of rab.items || []) {
      const lineTotal = r0(num(it.qty) * num(it.price));
      const comps = it.comps || [];
      const unitSum = comps.reduce((s, x) => s + num(x.coef) * num(x.price), 0);
      if (!comps.length || !unitSum) { by.subkon += lineTotal; continue; }
      const scale = lineTotal / (num(it.qty) * unitSum || 1);
      for (const x of comps) {
        const key = x.kind + '|' + x.name + '|' + x.unit;
        const q = num(it.qty) * num(x.coef), cost = q * num(x.price) * scale;
        const cur = map.get(key) || { kind: x.kind, name: x.name, unit: x.unit, qty: 0, cost: 0, price: num(x.price) };
        cur.qty += q; cur.cost += cost; map.set(key, cur);
        by[x.kind] = (by[x.kind] || 0) + cost;
      }
    }
    Object.keys(by).forEach((k) => { by[k] = r0(by[k]); });
    const list = [...map.values()].sort((a, b) => Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind) || b.cost - a.cost);
    return { list, by };
  }

  /* ---------- Penawaran ---------- */
  const lineAmount = (it) => (it.unit === '%' ? r0(num(it.qty) * num(it.price) / 100) : r0(num(it.qty) * num(it.price)));
  // Cost & Fee: harga satuan item "%" dihitung otomatis dari basis yang ditentukan item (calc)
  function quoteTotals(q) {
    const secs = (q.sections || []).map((s) => ({ title: s.title, items: (s.items || []).map((it) => Object.assign({}, it)) }));
    const cf = q.tpl === 'cf';
    if (cf) {
      const B = secs[1] || { items: [] };
      const baseB = B.items.filter((it) => !it.calc).reduce((s, it) => s + lineAmount(it), 0);
      B.items.forEach((it) => { if (it.calc === 'cont') it.price = baseB; });
      const totB = B.items.reduce((s, it) => s + lineAmount(it), 0);
      secs.forEach((s) => s.items.forEach((it) => { if (it.calc === 'fee') it.price = totB; }));
    }
    secs.forEach((s) => { s.items.forEach((it) => { it.amount = lineAmount(it); }); s.total = s.items.reduce((a, it) => a + it.amount, 0); });
    const subtotal = secs.reduce((a, s) => a + s.total, 0);
    const discount = r0(q.discount);
    if (cf) {
      const fee = secs[0] ? secs[0].total : 0, cost = secs.slice(1).reduce((a, s) => a + s.total, 0);
      const tax = r0((fee - discount) * num(q.taxPct) / 100);
      return { secs, subtotal, fee, cost, discount, tax, total: fee - discount + tax + cost, contract: fee - discount + tax };
    }
    const tax = r0((subtotal - discount) * num(q.taxPct) / 100);
    const total = subtotal - discount + tax;
    return { secs, subtotal, discount, tax, total, contract: total };
  }
  function scheduleAmounts(q, base) {
    let acc = 0; const rows = q.schedule || [];
    const sum = rows.reduce((s, r) => s + num(r.percent), 0);
    return rows.map((r, i) => {
      let a = r0(base * num(r.percent) / 100);
      if (i === rows.length - 1 && Math.abs(sum - 100) < 0.01) a = base - acc;
      acc += a; return Object.assign({}, r, { amount: a });
    });
  }
  function fillTokens(s, q, cfg) {
    const v = { kota: (cfg && cfg.city) || 'Cianjur', kunjungan: q.visits || 2, pemeliharaan: q.maintDays || 90, mingguDesain: q.designWeeks || '…', hariKerja: q.workDays || '…', batasBelanja: q.approvalLimit ? 'Rp ' + String(r0(q.approvalLimit)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : 'Rp …', garansi: q.warrantyMonths || 6 };
    return String(s || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  }
  // "1. Judul" -> heading, "a. teks" -> butir
  function parseTerms(s) {
    const out = [];
    for (const raw of String(s || '').split('\n')) {
      const l = raw.trim(); if (!l) continue;
      let m = l.match(/^(\d+)\.\s+(.*)$/);
      if (m) { out.push({ h: true, no: m[1], text: m[2] }); continue; }
      m = l.match(/^([a-z])\.\s+(.*)$/);
      if (m) { out.push({ h: false, no: m[1], text: m[2] }); continue; }
      out.push({ h: false, no: '', text: l });
    }
    return out;
  }

  /* ---------- Template penawaran (dari dokumen Widemp) ---------- */
  const it = (title, desc, qty, unit, extra) => Object.assign({ title, desc, qty, unit, price: 0 }, extra || {});
  const TERMS = {
 "db": "1. Masa Berlaku Penawaran\na. Penawaran ini berlaku selama 14 (empat belas) hari kalender sejak tanggal penawaran.\nb. Setelah masa berlaku berakhir, harga, lingkup, dan jadwal dapat ditinjau ulang oleh Widemp Atelier.\n2. Sistem Kontrak\na. Nilai kontrak bersifat harga tetap (lump sum) berdasarkan gambar kerja, spesifikasi, dan RAB yang telah disetujui Klien.\nb. Selama tidak ada perubahan lingkup atau spesifikasi dari Klien, nilai kontrak tidak berubah.\nc. Apabila material yang ditentukan tidak tersedia di pasaran, Widemp Atelier dapat menggunakan material setara dengan persetujuan Klien.\n3. Pekerjaan Tambah / Kurang\na. Setiap perubahan desain, spesifikasi, atau volume atas permintaan Klien dicatat dalam Berita Acara Pekerjaan Tambah/Kurang yang memuat nilai biaya dan tambahan waktu.\nb. Pekerjaan tambah dilaksanakan setelah Berita Acara ditandatangani Klien. Nilainya ditagihkan bersama termin berikutnya, kecuali disepakati lain.\nc. Pekerjaan kurang diperhitungkan sebagai pengurang nilai kontrak pada termin berikutnya.\n4. Ketentuan Pembayaran\na. Pembayaran termin dilakukan paling lambat 7 (tujuh) hari kalender sejak invoice diterbitkan.\nb. Apabila pembayaran terlambat, Widemp Atelier berhak menghentikan sementara pekerjaan. Jadwal penyelesaian bergeser sesuai lama keterlambatan, dan biaya yang timbul akibat penghentian ditanggung Klien.\nc. Widemp Atelier tidak berkewajiban menalangi biaya pekerjaan di luar termin yang telah dibayarkan.\n5. Jadwal Pelaksanaan\na. Estimasi waktu desain {mingguDesain} minggu dan pelaksanaan konstruksi {hariKerja} hari kalender, dihitung sejak uang muka diterima, gambar kerja disetujui, dan lahan siap dikerjakan.\nb. Jadwal dapat disesuaikan apabila terjadi pekerjaan tambah, keterlambatan pembayaran atau keputusan Klien, cuaca ekstrem, atau keadaan kahar.\n6. Kewajiban Klien\na. Menyediakan akses ke lokasi, kejelasan batas dan status lahan, serta izin lingkungan setempat (RT/RW).\nb. Menyediakan sumber air dan listrik kerja di lokasi, atau biayanya diperhitungkan tersendiri.\nc. Memberikan keputusan atas pilihan material dan desain paling lambat 3 (tiga) hari kerja sejak diminta agar jadwal tidak terganggu.\nd. Menyampaikan instruksi pekerjaan melalui PIC Widemp Atelier, tidak langsung kepada pekerja di lapangan.\n7. Pengawasan & Pelaporan\na. Widemp Atelier menyampaikan laporan progres secara berkala (mingguan) berupa foto dan persentase progres.\nb. Klien dapat melakukan inspeksi lapangan dengan koordinasi terlebih dahulu bersama PIC proyek.\n8. Serah Terima & Masa Pemeliharaan\na. Serah terima pertama dilakukan setelah pekerjaan selesai 100% dan dituangkan dalam Berita Acara Serah Terima.\nb. Masa pemeliharaan berlaku selama {pemeliharaan} hari kalender sejak serah terima pertama. Selama masa ini, Widemp Atelier memperbaiki cacat akibat mutu pekerjaan tanpa biaya tambahan.\nc. Masa pemeliharaan tidak mencakup kerusakan akibat pemakaian tidak wajar, bencana, atau modifikasi oleh pihak lain.\nd. Garansi produk dan peralatan mengikuti ketentuan garansi dari pabrikan masing-masing.\n9. Kondisi Lapangan Tak Terduga\na. Apabila ditemukan kondisi yang tidak dapat diketahui saat survei, antara lain batuan keras, muka air tanah tinggi, tanah labil, atau utilitas tertanam, penanganannya dibahas bersama Klien dan dapat diperhitungkan sebagai pekerjaan tambah.\n10. Pengecualian\na. Biaya pengurusan perizinan (PBG/SLF) dan retribusi, kecuali tercantum dalam Rincian Biaya.\nb. Penyambungan baru atau penambahan daya PLN, sambungan PDAM, dan internet.\nc. Perabot lepas, peralatan elektronik, AC, dan water heater, kecuali tercantum dalam RAB.\nd. Pekerjaan lansekap, pagar, dan pembongkaran bangunan eksisting, kecuali tercantum dalam RAB.\n11. Hak Kekayaan Intelektual & Dokumentasi\na. Hak cipta atas seluruh konsep, gambar, dan desain tetap menjadi milik Widemp Atelier.\nb. Setelah seluruh kewajiban pembayaran lunas, Klien berhak menggunakan desain untuk satu kali pembangunan di lokasi proyek yang tercantum dalam penawaran ini.\nc. Penggunaan ulang desain di lokasi lain, pengubahan oleh pihak lain, atau pengalihan kepada pihak ketiga memerlukan persetujuan tertulis dari Widemp Atelier.\nd. Widemp Atelier berhak menampilkan desain, render, dan dokumentasi proyek untuk keperluan portofolio dan promosi, kecuali Klien meminta kerahasiaan secara tertulis.\n12. Pembatalan\na. Apabila Klien membatalkan pekerjaan setelah SPK/Kontrak ditandatangani, uang muka yang telah digunakan untuk desain, persiapan, dan mobilisasi tidak dikembalikan.\nb. Pekerjaan yang telah terpasang serta material yang telah dipesan atau dibeli wajib dibayar oleh Klien.\n13. Keadaan Kahar (Force Majeure)\na. Keterlambatan atau kegagalan pelaksanaan akibat keadaan di luar kendali para pihak, antara lain bencana alam, cuaca ekstrem berkepanjangan, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai wanprestasi.\nb. Para pihak akan bermusyawarah untuk menyesuaikan jadwal dan, bila perlu, lingkup pekerjaan.\n14. Penyelesaian Perselisihan & Ketentuan Lain\na. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, para pihak sepakat memilih domisili hukum di Kepaniteraan Pengadilan Negeri {kota}.\nb. Penawaran yang telah ditandatangani Klien menjadi dasar kesepakatan kerja dan akan dituangkan lebih lanjut dalam Surat Perjanjian Kerja (SPK)/Kontrak. Apabila terdapat perbedaan, ketentuan dalam SPK/Kontrak yang berlaku.\nc. Komunikasi dan persetujuan tertulis, termasuk melalui email atau WhatsApp resmi para pihak, dianggap sah.",
 "desain": "1. Masa Berlaku Penawaran\na. Penawaran ini berlaku selama 14 (empat belas) hari kalender sejak tanggal penawaran.\nb. Setelah masa berlaku berakhir, harga, lingkup, dan jadwal dapat ditinjau ulang oleh Widemp Atelier.\n2. Lingkup Pekerjaan\na. Pekerjaan terbatas pada item yang tercantum dalam Rincian Biaya.\nb. Permintaan di luar lingkup tersebut dihitung sebagai pekerjaan tambah dengan penawaran terpisah yang disetujui Klien sebelum dikerjakan.\n3. Ketentuan Pembayaran\na. Pekerjaan dimulai setelah uang muka diterima. Setiap tahap berikutnya dilanjutkan setelah termin sebelumnya lunas.\nb. Pembayaran dilakukan paling lambat 7 (tujuh) hari kalender sejak invoice diterbitkan.\nc. Apabila pembayaran terlambat, Widemp Atelier berhak menunda pekerjaan dan jadwal penyelesaian bergeser sesuai lama keterlambatan.\nd. Pembayaran yang telah diterima untuk tahap yang sudah dikerjakan tidak dapat dikembalikan.\n4. Revisi\na. Setiap tahap mencakup maksimal 2 (dua) kali revisi minor tanpa biaya tambahan.\nb. Revisi minor adalah penyesuaian yang tidak mengubah konsep, tata letak utama, atau luas bangunan.\nc. Revisi mayor, termasuk perubahan konsep, tata letak utama, luas, atau perubahan atas tahap yang telah disetujui, dikenakan biaya tambahan sesuai kesepakatan.\nd. Permintaan revisi disampaikan secara tertulis dalam satu daftar per putaran revisi.\n5. Persetujuan Tahapan\na. Klien memberikan tanggapan atau persetujuan paling lambat 7 (tujuh) hari kalender sejak hasil tahap diserahkan.\nb. Apabila dalam 14 (empat belas) hari kalender tidak ada tanggapan, tahap tersebut dianggap disetujui dan pekerjaan dapat dilanjutkan ke tahap berikutnya.\nc. Proyek yang tertunda lebih dari 3 (tiga) bulan atas permintaan Klien dapat dikenakan penyesuaian biaya dan jadwal.\n6. Data & Kewajiban Klien\na. Klien menyediakan data yang diperlukan, antara lain ukuran dan batas lahan, sertifikat/denah eksisting, kebutuhan ruang, serta akses ke lokasi untuk survei.\nb. Widemp Atelier tidak bertanggung jawab atas kesalahan desain yang timbul dari data yang tidak akurat atau tidak lengkap dari Klien.\n7. Kunjungan Lapangan & Rapat\na. Penawaran ini mencakup {kunjungan} kali kunjungan lokasi dan rapat presentasi sesuai tahapan.\nb. Kunjungan tambahan, serta kunjungan di luar Kabupaten {kota}, dikenakan biaya transportasi dan akomodasi sesuai kesepakatan.\n8. File & Dokumen\na. Hasil pekerjaan diserahkan dalam bentuk file PDF.\nb. File kerja asli (CAD, SketchUp, file render) tidak termasuk dalam penawaran, kecuali disepakati secara tertulis.\nc. Biaya cetak dan pengiriman dokumen fisik ditanggung Klien.\n9. Hak Kekayaan Intelektual & Dokumentasi\na. Hak cipta atas seluruh konsep, gambar, dan desain tetap menjadi milik Widemp Atelier.\nb. Setelah seluruh kewajiban pembayaran lunas, Klien berhak menggunakan desain untuk satu kali pembangunan di lokasi proyek yang tercantum dalam penawaran ini.\nc. Penggunaan ulang desain di lokasi lain, pengubahan oleh pihak lain, atau pengalihan kepada pihak ketiga memerlukan persetujuan tertulis dari Widemp Atelier.\nd. Widemp Atelier berhak menampilkan desain, render, dan dokumentasi proyek untuk keperluan portofolio dan promosi, kecuali Klien meminta kerahasiaan secara tertulis.\n10. Pengecualian\na. Biaya pengurusan perizinan (PBG/SLF) dan retribusi.\nb. Perhitungan struktur dan MEP oleh tenaga ahli bersertifikat, kecuali tercantum dalam Rincian Biaya.\nc. Survei topografi, uji tanah (soil test), dan pengukuran oleh pihak ketiga.\nd. Pengawasan dan pelaksanaan pembangunan.\n11. Batas Tanggung Jawab\na. Widemp Atelier tidak bertanggung jawab atas hasil pembangunan yang dilaksanakan pihak lain tidak sesuai gambar kerja atau tanpa konsultasi dengan Widemp Atelier.\nb. RAB yang disusun (bila termasuk lingkup) merupakan estimasi berdasarkan harga pada saat penyusunan dan dapat berbeda dengan harga aktual pelaksanaan.\n12. Pembatalan\na. Apabila Klien membatalkan pekerjaan, pembayaran yang telah diterima tidak dikembalikan.\nb. Pekerjaan yang telah diselesaikan tetapi belum dibayar wajib dilunasi secara proporsional sesuai tahapannya.\n13. Keadaan Kahar (Force Majeure)\na. Keterlambatan atau kegagalan pelaksanaan akibat keadaan di luar kendali para pihak, antara lain bencana alam, cuaca ekstrem berkepanjangan, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai wanprestasi.\nb. Para pihak akan bermusyawarah untuk menyesuaikan jadwal dan, bila perlu, lingkup pekerjaan.\n14. Penyelesaian Perselisihan & Ketentuan Lain\na. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, para pihak sepakat memilih domisili hukum di Kepaniteraan Pengadilan Negeri {kota}.\nb. Penawaran yang telah ditandatangani Klien menjadi dasar kesepakatan kerja dan akan dituangkan lebih lanjut dalam Surat Perjanjian Kerja (SPK)/Kontrak. Apabila terdapat perbedaan, ketentuan dalam SPK/Kontrak yang berlaku.\nc. Komunikasi dan persetujuan tertulis, termasuk melalui email atau WhatsApp resmi para pihak, dianggap sah.",
 "cf": "1. Masa Berlaku Penawaran\na. Penawaran ini berlaku selama 14 (empat belas) hari kalender sejak tanggal penawaran.\nb. Setelah masa berlaku berakhir, harga, lingkup, dan jadwal dapat ditinjau ulang oleh Widemp Atelier.\n2. Prinsip Cost & Fee\na. Biaya proyek dibayar Klien sesuai pengeluaran aktual. RAB merupakan estimasi, bukan harga tetap, sehingga realisasi dapat lebih rendah atau lebih tinggi dari estimasi.\nb. Penghematan biaya proyek sepenuhnya menjadi hak Klien.\nc. Fee manajemen dihitung dari realisasi biaya proyek. Material atau pekerjaan yang dibeli dan dibayar langsung oleh Klien tidak dikenakan fee, kecuali atas pekerjaan pemasangannya.\n3. Dana Kerja\na. Dana kerja ditransfer ke rekening proyek yang ditentukan dan hanya digunakan untuk keperluan proyek ini.\nb. Sisa saldo pada setiap periode diperhitungkan pada pengisian dana kerja berikutnya.\nc. Widemp Atelier tidak berkewajiban menalangi biaya proyek. Apabila dana kerja terlambat diterima, pekerjaan dapat dihentikan sementara dan jadwal bergeser sesuai lama keterlambatan.\n4. Transparansi & Pelaporan\na. Widemp Atelier menyampaikan laporan mingguan berisi rincian pengeluaran, salinan nota/kwitansi, dan foto progres pekerjaan.\nb. Klien berhak memeriksa seluruh bukti transaksi dan melakukan pengecekan harga kapan saja.\nc. Di akhir proyek, Widemp Atelier menyerahkan Laporan Keuangan Akhir beserta seluruh bukti pengeluaran.\n5. Persetujuan Pengeluaran & Pengadaan\na. Pengeluaran tunggal di atas {batasBelanja}, pengeluaran di luar RAB, dan penggunaan dana tak terduga memerlukan persetujuan Klien terlebih dahulu.\nb. Untuk item bernilai besar, Widemp Atelier menyampaikan pembanding harga dari minimal 2 (dua) pemasok.\nc. Seluruh diskon atau potongan harga dari pemasok menjadi hak Klien.\n6. Pengendalian Biaya\na. Widemp Atelier wajib memberikan pemberitahuan dini apabila realisasi biaya diperkirakan melampaui estimasi lebih dari 10%.\nb. Keputusan penyesuaian lingkup, spesifikasi, atau anggaran sepenuhnya berada pada Klien.\n7. Perubahan Desain & Spesifikasi\na. Perubahan desain atau spesifikasi atas permintaan Klien dilaksanakan setelah ada persetujuan tertulis. Dampak biaya dan waktu disampaikan sebelum dikerjakan.\nb. Revisi desain mayor setelah DED disetujui dikenakan fee desain tambahan sesuai kesepakatan.\n8. Jadwal & Kewajiban Klien\na. Estimasi waktu pelaksanaan {hariKerja} hari kalender sejak dana kerja awal diterima dan lahan siap dikerjakan.\nb. Klien menyediakan akses lokasi, kejelasan status lahan, izin lingkungan setempat, serta memberikan keputusan material paling lambat 3 (tiga) hari kerja sejak diminta.\nc. Instruksi pekerjaan disampaikan melalui PIC Widemp Atelier, tidak langsung kepada pekerja.\n9. Mutu, Serah Terima & Pemeliharaan\na. Serah terima dilakukan setelah pekerjaan selesai dan dituangkan dalam Berita Acara Serah Terima.\nb. Masa pemeliharaan berlaku {pemeliharaan} hari kalender. Perbaikan akibat kelalaian pelaksanaan menjadi tanggung jawab Widemp Atelier tanpa dibebankan ke biaya proyek.\nc. Perbaikan akibat cacat produk, pemakaian tidak wajar, atau sebab di luar kendali pelaksana dibiayai sebagai biaya proyek.\n10. Pengecualian\na. Biaya perizinan (PBG/SLF) dan retribusi, penyambungan baru/penambahan daya PLN dan PDAM, kecuali disepakati untuk dibiayai sebagai biaya proyek.\nb. Perabot lepas dan peralatan elektronik yang dibeli langsung oleh Klien.\n11. Hak Kekayaan Intelektual & Dokumentasi\na. Hak cipta atas seluruh konsep, gambar, dan desain tetap menjadi milik Widemp Atelier.\nb. Setelah seluruh kewajiban pembayaran lunas, Klien berhak menggunakan desain untuk satu kali pembangunan di lokasi proyek yang tercantum dalam penawaran ini.\nc. Penggunaan ulang desain di lokasi lain, pengubahan oleh pihak lain, atau pengalihan kepada pihak ketiga memerlukan persetujuan tertulis dari Widemp Atelier.\nd. Widemp Atelier berhak menampilkan desain, render, dan dokumentasi proyek untuk keperluan portofolio dan promosi, kecuali Klien meminta kerahasiaan secara tertulis.\n12. Pembatalan\na. Apabila proyek dihentikan oleh Klien, fee desain untuk tahap yang telah berjalan dan fee manajemen atas biaya yang telah direalisasikan wajib dilunasi.\nb. Sisa dana kerja dikembalikan kepada Klien setelah dikurangi kewajiban kepada pemasok, subkontraktor, dan pekerja atas pekerjaan atau material yang telah dipesan.\n13. Keadaan Kahar (Force Majeure)\na. Keterlambatan atau kegagalan pelaksanaan akibat keadaan di luar kendali para pihak, antara lain bencana alam, cuaca ekstrem berkepanjangan, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai wanprestasi.\nb. Para pihak akan bermusyawarah untuk menyesuaikan jadwal dan, bila perlu, lingkup pekerjaan.\n14. Penyelesaian Perselisihan & Ketentuan Lain\na. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, para pihak sepakat memilih domisili hukum di Kepaniteraan Pengadilan Negeri {kota}.\nb. Penawaran yang telah ditandatangani Klien menjadi dasar kesepakatan kerja dan akan dituangkan lebih lanjut dalam Surat Perjanjian Kerja (SPK)/Kontrak. Apabila terdapat perbedaan, ketentuan dalam SPK/Kontrak yang berlaku.\nc. Komunikasi dan persetujuan tertulis, termasuk melalui email atau WhatsApp resmi para pihak, dianggap sah."
};
  TERMS.pw = `1. Masa Berlaku Penawaran
a. Penawaran ini berlaku selama 14 (empat belas) hari kalender sejak tanggal penawaran.
b. Setelah masa berlaku berakhir, harga, lingkup, dan jadwal dapat ditinjau ulang oleh Widemp Atelier.
2. Lingkup Pengawasan
a. Widemp Atelier mengawasi kesesuaian pekerjaan pelaksana/kontraktor terhadap gambar kerja, spesifikasi, mutu, dan jadwal yang disetujui Klien.
b. Pengawasan dilakukan secara berkala sebanyak {kunjungan} kali kunjungan per minggu, ditambah kunjungan pada tahap penting (pengecoran, pemasangan rangka atap, dan serah terima).
c. Widemp Atelier bukan pelaksana pekerjaan. Tanggung jawab atas mutu, pengadaan material, tenaga kerja, dan keselamatan kerja di lapangan berada pada pelaksana/kontraktor.
3. Pelaporan
a. Widemp Atelier menyampaikan laporan mingguan berisi foto progres, persentase progres, catatan temuan, dan rekomendasi perbaikan.
b. Widemp Atelier membantu opname progres untuk dasar pembayaran termin kontraktor.
4. Ketentuan Pembayaran
a. Pengawasan dimulai setelah uang muka diterima.
b. Pembayaran dilakukan paling lambat 7 (tujuh) hari kalender sejak invoice diterbitkan.
c. Apabila pembayaran terlambat, Widemp Atelier berhak menghentikan sementara pengawasan.
5. Waktu Pengawasan
a. Masa pengawasan {hariKerja} hari kalender sesuai jadwal pelaksanaan.
b. Apabila pelaksanaan melewati masa tersebut bukan karena Widemp Atelier, perpanjangan pengawasan dikenakan biaya per bulan sesuai harga satuan dalam penawaran ini.
6. Kewajiban Klien
a. Menyerahkan gambar kerja, RAB, dan kontrak pelaksana sebagai acuan pengawasan.
b. Meneruskan instruksi teknis kepada pelaksana melalui atau sepengetahuan Widemp Atelier.
c. Memberikan keputusan atas temuan dan usulan perubahan paling lambat 3 (tiga) hari kerja.
7. Batas Tanggung Jawab
a. Widemp Atelier tidak bertanggung jawab atas pekerjaan yang dilaksanakan tanpa sepengetahuan pengawas, di luar jadwal kunjungan, atau yang tidak mengikuti rekomendasi pengawas.
b. Keputusan akhir atas perubahan biaya dan lingkup berada pada Klien.
8. Pengecualian
a. Pelaksanaan pekerjaan, pengadaan material, dan biaya perizinan (PBG/SLF).
b. Perhitungan ulang struktur dan MEP oleh tenaga ahli bersertifikat, kecuali tercantum dalam Rincian Biaya.
c. Biaya perjalanan ke lokasi di luar Kabupaten {kota}, kecuali disepakati lain.
9. Pembatalan
a. Apabila Klien menghentikan pengawasan, pembayaran untuk periode yang telah berjalan tidak dikembalikan dan periode berjalan wajib dilunasi.
10. Keadaan Kahar (Force Majeure)
a. Keterlambatan atau kegagalan pelaksanaan akibat keadaan di luar kendali para pihak, antara lain bencana alam, cuaca ekstrem berkepanjangan, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai wanprestasi.
b. Para pihak akan bermusyawarah untuk menyesuaikan jadwal dan, bila perlu, lingkup pekerjaan.
11. Penyelesaian Perselisihan & Ketentuan Lain
a. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, para pihak sepakat memilih domisili hukum di Kepaniteraan Pengadilan Negeri {kota}.
b. Penawaran yang telah ditandatangani Klien menjadi dasar kesepakatan kerja dan akan dituangkan lebih lanjut dalam Surat Perjanjian Kerja (SPK)/Kontrak. Apabila terdapat perbedaan, ketentuan dalam SPK/Kontrak yang berlaku.
c. Komunikasi dan persetujuan tertulis, termasuk melalui email atau WhatsApp resmi para pihak, dianggap sah.`;
  TERMS.pi = `1. Masa Berlaku Penawaran
a. Penawaran ini berlaku selama 14 (empat belas) hari kalender sejak tanggal penawaran.
b. Harga material (multiplek, HPL, aksesoris) dapat ditinjau ulang setelah masa berlaku berakhir.
2. Gambar, Material & Sampel
a. Produksi dilaksanakan berdasarkan gambar kerja interior dan sampel material yang telah disetujui Klien secara tertulis.
b. Perbedaan kecil warna dan motif antara sampel dan produk (HPL, veneer, cat duco) merupakan toleransi wajar dari pabrikan.
c. Perubahan desain, ukuran, atau material setelah produksi dimulai dihitung sebagai pekerjaan tambah.
3. Pengukuran Lapangan
a. Widemp Atelier melakukan pengukuran ulang di lokasi sebelum produksi. Ukuran akhir mengikuti hasil pengukuran tersebut.
4. Ketentuan Pembayaran
a. Produksi dimulai setelah uang muka diterima dan gambar kerja disetujui.
b. Pembayaran dilakukan paling lambat 7 (tujuh) hari kalender sejak invoice diterbitkan. Pengiriman dilakukan setelah termin sebelum pengiriman lunas.
c. Barang yang telah diproduksi tetap menjadi milik Widemp Atelier sampai seluruh pembayaran lunas.
5. Waktu Produksi & Pemasangan
a. Estimasi waktu produksi dan pemasangan {hariKerja} hari kalender sejak uang muka diterima dan gambar kerja disetujui.
b. Jadwal dapat bergeser apabila lokasi belum siap, terjadi pekerjaan tambah, keterlambatan pembayaran atau keputusan Klien, atau keadaan kahar.
6. Kesiapan Lokasi
a. Dinding, lantai, plafon, titik listrik, dan titik air di area pemasangan telah selesai sebelum pemasangan.
b. Klien menyediakan akses, listrik kerja, serta tempat penyimpanan sementara yang aman di lokasi.
7. Garansi
a. Garansi konstruksi dan pemasangan selama {garansi} bulan sejak serah terima, untuk cacat akibat mutu pekerjaan.
b. Garansi tidak mencakup kerusakan akibat pemakaian tidak wajar, air/kelembapan berlebih, rayap dari lingkungan sekitar, atau modifikasi oleh pihak lain.
c. Garansi aksesoris (engsel, rel, handle, lampu) mengikuti ketentuan pabrikan.
8. Pengecualian
a. Peralatan elektronik, kompor, hood, sink, kran, dan batu top table, kecuali tercantum dalam Rincian Biaya.
b. Pembongkaran furnitur lama dan perbaikan dinding/lantai eksisting.
c. Pengiriman ke luar Kabupaten {kota}, kecuali tercantum dalam Rincian Biaya.
9. Hak Kekayaan Intelektual & Dokumentasi
a. Hak cipta atas desain tetap menjadi milik Widemp Atelier.
b. Widemp Atelier berhak menampilkan dokumentasi proyek untuk keperluan portofolio dan promosi, kecuali Klien meminta kerahasiaan secara tertulis.
10. Pembatalan
a. Apabila Klien membatalkan setelah produksi dimulai, uang muka tidak dikembalikan dan material yang telah dipotong atau dipesan wajib dibayar.
11. Keadaan Kahar (Force Majeure)
a. Keterlambatan atau kegagalan pelaksanaan akibat keadaan di luar kendali para pihak, antara lain bencana alam, cuaca ekstrem berkepanjangan, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai wanprestasi.
12. Penyelesaian Perselisihan & Ketentuan Lain
a. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, para pihak sepakat memilih domisili hukum di Kepaniteraan Pengadilan Negeri {kota}.
b. Penawaran yang telah ditandatangani Klien menjadi dasar kesepakatan kerja. Komunikasi dan persetujuan tertulis, termasuk melalui email atau WhatsApp resmi para pihak, dianggap sah.`;

  const TEMPLATES = {
    desain: {
      label: 'Jasa Desain', subtitle: 'Jasa Desain Arsitektur & Interior', code: 'D', totalLabel: 'TOTAL PENAWARAN',
      scope: 'Jasa perencanaan desain arsitektur dan/atau interior untuk {jenis} di {lokasi}, mulai dari pengumpulan kebutuhan, konsep, pengembangan desain, hingga gambar kerja (DED) yang siap digunakan untuk perhitungan biaya dan pelaksanaan pembangunan.',
      sections: () => [
        { title: 'DESAIN ARSITEKTUR', items: [
          it('Konsep & Pra-Rancangan', 'Diskusi kebutuhan, survei lokasi, program ruang, zoning, denah konsep, dan moodboard.', 0, 'm²', { area: true }),
          it('Pengembangan Desain', 'Denah, tampak, potongan, rencana material, dan visual 3D eksterior.', 0, 'm²', { area: true }),
          it('Gambar Kerja Arsitektur (DED)', 'Gambar kerja lengkap, detail arsitektur, dan spesifikasi teknis material.', 0, 'm²', { area: true })] },
        { title: 'DESAIN INTERIOR', items: [
          it('Konsep & Visual 3D Interior', 'Layout furnitur, skema warna dan material, render 3D per ruang.', 0, 'm²', { area: true }),
          it('Gambar Kerja Interior', 'Detail furnitur custom/built-in, plafon, lantai, dinding, dan titik lampu.', 0, 'm²', { area: true })] },
        { title: 'PEKERJAAN TAMBAHAN (OPSIONAL)', items: [
          it('Rencana Anggaran Biaya (RAB) / BoQ', 'Estimasi biaya pembangunan berdasarkan gambar kerja dan harga setempat.', 1, 'ls'),
          it('Gambar Struktur & MEP', 'Disusun bersama tenaga ahli struktur dan MEP mitra.', 1, 'ls'),
          it('Animasi / Walkthrough 3D', 'Video presentasi desain.', 1, 'ls')] },
      ],
      tableNote: 'Item yang tidak dipilih Klien dapat dihapus. Luas dihitung dari luas lantai bangunan/ruang yang didesain.',
      stages: () => [
        { name: 'Konsep', result: 'Program ruang, zoning, denah konsep, moodboard', time: '… minggu' },
        { name: 'Pengembangan Desain', result: 'Denah, tampak, potongan, visual 3D eksterior/interior', time: '… minggu' },
        { name: 'Gambar Kerja (DED)', result: 'Gambar kerja arsitektur/interior, detail, spesifikasi material', time: '… minggu' },
        { name: 'Serah Terima', result: 'File PDF siap cetak (dan RAB bila termasuk lingkup)', time: '… hari' }],
      stagesNote: 'Estimasi waktu dihitung sejak uang muka dan data lengkap dari Klien diterima, tidak termasuk waktu tunggu tanggapan Klien.',
      schedule: () => [
        { desc: 'Uang muka, dibayar saat penawaran disetujui sebelum pekerjaan dimulai', percent: 40 },
        { desc: 'Setelah Klien menyetujui Pengembangan Desain (denah & 3D)', percent: 30 },
        { desc: 'Sebelum penyerahan Gambar Kerja (DED) final', percent: 30 }],
    },
    db: {
      label: 'Design & Build', subtitle: 'Desain & Pembangunan (Design & Build)', code: 'DB', totalLabel: 'NILAI KONTRAK', perM2: true,
      scope: 'Layanan terpadu dari perencanaan desain hingga pembangunan selesai untuk {jenis} di {lokasi}. Seluruh pekerjaan dilaksanakan dengan sistem kontrak harga tetap (lump sum) berdasarkan gambar kerja, spesifikasi, dan RAB yang telah disetujui Klien. Widemp Atelier bertanggung jawab atas desain, pengadaan material, tenaga kerja, dan pengawasan.',
      sections: () => [
        { title: 'JASA DESAIN', items: [it('Desain Arsitektur & Interior', 'Konsep, pengembangan desain, visual 3D, dan gambar kerja (DED).', 0, 'm²', { area: true })] },
        { title: 'PEKERJAAN KONSTRUKSI', items: [
          it('Pekerjaan Persiapan', 'Pembersihan lahan, pengukuran, bouwplank, gudang/direksi keet, mobilisasi.', 1, 'ls'),
          it('Pekerjaan Tanah & Pondasi', 'Galian, urugan, pondasi sesuai gambar struktur.', 1, 'ls'),
          it('Pekerjaan Struktur', 'Sloof, kolom, balok, pelat lantai, dan tangga beton.', 1, 'ls'),
          it('Pekerjaan Dinding', 'Pasangan dinding, plesteran, dan acian.', 1, 'ls'),
          it('Pekerjaan Atap & Plafon', 'Rangka atap, penutup atap, talang, dan plafon.', 1, 'ls'),
          it('Pekerjaan Lantai & Pelapis Dinding', 'Keramik/granit/parket, plint, dan pelapis dinding.', 1, 'ls'),
          it('Pekerjaan Kusen, Pintu & Jendela', 'Kusen, daun pintu/jendela, kaca, dan aksesoris (kunci, engsel).', 1, 'ls'),
          it('Pekerjaan Mekanikal, Elektrikal & Plumbing', 'Instalasi listrik, titik lampu & stop kontak, air bersih, air kotor, septic tank.', 1, 'ls'),
          it('Pekerjaan Sanitair', 'Kloset, wastafel, shower, kran, dan aksesoris kamar mandi.', 1, 'ls'),
          it('Pekerjaan Pengecatan & Finishing', 'Cat dinding interior/eksterior, plafon, kayu, dan besi.', 1, 'ls')] },
        { title: 'PEKERJAAN INTERIOR', items: [it('Furnitur Custom / Built-in', 'Kitchen set, lemari, backdrop, dan furnitur sesuai gambar interior.', 1, 'ls')] },
        { title: 'MANAJEMEN PROYEK', items: [it('Manajemen, Pengawasan & K3', 'Pengawasan harian, pelaporan progres, alat keselamatan kerja, dan pembersihan akhir.', 1, 'ls')] },
      ],
      tableNote: 'Rincian volume dan harga per item mengacu pada RAB terlampir yang menjadi bagian tidak terpisahkan dari penawaran ini.',
      schedule: () => [
        { desc: 'Uang muka saat penandatanganan SPK/Kontrak (desain, persiapan, dan mobilisasi)', percent: 30 },
        { desc: 'Progres fisik pekerjaan mencapai 30%', percent: 25 },
        { desc: 'Progres fisik pekerjaan mencapai 60%', percent: 25 },
        { desc: 'Progres fisik pekerjaan mencapai 90%', percent: 15 },
        { desc: 'Retensi, dibayar setelah masa pemeliharaan selesai (serah terima akhir)', percent: 5 }],
      scheduleNote: 'Persentase progres ditetapkan berdasarkan laporan progres dan pemeriksaan lapangan bersama (opname) oleh Klien dan Widemp Atelier.',
    },
    cf: {
      label: 'Cost & Fee', subtitle: 'Sistem Cost & Fee Project', code: 'CF', totalLabel: 'ESTIMASI TOTAL PROYEK',
      scope: 'Widemp Atelier merencanakan, mengelola, dan mengawasi pembangunan {jenis} di {lokasi}. Biaya pembangunan (cost), meliputi material, upah, alat, dan subkontraktor, dibayar Klien sesuai pengeluaran aktual dan didukung bukti transaksi. Atas jasa perencanaan dan pengelolaan proyek, Widemp Atelier menerima fee sesuai ketentuan di bawah ini.',
      sections: () => [
        { title: 'FEE JASA WIDEMP ATELIER', items: [
          it('Jasa Desain Arsitektur & Interior', 'Konsep, pengembangan desain, visual 3D, gambar kerja (DED), dan RAB estimasi.', 0, 'm²', { area: true }),
          it('Fee Manajemen & Pengawasan Proyek', 'Persentase dari total realisasi biaya proyek (B). Nilai di samping merupakan estimasi berdasarkan RAB.', 10, '%', { calc: 'fee' })] },
        { title: 'ESTIMASI BIAYA PROYEK (DIBAYAR SESUAI REALISASI)', items: [
          it('Material Bangunan & Finishing', 'Sesuai spesifikasi dan RAB yang disetujui Klien.', 1, 'ls', { res: 'material' }),
          it('Upah Tenaga Kerja', 'Mandor, tukang, dan pekerja.', 1, 'ls', { res: 'upah' }),
          it('Alat & Operasional Lapangan', 'Sewa alat, perancah, air dan listrik kerja, keamanan, dan kebersihan.', 1, 'ls', { res: 'alat' }),
          it('Subkontraktor / Pekerjaan Khusus', 'Antara lain baja ringan, aluminium & kaca, MEP khusus, dan furnitur.', 1, 'ls', { res: 'subkon' }),
          it('Biaya Tak Terduga (Contingency)', 'Cadangan dari estimasi biaya. Hanya digunakan dengan persetujuan Klien.', 5, '%', { calc: 'cont' })] },
      ],
      tableNote: 'Estimasi biaya proyek (B) disusun berdasarkan RAB terlampir dan bukan merupakan harga tetap. Tagihan akhir mengikuti realisasi pengeluaran.',
      mechanism: () => [
        { comp: 'Fee Desain', when: '50% saat penawaran disetujui; 50% sebelum penyerahan DED', note: 'Dibayar terpisah dari dana kerja proyek.' },
        { comp: 'Dana Kerja Awal', when: 'Sebelum konstruksi dimulai', note: 'Sebesar kebutuhan 2 minggu pertama sesuai rencana kerja dan anggaran.' },
        { comp: 'Pengisian Dana Kerja', when: 'Setiap 2 minggu', note: 'Berdasarkan laporan realisasi dan rencana kebutuhan periode berikutnya.' },
        { comp: 'Fee Manajemen', when: 'Setiap bulan', note: '{fee}% × realisasi biaya proyek pada periode tersebut.' },
        { comp: 'Penyelesaian Akhir', when: 'Saat serah terima', note: 'Rekonsiliasi seluruh pengeluaran. Sisa dana kerja dikembalikan kepada Klien.' }],
    },
    pw: {
      label: 'Pengawasan', subtitle: 'Jasa Pengawasan Pembangunan', code: 'PW', totalLabel: 'TOTAL PENAWARAN',
      scope: 'Jasa pengawasan berkala atas pelaksanaan pembangunan {jenis} di {lokasi} untuk memastikan pekerjaan pelaksana/kontraktor sesuai gambar kerja, spesifikasi, mutu, dan jadwal yang telah disetujui Klien.',
      sections: () => [
        { title: 'JASA PENGAWASAN', items: [
          it('Pengawasan Berkala', 'Kunjungan lapangan terjadwal, pemeriksaan mutu dan kesesuaian gambar, koordinasi dengan pelaksana.', 0, 'bulan'),
          it('Laporan Progres & Opname', 'Laporan mingguan (foto, persentase progres, temuan) dan pendampingan opname termin.', 1, 'ls')] },
        { title: 'PEKERJAAN TAMBAHAN (OPSIONAL)', items: [
          it('Review RAB & Penawaran Kontraktor', 'Pemeriksaan volume, harga satuan, dan kewajaran penawaran pelaksana.', 1, 'ls'),
          it('Pendampingan Serah Terima', 'Pemeriksaan akhir, daftar perbaikan (punch list), dan berita acara serah terima.', 1, 'ls')] },
      ],
      tableNote: 'Item yang tidak dipilih Klien dapat dihapus.',
      schedule: () => [
        { desc: 'Uang muka, dibayar saat penawaran disetujui sebelum pengawasan dimulai', percent: 30 },
        { desc: 'Progres fisik pekerjaan mencapai 50%', percent: 40 },
        { desc: 'Setelah serah terima pekerjaan', percent: 30 }],
    },
    pi: {
      label: 'Produksi Interior', subtitle: 'Produksi & Pemasangan Furnitur Interior', code: 'PI', totalLabel: 'TOTAL PENAWARAN',
      scope: 'Produksi dan pemasangan furnitur custom/built-in untuk {jenis} di {lokasi} sesuai gambar kerja interior dan spesifikasi material yang telah disetujui Klien.',
      sections: () => [
        { title: 'PRODUKSI FURNITUR', items: [it('Kitchen Set', 'Multiplek 18 mm, finishing HPL, aksesoris standar.', 0, 'm')] },
        { title: 'PENGIRIMAN & PEMASANGAN', items: [it('Pengiriman & Pemasangan', 'Pengiriman ke lokasi, pemasangan, dan pembersihan area kerja.', 1, 'ls')] },
      ],
      tableNote: 'Ukuran akhir mengikuti hasil pengukuran ulang di lokasi sebelum produksi.',
      schedule: () => [
        { desc: 'Uang muka, saat gambar kerja dan material disetujui (produksi dimulai)', percent: 50 },
        { desc: 'Sebelum pengiriman ke lokasi', percent: 40 },
        { desc: 'Setelah pemasangan selesai dan serah terima', percent: 10 }],
    },
  };
  Object.keys(TEMPLATES).forEach((k) => { TEMPLATES[k].terms = TERMS[k]; });

  function newQuote(tpl, cfg, date) {
    const T = TEMPLATES[tpl];
    return {
      tpl, date, validDays: 14, status: 'draft', scope: T.scope, sections: T.sections(), discount: 0, taxPct: 0,
      schedule: T.schedule ? T.schedule() : [], stages: T.stages ? T.stages() : [], mechanism: T.mechanism ? T.mechanism() : [],
      terms: T.terms, visits: 2, maintDays: tpl === 'cf' ? 60 : 90, warrantyMonths: 6, signerName: (cfg && cfg.accName) || '', signerTitle: 'Principal Architect',
    };
  }

  // RAB -> isi rincian biaya penawaran
  function quoteFromRab(tpl, rab, cfg, date) {
    const q = newQuote(tpl, cfg, date), T = rabTotals(rab), mk = 1 + T.markup;
    Object.assign(q, { rabId: rab.id, projectName: rab.projectName || '', client: rab.client || '', clientId: rab.clientId || '', location: rab.location || '' });
    const isInt = (d) => INTERIOR_DIVS.includes(d);
    if (tpl === 'db') {
      const ar = T.divs.filter((d) => !isInt(d.name)), inn = T.divs.filter((d) => isInt(d.name));
      q.sections[1].items = ar.map((d) => it('Pekerjaan ' + d.name.replace(/^Pekerjaan /, ''), d.items.slice(0, 4).map((x) => x.desc).join(', ') + (d.items.length > 4 ? ', dll.' : '.'), 1, 'ls', { price: r0(d.total * mk) }));
      q.sections[2].items = inn.length ? inn.map((d) => it(d.name === 'Furniture' ? 'Furnitur Custom / Built-in' : 'Pekerjaan Interior', d.items.slice(0, 4).map((x) => x.desc).join(', ') + '.', 1, 'ls', { price: r0(d.total * mk) })) : q.sections[2].items;
      fixRounding(q.sections.slice(1, 3), r0(T.subtotal + T.overhead + T.profit));
    } else if (tpl === 'cf') {
      const R = rabResources(rab);
      q.sections[1].items.forEach((x) => { if (x.res) x.price = R.by[x.res] || 0; });
    } else if (tpl === 'pi') {
      q.sections[0].items = T.items.map((x) => it(x.desc, x.spec || '', num(x.qty), x.unit, { price: r0(num(x.price) * mk) }));
    }
    return q;
  }
  // pastikan jumlah baris hasil markup sama persis dengan total RAB (selisih pembulatan ke baris terbesar)
  function fixRounding(secs, target) {
    const all = secs.flatMap((s) => s.items).filter((x) => x.price);
    if (!all.length) return;
    const diff = target - all.reduce((s, x) => s + r0(x.price), 0);
    all.sort((a, b) => b.price - a.price)[0].price += diff;
  }

  // Penawaran disetujui -> data proyek & termin untuk modul keuangan
  function projectFromQuote(q) {
    const T = quoteTotals(q);
    const contract = T.contract;
    let terms;
    if (q.tpl === 'cf') {
      const design = T.secs[0] ? T.secs[0].items.filter((x) => !x.calc).reduce((s, x) => s + x.amount, 0) : 0;
      const rest = contract - design;
      const pct = (v) => (contract ? Math.round(v / contract * 10000) / 100 : 0);
      terms = [];
      if (design) terms.push({ label: 'Fee desain – DP 50%', percent: pct(design / 2) }, { label: 'Fee desain – sebelum DED', percent: pct(design / 2) });
      if (rest) terms.push({ label: 'Fee manajemen (estimasi)', percent: 0 });
      const used = terms.reduce((s, t) => s + t.percent, 0);
      if (terms.length) terms[terms.length - 1].percent = Math.round((100 - used + terms[terms.length - 1].percent) * 100) / 100;
    } else {
      const rows = q.schedule || [], n = rows.length;
      terms = rows.map((r, i) => ({ label: n === 1 ? 'Pembayaran penuh' : i === 0 ? 'Uang muka (DP)' : /retensi/i.test(r.desc) ? 'Retensi' : i === n - 1 ? 'Pelunasan' : 'Termin ' + (i + 1), percent: num(r.percent), note: r.desc }));
    }
    return { contract, terms };
  }

  return { DIVISIONS, INTERIOR_DIVS, KINDS, SEED_PRICES, SEED_AHSP, TEMPLATES, ahspCalc, snapshot, rabTotals, rabResources, lineAmount, quoteTotals, scheduleAmounts, fillTokens, parseTerms, newQuote, quoteFromRab, projectFromQuote };
});
