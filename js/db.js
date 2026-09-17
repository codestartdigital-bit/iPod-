/* =========================================================================
   db.js — camada de persistencia (IndexedDB)
   -------------------------------------------------------------------------
   Responsabilidade unica: guardar e recuperar biblioteca, arquivos de audio,
   capas, playlists e preferencias. Nenhuma regra de UI aqui.

   Object stores
     tracks     { id, title, artist, albumArtist, album, genre, composer,
                  year, trackNo, discNo, duration, fileName, mime, size,
                  addedAt, playCount, lastPlayed, rating, albumKey }
     files      { id, blob }                 -> audio bruto
     art        { key, blob }                -> capa por album (dedup)
     playlists  { id, name, trackIds[], createdAt }
     kv         { k, v }                     -> preferencias e estado
   ========================================================================= */

const DB_NAME = 'ipod-classic';
const DB_VERSION = 1;

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) {
        const s = db.createObjectStore('tracks', { keyPath: 'id' });
        s.createIndex('artist', 'artist');
        s.createIndex('album', 'album');
        s.createIndex('genre', 'genre');
        s.createIndex('albumKey', 'albumKey');
        s.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('art')) db.createObjectStore('art', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      void ev;
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { try { _db.close(); } catch (_) {} _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
  });
}

function tx(storeNames, mode) {
  return open().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transacao abortada'));
  });
}

/* ------------------------------------------------------------------ tracks */

export async function putTrack(track, blob, artBlob) {
  const t = await tx(['tracks', 'files', 'art'], 'readwrite');
  t.objectStore('tracks').put(track);
  if (blob) t.objectStore('files').put({ id: track.id, blob });
  if (artBlob && track.albumKey) t.objectStore('art').put({ key: track.albumKey, blob: artBlob });
  await txDone(t);
  return track;
}

/** Grava um lote inteiro numa unica transacao (muito mais rapido). */
export async function putTracksBatch(entries) {
  if (!entries.length) return;
  const t = await tx(['tracks', 'files', 'art'], 'readwrite');
  const st = t.objectStore('tracks'), sf = t.objectStore('files'), sa = t.objectStore('art');
  for (const e of entries) {
    st.put(e.track);
    if (e.blob) sf.put({ id: e.track.id, blob: e.blob });
    if (e.artBlob && e.track.albumKey) sa.put({ key: e.track.albumKey, blob: e.artBlob });
  }
  await txDone(t);
}

export async function allTracks() {
  const t = await tx('tracks', 'readonly');
  return reqToPromise(t.objectStore('tracks').getAll());
}

export async function getTrack(id) {
  const t = await tx('tracks', 'readonly');
  return reqToPromise(t.objectStore('tracks').get(id));
}

export async function updateTrack(id, patch) {
  const t = await tx('tracks', 'readwrite');
  const st = t.objectStore('tracks');
  const cur = await reqToPromise(st.get(id));
  if (!cur) { await txDone(t); return null; }
  const next = Object.assign({}, cur, patch);
  st.put(next);
  await txDone(t);
  return next;
}

export async function deleteTrack(id) {
  const t = await tx(['tracks', 'files'], 'readwrite');
  t.objectStore('tracks').delete(id);
  t.objectStore('files').delete(id);
  await txDone(t);
}

export async function getFileBlob(id) {
  const t = await tx('files', 'readonly');
  const rec = await reqToPromise(t.objectStore('files').get(id));
  return rec ? rec.blob : null;
}

/** true se ja existe faixa com esta assinatura (nome+tamanho) — evita duplicar. */
export async function hasTrackId(id) {
  const t = await tx('tracks', 'readonly');
  const k = await reqToPromise(t.objectStore('tracks').getKey(id));
  return k !== undefined;
}

/* --------------------------------------------------------------------- art */

export async function getArt(key) {
  if (!key) return null;
  const t = await tx('art', 'readonly');
  const rec = await reqToPromise(t.objectStore('art').get(key));
  return rec ? rec.blob : null;
}

export async function allArtKeys() {
  const t = await tx('art', 'readonly');
  return reqToPromise(t.objectStore('art').getAllKeys());
}

/* --------------------------------------------------------------- playlists */

export async function allPlaylists() {
  const t = await tx('playlists', 'readonly');
  return reqToPromise(t.objectStore('playlists').getAll());
}

export async function putPlaylist(pl) {
  const t = await tx('playlists', 'readwrite');
  t.objectStore('playlists').put(pl);
  await txDone(t);
  return pl;
}

export async function deletePlaylist(id) {
  const t = await tx('playlists', 'readwrite');
  t.objectStore('playlists').delete(id);
  await txDone(t);
}

/* ---------------------------------------------------------------------- kv */

export async function kvGet(k, fallback) {
  const t = await tx('kv', 'readonly');
  const rec = await reqToPromise(t.objectStore('kv').get(k));
  return rec === undefined ? fallback : rec.v;
}

export async function kvSet(k, v) {
  const t = await tx('kv', 'readwrite');
  t.objectStore('kv').put({ k, v });
  await txDone(t);
}

/* ------------------------------------------------------------------ limpeza */

export async function wipeLibrary() {
  const t = await tx(['tracks', 'files', 'art', 'playlists'], 'readwrite');
  t.objectStore('tracks').clear();
  t.objectStore('files').clear();
  t.objectStore('art').clear();
  t.objectStore('playlists').clear();
  await txDone(t);
}

/** Uso de disco reportado pelo navegador (pode ser aproximado). */
export async function estimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try { return await navigator.storage.estimate(); } catch (_) { /* ignore */ }
  }
  return { usage: 0, quota: 0 };
}

/** Pede armazenamento persistente (reduz o risco de o iOS apagar a biblioteca). */
export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (_) { return false; }
  }
  return false;
}
