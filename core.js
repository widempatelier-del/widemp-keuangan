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
      let amount = Math.round((contract * (Number(t.percent) || 0)) / 100);
      if (i === sorted.length - 1 && Math.abs(totalPct - 100) < 0.001) amount = contract - acc;
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
    const ok = new Set(accounts.filter((a) => !a.deleted && a.scope !== 'pribadi').map((a) => a.id));
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

  return {
    BULAN, PRESETS, uid, isoDate, monthKey, fmtRp, parseNum, live, mergeRecords,
    makeTermLabels, scheduleAmounts, paidFor, projectSummary, piutangList,
    balances, usahaTxs, monthTotals, monthlySeries,
  };
});
