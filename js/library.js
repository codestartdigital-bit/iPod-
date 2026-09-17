/* =========================================================================
   library.js — importacao de arquivos e indices da biblioteca
   -------------------------------------------------------------------------
   Responsabilidades:
     1. Importar File/Blob -> ler tags -> medir duracao -> gravar no IndexedDB
     2. Manter em memoria os indices de navegacao (artistas, albuns, generos,
        compositores, musicas) usados pelos menus
   ========================================================================= */

import * as db from './db.js';
import { readTags, guessFromFilename } from './tags.js';

export const UNKNOWN_ARTIST = 'Artista Desconhecido';
export const UNKNOWN_ALBUM = 'Album Desconhecido';
export const UNKNOWN_GENRE = 'Sem Genero';

const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|mp4|wav|wave|aif|aiff|flac|ogg|oga|opus|weba|webm)$/i;

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Chave de ordenacao: ignora artigos iniciais e acentos. */
export function sortKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an|o|os|as|um|uma)\s+/i, '')
    .toLowerCase();
}

export const cmp = (a, b) => collator.compare(sortKey(a), sortKey(b));

function hashId(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

export function albumKeyOf(t) {
  const artist = t.albumArtist || t.artist || UNKNOWN_ARTIST;
  const album = t.album || UNKNOWN_ALBUM;
  return hashId(sortKey(artist) + '' + sortKey(album));
}

/* ------------------------------------------------------------ duracao */

/** Mede a duracao real usando o decodificador do proprio navegador. */
function probeDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      try { a.load(); } catch (_) { /* noop */ }
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) && v > 0 ? v : 0);
    };
    const timer = setTimeout(() => finish(0), 8000);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(a.duration));
    a.addEventListener('error', () => finish(0));
    a.src = url;
  });
}

/** O navegador consegue tocar este arquivo? (informativo, nao bloqueia) */
export function canPlay(mime, name) {
  const probe = document.createElement('audio');
  if (mime && probe.canPlayType(mime)) return true;
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const map = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac',
    mp4: 'audio/mp4', wav: 'audio/wav', wave: 'audio/wav', aif: 'audio/aiff',
    aiff: 'audio/aiff', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg',
    opus: 'audio/ogg; codecs=opus', weba: 'audio/webm', webm: 'audio/webm',
  };
  return !!(map[ext] && probe.canPlayType(map[ext]));
}

/* --------------------------------------------------------- importacao */

/**
 * Importa uma lista de File.
 * @param {File[]} files
 * @param {(p:{done:number,total:number,name:string,added:number,skipped:number})=>void} onProgress
 * @returns {Promise<{added:number, skipped:number, failed:number, unplayable:string[]}>}
 */
export async function importFiles(files, onProgress) {
  const list = Array.from(files).filter((f) => f && (AUDIO_EXT.test(f.name) || /^audio\//.test(f.type)));
  const result = { added: 0, skipped: 0, failed: 0, unplayable: [] };
  const total = list.length;
  if (!total) return result;

  const knownArt = new Set(await db.allArtKeys());
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await db.putTracksBatch(batch);
    batch = [];
  };

  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    if (onProgress) {
      onProgress({ done: i, total, name: file.name, added: result.added, skipped: result.skipped });
    }
    try {
      const id = hashId([file.name, file.size, file.lastModified || 0].join('|'));
      if (await db.hasTrackId(id)) { result.skipped++; continue; }

      const tags = await readTags(file);
      const guess = guessFromFilename(file.name);

      const track = {
        id,
        title: tags.title || guess.title || file.name,
        artist: tags.artist || guess.artist || UNKNOWN_ARTIST,
        albumArtist: tags.albumArtist || tags.artist || guess.artist || UNKNOWN_ARTIST,
        album: tags.album || UNKNOWN_ALBUM,
        genre: tags.genre || UNKNOWN_GENRE,
        composer: tags.composer || '',
        year: tags.year || 0,
        trackNo: tags.trackNo || guess.trackNo || 0,
        discNo: tags.discNo || 0,
        duration: 0,
        fileName: file.name,
        mime: file.type || '',
        size: file.size,
        addedAt: Date.now(),
        playCount: 0,
        lastPlayed: 0,
        rating: 0,
        albumKey: '',
      };
      track.albumKey = albumKeyOf(track);
      track.duration = await probeDuration(file);

      if (!track.duration && !canPlay(file.type, file.name)) result.unplayable.push(file.name);

      const needArt = tags.artBlob && !knownArt.has(track.albumKey);
      if (needArt) knownArt.add(track.albumKey);

      batch.push({ track, blob: file, artBlob: needArt ? tags.artBlob : null });
      result.added++;

      if (batch.length >= 8) await flush();
    } catch (err) {
      console.error('[library] falha ao importar', file.name, err);
      result.failed++;
    }
  }

  await flush();
  if (onProgress) {
    onProgress({ done: total, total, name: '', added: result.added, skipped: result.skipped });
  }
  return result;
}

/* -------------------------------------------------------------- indices */

export const index = {
  tracks: [],          // todas as faixas
  byId: new Map(),
  songs: [],           // ordenadas por titulo
  albums: [],          // { key, name, artist, year, trackIds[] }
  artists: [],         // { name, albumKeys[], trackIds[] }
  genres: [],          // { name, trackIds[] }
  composers: [],       // { name, trackIds[] }
  recent: [],          // ids por data de importacao (desc)
  ready: false,
};

export async function rebuild() {
  const tracks = await db.allTracks();
  index.tracks = tracks;
  index.byId = new Map(tracks.map((t) => [t.id, t]));

  index.songs = tracks.slice().sort((a, b) => cmp(a.title, b.title) || cmp(a.artist, b.artist));

  const albumMap = new Map();
  const artistMap = new Map();
  const genreMap = new Map();
  const composerMap = new Map();

  for (const t of tracks) {
    // albuns
    let al = albumMap.get(t.albumKey);
    if (!al) {
      al = { key: t.albumKey, name: t.album || UNKNOWN_ALBUM, artist: t.albumArtist || t.artist || UNKNOWN_ARTIST, year: t.year || 0, trackIds: [] };
      albumMap.set(t.albumKey, al);
    }
    al.trackIds.push(t.id);
    if (t.year && (!al.year || t.year < al.year)) al.year = t.year;

    // artistas (usa o artista do album para agrupar coletaneas corretamente)
    const aName = t.albumArtist || t.artist || UNKNOWN_ARTIST;
    let ar = artistMap.get(aName);
    if (!ar) { ar = { name: aName, albumKeys: new Set(), trackIds: [] }; artistMap.set(aName, ar); }
    ar.albumKeys.add(t.albumKey);
    ar.trackIds.push(t.id);

    // generos
    const g = t.genre || UNKNOWN_GENRE;
    let ge = genreMap.get(g);
    if (!ge) { ge = { name: g, trackIds: [] }; genreMap.set(g, ge); }
    ge.trackIds.push(t.id);

    // compositores
    if (t.composer) {
      let co = composerMap.get(t.composer);
      if (!co) { co = { name: t.composer, trackIds: [] }; composerMap.set(t.composer, co); }
      co.trackIds.push(t.id);
    }
  }

  const byTrackOrder = (a, b) => {
    const ta = index.byId.get(a), tb = index.byId.get(b);
    return (ta.discNo || 0) - (tb.discNo || 0) || (ta.trackNo || 0) - (tb.trackNo || 0) || cmp(ta.title, tb.title);
  };

  index.albums = Array.from(albumMap.values())
    .map((a) => { a.trackIds.sort(byTrackOrder); return a; })
    .sort((a, b) => cmp(a.name, b.name));

  index.artists = Array.from(artistMap.values())
    .map((a) => {
      a.albumKeys = Array.from(a.albumKeys)
        .sort((x, y) => (albumMap.get(x).year || 9999) - (albumMap.get(y).year || 9999) || cmp(albumMap.get(x).name, albumMap.get(y).name));
      a.trackIds.sort(byTrackOrder);
      return a;
    })
    .sort((a, b) => cmp(a.name, b.name));

  index.genres = Array.from(genreMap.values())
    .map((g) => { g.trackIds.sort(byTrackOrder); return g; })
    .sort((a, b) => cmp(a.name, b.name));

  index.composers = Array.from(composerMap.values())
    .map((c) => { c.trackIds.sort(byTrackOrder); return c; })
    .sort((a, b) => cmp(a.name, b.name));

  index.recent = tracks.slice().sort((a, b) => b.addedAt - a.addedAt).map((t) => t.id);
  index.ready = true;
  return index;
}

export const getTrack = (id) => index.byId.get(id) || null;
export const getAlbum = (key) => index.albums.find((a) => a.key === key) || null;
export const trackCount = () => index.tracks.length;

/** Todas as faixas ordenadas como o iPod faz em "Musicas". */
export const allSongIds = () => index.songs.map((t) => t.id);

/** Busca simples por titulo / artista / album. */
export function search(query) {
  const q = sortKey(query);
  if (!q) return [];
  return index.songs.filter((t) =>
    sortKey(t.title).includes(q) || sortKey(t.artist).includes(q) || sortKey(t.album).includes(q)
  );
}

/* --------------------------------------------------------------- capas */

const artUrlCache = new Map();
const artMissing = new Set();

/** URL de objeto da capa (cacheada). null se o album nao tem capa. */
export async function artUrl(albumKey) {
  if (!albumKey || artMissing.has(albumKey)) return null;
  if (artUrlCache.has(albumKey)) return artUrlCache.get(albumKey);
  const blob = await db.getArt(albumKey);
  if (!blob) { artMissing.add(albumKey); return null; }
  const url = URL.createObjectURL(blob);
  artUrlCache.set(albumKey, url);
  return url;
}

/** Versao sincrona: so devolve se ja estiver no cache. */
export const artUrlCached = (albumKey) => artUrlCache.get(albumKey) || null;

export function clearArtCache() {
  for (const url of artUrlCache.values()) URL.revokeObjectURL(url);
  artUrlCache.clear();
  artMissing.clear();
}

/* ----------------------------------------------------------- playlists */

export let playlists = [];

export async function loadPlaylists() {
  playlists = await db.allPlaylists();
  playlists.sort((a, b) => cmp(a.name, b.name));
  return playlists;
}

export async function createPlaylist(name, trackIds) {
  const pl = { id: hashId(name + Date.now()), name, trackIds: trackIds || [], createdAt: Date.now() };
  await db.putPlaylist(pl);
  await loadPlaylists();
  return pl;
}

export async function addToPlaylist(playlistId, trackId) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return null;
  if (!pl.trackIds.includes(trackId)) pl.trackIds.push(trackId);
  await db.putPlaylist(pl);
  return pl;
}

export async function removePlaylist(id) {
  await db.deletePlaylist(id);
  await loadPlaylists();
}

/* ------------------------------------------------------------ exclusao */

export async function removeTrack(id) {
  await db.deleteTrack(id);
  for (const pl of playlists) {
    if (pl.trackIds.includes(id)) {
      pl.trackIds = pl.trackIds.filter((x) => x !== id);
      await db.putPlaylist(pl);
    }
  }
  await rebuild();
}

export async function wipe() {
  clearArtCache();
  await db.wipeLibrary();
  playlists = [];
  await rebuild();
}
