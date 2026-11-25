/* Sinkron ke Google Drive (scope drive.file: aplikasi hanya melihat file yang dibuatnya sendiri) */
(function () {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME = 'Widemp Atelier';
  const FILE_NAME = 'widemp-data.json';
  const SCHEMA = 1;
  const LS = window.localStorage;
  const K = { client: 'wk_client_id', on: 'wk_drive_on', folder: 'wk_folder_id', file: 'wk_file_id', last: 'wk_last_sync' };

  let tokenClient = null, tokenClientFor = '', token = null, tokenExp = 0, gsiPromise = null;
  // token akses (berlaku ±1 jam) disimpan supaya membuka ulang aplikasi tidak perlu login lagi
  try { const t = LS.getItem('wk_tok'), e = Number(LS.getItem('wk_tok_exp')) || 0; if (t && Date.now() < e) { token = t; tokenExp = e; } } catch (err) { /* abaikan */ }
  const keepToken = () => { try { if (token) { LS.setItem('wk_tok', token); LS.setItem('wk_tok_exp', String(tokenExp)); } else { LS.removeItem('wk_tok'); LS.removeItem('wk_tok_exp'); } } catch (err) { /* abaikan */ } };

  const clientId = () => (LS.getItem(K.client) || '').trim();
  const isConnected = () => LS.getItem(K.on) === '1' && !!clientId();
  const hasToken = () => !!token && Date.now() < tokenExp;
  const lastSync = () => Number(LS.getItem(K.last)) || 0;

  function loadGsi() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { gsiPromise = null; rej(new Error('Tidak bisa memuat login Google (periksa internet)')); };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }

  async function getToken(interactive) {
    if (hasToken()) return token;
    const id = clientId();
    if (!id) throw new Error('Client ID Google belum diisi');
    await loadGsi();
    return new Promise((res, rej) => {
      if (!tokenClient || tokenClientFor !== id) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: () => {} });
        tokenClientFor = id;
      }
      tokenClient.callback = (r) => {
        if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Izin ditolak' : 'Perlu login: ' + r.error));
        token = r.access_token;
        tokenExp = Date.now() + ((Number(r.expires_in) || 3600) - 90) * 1000;
        keepToken(); res(token);
      };
      tokenClient.error_callback = (e) => rej(new Error('Perlu login (' + ((e && e.type) || 'popup') + ')'));
      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {}),
    }));
    if (res.status === 401) { token = null; tokenExp = 0; keepToken(); throw new Error('Perlu login'); }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error.message; } catch (e) { /* abaikan */ }
      const err = new Error(msg || 'Drive error ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res;
  }
  const j = async (url, opts) => (await api(url, opts)).json();
  const D = 'https://www.googleapis.com/drive/v3/files';

  // Cari berdasarkan nama; jika belum ada, buat. Bila dua perangkat membuat bersamaan, yang tertua dipakai.
  async function ensure(name, mime, parent, cacheKey) {
    const cached = LS.getItem(cacheKey);
    if (cached) {
      try {
        const m = await j(`${D}/${cached}?fields=id,trashed`);
        if (!m.trashed) return cached;
      } catch (e) { if (e.status !== 404) throw e; }
      LS.removeItem(cacheKey);
    }
    const q = `name='${name}' and mimeType='${mime}' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const find = async () => (await j(`${D}?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id,createdTime)&spaces=drive`)).files || [];
    let files = await find();
    if (!files.length) {
      const body = { name, mimeType: mime }; if (parent) body.parents = [parent];
      const mine = await j(`${D}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      files = await find();
      if (files.length && files[0].id !== mine.id) {
        try { await api(`${D}/${mine.id}`, { method: 'DELETE' }); } catch (e) { /* abaikan */ }
      }
      if (!files.length) files = [mine];
    }
    LS.setItem(cacheKey, files[0].id);
    return files[0].id;
  }

  async function download(fileId) {
    const txt = await (await api(`${D}/${fileId}?alt=media`)).text();
    if (!txt.trim()) return { records: [] };
    const data = JSON.parse(txt);
    if ((data.schema || 1) > SCHEMA) throw new Error('Data di Drive dibuat versi aplikasi yang lebih baru');
    return data;
  }
  const upload = (fileId, payload) =>
    api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=version`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });

  async function connect() {
    await getToken(true);
    LS.setItem(K.on, '1');
  }
  function disconnect() {
    [K.on, K.folder, K.file, K.last, VER].forEach((k) => LS.removeItem(k));
    Object.keys(LS).filter((k) => k.startsWith('wk_dir_')).forEach((k) => LS.removeItem(k));
    token = null; tokenExp = 0; keepToken();
  }

  /** getLocal(): array record; applyMerged(array): simpan hasil gabungan ke lokal */
  // ID folder & file disimpan; tidak dicek ulang tiap sinkron (hemat 2 permintaan). Bila file hilang, dicari ulang.
  async function dataFileId() {
    const f = LS.getItem(K.file);
    if (f && LS.getItem(K.folder)) return f;
    const folderId = await ensure(FOLDER_NAME, 'application/vnd.google-apps.folder', null, K.folder);
    return ensure(FILE_NAME, 'application/json', folderId, K.file);
  }
  const VER = 'wk_remote_ver';

  /** getLocal(): array record; applyMerged(array); opts.dirty: ada perubahan lokal yang belum terkirim */
  async function sync(getLocal, applyMerged, interactive, opts = {}) {
    await getToken(!!interactive);
    let fileId = await dataFileId();
    for (let attempt = 0; attempt < 4; attempt++) {
      let v1, remote;
      try {
        if (!opts.dirty) {
          // tidak ada perubahan lokal: cukup cek versi; unduh hanya bila perangkat lain mengubah data
          v1 = (await j(`${D}/${fileId}?fields=version,trashed`)).version;
          if (v1 && v1 === LS.getItem(VER)) { LS.setItem(K.last, String(Date.now())); return { toLocal: 0, toRemote: 0, skipped: true }; }
          remote = await download(fileId);
        } else {
          const [meta, data] = await Promise.all([j(`${D}/${fileId}?fields=version`), download(fileId)]);
          v1 = meta.version; remote = data;
        }
      } catch (e) {
        if (e.status === 404 && attempt === 0) { LS.removeItem(K.file); LS.removeItem(K.folder); LS.removeItem(VER); fileId = await dataFileId(); continue; }
        throw e;
      }
      const m = window.Core.mergeRecords(getLocal(), remote.records || []);
      if (m.toLocal) await applyMerged(m.records);
      if (m.toRemote || !(remote.records || []).length) {
        const v2 = (await j(`${D}/${fileId}?fields=version`)).version;
        if (v2 !== v1) { opts = Object.assign({}, opts, { dirty: true }); continue; } // perangkat lain menulis bersamaan: ulangi
        const res = await upload(fileId, { app: 'widemp-keuangan', schema: SCHEMA, savedAt: Date.now(), records: m.records });
        try { const nv = (await res.json()).version; if (nv) LS.setItem(VER, String(nv)); else LS.removeItem(VER); } catch (e) { LS.removeItem(VER); }
      } else LS.setItem(VER, String(v1));
      LS.setItem(K.last, String(Date.now()));
      return { toLocal: m.toLocal, toRemote: m.toRemote };
    }
    throw new Error('Sinkron bentrok, coba lagi');
  }

  /** Simpan PDF ke "Widemp Atelier/<sub>/". Nama sama = file lama diperbarui, tidak dobel. */
  async function uploadFile(sub, name, blob) {
    await getToken(true);
    const root = await ensure(FOLDER_NAME, 'application/vnd.google-apps.folder', null, K.folder);
    const dir = await ensure(sub, 'application/vnd.google-apps.folder', root, 'wk_dir_' + sub);
    const q = `name='${name.replace(/'/g, "\\'")}' and '${dir}' in parents and trashed=false`;
    const found = ((await j(`${D}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)).files || [])[0];
    if (found) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${found.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': blob.type }, body: blob });
      return found.id;
    }
    const meta = await j(`${D}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: [dir], mimeType: blob.type }) });
    await api(`https://www.googleapis.com/upload/drive/v3/files/${meta.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': blob.type }, body: blob });
    return meta.id;
  }

  // dipanggil saat pengguna mengetuk (mis. Simpan): perbarui login diam-diam bila sudah kedaluwarsa
  let lastRefresh = 0;
  function refreshToken() {
    if (hasToken() || !isConnected() || Date.now() - lastRefresh < 60000) return Promise.resolve(token);
    lastRefresh = Date.now();
    return getToken(false);
  }
  const warmup = () => (isConnected() ? loadGsi().catch(() => {}) : Promise.resolve());

  window.DriveSync = { K, clientId, isConnected, hasToken, lastSync, connect, disconnect, sync, uploadFile, refreshToken, warmup };
})();
