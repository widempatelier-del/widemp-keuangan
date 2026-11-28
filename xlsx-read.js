/* Pembaca .xlsx ringan (tanpa pustaka): ZIP + DecompressionStream, nilai tersimpan (cached) tiap sel. */
(function () {
  'use strict';
  async function inflate(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), files = {};
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Bukan file .xlsx yang valid');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
      const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), start = lo + 30 + lnl + lxl;
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nl + xl + cl;
    }
    return {
      async text(name) {
        const f = files[name] || files[name.replace(/^\//, '')]; if (!f) return null;
        const d = f.method === 0 ? f.data : await inflate(f.data);
        return td.decode(d);
      },
    };
  }
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
  async function read(file) {
    const z = await unzip(await file.arrayBuffer());
    const wb = xml(await z.text('xl/workbook.xml'));
    const rels = xml(await z.text('xl/_rels/workbook.xml.rels'));
    const relMap = {}; kids(rels, 'Relationship').forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const ssTxt = await z.text('xl/sharedStrings.xml'), ss = [];
    if (ssTxt) kids(xml(ssTxt), 'si').forEach((si) => ss.push(kids(si, 't').map((t) => t.textContent).join('')));
    const sheets = {}, order = [];
    for (const s of kids(wb, 'sheet')) {
      const name = s.getAttribute('name'), rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
      let target = relMap[rid] || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const tx = await z.text(target); if (!tx) continue;
      const cells = {};
      kids(xml(tx), 'c').forEach((c) => {
        const r = c.getAttribute('r'), t = c.getAttribute('t'), v = kids(c, 'v')[0];
        let val = null;
        if (t === 's') val = v ? ss[+v.textContent] : null;
        else if (t === 'inlineStr') val = kids(c, 't').map((x) => x.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
        else if (t === 'b') val = v ? v.textContent === '1' : null;
        else if (v) val = Number(v.textContent);
        if (val !== null && val !== '') cells[r] = val;
      });
      sheets[name] = cells; order.push(name);
    }
    return { sheets, order };
  }
  window.XLSXRead = read;
})();
