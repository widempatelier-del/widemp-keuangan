/* Widemp Studio — antarmuka Penawaran, RAB, dan Database (klien, harga, analisa) */
(() => {
  'use strict';
  const S = window.SCore, C = window.Core, $ = (s, r = document) => r.querySelector(s);
  let W = null; // API dari app.js (diisi saat init)
  const esc = (s) => W.esc(s), rp = (n) => C.fmtRp(n), nf = C.fmtNum;
  const opt = (v, l, sel) => W.opt(v, l, sel);
  const money = (v) => W.fmtMoneyInput(v);
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const cf4 = (n) => { const [i, d] = String(Math.round((Number(n) || 0) * 10000) / 10000).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : ''); };
  const STATUS = { draft: ['Draf', ''], dikirim: ['Dikirim', 'bill'], disetujui: ['Disetujui', 'ok'], ditolak: ['Ditolak', 'late'] };
  const deep = (o) => JSON.parse(JSON.stringify(o || null));

  // nilai desimal: "4,5", "1.250,5" atau rumus volume "4*3,5*0,3"
  function evalQty(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return 0;
    if (/^[\d.]+(,\d+)?$/.test(s)) return C.parseDec(s);
    const e = s.replace(/×|x/gi, '*').replace(/:/g, '/').replace(/,/g, '.');
    if (!/^[\d.+\-*/()\s]+$/.test(e)) return NaN;
    try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : NaN; } catch (err) { return NaN; }
  }
  const isExpr = (s) => /[+\-*/x×:()]/i.test(String(s || '').replace(/^-/, ''));

  /* ---------------- data ---------------- */
  const prices = () => new Map(W.of('price').map((p) => [p.id, p]));
  const clients = () => W.of('client').sort((a, b) => a.name.localeCompare(b.name));
  const quotes = () => W.of('quote').sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.seq || 0) - (a.seq || 0));
  const rabs = () => W.of('rab').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cfg = () => W.cfg();
  const qPrefix = (tpl) => `${cfg().qtnPrefix || 'QTN/WA'}-${S.TEMPLATES[tpl].code}`;
  const qNumber = (tpl, date) => { const seq = C.nextSeq(W.of('quote').filter((q) => q.tpl === tpl), date); return { seq, number: C.docNumber(qPrefix(tpl), seq, date) }; };

  async function ensureClient(name, extra = {}) {
    name = String(name || '').trim(); if (!name) return '';
    const ex = W.of('client').find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (ex) return ex.id;
    const c = await W.save('client', Object.assign({ name }, extra)); return c.id;
  }

  /* ---------------- seed ---------------- */
  const SEEDS = () => [...S.SEED_PRICES, ...S.SEED_AHSP].map((r) => Object.assign({ updatedAt: 0 }, deep(r)));

  /* =============== TAB PENAWARAN & RAB =============== */
  function vQuotes() {
    const ui = W.ui;
    if (ui.qid) return vQuoteDetail();
    if (ui.rid) return vRabDetail();
    const k = ui.qKind || 'quote';
    let body = '';
    if (k === 'quote') {
      const list = quotes().filter((q) => !ui.qFilter || q.status === ui.qFilter);
      const st = Object.keys(STATUS).map((s) => `<button data-act="s-qfilter" data-k="${s}" class="${ui.qFilter === s ? 'on in' : ''}">${STATUS[s][0]}</button>`).join('');
      body = `<div class="seg sm" style="margin-bottom:10px"><button data-act="s-qfilter" data-k="" class="${!ui.qFilter ? 'on in' : ''}">Semua</button>${st}</div>
      <div class="card">${list.length ? list.map((q) => { const T = S.quoteTotals(q); return `
        <div class="row click" data-act="s-open-q" data-id="${q.id}"><div class="grow"><div class="t">${esc(q.client || 'Tanpa klien')} <span class="badge ${STATUS[q.status || 'draft'][1]}">${STATUS[q.status || 'draft'][0]}</span></div>
        <div class="s">${esc(q.number)} · ${esc(S.TEMPLATES[q.tpl].label)}${q.projectName ? ' · ' + esc(q.projectName) : ''} · ${W.fmtDate(q.date)}</div></div><div class="amt">${rp(T.total)}</div></div>`; }).join('')
        : '<div class="empty">Belum ada penawaran.<br>Ketuk + untuk membuat, atau buat dari RAB.</div>'}</div>
      <button class="fab" data-act="s-new-q" aria-label="Penawaran baru">+</button>`;
    } else {
      const list = rabs();
      body = `<div class="card">${list.length ? list.map((r) => { const T = S.rabTotals(r); return `
        <div class="row click" data-act="s-open-r" data-id="${r.id}"><div class="grow"><div class="t">${esc(r.projectName || 'RAB tanpa nama')}</div>
        <div class="s">${esc(r.client || 'Tanpa klien')} · ${(r.items || []).length} item · ${esc(r.version || 'V1.0')} · ${W.fmtDate(r.date)}</div></div><div class="amt">${rp(T.grand)}</div></div>`; }).join('')
        : '<div class="empty">Belum ada RAB.<br>Ketuk + untuk menyusun RAB pertama.</div>'}</div>
      <button class="fab" data-act="s-new-r" aria-label="RAB baru">+</button>`;
    }
    return `<h2>Penawaran &amp; RAB</h2>
      <div class="seg" style="margin-bottom:12px"><button data-act="s-qkind" data-k="quote" class="${k === 'quote' ? 'on in' : ''}">Penawaran</button><button data-act="s-qkind" data-k="rab" class="${k === 'rab' ? 'on in' : ''}">RAB / BOQ</button></div>${body}`;
  }

  /* ---------- Penawaran: detail ---------- */
  function vQuoteDetail() {
    const q = W.byId(W.ui.qid);
    if (!q || q.deleted) { W.ui.qid = null; return vQuotes(); }
    const T = S.quoteTotals(q), TPL = S.TEMPLATES[q.tpl], st = STATUS[q.status || 'draft'];
    const canShare = !!(navigator.canShare && navigator.share);
    let no = 0;
    const secs = T.secs.map((s, si) => `
      <div class="sech"><b>${LET[si]}. ${esc(s.title)}</b>${q.tpl === 'cf' ? '' : `<button class="linkbtn" data-act="s-sec" data-i="${si}">Ubah</button>`}</div>
      ${s.items.map((it, ii) => { no++; return `<div class="row click" data-act="s-qitem" data-s="${si}" data-i="${ii}"><div class="grow"><div class="t">${no}. ${esc(it.title || '(tanpa judul)')}</div>
        <div class="s">${nf(it.qty)} ${esc(it.unit || '')} × ${rp(it.price)}${it.calc === 'fee' ? ' (biaya B)' : it.calc === 'cont' ? ' (dasar B)' : ''}</div></div><div class="amt">${rp(it.amount)}</div></div>`; }).join('')}
      <div class="row"><div class="grow"><button class="btn sm" data-act="s-qitem" data-s="${si}" data-i="-1">+ Item</button></div><div class="amt muted">Subtotal ${LET[si]} ${rp(s.total)}</div></div>`).join('');
    const rab = q.rabId ? W.byId(q.rabId) : null, proj = q.projectId ? W.byId(q.projectId) : null;
    const sched = q.tpl === 'cf'
      ? (q.mechanism || []).map((m) => `<div class="row"><div class="grow"><div class="t">${esc(m.comp)}</div><div class="s">${esc(m.when)} · ${esc(m.note)}</div></div></div>`).join('')
      : S.scheduleAmounts(q, T.contract).map((r, i) => `<div class="row"><div class="grow"><div class="t">Termin ${i + 1} · ${nf(r.percent)}%</div><div class="s">${esc(r.desc)}</div></div><div class="amt">${rp(r.amount)}</div></div>`).join('');
    const sumPct = (q.schedule || []).reduce((s, r) => s + (Number(r.percent) || 0), 0);
    return `
    <div class="actions" style="margin-top:0"><button class="btn sm" data-act="back">← Kembali</button><button class="btn sm" data-act="s-q-info">Ubah info</button><button class="btn sm" data-act="s-q-dup">Duplikat</button></div>
    <h2 style="margin-top:0">${esc(q.number)} <span class="badge ${st[1]}">${st[0]}</span></h2>
    <div class="muted" style="margin-bottom:10px">${esc(TPL.label)} · ${esc(q.client || 'Tanpa klien')}${q.projectName ? ' · ' + esc(q.projectName) : ''}${q.location ? ' · ' + esc(q.location) : ''}${q.area ? ' · ± ' + nf(q.area) + ' m²' : ''}</div>
    <div class="stat"><div class="l">${esc(TPL.totalLabel.charAt(0) + TPL.totalLabel.slice(1).toLowerCase())}</div><div class="v">${rp(T.total)}</div>
      ${q.tpl === 'cf' ? `<div class="s muted">Fee jasa ${rp(T.fee)} · estimasi biaya proyek ${rp(T.cost)}</div>` : ''}
      ${TPL.perM2 && Number(q.area) ? `<div class="s muted">± ${rp(Math.round(T.total / q.area))} / m²</div>` : ''}</div>
    <div class="actions">
      <button class="btn primary" data-act="s-pdf" data-k="q" data-m="dl" data-id="${q.id}">Unduh PDF</button>
      ${canShare ? `<button class="btn" data-act="s-pdf" data-k="q" data-m="share" data-id="${q.id}">Bagikan</button>` : ''}
      ${W.DS.isConnected() ? `<button class="btn" data-act="s-pdf" data-k="q" data-m="drive" data-id="${q.id}">Simpan ke Drive</button>` : ''}</div>
    <div class="card"><div class="s muted" style="margin-bottom:6px">Status penawaran</div>
      <div class="actions" style="margin:0">
        ${q.status !== 'dikirim' && q.status !== 'disetujui' ? '<button class="btn sm" data-act="s-q-status" data-k="dikirim">Tandai dikirim</button>' : ''}
        ${q.status !== 'disetujui' ? '<button class="btn sm primary" data-act="s-q-approve">Disetujui → buat proyek</button>' : ''}
        ${q.status !== 'ditolak' && q.status !== 'disetujui' ? '<button class="btn sm" data-act="s-q-status" data-k="ditolak">Ditolak</button>' : ''}
        ${q.status && q.status !== 'draft' && q.status !== 'disetujui' ? '<button class="btn sm" data-act="s-q-status" data-k="draft">Kembalikan ke draf</button>' : ''}
        ${proj && !proj.deleted ? `<button class="btn sm" data-act="open-project" data-id="${proj.id}">Buka proyek: ${esc(proj.name)}</button>` : ''}
        ${rab && !rab.deleted ? `<button class="btn sm" data-act="s-open-r" data-id="${rab.id}">Buka RAB</button>` : ''}</div></div>
    <h2>Rincian biaya</h2>
    <div class="card">${secs}
      ${q.tpl === 'cf' ? '' : '<div class="actions"><button class="btn sm" data-act="s-sec" data-i="-1">+ Bagian</button></div>'}
      <div class="row"><div class="grow s">${q.tpl === 'cf' ? 'Diskon fee' : 'Diskon'}</div><div class="amt">${T.discount ? '− ' + rp(T.discount) : '-'}</div></div>
      <div class="row"><div class="grow s">PPN ${Number(q.taxPct) ? nf(q.taxPct) + '%' : '(tidak dikenakan)'}</div><div class="amt">${rp(T.tax)}</div></div>
      <div class="row"><div class="grow t">${esc(TPL.totalLabel)}</div><div class="amt">${rp(T.total)}</div></div>
      <div class="actions"><button class="btn sm" data-act="s-q-disc">Diskon &amp; PPN</button></div></div>
    ${q.tpl === 'desain' ? `<h2>Tahapan &amp; hasil pekerjaan</h2><div class="card">${(q.stages || []).map((s, i) => `<div class="row"><div class="grow"><div class="t">${i + 1}. ${esc(s.name)}</div><div class="s">${esc(s.result)}</div></div><div class="amt s">${esc(s.time)}</div></div>`).join('')}
      <div class="actions"><button class="btn sm" data-act="s-q-rows" data-k="stages">Ubah tahapan</button></div></div>` : ''}
    <h2>${q.tpl === 'cf' ? 'Mekanisme pembayaran' : 'Jadwal pembayaran'}</h2>
    <div class="card">${sched || '<div class="empty">Belum ada.</div>'}
      ${q.tpl !== 'cf' && Math.abs(sumPct - 100) > 0.01 ? `<div class="note">Total persen termin ${nf(sumPct)}%, belum 100%.</div>` : ''}
      <div class="actions"><button class="btn sm" data-act="s-q-rows" data-k="${q.tpl === 'cf' ? 'mechanism' : 'schedule'}">Ubah</button></div></div>
    <h2>Lingkup, syarat &amp; ketentuan</h2>
    <div class="card"><div class="s">${esc(fillQ(q, q.scope)).slice(0, 260)}${fillQ(q, q.scope).length > 260 ? '…' : ''}</div>
      <div class="s muted" style="margin-top:6px">${S.parseTerms(q.terms).filter((t) => t.h).length} pasal syarat &amp; ketentuan</div>
      <div class="actions"><button class="btn sm" data-act="s-q-text">Ubah lingkup &amp; S&amp;K</button></div></div>
    <div class="actions"><button class="btn sm danger" data-act="s-q-del">Hapus penawaran</button></div>`;
  }
  const fillQ = (q, s) => S.fillTokens(s, q, cfg()).replace(/\{jenis\}/g, q.buildingType || 'bangunan').replace(/\{lokasi\}/g, q.location || 'lokasi proyek');

  function clientFields(d) {
    const list = clients();
    return `<label>Klien / perusahaan</label><input name="client" list="clientList" required value="${esc(d.client || '')}" autocomplete="off">
      <datalist id="clientList">${list.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
  }
  function fillFromClient(f) {
    const c = W.of('client').find((x) => x.name.toLowerCase() === String(f.client.value).trim().toLowerCase());
    if (!c) return;
    if (f.attn && !f.attn.value) f.attn.value = [c.pic, c.title].filter(Boolean).join(' / ');
    if (f.address && !f.address.value) f.address.value = c.address || '';
    if (f.contact && !f.contact.value) f.contact.value = [c.phone, c.email].filter(Boolean).join(' / ');
  }

  function newQuoteSheet(fromRab) {
    const tpls = fromRab ? ['db', 'cf', 'pi'] : Object.keys(S.TEMPLATES);
    W.openSheet(`<form data-form="s-newq" data-rab="${fromRab ? fromRab.id : ''}">${W.head(fromRab ? 'Penawaran dari RAB' : 'Penawaran baru')}
      ${fromRab ? `<div class="s muted">${esc(fromRab.projectName || '')} · ${rp(S.rabTotals(fromRab).grand)}</div>` : ''}
      <label>Jenis penawaran</label>
      <div class="pick">${tpls.map((k, i) => `<label class="pickopt"><input type="radio" name="tpl" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${esc(S.TEMPLATES[k].label)}</b><small>${esc(S.TEMPLATES[k].subtitle)}${fromRab ? ' · ' + ({ db: 'total per divisi, sudah termasuk overhead & profit', cf: 'material, upah, alat, subkon dari analisa', pi: 'tiap item RAB jadi baris penawaran' }[k]) : ''}</small></span></label>`).join('')}</div>
      ${!fromRab && rabs().length ? `<label>Ambil rincian dari RAB (opsional)</label><select name="rabId"><option value="">— tanpa RAB —</option>${rabs().map((r) => opt(r.id, (r.projectName || 'RAB') + ' · ' + rp(S.rabTotals(r).grand))).join('')}</select>
        <div class="s muted">RAB hanya dipakai untuk Design &amp; Build, Cost &amp; Fee, dan Produksi Interior.</div>` : ''}
      ${W.foot()}</form>`);
  }

  function quoteInfoForm(q) {
    const TPL = S.TEMPLATES[q.tpl];
    W.openSheet(`<form data-form="s-qinfo" data-id="${q.id}">${W.head('Info penawaran')}
      <label>Nomor penawaran</label><input name="number" required value="${esc(q.number)}">
      <div class="cols"><div><label>Tanggal</label><input type="date" name="date" required value="${esc(q.date)}"></div><div><label>Berlaku (hari)</label><input name="validDays" inputmode="numeric" value="${esc(q.validDays || 14)}"></div></div>
      ${clientFields(q)}
      <label>PIC / jabatan</label><input name="attn" value="${esc(q.attn || '')}" placeholder="mis. Bapak Arif / Owner">
      <label>Alamat</label><input name="address" value="${esc(q.address || '')}">
      <label>Telepon / email</label><input name="contact" value="${esc(q.contact || '')}">
      <label>Nama proyek</label><input name="projectName" value="${esc(q.projectName || '')}">
      <div class="cols"><div><label>Lokasi</label><input name="location" value="${esc(q.location || '')}"></div><div><label>Luas area (m²)</label><input name="area" inputmode="decimal" value="${esc(q.area ? nf(q.area) : '')}"></div></div>
      <label>Jenis bangunan (untuk kalimat lingkup)</label><input name="buildingType" value="${esc(q.buildingType || '')}" placeholder="mis. rumah tinggal 2 lantai">
      ${q.tpl === 'cf' || q.tpl === 'desain' || q.tpl === 'pw' ? '' : '<div class="s muted">Item ber-satuan m² ikut berubah bila luas area diubah.</div>'}
      <div class="cols"><div><label>Penanda tangan</label><input name="signerName" value="${esc(q.signerName || '')}"></div><div><label>Jabatan</label><input name="signerTitle" value="${esc(q.signerTitle || '')}"></div></div>
      ${W.foot()}</form>`);
    void TPL;
  }

  function qItemForm(q, si, ii) {
    const it = ii >= 0 ? q.sections[si].items[ii] : { qty: 1, unit: 'ls', price: 0 };
    const calc = it.calc;
    W.openSheet(`<form data-form="s-qitem" data-id="${q.id}" data-s="${si}" data-i="${ii}">${W.head(ii >= 0 ? 'Ubah item' : 'Item baru')}
      <div class="s muted">${LET[si]}. ${esc(q.sections[si].title)}</div>
      <label>Uraian pekerjaan</label><input name="title" required value="${esc(it.title || '')}">
      <label>Keterangan (baris kecil di bawah uraian)</label><textarea name="desc" rows="2">${esc(it.desc || '')}</textarea>
      <div class="cols"><div><label>${calc ? 'Persen (%)' : 'Volume'}</label><input name="qty" inputmode="decimal" value="${esc(nf(it.qty))}"></div>
      <div><label>Satuan</label><input name="unit" value="${esc(it.unit || '')}" ${calc ? 'readonly' : ''}></div></div>
      ${calc ? `<div class="note">Harga satuan dihitung otomatis dari ${calc === 'fee' ? 'total estimasi biaya proyek (B)' : 'jumlah item B lainnya'}.</div>` : `<label>Harga satuan (Rp)</label><input name="price" class="money" inputmode="numeric" value="${money(it.price)}">`}
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink);font-size:14px"><input type="checkbox" name="area" ${it.area ? 'checked' : ''} style="width:auto"> Volume mengikuti luas area penawaran</label>
      ${W.foot(ii >= 0 && !calc ? '<button class="btn danger" type="button" data-act="s-qitem-del">Hapus</button>' : '')}</form>`);
  }

  function secForm(q, si) {
    const s = si >= 0 ? q.sections[si] : { title: '' };
    W.openSheet(`<form data-form="s-sec" data-id="${q.id}" data-i="${si}">${W.head(si >= 0 ? 'Ubah bagian' : 'Bagian baru')}
      <label>Judul bagian</label><input name="title" required value="${esc(s.title)}" placeholder="mis. PEKERJAAN TAMBAHAN">
      ${si >= 0 ? `<div class="actions"><button class="btn sm" type="button" data-act="s-sec-move" data-d="-1">Naikkan</button><button class="btn sm" type="button" data-act="s-sec-move" data-d="1">Turunkan</button></div>` : ''}
      ${W.foot(si >= 0 ? '<button class="btn danger" type="button" data-act="s-sec-del">Hapus bagian</button>' : '')}</form>`);
  }

  function discForm(q) {
    W.openSheet(`<form data-form="s-qdisc" data-id="${q.id}">${W.head('Diskon & PPN')}
      <label>Diskon (Rp)</label><input name="discount" class="money" inputmode="numeric" value="${money(q.discount)}">
      <label>PPN (%)</label><input name="taxPct" inputmode="decimal" value="${esc(q.taxPct ? nf(q.taxPct) : '')}" placeholder="0">
      <div class="s muted">Kosongkan PPN bila harga belum termasuk pajak.</div>${W.foot()}</form>`);
  }

  const ROWDEF = {
    schedule: { title: 'Jadwal pembayaran', cols: [['desc', 'Ketentuan', 3], ['percent', '%', 1]] },
    stages: { title: 'Tahapan pekerjaan', cols: [['name', 'Pekerjaan', 2], ['result', 'Hasil', 3], ['time', 'Waktu', 1.2]] },
    mechanism: { title: 'Mekanisme pembayaran', cols: [['comp', 'Komponen', 1.5], ['when', 'Waktu', 2], ['note', 'Keterangan', 3]] },
  };
  const rowHtml = (def, r = {}) => `<div class="rowed card" style="padding:8px;margin-bottom:6px">${def.cols.map(([k, l]) => `<label style="margin-top:2px">${l}</label>${k === 'percent' ? `<input name="${k}" inputmode="decimal" value="${esc(r[k] != null ? nf(r[k]) : '')}">` : `<textarea name="${k}" rows="${k === 'desc' || k === 'note' || k === 'result' ? 2 : 1}">${esc(r[k] || '')}</textarea>`}`).join('')}
    <div class="actions" style="margin:6px 0 0"><button class="btn sm danger" type="button" data-act="s-row-rm">Hapus baris</button></div></div>`;
  function rowsForm(q, key) {
    const def = ROWDEF[key];
    W.openSheet(`<form data-form="s-rows" data-id="${q.id}" data-k="${key}">${W.head(def.title)}
      <div id="sRows">${(q[key] || []).map((r) => rowHtml(def, r)).join('')}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="s-row-add" data-k="${key}">+ Baris</button>${key === 'schedule' ? '<span class="s" id="sPct"></span>' : ''}</div>${W.foot()}</form>`);
    updPct();
  }
  function updPct() {
    const el = $('#sPct'); if (!el) return;
    const sum = [...document.querySelectorAll('#sRows [name=percent]')].reduce((s, i) => s + C.parseDec(i.value), 0);
    el.textContent = 'Total ' + nf(sum) + '%'; el.className = 's ' + (Math.abs(sum - 100) < 0.01 ? 'in' : 'out');
  }

  function textForm(q) {
    const tk = /\{(\w+)\}/g, used = new Set(); let m;
    const src = [q.scope, q.terms, ...(q.mechanism || []).map((x) => x.note)].join('\n');
    while ((m = tk.exec(src))) used.add(m[1]);
    const F = [['workDays', 'Waktu pelaksanaan (hari)', 'hariKerja'], ['designWeeks', 'Waktu desain (minggu)', 'mingguDesain'], ['visits', 'Kunjungan lapangan (kali)', 'kunjungan'], ['maintDays', 'Masa pemeliharaan (hari)', 'pemeliharaan'], ['warrantyMonths', 'Garansi (bulan)', 'garansi'], ['approvalLimit', 'Batas belanja tanpa persetujuan (Rp)', 'batasBelanja']].filter((x) => used.has(x[2]));
    W.openSheet(`<form data-form="s-qtext" data-id="${q.id}">${W.head('Lingkup, syarat & ketentuan')}
      ${F.length ? `<div class="cols">${F.map(([k, l]) => `<div><label>${l}</label><input name="${k}" ${k === 'approvalLimit' ? 'class="money"' : ''} inputmode="numeric" value="${k === 'approvalLimit' ? money(q[k]) : esc(q[k] || '')}"></div>`).join('')}</div>` : ''}
      <label>Lingkup pekerjaan</label><textarea name="scope" rows="5">${esc(q.scope || '')}</textarea>
      <label>Catatan di bawah tabel biaya</label><textarea name="tableNote" rows="2">${esc(q.tableNote != null ? q.tableNote : S.TEMPLATES[q.tpl].tableNote || '')}</textarea>
      <label>Syarat &amp; ketentuan</label><textarea name="terms" rows="14" style="font-size:13px">${esc(q.terms || '')}</textarea>
      <div class="note">Format: baris "1. Judul pasal", lalu butir "a. isi". Kata dalam kurung kurawal seperti {kota} atau {hariKerja} diisi otomatis dari kolom di atas.</div>
      <div class="actions"><button class="btn sm" type="button" data-act="s-terms-reset">Kembalikan S&amp;K bawaan</button></div>
      ${W.foot()}</form>`);
  }

  async function approveQuote(q) {
    if (q.projectId && W.byId(q.projectId) && !W.byId(q.projectId).deleted) {
      await W.save('quote', Object.assign({}, q, { status: 'disetujui' })); W.render(); return W.toast('Penawaran disetujui');
    }
    const P = S.projectFromQuote(q);
    if (!P.contract) return W.toast('Nilai penawaran masih 0');
    if (!confirm(`Buat proyek "${q.projectName || q.client}" dengan nilai kontrak ${rp(P.contract)} dan ${P.terms.length} termin?`)) return;
    const clientId = q.clientId || await ensureClient(q.client);
    const p = await W.save('project', {
      name: q.projectName || q.client || q.number, client: q.client || '', attn: q.attn || '', address: q.address || '', service: S.TEMPLATES[q.tpl].label,
      progress: 0, contract: P.contract, status: 'aktif', createdAt: Date.now(), quoteId: q.id, clientId,
      note: `Dari penawaran ${q.number}` + (q.tpl === 'cf' ? ' (nilai kontrak = fee jasa; biaya proyek dibayar sesuai realisasi)' : ''),
    });
    for (let i = 0; i < P.terms.length; i++) await W.save('term', { projectId: p.id, no: i + 1, label: P.terms[i].label, percent: P.terms[i].percent, billed: false, dueDate: '', note: P.terms[i].note || '' });
    await W.save('quote', Object.assign({}, q, { status: 'disetujui', projectId: p.id, clientId, approvedAt: C.isoDate() }));
    if (q.rabId && W.byId(q.rabId)) await W.save('rab', Object.assign({}, W.byId(q.rabId), { projectId: p.id }));
    W.toast('Proyek dibuat di Keuangan');
    W.ui.qid = null; W.ui.tab = 'proj'; W.ui.pid = p.id; history.pushState({ pid: p.id }, ''); W.render(); window.scrollTo(0, 0);
  }

  /* ---------- RAB: detail ---------- */
  function vRabDetail() {
    const r = W.byId(W.ui.rid);
    if (!r || r.deleted) { W.ui.rid = null; return vQuotes(); }
    const T = S.rabTotals(r), view = W.ui.rView || 'item';
    const canShare = !!(navigator.canShare && navigator.share);
    let body = '';
    if (view === 'item') {
      body = T.divs.length ? T.divs.map((g) => `<div class="sech"><b>${esc(g.name)}</b><span class="muted s">${rp(g.total)}</span></div>
        ${g.rooms.map((rm) => `${rm.name ? `<div class="subh"><b>${esc(rm.name)}</b><span class="muted s">${rp(rm.total)}</span><button class="linkbtn" data-act="s-room-ren" data-k="${esc(rm.name)}">Ganti nama</button></div>` : ''}${rm.items.map((it) => { const idx = r.items.findIndex((x) => x.id === it.id); return `<div class="row click" data-act="s-ritem" data-i="${idx}"><div class="grow"><div class="t">${esc(it.desc || '(tanpa uraian)')}${it.ahspId ? '' : ' <span class="badge">manual</span>'}</div>
          <div class="s">${nf(it.qty)} ${esc(it.unit || '')} × ${rp(it.price)}${it.remark ? ' · ' + esc(it.remark) : ''}</div></div><div class="amt">${rp(it.total)}</div></div>`; }).join('')}`).join('')}`).join('')
        : '<div class="empty">Belum ada item.<br>Ketuk + lalu pilih analisa dan isi volume.</div>';
    } else if (view === 'div') {
      body = T.divs.map((g, i) => `<div class="row"><div class="grow"><div class="t">${i + 1}. ${esc(g.name)}</div><div class="bar"><i style="width:${Math.round(g.pct)}%"></i></div></div><div class="amt">${rp(g.total)}<div class="s muted">${nf(Math.round(g.pct * 100) / 100)}%</div></div></div>${g.rooms.filter((rm) => rm.name).map((rm) => `<div class="row" style="padding-left:16px"><div class="grow s">${esc(rm.name)}</div><div class="amt s">${rp(rm.total)}</div></div>`).join('')}`).join('') || '<div class="empty">Belum ada item.</div>';
    } else {
      const R = S.rabResources(r);
      body = `<div class="grid" style="margin-bottom:10px">${Object.keys(S.KINDS).filter((k) => R.by[k]).map((k) => `<div class="stat"><div class="l">${S.KINDS[k]}</div><div class="v" style="font-size:15px">${rp(R.by[k])}</div></div>`).join('')}</div>` +
        (R.list.length ? R.list.map((x) => `<div class="row"><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${S.KINDS[x.kind] || x.kind} · ${nf(Math.round(x.qty * 100) / 100)} ${esc(x.unit)} × ${rp(x.price)}</div></div><div class="amt">${rp(x.cost)}</div></div>`).join('') : '<div class="empty">Belum ada item dari analisa.</div>') +
        (R.by.subkon && R.list.every((x) => x.kind !== 'subkon') ? '' : '');
    }
    const stale = staleCount(r);
    return `
    <div class="actions" style="margin-top:0"><button class="btn sm" data-act="back">← Kembali</button><button class="btn sm" data-act="s-r-info">Ubah info</button><button class="btn sm" data-act="s-r-dup">Duplikat / versi baru</button></div>
    <h2 style="margin-top:0">${esc(r.projectName || 'RAB')} <span class="badge">${esc(r.version || 'V1.0')}</span></h2>
    <div class="muted" style="margin-bottom:10px">${esc(r.client || 'Tanpa klien')}${r.location ? ' · ' + esc(r.location) : ''} · ${W.fmtDate(r.date)}</div>
    <div class="grid g4">
      <div class="stat"><div class="l">Subtotal BOQ</div><div class="v">${rp(T.subtotal)}</div></div>
      <div class="stat"><div class="l">Overhead ${nf(r.ohPct || 0)}% + profit ${nf(r.profitPct || 0)}%</div><div class="v">${rp(T.overhead + T.profit)}</div></div>
      <div class="stat"><div class="l">Pajak ${nf(r.taxPct || 0)}%</div><div class="v">${rp(T.tax)}</div></div>
      <div class="stat"><div class="l">Grand total</div><div class="v">${rp(T.grand)}</div></div></div>
    <div class="actions">
      <button class="btn primary" data-act="s-rpdf" data-m="dl">Unduh PDF</button>
      ${canShare ? '<button class="btn" data-act="s-rpdf" data-m="share">Bagikan</button>' : ''}
      ${W.DS.isConnected() ? '<button class="btn" data-act="s-rpdf" data-m="drive">Simpan ke Drive</button>' : ''}
      <button class="btn" data-act="s-r-quote">Buat penawaran</button>
      <button class="btn sm" data-act="s-r-cost">Overhead, profit &amp; catatan</button></div>
    ${stale ? `<div class="note">${stale} item memakai harga lama dari database. <button class="linkbtn" data-act="s-r-refresh">Perbarui harga</button></div>` : ''}
    <div class="seg sm" style="margin:12px 0 10px"><button data-act="s-rview" data-k="item" class="${view === 'item' ? 'on in' : ''}">Item</button><button data-act="s-rview" data-k="div" class="${view === 'div' ? 'on in' : ''}">Rekap divisi</button><button data-act="s-rview" data-k="res" class="${view === 'res' ? 'on in' : ''}">Material &amp; upah</button></div>
    <div class="card">${body}</div>
    ${r.projectId && W.byId(r.projectId) && !W.byId(r.projectId).deleted ? `<div class="actions"><button class="btn sm" data-act="open-project" data-id="${r.projectId}">Buka proyek</button></div>` : ''}
    <div class="actions"><button class="btn sm danger" data-act="s-r-del">Hapus RAB</button></div>
    ${view === 'item' ? '<button class="fab" data-act="s-ritem" data-i="-1" aria-label="Tambah item">+</button>' : ''}`;
  }
  function staleCount(r) {
    const pm = prices();
    return (r.items || []).filter((it) => { const a = it.ahspId && W.byId(it.ahspId); return a && !a.deleted && !it.manualPrice && S.snapshot(a, pm).price !== Number(it.price); }).length;
  }

  function rabInfoForm(r) {
    const d = r || { date: C.isoDate(), version: 'V1.0', ohPct: cfg().rabOh != null ? cfg().rabOh : 5, profitPct: cfg().rabProfit != null ? cfg().rabProfit : 10, location: cfg().city || 'Cianjur' };
    W.openSheet(`<form data-form="s-rinfo" data-id="${r ? r.id : ''}">${W.head(r ? 'Info RAB' : 'RAB baru')}
      <label>Nama proyek</label><input name="projectName" required value="${esc(d.projectName || '')}">
      ${clientFields(d)}
      <label>Lokasi</label><input name="location" value="${esc(d.location || '')}">
      <div class="cols"><div><label>Tanggal</label><input type="date" name="date" value="${esc(d.date || C.isoDate())}"></div><div><label>Versi</label><input name="version" value="${esc(d.version || 'V1.0')}"></div></div>
      <label>Proyek di Keuangan (opsional)</label><select name="projectId"><option value="">— belum ada —</option>${W.of('project').map((p) => opt(p.id, p.name, p.id === d.projectId)).join('')}</select>
      ${r ? '' : `<div class="cols"><div><label>Overhead / contingency (%)</label><input name="ohPct" inputmode="decimal" value="${esc(nf(d.ohPct))}"></div><div><label>Profit / fee (%)</label><input name="profitPct" inputmode="decimal" value="${esc(nf(d.profitPct))}"></div></div>`}
      ${W.foot()}</form>`);
  }
  function rabCostForm(r) {
    W.openSheet(`<form data-form="s-rcost" data-id="${r.id}">${W.head('Overhead, profit & catatan')}
      <div class="cols"><div><label>Contingency / overhead (%)</label><input name="ohPct" inputmode="decimal" value="${esc(nf(r.ohPct || 0))}"></div><div><label>Profit / fee (%)</label><input name="profitPct" inputmode="decimal" value="${esc(nf(r.profitPct || 0))}"></div></div>
      <label>Pajak (%)</label><input name="taxPct" inputmode="decimal" value="${esc(r.taxPct ? nf(r.taxPct) : '')}" placeholder="0">
      <label>Catatan / asumsi (tercetak di PDF)</label><textarea name="notes" rows="5" placeholder="Spesifikasi, asumsi, pekerjaan yang termasuk / tidak termasuk">${esc(r.notes || '')}</textarea>
      ${W.foot()}</form>`);
  }

  function ahspOptions(sel) {
    const list = W.of('ahsp'), pm = prices();
    const groups = {};
    list.forEach((a) => { const g = (a.group === 'interior' ? 'Interior · ' : '') + (a.division || 'Lain-lain'); (groups[g] = groups[g] || []).push(a); });
    return Object.keys(groups).sort((a, b) => a.localeCompare(b)).map((g) => `<optgroup label="${esc(g)}">${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map((a) => opt(a.id, `${a.name} (${a.unit}) · ${rp(S.ahspCalc(a, pm).total)}`, a.id === sel)).join('')}</optgroup>`).join('');
  }
  function rItemForm(r, idx) {
    const it = idx >= 0 ? r.items[idx] : { qty: '', division: W.ui.lastDiv || 'Persiapan' };
    W.openSheet(`<form data-form="s-ritem" data-id="${r.id}" data-i="${idx}">${W.head(idx >= 0 ? 'Ubah item RAB' : 'Item RAB baru')}
      <label>Analisa harga satuan</label><select name="ahspId"><option value="">— manual / lump sum —</option>${ahspOptions(it.ahspId)}</select>
      <div class="cols"><div><label>Divisi</label><select name="division">${S.DIVISIONS.map((d) => opt(d, d, d === it.division)).join('')}</select></div><div><label>Satuan</label><input name="unit" value="${esc(it.unit || '')}"></div></div>
      <label>Ruangan / sub bab (opsional)</label><input name="room" list="roomList" value="${esc(it.room != null ? it.room : (idx < 0 ? W.ui.lastRoom || '' : ''))}" placeholder="mis. Kamar Tidur Utama, Dapur" autocomplete="off">
      <datalist id="roomList">${[...new Set((r.items || []).map((x) => (x.room || '').trim()).filter(Boolean).concat(ROOMS))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <label>Uraian / item</label><input name="desc" required value="${esc(it.desc || '')}">
      <label>Spesifikasi (opsional)</label><input name="spec" value="${esc(it.spec || '')}" placeholder="mis. merk / tipe / ukuran">
      <label>Volume — boleh rumus, mis. 4*3,5*0,3</label><input name="qty" inputmode="text" value="${esc(it.qtyExpr || (it.qty !== '' && it.qty != null ? nf(it.qty) : ''))}" autocomplete="off"><div class="s" id="qtyOut"></div>
      <label>Harga satuan (Rp)</label><input name="price" class="money" inputmode="numeric" value="${money(it.price)}">
      <div class="s muted" id="priceNote"></div>
      <div id="compBox"></div>
      <label>Keterangan (remarks)</label><input name="remark" value="${esc(it.remark || '')}">
      <div class="stat" style="margin-top:10px"><div class="v" id="rTotal"></div></div>
      ${W.foot(idx >= 0 ? '<button class="btn danger" type="button" data-act="s-ritem-del">Hapus</button>' : '')}</form>`);
    const f = $('form[data-form=s-ritem]');
    f.dataset.manual = it.manualPrice ? '1' : '';
    rItemRefresh(f, false);
  }
  const ROOMS = ['Ruang Tamu', 'Ruang Keluarga', 'Ruang Makan', 'Dapur', 'Kamar Tidur Utama', 'Kamar Tidur Anak', 'Kamar Tidur Tamu', 'Kamar Mandi', 'Ruang Kerja', 'Mushola', 'Foyer', 'Teras', 'Carport', 'Area Laundry'];
  function rItemRefresh(f, fromAhsp) {
    const a = f.ahspId.value ? W.byId(f.ahspId.value) : null;
    const box = $('#compBox', f), note = $('#priceNote', f);
    if (a) {
      const k = S.ahspCalc(a, prices());
      if (fromAhsp) { f.desc.value = a.name; f.unit.value = a.unit; f.division.value = S.DIVISIONS.includes(a.division) ? a.division : 'Custom'; f.price.value = money(k.total); f.dataset.manual = ''; }
      box.innerHTML = `<div class="mini">${k.lines.map((l) => `<div><span>${esc(l.name)}${l.empty ? ' <b class="out">harga 0</b>' : ''}</span><span>${cf4(l.coef)} ${esc(l.unit)}</span><span>${rp(l.total)}</span></div>`).join('')}
        <div class="tot"><span>Harga analisa</span><span></span><span>${rp(k.total)}</span></div></div>`;
      note.textContent = C.parseNum(f.price.value) !== k.total ? 'Harga diubah manual (berbeda dari analisa).' : k.empties ? `${k.empties} komponen belum ada harganya. Isi di tab Data → Harga.` : '';
    } else { box.innerHTML = ''; note.textContent = ''; }
    const q = evalQty(f.qty.value);
    $('#qtyOut', f).textContent = Number.isNaN(q) ? 'Rumus tidak valid' : isExpr(f.qty.value) ? '= ' + nf(q) + ' ' + f.unit.value : '';
    $('#rTotal', f).textContent = 'Jumlah ' + rp(Math.round((Number.isNaN(q) ? 0 : q) * C.parseNum(f.price.value)));
  }

  function rabPdfSheet(r) {
    W.openSheet(`<form data-form="s-rpdf" data-id="${r.id}" data-m="${W.ui._rpdfMode || 'dl'}">${W.head('PDF RAB / BOQ')}
      <div class="s muted">Halaman RAB/BOQ dan rekap per divisi selalu disertakan.</div>
      <label class="chk"><input type="checkbox" name="analysis" ${cfg().rabPdfAnalysis ? 'checked' : ''}> Lampirkan analisa harga satuan</label>
      <label class="chk"><input type="checkbox" name="resources" ${cfg().rabPdfRes ? 'checked' : ''}> Lampirkan rekap kebutuhan material &amp; upah</label>
      <div class="s muted">Untuk klien biasanya cukup tanpa lampiran. Lampiran berguna untuk tim lapangan dan belanja material.</div>
      <div class="actions" style="margin-top:16px"><button class="btn primary" type="submit">Buat PDF</button><button class="btn" type="button" data-act="close">Batal</button></div></form>`);
  }

  /* =============== TAB DATA =============== */
  function vData() {
    const seg = W.ui.dataSeg || 'client';
    const tabs = [['client', 'Klien'], ['price', 'Harga'], ['ahsp', 'Analisa'], ['set', 'Pengaturan']];
    const head = `<div class="seg sm" style="margin-bottom:12px">${tabs.map(([k, l]) => `<button data-act="s-dseg" data-k="${k}" class="${seg === k ? 'on in' : ''}">${l}</button>`).join('')}</div>`;
    if (seg === 'set') return head + W.vSettings();
    return `<h2>Database</h2>${head}` + (seg === 'client' ? vClients() : seg === 'price' ? vPrices() : vAhsp());
  }
  function vClients() {
    const q = (W.ui.dq || '').toLowerCase();
    const list = clients().filter((c) => !q || [c.name, c.pic, c.address, c.phone].join(' ').toLowerCase().includes(q));
    const projs = W.of('project'), qs = W.of('quote');
    return `<div class="filters"><input type="search" id="sDq" placeholder="Cari klien…" value="${esc(W.ui.dq || '')}"></div>
      <div class="card">${list.length ? list.map((c) => {
        const np = projs.filter((p) => p.clientId === c.id || (p.client || '').toLowerCase() === c.name.toLowerCase()).length;
        const nq = qs.filter((x) => x.clientId === c.id || (x.client || '').toLowerCase() === c.name.toLowerCase()).length;
        return `<div class="row click" data-act="s-client" data-id="${c.id}"><div class="grow"><div class="t">${esc(c.name)}</div>
        <div class="s">${esc([c.pic, c.phone, c.address].filter(Boolean).join(' · ') || '-')}</div></div><div class="amt s">${np} proyek<br>${nq} penawaran</div></div>`; }).join('')
        : '<div class="empty">Belum ada klien.</div>'}</div>
      <div class="actions"><button class="btn sm" data-act="s-client-import">Ambil klien dari proyek yang ada</button></div>
      <button class="fab" data-act="s-client" aria-label="Klien baru">+</button>`;
  }
  function clientForm(c) {
    const d = c || {};
    W.openSheet(`<form data-form="s-client" data-id="${c ? c.id : ''}">${W.head(c ? 'Ubah klien' : 'Klien baru')}
      <label>Nama klien / perusahaan</label><input name="name" required value="${esc(d.name || '')}">
      <div class="cols"><div><label>PIC</label><input name="pic" value="${esc(d.pic || '')}"></div><div><label>Jabatan</label><input name="title" value="${esc(d.title || '')}"></div></div>
      <div class="cols"><div><label>Telepon / WhatsApp</label><input name="phone" inputmode="tel" value="${esc(d.phone || '')}"></div><div><label>Email</label><input name="email" inputmode="email" value="${esc(d.email || '')}"></div></div>
      <label>Alamat</label><input name="address" value="${esc(d.address || '')}">
      <label>Sumber / catatan</label><input name="note" value="${esc(d.note || '')}" placeholder="mis. referensi Pak Asep, Instagram">
      ${W.foot(c ? '<button class="btn danger" type="button" data-act="s-client-del" data-id="' + c.id + '">Hapus</button>' : '')}</form>`);
  }

  function vPrices() {
    const k = W.ui.pk || '', q = (W.ui.dq || '').toLowerCase();
    const all = W.of('price');
    const list = all.filter((p) => (!k || p.kind === k) && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => Object.keys(S.KINDS).indexOf(a.kind) - Object.keys(S.KINDS).indexOf(b.kind) || a.name.localeCompare(b.name));
    const empty = all.filter((p) => !Number(p.price)).length;
    return `<div class="note" style="margin-top:0">Harga wilayah <b>${esc(cfg().region || cfg().city || 'Cianjur')}</b>${cfg().priceDate ? ' · diperbarui ' + W.fmtDate(cfg().priceDate) : ''}. ${empty ? `<b class="out">${empty} harga belum diisi.</b>` : 'Semua harga sudah terisi.'}</div>
      <div class="filters"><select id="sPk"><option value="">Semua jenis</option>${Object.keys(S.KINDS).map((x) => opt(x, S.KINDS[x], x === k)).join('')}</select><input type="search" id="sDq" placeholder="Cari…" value="${esc(W.ui.dq || '')}"></div>
      <div class="card">${list.map((p) => `<div class="row click" data-act="s-price" data-id="${p.id}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${S.KINDS[p.kind] || p.kind} · per ${esc(p.unit)}</div></div>
        <div class="amt ${Number(p.price) ? '' : 'out'}">${Number(p.price) ? rp(p.price) : 'belum diisi'}</div></div>`).join('') || '<div class="empty">Tidak ada data.</div>'}</div>
      <div class="actions"><button class="btn sm" data-act="s-price-paste">Tempel dari Excel</button><button class="btn sm" data-act="s-price-csv">Ekspor ke Excel (CSV)</button></div>
      <button class="fab" data-act="s-price" aria-label="Harga baru">+</button>`;
  }
  function priceForm(p) {
    const d = p || { kind: W.ui.pk || 'material' };
    const used = p ? W.of('ahsp').filter((a) => (a.comps || []).some((x) => x.priceId === p.id)) : [];
    W.openSheet(`<form data-form="s-price" data-id="${p ? p.id : ''}">${W.head(p ? 'Ubah harga' : 'Harga baru')}
      <label>Nama</label><input name="name" required value="${esc(d.name || '')}">
      <div class="cols"><div><label>Jenis</label><select name="kind">${Object.keys(S.KINDS).map((x) => opt(x, S.KINDS[x], x === d.kind)).join('')}</select></div><div><label>Satuan</label><input name="unit" required value="${esc(d.unit || '')}" placeholder="kg, m³, OH, bh"></div></div>
      <label>Harga (Rp)</label><input name="price" class="money" inputmode="numeric" value="${money(d.price)}">
      <label>Catatan (toko / merk)</label><input name="note" value="${esc(d.note || '')}">
      ${used.length ? `<div class="s muted">Dipakai di ${used.length} analisa: ${esc(used.slice(0, 4).map((a) => a.name).join('; '))}${used.length > 4 ? '…' : ''}</div>` : ''}
      ${W.foot(p ? '<button class="btn danger" type="button" data-act="s-price-del" data-id="' + p.id + '">Hapus</button>' : '')}</form>`);
  }
  function pasteForm() {
    W.openSheet(`<form data-form="s-paste">${W.head('Tempel harga dari Excel')}
      <div class="s muted">Salin kolom dari Excel lalu tempel di sini. Urutan kolom: <b>nama · satuan · harga</b> (kolom ke-4 jenis: material / upah / alat / subkon, opsional). Nama yang sudah ada diperbarui harganya; nama baru ditambahkan.</div>
      <textarea name="data" rows="10" placeholder="Semen Portland (PC)\tkg\t1.450&#10;Pasir pasang\tm³\t285000&#10;Tukang batu\tOH\t130000\tupah"></textarea>
      <label class="chk"><input type="checkbox" name="stamp" checked> Catat tanggal pembaruan harga hari ini</label>
      ${W.foot()}</form>`);
  }
  async function applyPaste(text, stamp) {
    const list = W.of('price'); let up = 0, add = 0, bad = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const cols = raw.split(/\t|;/).map((s) => s.trim());
      if (cols.length < 3) { bad++; continue; }
      const [name, unit, priceS, kindS] = cols, price = C.parseNum(priceS);
      if (!name || !price) { bad++; continue; }
      const kind = Object.keys(S.KINDS).find((k) => (kindS || '').toLowerCase().startsWith(k)) || '';
      const ex = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (ex) { await W.save('price', Object.assign({}, ex, { price, unit: unit || ex.unit, kind: kind || ex.kind })); up++; }
      else { await W.save('price', { name, unit, price, kind: kind || (/^(OH|hari)$/i.test(unit) ? 'upah' : 'material') }); add++; }
    }
    if (stamp && (up || add)) await W.save('config', Object.assign({}, W.R.get('config') || {}, { id: 'config', priceDate: C.isoDate() }));
    return { up, add, bad };
  }
  function exportCsv() {
    const rows = [['Nama', 'Satuan', 'Harga', 'Jenis']].concat(W.of('price').map((p) => [p.name, p.unit, p.price || 0, p.kind]));
    const csv = '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv' }), `harga-widemp-${C.isoDate()}.csv`);
  }

  function vAhsp() {
    const q = (W.ui.dq || '').toLowerCase(), g = W.ui.ag || '', pm = prices();
    const list = W.of('ahsp').filter((a) => (!g || a.group === g) && (!q || a.name.toLowerCase().includes(q)));
    const divs = {};
    list.forEach((a) => { (divs[a.division || 'Lain-lain'] = divs[a.division || 'Lain-lain'] || []).push(a); });
    const ord = (d) => { const i = S.DIVISIONS.indexOf(d); return i < 0 ? 99 : i; };
    return `<div class="filters"><select id="sAg"><option value="">Bangunan &amp; interior</option>${opt('bangunan', 'Bangunan / arsitektur', g === 'bangunan')}${opt('interior', 'Interior / furnitur', g === 'interior')}</select><input type="search" id="sDq" placeholder="Cari analisa…" value="${esc(W.ui.dq || '')}"></div>
      ${Object.keys(divs).sort((a, b) => ord(a) - ord(b)).map((d) => `<div class="sech" style="margin-top:12px"><b>${esc(d)}</b></div><div class="card">${divs[d].sort((a, b) => a.name.localeCompare(b.name)).map((a) => {
        const k = S.ahspCalc(a, pm);
        return `<div class="row click" data-act="s-ahsp" data-id="${a.id}"><div class="grow"><div class="t">${esc(a.name)}</div><div class="s">per ${esc(a.unit)} · ${a.source === 'PUPR' ? 'AHSP PUPR' : 'analisa sendiri'} · ${(a.comps || []).length} komponen${k.empties ? ` · <span class="out">${k.empties} harga kosong</span>` : ''}</div></div><div class="amt">${rp(k.total)}</div></div>`; }).join('')}</div>`).join('') || '<div class="card"><div class="empty">Tidak ada analisa.</div></div>'}
      <div class="muted" style="font-size:12px">Koefisien AHSP PUPR (SNI) untuk pekerjaan umum. Analisa bertanda “sendiri” adalah perkiraan awal: cek dan sesuaikan dengan kebiasaan lapangan Anda.</div>
      <button class="fab" data-act="s-ahsp" aria-label="Analisa baru">+</button>`;
  }
  const compRow = (x = {}) => `<div class="comprow"><select name="c_price">${priceOptions(x.priceId)}</select><input name="c_coef" inputmode="decimal" placeholder="koef." value="${esc(x.coef != null ? cf4(x.coef) : '')}"><button class="btn sm danger" type="button" data-act="s-comp-rm">✕</button></div>`;
  function priceOptions(sel) {
    const list = W.of('price');
    return '<option value="">— pilih —</option>' + Object.keys(S.KINDS).map((k) => `<optgroup label="${S.KINDS[k]}">${list.filter((p) => p.kind === k).sort((a, b) => a.name.localeCompare(b.name)).map((p) => opt(p.id, `${p.name} (${p.unit})`, p.id === sel)).join('')}</optgroup>`).join('');
  }
  function ahspForm(a) {
    const d = a || { group: W.ui.ag || 'bangunan', division: 'Custom', source: 'Sendiri', overhead: 0, comps: [{}, {}] };
    W.openSheet(`<form data-form="s-ahsp" data-id="${a ? a.id : ''}">${W.head(a ? 'Analisa harga satuan' : 'Analisa baru')}
      <label>Nama pekerjaan</label><input name="name" required value="${esc(d.name || '')}">
      <div class="cols"><div><label>Satuan</label><input name="unit" required value="${esc(d.unit || '')}"></div><div><label>Divisi</label><select name="division">${S.DIVISIONS.map((x) => opt(x, x, x === d.division)).join('')}</select></div></div>
      <div class="cols"><div><label>Kelompok</label><select name="group">${opt('bangunan', 'Bangunan / arsitektur', d.group !== 'interior')}${opt('interior', 'Interior / furnitur', d.group === 'interior')}</select></div><div><label>Sumber koefisien</label><select name="source">${opt('PUPR', 'AHSP PUPR', d.source === 'PUPR')}${opt('Sendiri', 'Analisa sendiri', d.source !== 'PUPR')}</select></div></div>
      <label>Komponen (bahan / upah / alat) dan koefisien per ${esc(d.unit || 'satuan')}</label>
      <div id="comps">${(d.comps || []).map(compRow).join('')}</div>
      <div class="actions"><button class="btn sm" type="button" data-act="s-comp-add">+ Komponen</button></div>
      <label>Overhead &amp; profit dalam analisa (%)</label><input name="overhead" inputmode="decimal" value="${esc(nf(d.overhead || 0))}">
      <div class="s muted">Biarkan 0 bila overhead &amp; profit dihitung di ringkasan RAB (agar tidak dobel).</div>
      <div class="stat" style="margin-top:10px"><div class="v" id="aTotal"></div></div>
      ${W.foot(a ? '<button class="btn" type="button" data-act="s-ahsp-dup" data-id="' + a.id + '">Duplikat</button><button class="btn danger" type="button" data-act="s-ahsp-del" data-id="' + a.id + '">Hapus</button>' : '')}</form>`);
    updAhspTotal();
  }
  function readComps(f) {
    return [...f.querySelectorAll('.comprow')].map((r) => ({ priceId: r.querySelector('[name=c_price]').value, coef: C.parseDec(r.querySelector('[name=c_coef]').value) })).filter((x) => x.priceId && x.coef);
  }
  function updAhspTotal() {
    const f = $('form[data-form=s-ahsp]'); if (!f) return;
    const k = S.ahspCalc({ comps: readComps(f), overhead: C.parseDec(f.overhead.value) }, prices());
    $('#aTotal').textContent = 'Harga satuan ' + rp(k.total) + (k.by.material || k.by.upah ? ` (material ${rp(k.by.material)} · upah ${rp(k.by.upah)})` : '');
  }

  function settingsCard() {
    const c = cfg();
    return `<h2>Penawaran &amp; RAB</h2><div class="card">
      <div class="cols"><div><label>Penanda tangan penawaran</label><input id="qSigner" value="${esc(c.signerName || c.accName || '')}"></div><div><label>Jabatan</label><input id="qTitle" value="${esc(c.signerTitle || 'Principal Architect')}"></div></div>
      <div class="cols"><div><label>Alamat kantor (kaki halaman)</label><input id="qAddr" value="${esc(c.address || '')}"></div><div><label>Instagram</label><input id="qIg" value="${esc(c.instagram || '')}" placeholder="@widemp.atelier"></div></div>
      <div class="cols"><div><label>Awalan nomor penawaran</label><input id="qPrefix" value="${esc(c.qtnPrefix || 'QTN/WA')}"></div><div><label>Wilayah harga</label><input id="qRegion" value="${esc(c.region || c.city || 'Cianjur')}"></div></div>
      <div class="cols"><div><label>Overhead RAB bawaan (%)</label><input id="qOh" inputmode="decimal" value="${esc(nf(c.rabOh != null ? c.rabOh : 5))}"></div><div><label>Profit RAB bawaan (%)</label><input id="qProfit" inputmode="decimal" value="${esc(nf(c.rabProfit != null ? c.rabProfit : 10))}"></div></div>
      <div class="s muted" style="margin-top:6px">Contoh nomor: ${esc(C.docNumber(qPrefix('desain'), 1, C.isoDate()))} · ${esc(C.docNumber(qPrefix('db'), 1, C.isoDate()))}</div>
      <div class="actions"><button class="btn sm primary" data-act="s-save-set">Simpan</button></div></div>`;
  }

  function projectLinks(p) {
    const q = W.of('quote').filter((x) => x.projectId === p.id), r = W.of('rab').filter((x) => x.projectId === p.id);
    if (!q.length && !r.length) return '';
    return `<div class="actions">${q.map((x) => `<button class="btn sm" data-act="s-open-q" data-id="${x.id}">Penawaran ${esc(x.number)}</button>`).join('')}${r.map((x) => `<button class="btn sm" data-act="s-open-r" data-id="${x.id}">RAB ${esc(x.version || '')}</button>`).join('')}</div>`;
  }

  /* ---------------- PDF ---------------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
  const biz = () => Object.assign(W.bizInfo(), { address: cfg().address || '', instagram: cfg().instagram || '' });
  async function pdfOut(kind, rec, mode, btn, opts) {
    const label = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan…'; }
    try {
      const blob = kind === 'q' ? await window.StudioPDF.quote(rec, biz(), W.PDFF, cfg()) : await window.StudioPDF.rab(rec, biz(), W.PDFF, opts || {});
      const name = kind === 'q' ? `Penawaran_${safe(rec.number)}_${safe(rec.client)}.pdf` : `RAB_${safe(rec.projectName)}_${safe(rec.version)}.pdf`;
      if (mode === 'dl') download(blob, name);
      else if (mode === 'share') {
        const file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
        else W.toast('Perangkat ini tidak mendukung berbagi file');
      } else if (mode === 'drive') {
        if (!navigator.onLine) throw new Error('Sedang offline');
        await W.DS.uploadFile(kind === 'q' ? 'Penawaran' : 'RAB', name, blob);
        await W.save(kind === 'q' ? 'quote' : 'rab', Object.assign({}, rec, { driveSaved: Date.now() })); W.toast('Tersimpan di Drive');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err); W.toast('Gagal: ' + err.message);
    } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
  }

  /* =============== event =============== */
  const curQ = () => W.byId(W.ui.qid), curR = () => W.byId(W.ui.rid);
  const go = (patch) => { Object.assign(W.ui, patch); W.render(); window.scrollTo(0, 0); };
  function openQ(id) { W.ui.tab = 'quote'; W.ui.pid = null; W.ui.rid = null; W.ui.qid = id; history.pushState({ qid: id }, ''); W.render(); window.scrollTo(0, 0); }
  function openR(id) { W.ui.tab = 'quote'; W.ui.pid = null; W.ui.qid = null; W.ui.rid = id; history.pushState({ rid: id }, ''); W.render(); window.scrollTo(0, 0); }
  const saveQ = (q) => W.save('quote', q);

  async function click(a, el, e) {
    const id = el.dataset.id;
    switch (a) {
      case 's-qkind': go({ qKind: el.dataset.k }); return true;
      case 's-qfilter': go({ qFilter: el.dataset.k }); return true;
      case 's-dseg': W.ui.dq = ''; go({ dataSeg: el.dataset.k }); return true;
      case 's-open-q': e.stopPropagation(); W.closeSheet(); openQ(id); return true;
      case 's-open-r': e.stopPropagation(); W.closeSheet(); openR(id); return true;
      case 's-new-q': newQuoteSheet(null); return true;
      case 's-new-r': rabInfoForm(null); return true;
      // penawaran
      case 's-q-info': quoteInfoForm(curQ()); return true;
      case 's-qitem': qItemForm(curQ(), Number(el.dataset.s), Number(el.dataset.i)); return true;
      case 's-qitem-del': { const f = el.closest('form'), q = deep(curQ()); q.sections[f.dataset.s].items.splice(Number(f.dataset.i), 1); await saveQ(q); W.closeSheet(); W.render(); return true; }
      case 's-sec': secForm(curQ(), Number(el.dataset.i)); return true;
      case 's-sec-del': { const f = el.closest('form'), q = deep(curQ()); if (!confirm('Hapus bagian ini beserta item-nya?')) return true; q.sections.splice(Number(f.dataset.i), 1); await saveQ(q); W.closeSheet(); W.render(); return true; }
      case 's-sec-move': { const f = el.closest('form'), q = deep(curQ()), i = Number(f.dataset.i), j = i + Number(el.dataset.d); if (j < 0 || j >= q.sections.length) return true; [q.sections[i], q.sections[j]] = [q.sections[j], q.sections[i]]; await saveQ(q); W.closeSheet(); W.render(); return true; }
      case 's-q-disc': discForm(curQ()); return true;
      case 's-q-rows': rowsForm(curQ(), el.dataset.k); return true;
      case 's-row-add': $('#sRows').insertAdjacentHTML('beforeend', rowHtml(ROWDEF[el.dataset.k])); updPct(); return true;
      case 's-row-rm': el.closest('.rowed').remove(); updPct(); return true;
      case 's-q-text': textForm(curQ()); return true;
      case 's-terms-reset': { const f = el.closest('form'); if (confirm('Ganti S&K dengan teks bawaan?')) f.terms.value = S.TEMPLATES[curQ().tpl].terms; return true; }
      case 's-q-status': { const q = curQ(); await saveQ(Object.assign({}, q, { status: el.dataset.k, sentAt: el.dataset.k === 'dikirim' ? C.isoDate() : q.sentAt })); W.render(); W.toast('Status: ' + STATUS[el.dataset.k][0]); return true; }
      case 's-q-approve': await approveQuote(curQ()); return true;
      case 's-q-dup': {
        const q = deep(curQ()), today = C.isoDate(), n = qNumber(q.tpl, today);
        ['id', 'updatedAt', 'projectId', 'driveSaved', 'approvedAt', 'sentAt'].forEach((k) => delete q[k]);
        const rec = await saveQ(Object.assign(q, n, { date: today, status: 'draft' })); openQ(rec.id); W.toast('Salinan dibuat: ' + rec.number); return true;
      }
      case 's-q-del': if (confirm('Hapus penawaran ini?')) { await W.del(W.ui.qid); W.ui.qid = null; history.back(); W.toast('Dihapus'); } return true;
      case 's-pdf': pdfOut('q', W.byId(id), el.dataset.m, el); return true;
      // RAB
      case 's-r-info': rabInfoForm(curR()); return true;
      case 's-r-cost': rabCostForm(curR()); return true;
      case 's-rview': go({ rView: el.dataset.k }); return true;
      case 's-ritem': rItemForm(curR(), Number(el.dataset.i)); return true;
      case 's-ritem-del': { const f = el.closest('form'), r = deep(curR()); r.items.splice(Number(f.dataset.i), 1); await W.save('rab', r); W.closeSheet(); W.render(); return true; }
      case 's-room-ren': {
        const old = el.dataset.k, nu = prompt('Ganti nama ruangan "' + old + '" menjadi:', old);
        if (nu == null || !nu.trim() || nu.trim() === old) return true;
        const r = deep(curR()); r.items.forEach((it) => { if ((it.room || '').trim().toLowerCase() === old.toLowerCase()) it.room = nu.trim(); });
        await W.save('rab', r); W.render(); W.toast('Nama ruangan diganti'); return true;
      }
      case 's-r-refresh': {
        const r = deep(curR()), pm = prices(); let n = 0;
        r.items.forEach((it) => { const a = it.ahspId && W.byId(it.ahspId); if (a && !a.deleted && !it.manualPrice) { const s = S.snapshot(a, pm); if (s.price !== Number(it.price)) n++; Object.assign(it, s); } });
        await W.save('rab', r); W.render(); W.toast(n + ' harga item diperbarui'); return true;
      }
      case 's-r-dup': {
        const r = deep(curR()); ['id', 'updatedAt', 'driveSaved'].forEach((k) => delete r[k]);
        const m = String(r.version || 'V1.0').match(/^V?(\d+)(?:\.(\d+))?$/i);
        r.version = m ? `V${Number(m[1]) + 1}.0` : (r.version || '') + ' (salinan)'; r.date = C.isoDate();
        r.items.forEach((it) => { it.id = C.uid(); });
        const rec = await W.save('rab', r); openR(rec.id); W.toast('RAB ' + rec.version + ' dibuat'); return true;
      }
      case 's-r-del': if (W.of('quote').some((q) => q.rabId === W.ui.rid) && !confirm('RAB ini dipakai penawaran. Tetap hapus?')) return true; if (confirm('Hapus RAB ini?')) { await W.del(W.ui.rid); W.ui.rid = null; history.back(); W.toast('Dihapus'); } return true;
      case 's-r-quote': newQuoteSheet(curR()); return true;
      case 's-rpdf': W.ui._rpdfMode = el.dataset.m; rabPdfSheet(curR()); return true;
      // data
      case 's-client': clientForm(id ? W.byId(id) : null); return true;
      case 's-client-del': if (confirm('Hapus klien ini? Proyek dan penawaran tidak ikut terhapus.')) { await W.del(id); W.closeSheet(); W.render(); } return true;
      case 's-client-import': {
        let n = 0;
        for (const p of W.of('project')) { if (!p.client) continue; const had = W.of('client').some((c) => c.name.toLowerCase() === p.client.toLowerCase()); if (!had) { await ensureClient(p.client, { pic: (p.attn || '').replace(/\s*\(.*\)$/, ''), address: p.address || '' }); n++; } }
        W.render(); W.toast(n ? n + ' klien ditambahkan' : 'Semua klien proyek sudah ada'); return true;
      }
      case 's-price': priceForm(id ? W.byId(id) : null); return true;
      case 's-price-del': {
        const used = W.of('ahsp').filter((x) => (x.comps || []).some((c) => c.priceId === id));
        if (used.length && !confirm(`Harga ini dipakai ${used.length} analisa. Komponennya akan bernilai 0. Tetap hapus?`)) return true;
        if (!used.length && !confirm('Hapus harga ini?')) return true;
        await W.del(id); W.closeSheet(); W.render(); return true;
      }
      case 's-price-paste': pasteForm(); return true;
      case 's-price-csv': exportCsv(); return true;
      case 's-ahsp': ahspForm(id ? W.byId(id) : null); return true;
      case 's-ahsp-del': if (confirm('Hapus analisa ini? Item RAB yang sudah dibuat tetap menyimpan harganya.')) { await W.del(id); W.closeSheet(); W.render(); } return true;
      case 's-ahsp-dup': { const a = deep(W.byId(id)); ['id', 'updatedAt', 'seed'].forEach((k) => delete a[k]); a.name += ' (salinan)'; a.source = 'Sendiri'; const rec = await W.save('ahsp', a); ahspForm(rec); W.render(); return true; }
      case 's-comp-add': $('#comps').insertAdjacentHTML('beforeend', compRow()); return true;
      case 's-comp-rm': el.closest('.comprow').remove(); updAhspTotal(); return true;
      case 's-save-set': {
        const v = (s) => $(s).value.trim();
        await W.save('config', Object.assign({}, W.R.get('config') || {}, { id: 'config', signerName: v('#qSigner'), signerTitle: v('#qTitle'), address: v('#qAddr'), instagram: v('#qIg'), qtnPrefix: v('#qPrefix') || 'QTN/WA', region: v('#qRegion'), rabOh: C.parseDec(v('#qOh')), rabProfit: C.parseDec(v('#qProfit')) }));
        W.render(); W.toast('Tersimpan'); return true;
      }
    }
    return false;
  }

  // return: true = sudah ditangani (jangan tutup sheet otomatis), 'done' = tutup + render + toast
  async function submit(kind, f, d, id) {
    switch (kind) {
      case 's-newq': {
        const rab = W.byId(f.dataset.rab || d.rabId || '');
        const tpl = d.tpl, today = C.isoDate();
        const useRab = rab && ['db', 'cf', 'pi'].includes(tpl);
        const base = useRab ? S.quoteFromRab(tpl, rab, cfg(), today) : S.newQuote(tpl, cfg(), today);
        if (!useRab && rab) Object.assign(base, { projectName: rab.projectName, client: rab.client, location: rab.location, clientId: rab.clientId });
        base.signerName = cfg().signerName || cfg().accName || ''; base.signerTitle = cfg().signerTitle || 'Principal Architect';
        if (base.clientId || base.client) {
          const c = W.byId(base.clientId) || W.of('client').find((x) => x.name.toLowerCase() === String(base.client || '').toLowerCase());
          if (c) Object.assign(base, { clientId: c.id, client: c.name, attn: [c.pic, c.title].filter(Boolean).join(' / '), address: c.address || '', contact: [c.phone, c.email].filter(Boolean).join(' / ') });
        }
        const rec = await saveQ(Object.assign(base, qNumber(tpl, today)));
        W.closeSheet(); openQ(rec.id); quoteInfoForm(rec); return true;
      }
      case 's-qinfo': {
        const q = deep(curQ()), area = C.parseDec(d.area);
        Object.assign(q, { number: d.number.trim(), date: d.date, validDays: Number(d.validDays) || 14, client: d.client.trim(), attn: d.attn.trim(), address: d.address.trim(), contact: d.contact.trim(), projectName: d.projectName.trim(), location: d.location.trim(), area, buildingType: d.buildingType.trim(), signerName: d.signerName.trim(), signerTitle: d.signerTitle.trim() });
        if (area) q.sections.forEach((s) => s.items.forEach((it) => { if (it.area) it.qty = area; }));
        q.clientId = await ensureClient(q.client, { pic: q.attn.split('/')[0].trim(), title: (q.attn.split('/')[1] || '').trim(), address: q.address });
        await saveQ(q); return 'done';
      }
      case 's-qitem': {
        const q = deep(curQ()), si = Number(f.dataset.s), ii = Number(f.dataset.i);
        const old = ii >= 0 ? q.sections[si].items[ii] : {};
        const it = Object.assign({}, old, { title: d.title.trim(), desc: d.desc.trim(), qty: C.parseDec(d.qty), unit: old.calc ? old.unit : d.unit.trim(), area: !!d.area });
        if (!old.calc) it.price = C.parseNum(d.price);
        if (it.area && Number(q.area)) it.qty = Number(q.area);
        if (ii >= 0) q.sections[si].items[ii] = it; else q.sections[si].items.push(it);
        await saveQ(q); return 'done';
      }
      case 's-sec': {
        const q = deep(curQ()), i = Number(f.dataset.i);
        if (i >= 0) q.sections[i].title = d.title.trim().toUpperCase(); else q.sections.push({ title: d.title.trim().toUpperCase(), items: [] });
        await saveQ(q); return 'done';
      }
      case 's-qdisc': await saveQ(Object.assign({}, curQ(), { discount: C.parseNum(d.discount), taxPct: C.parseDec(d.taxPct) })); return 'done';
      case 's-rows': {
        const key = f.dataset.k, def = ROWDEF[key];
        const rows = [...f.querySelectorAll('.rowed')].map((r) => Object.fromEntries(def.cols.map(([k]) => [k, k === 'percent' ? C.parseDec(r.querySelector(`[name=${k}]`).value) : r.querySelector(`[name=${k}]`).value.trim()])));
        if (key === 'schedule') { const s = rows.reduce((a, r) => a + r.percent, 0); if (rows.length && Math.abs(s - 100) > 0.01 && !confirm(`Total ${nf(s)}%, belum 100%. Tetap simpan?`)) return true; }
        await saveQ(Object.assign({}, curQ(), { [key]: rows })); return 'done';
      }
      case 's-qtext': {
        const patch = { scope: d.scope.trim(), tableNote: d.tableNote.trim(), terms: d.terms.trim() };
        ['workDays', 'designWeeks', 'visits', 'maintDays', 'warrantyMonths'].forEach((k) => { if (k in d) patch[k] = Number(d[k]) || ''; });
        if ('approvalLimit' in d) patch.approvalLimit = C.parseNum(d.approvalLimit);
        await saveQ(Object.assign({}, curQ(), patch)); return 'done';
      }
      case 's-rinfo': {
        const old = id ? W.byId(id) : null;
        const r = Object.assign({}, old || { items: [], taxPct: 0, ohPct: C.parseDec(d.ohPct), profitPct: C.parseDec(d.profitPct) }, { id, projectName: d.projectName.trim(), client: d.client.trim(), location: d.location.trim(), date: d.date, version: d.version.trim() || 'V1.0', projectId: d.projectId || '' });
        r.clientId = await ensureClient(r.client);
        const rec = await W.save('rab', r);
        if (!old) { W.closeSheet(); openR(rec.id); rItemForm(rec, -1); return true; }
        return 'done';
      }
      case 's-rcost': await W.save('rab', Object.assign({}, curR(), { ohPct: C.parseDec(d.ohPct), profitPct: C.parseDec(d.profitPct), taxPct: C.parseDec(d.taxPct), notes: d.notes.trim() })); return 'done';
      case 's-ritem': {
        const r = deep(curR()), idx = Number(f.dataset.i), qty = evalQty(d.qty);
        if (Number.isNaN(qty)) { W.toast('Volume tidak valid'); return true; }
        const old = idx >= 0 ? r.items[idx] : { id: C.uid() };
        const it = Object.assign({}, old, { division: d.division, desc: d.desc.trim(), spec: d.spec.trim(), unit: d.unit.trim(), qty, qtyExpr: isExpr(d.qty) ? d.qty.trim() : '', price: C.parseNum(d.price), remark: d.remark.trim(), ahspId: d.ahspId || '', room: (d.room || '').trim() });
        const a = it.ahspId && W.byId(it.ahspId);
        if (a) { const s = S.snapshot(a, prices()); it.comps = s.comps; it.manualPrice = it.price !== s.price; } else { it.comps = []; it.manualPrice = false; }
        if (idx >= 0) r.items[idx] = it; else r.items.push(it);
        W.ui.lastDiv = it.division; W.ui.lastRoom = it.room;
        await W.save('rab', r);
        if (idx < 0 && f.dataset.again !== '0') { W.render(); rItemForm(W.byId(r.id), -1); W.toast('Item ditambahkan · isi item berikutnya atau tutup'); return true; }
        return 'done';
      }
      case 's-rpdf': {
        const opts = { analysis: !!d.analysis, resources: !!d.resources };
        await W.save('config', Object.assign({}, W.R.get('config') || {}, { id: 'config', rabPdfAnalysis: opts.analysis, rabPdfRes: opts.resources }));
        const btn = f.querySelector('[type=submit]');
        await pdfOut('r', W.byId(id), f.dataset.m, btn, opts); W.closeSheet(); return true;
      }
      case 's-client': {
        const old = id ? W.byId(id) : null;
        const dup = W.of('client').find((c) => c.name.toLowerCase() === d.name.trim().toLowerCase() && c.id !== id);
        if (dup) { W.toast('Nama klien sudah ada'); return true; }
        await W.save('client', Object.assign({}, old, { id, name: d.name.trim(), pic: d.pic.trim(), title: d.title.trim(), phone: d.phone.trim(), email: d.email.trim(), address: d.address.trim(), note: d.note.trim() })); return 'done';
      }
      case 's-price': {
        const old = id ? W.byId(id) : null;
        await W.save('price', Object.assign({}, old, { id, name: d.name.trim(), kind: d.kind, unit: d.unit.trim(), price: C.parseNum(d.price), note: d.note.trim() })); return 'done';
      }
      case 's-paste': { const res = await applyPaste(d.data, !!d.stamp); W.closeSheet(); W.render(); W.toast(`${res.up} diperbarui, ${res.add} baru${res.bad ? `, ${res.bad} baris dilewati` : ''}`); return true; }
      case 's-ahsp': {
        const comps = readComps(f); if (!comps.length) { W.toast('Isi minimal satu komponen'); return true; }
        const old = id ? W.byId(id) : null;
        await W.save('ahsp', Object.assign({}, old, { id, name: d.name.trim(), unit: d.unit.trim(), division: d.division, group: d.group, source: d.source, comps, overhead: C.parseDec(d.overhead) })); return 'done';
      }
    }
    return false;
  }

  function input(e) {
    const t = e.target;
    if (t.id === 'sDq') { W.ui.dq = t.value; clearTimeout(input._t); input._t = setTimeout(() => { W.render(); const q = $('#sDq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
    const f = t.form;
    if (f && f.dataset.form === 's-ritem') { if (t.name === 'price') f.dataset.manual = '1'; rItemRefresh(f, false); }
    if (f && f.dataset.form === 's-ahsp') updAhspTotal();
    if (t.matches('#sRows [name=percent]')) updPct();
  }
  function change(e) {
    const t = e.target, f = t.form;
    if (t.id === 'sPk') { W.ui.pk = t.value; W.render(); return true; }
    if (t.id === 'sAg') { W.ui.ag = t.value; W.render(); return true; }
    if (f && f.dataset.form === 's-ritem' && t.name === 'ahspId') { rItemRefresh(f, true); return true; }
    if (f && f.dataset.form === 's-ahsp') { updAhspTotal(); return true; }
    if (f && t.name === 'client' && f.dataset.form && f.dataset.form.startsWith('s-')) { fillFromClient(f); return true; }
    return false;
  }

  window.Studio = {
    init(api) { W = api; }, SEEDS, vQuotes, vData, settingsCard, projectLinks, click, submit, input, change,
    _t: { evalQty },
  };
})();
