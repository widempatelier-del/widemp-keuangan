/* Widemp Keuangan — logika inti (murni, tanpa DOM) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const pad = (n) => String(n).padStart(2, '0');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (s) => String(s).slice(0, 7);

  function fmtRp(n) {
    n = Math.round(Number(n) || 0);
    const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + 'Rp ' + s;
  }
  // "1.500.000,50" -> 1500000 (desimal diabaikan, rupiah bulat)
  function parseNum(s) {
    return Number(String(s == null ? '' : s).split(',')[0].replace(/[^\d]/g, '')) || 0;
  }

  const live = (records, type) => records.filter((r) => r.type === type && !r.deleted);

  /* ---------- Sinkron: gabung per id, updatedAt terbaru menang ---------- */
  function mergeRecords(local, remote) {
    const L = new Map(local.map((r) => [r.id, r]));
    const R = new Map(remote.map((r) => [r.id, r]));
    const out = [];
    let toLocal = 0, toRemote = 0;
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(id), r = R.get(id);
      if (l && !r) { out.push(l); toRemote++; }
      else if (r && !l) { out.push(r); toLocal++; }
      else if ((r.updatedAt || 0) > (l.updatedAt || 0)) { out.push(r); toLocal++; }
      else if ((l.updatedAt || 0) > (r.updatedAt || 0)) { out.push(l); toRemote++; }
      else out.push(l);
    }
    return { records: out, toLocal, toRemote };
  }

  /* ---------- Termin ---------- */
  function makeTermLabels(percents) {
    const n = percents.length;
    return percents.map((p, i) => {
      if (n === 1) return 'Pembayaran penuh';
      if (i === 0) return 'Uang muka (DP)';
      if (i === n - 1) return 'Pelunasan';
      return 'Termin ' + (i + 1);
    });
  }
  const PRESETS = [
    { name: 'DP 30 / 40 / 30', percents: [30, 40, 30] },
    { name: 'DP 50 / Pelunasan 50', percents: [50, 50] },
    { name: '30 / 30 / 30 / 10', percents: [30, 30, 30, 10] },
    { name: 'Sekali bayar 100', percents: [100] },
  ];

  // Hitung nominal tiap termin; termin terakhir menyerap selisih pembulatan bila total 100%.
  function scheduleAmounts(project, terms) {
    const sorted = terms.filter((t) => !t.deleted).sort((a, b) => (a.no || 0) - (b.no || 0));
    const contract = Number(project.contract) || 0;
    const totalPct = sorted.reduce((s, t) => s + (Number(t.percent) || 0), 0);
    let acc = 0;
    return sorted.map((t, i) => {
      const fixed = t.fixed != null && t.fixed !== '' ? Math.round(Number(t.fixed)) : null;
      let amount = fixed != null ? fixed : Math.round((contract * (Number(t.percent) || 0)) / 100);
      if (fixed == null && i === sorted.length - 1 && Math.abs(totalPct - 100) < 0.01) amount = contract - acc;
      acc += amount;
      return Object.assign({}, t, { amount });
    });
  }

  const sumTx = (txs, pred) => txs.reduce((s, t) => (!t.deleted && pred(t) ? s + (Number(t.amount) || 0) : s), 0);
  const paidFor = (txs, termId) => sumTx(txs, (t) => t.kind === 'in' && t.termId === termId);

  function projectSummary(project, terms, txs) {
    const sched = scheduleAmounts(project, terms).map((t) => {
      const paid = paidFor(txs, t.id);
      return Object.assign(t, { paid, remaining: Math.max(0, t.amount - paid) });
    });
    const received = sumTx(txs, (t) => t.kind === 'in' && t.projectId === project.id);
    const expense = sumTx(txs, (t) => t.kind === 'out' && t.projectId === project.id);
    const contract = Number(project.contract) || 0;
    const billedOutstanding = sched.filter((t) => t.billed).reduce((s, t) => s + t.remaining, 0);
    return { sched, contract, received, expense, remaining: Math.max(0, contract - received), billedOutstanding, profit: received - expense };
  }

  function piutangList(projects, terms, txs, today) {
    const items = [];
    for (const p of projects) {
      if (p.deleted || p.status === 'batal') continue;
      const ptTerms = terms.filter((t) => t.projectId === p.id);
      for (const t of projectSummary(p, ptTerms, txs).sched) {
        if (t.billed && t.remaining > 0) {
          items.push({ project: p, term: t, amount: t.amount, paid: t.paid, remaining: t.remaining, overdue: !!(t.dueDate && t.dueDate < today) });
        }
      }
    }
    return items.sort((a, b) => (a.term.dueDate || '9999').localeCompare(b.term.dueDate || '9999'));
  }

  /* ---------- Kas & laporan (hanya akun lingkup "usaha") ---------- */
  function balances(accounts, txs) {
    return accounts.filter((a) => !a.deleted).map((a) => {
      const inn = sumTx(txs, (t) => t.accountId === a.id && t.kind === 'in');
      const out = sumTx(txs, (t) => t.accountId === a.id && t.kind === 'out');
      return Object.assign({}, a, { balance: (Number(a.opening) || 0) + inn - out });
    });
  }
  function usahaTxs(accounts, txs) {
    const ok = new Set(accounts.filter((a) => !a.deleted && (a.scope || 'usaha') === 'usaha').map((a) => a.id));
    return txs.filter((t) => !t.deleted && ok.has(t.accountId));
  }
  function monthTotals(accounts, txs, key) {
    const u = usahaTxs(accounts, txs).filter((t) => monthKey(t.date) === key);
    return { in: sumTx(u, (t) => t.kind === 'in'), out: sumTx(u, (t) => t.kind === 'out') };
  }
  function monthlySeries(accounts, txs, n, now = new Date()) {
    const res = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      res.push(Object.assign({ key, label: BULAN[d.getMonth()] }, monthTotals(accounts, txs, key)));
    }
    return res;
  }

  /* ---------- Dokumen: terbilang, nomor, invoice ---------- */
  const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  function terbilangInt(n) {
    if (n < 12) return SATUAN[n];
    if (n < 20) return SATUAN[n - 10] + ' Belas';
    if (n < 100) return SATUAN[Math.floor(n / 10)] + ' Puluh' + (n % 10 ? ' ' + SATUAN[n % 10] : '');
    if (n < 200) return 'Seratus' + (n - 100 ? ' ' + terbilangInt(n - 100) : '');
    if (n < 1000) return SATUAN[Math.floor(n / 100)] + ' Ratus' + (n % 100 ? ' ' + terbilangInt(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n - 1000 ? ' ' + terbilangInt(n - 1000) : '');
    const units = [[1e12, 'Triliun'], [1e9, 'Miliar'], [1e6, 'Juta'], [1e3, 'Ribu']];
    for (const [v, w] of units) {
      if (n >= v) { const q = Math.floor(n / v), r = n % v; return terbilangInt(q) + ' ' + w + (r ? ' ' + terbilangInt(r) : ''); }
    }
    return '';
  }
  function terbilang(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    return (n === 0 ? 'Nol' : terbilangInt(n)) + ' Rupiah';
  }
  function tanggalPanjang(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${BULAN_PANJANG[m - 1]} ${y}`;
  }
  function docNumber(prefix, seq, iso) {
    const [y, m] = iso.split('-').map(Number);
    return `${prefix}/${String(seq).padStart(3, '0')}/${ROMAWI[m - 1]}/${y}`;
  }
  // urutan berikutnya per tahun, per jenis dokumen
  function nextSeq(docs, iso) {
    const y = String(iso).slice(0, 4);
    return docs.filter((d) => !d.deleted && String(d.date).slice(0, 4) === y).reduce((m, d) => Math.max(m, Number(d.seq) || 0), 0) + 1;
  }
  function invoiceTotals(inv) {
    const lines = (inv.items || []).map((it) => Math.round((Number(it.qty) || 0) * (Number(it.price) || 0)));
    const subtotal = lines.reduce((s, x) => s + x, 0);
    const discount = Math.round(Number(inv.discount) || 0);
    const tax = Math.round(((subtotal - discount) * (Number(inv.taxPct) || 0)) / 100);
    return { lines, subtotal, discount, tax, total: subtotal - discount + tax };
  }
  // angka Indonesia: 255.73 -> "255,73"
  function fmtNum(n) {
    n = Number(n) || 0;
    const [i, d] = String(Math.round(n * 100) / 100).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
  }
  function parseDec(s) { return Number(String(s == null ? '' : s).replace(/\./g, '').replace(',', '.')) || 0; }

  /* ---------- Periode ringkasan ---------- */
  const PERIODS = { m1: 1, m3: 3, m6: 6, y: 0 };
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
  function periodRange(kind, now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth();
    const n = kind === 'y' ? m + 1 : PERIODS[kind] || 3;
    const mk = (offset) => {
      const s = new Date(y, m - offset - n + 1, 1), e = new Date(y, m - offset, 1);
      const months = [];
      for (let i = 0; i < n; i++) { const d = new Date(s.getFullYear(), s.getMonth() + i, 1); months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${BULAN[d.getMonth()]} ${d.getFullYear()}` }); }
      return { start: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-01`, end: `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(lastDay(e.getFullYear(), e.getMonth()))}`, months };
    };
    const cur = mk(0), prev = mk(n);
    const a = cur.months[0], b = cur.months[cur.months.length - 1];
    const sameYear = a.key.slice(0, 4) === b.key.slice(0, 4);
    cur.label = n === 1 ? b.label : `${sameYear ? a.label.split(' ')[0] : a.label} – ${b.label}`;
    return { cur, prev };
  }
  function rangeTotals(accounts, txs, r) {
    const u = usahaTxs(accounts, txs).filter((t) => t.date >= r.start && t.date <= r.end);
    return { in: sumTx(u, (t) => t.kind === 'in'), out: sumTx(u, (t) => t.kind === 'out') };
  }
  // saldo kas usaha sampai akhir tanggal (inklusif)
  function balanceAt(accounts, txs, iso) {
    const accs = accounts.filter((a) => !a.deleted && (a.scope || 'usaha') === 'usaha');
    const opening = accs.reduce((s, a) => s + (Number(a.opening) || 0), 0);
    const u = usahaTxs(accounts, txs).filter((t) => t.date <= iso);
    return opening + sumTx(u, (t) => t.kind === 'in') - sumTx(u, (t) => t.kind === 'out');
  }
  // perubahan persen; null jika pembanding 0
  const pctChange = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);

  return {
    PERIODS, periodRange, rangeTotals, balanceAt, pctChange,
    BULAN_PANJANG, terbilang, tanggalPanjang, docNumber, nextSeq, invoiceTotals, fmtNum, parseDec,
    BULAN, PRESETS, uid, isoDate, monthKey, fmtRp, parseNum, live, mergeRecords,
    makeTermLabels, scheduleAmounts, paidFor, projectSummary, piutangList,
    balances, usahaTxs, monthTotals, monthlySeries,
  };
});
