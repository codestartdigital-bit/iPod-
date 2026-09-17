/* =========================================================================
   audio.js — motor de reproducao
   -------------------------------------------------------------------------
   Encapsula o elemento <audio>, a fila, shuffle, repeat, scrubbing,
   integracao com a Media Session (controles da tela de bloqueio) e a
   persistencia do estado de reproducao entre sessoes.
   ========================================================================= */

import * as db from './db.js';
import * as lib from './library.js';

const el = document.getElementById('audio');

/* --------------------------------------------------------- event bus */

const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
function emit(evt, payload) {
  const set = listeners.get(evt);
  if (set) for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
}

/* ---------------------------------------------------------- estado */

export const state = {
  queue: [],          // ids na ordem original do contexto
  order: [],          // indices de `queue` na ordem de execucao
  pos: -1,            // posicao dentro de `order`
  trackId: null,
  playing: false,
  shuffle: 'off',     // 'off' | 'songs'
  repeat: 'off',      // 'off' | 'one' | 'all'
  volume: 0.8,
  context: '',        // rotulo da fila (ex.: nome do album)
  duration: 0,
  currentTime: 0,
  loading: false,
};

let objectUrl = null;
let saveTimer = 0;

export const currentTrack = () => (state.trackId ? lib.getTrack(state.trackId) : null);
export const queueLength = () => state.order.length;
export const queueIndex = () => (state.pos < 0 ? 0 : state.pos + 1);

/* ------------------------------------------------------- ordem/shuffle */

function buildOrder(startIdx) {
  const n = state.queue.length;
  const seq = Array.from({ length: n }, (_, i) => i);
  if (state.shuffle === 'off') {
    state.order = seq;
    state.pos = startIdx >= 0 ? startIdx : 0;
    return;
  }
  // Fisher-Yates, mantendo a faixa escolhida em primeiro lugar
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  if (startIdx >= 0) {
    const at = seq.indexOf(startIdx);
    if (at > 0) { seq.splice(at, 1); seq.unshift(startIdx); }
  }
  state.order = seq;
  state.pos = 0;
}

export function setShuffle(mode) {
  if (state.shuffle === mode) return;
  state.shuffle = mode;
  if (state.queue.length) {
    const currentQueueIdx = state.order[state.pos];
    buildOrder(currentQueueIdx >= 0 ? currentQueueIdx : 0);
  }
  persistSettings();
  emit('state', state);
}

export function setRepeat(mode) {
  state.repeat = mode;
  persistSettings();
  emit('state', state);
}

/* ------------------------------------------------------------ carga */

async function loadCurrent(autoplay) {
  const qi = state.order[state.pos];
  const id = state.queue[qi];
  if (!id) return;

  state.trackId = id;
  state.loading = true;
  emit('track', currentTrack());

  const blob = await db.getFileBlob(id);
  if (!blob) {
    state.loading = false;
    emit('error', 'Arquivo nao encontrado');
    return;
  }

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  el.src = objectUrl;
  el.volume = state.volume;
  el.load();
  state.loading = false;

  if (autoplay) {
    try {
      await el.play();
      state.playing = true;
    } catch (err) {
      // iOS exige gesto do usuario para a primeira reproducao
      state.playing = false;
      emit('blocked', err);
    }
  }
  updateMediaSession();
  emit('state', state);
  scheduleSave();
}

/* ------------------------------------------------------------- API */

/**
 * Toca uma lista de faixas.
 * @param {string[]} ids   fila completa (ordem do contexto)
 * @param {number} startIdx indice inicial dentro de ids
 * @param {string} context rotulo exibido/registrado
 */
export async function playQueue(ids, startIdx, context) {
  if (!ids || !ids.length) return;
  state.queue = ids.slice();
  state.context = context || '';
  buildOrder(startIdx >= 0 ? startIdx : 0);
  await loadCurrent(true);
  emit('queue', state);
}

export async function toggle() {
  if (!state.trackId) return;
  if (el.paused) {
    try { await el.play(); state.playing = true; }
    catch (err) { state.playing = false; emit('blocked', err); }
  } else {
    el.pause();
    state.playing = false;
  }
  updateMediaSession();
  emit('state', state);
  scheduleSave();
}

export async function play() { if (el.paused) await toggle(); }
export function pause() { if (!el.paused) { el.pause(); state.playing = false; emit('state', state); } }

export async function next() {
  if (!state.order.length) return;

  if (state.pos + 1 < state.order.length) {        // proxima da fila
    state.pos++;
    await loadCurrent(true);
    return;
  }
  if (state.repeat === 'all') {                    // fim da fila com repetir tudo
    if (state.shuffle !== 'off') buildOrder(-1);   // nova ordem aleatoria a cada volta
    state.pos = 0;
    await loadCurrent(true);
    return;
  }
  stopAtEnd();                                     // fim da fila: para, como no iPod
}

function stopAtEnd() {
  el.pause();
  state.playing = false;
  el.currentTime = 0;
  updateMediaSession();
  emit('state', state);
  emit('ended', state);
}

export async function prev() {
  if (!state.order.length) return;
  // como no iPod: nos primeiros 3 s volta a faixa, depois reinicia a atual
  if (el.currentTime > 3) { el.currentTime = 0; return; }
  if (state.pos > 0) state.pos--;
  else if (state.repeat === 'all') state.pos = state.order.length - 1;
  else { el.currentTime = 0; return; }
  await loadCurrent(true);
}

/**
 * Retira uma faixa da fila atual. Usada quando a musica e apagada da
 * biblioteca: se for a que esta tocando, a reproducao para e a tela
 * "Tocando Agora" volta ao estado vazio.
 */
export function forgetTrack(id) {
  if (!state.queue.includes(id)) return;

  if (state.trackId === id) {
    el.pause();
    state.playing = false;
    el.removeAttribute('src');
    try { el.load(); } catch (_) { /* noop */ }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    state.trackId = null;
  }

  state.queue = state.queue.filter((q) => q !== id);

  if (!state.queue.length) {
    state.order = [];
    state.pos = -1;
    state.trackId = null;
  } else {
    // mantem a faixa atual na fila reconstruida, quando ela sobreviveu
    const keep = state.trackId ? state.queue.indexOf(state.trackId) : -1;
    buildOrder(keep >= 0 ? keep : 0);
    if (keep < 0) state.trackId = null;
  }

  emit('track', currentTrack());
  emit('state', state);
  scheduleSave();
}

export function seek(seconds) {
  if (!Number.isFinite(seconds) || !el.duration) return;
  el.currentTime = Math.max(0, Math.min(el.duration, seconds));
  emit('time', { currentTime: el.currentTime, duration: el.duration });
}

export function seekBy(delta) { seek((el.currentTime || 0) + delta); }

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  el.volume = state.volume;
  persistSettings();
  emit('volume', state.volume);
}

export const getTime = () => ({ currentTime: el.currentTime || 0, duration: el.duration || 0 });

/* --------------------------------------------------- scan (FF / REW) */

let scanTimer = 0, scanStart = 0;

export function startScan(dir) {
  if (scanTimer || !state.trackId) return;
  scanStart = performance.now();
  scanTimer = setInterval(() => {
    const held = (performance.now() - scanStart) / 1000;
    const step = held < 2 ? 1 : held < 5 ? 3 : 8;   // aceleracao progressiva
    seekBy(dir * step);
  }, 200);
}

export function stopScan() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = 0; }
}

export const isScanning = () => !!scanTimer;

/* ------------------------------------------------------ Media Session */

async function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = currentTrack();
  if (!t) return;
  try {
    const art = await lib.artUrl(t.albumKey);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  } catch (_) { /* metadata e best-effort */ }
}

function wireMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) {} };
  set('play', () => play());
  set('pause', () => pause());
  set('previoustrack', () => prev());
  set('nexttrack', () => next());
  set('seekbackward', (d) => seekBy(-(d && d.seekOffset ? d.seekOffset : 10)));
  set('seekforward', (d) => seekBy(d && d.seekOffset ? d.seekOffset : 10));
  set('seekto', (d) => { if (d && d.seekTime != null) seek(d.seekTime); });
}

/* ------------------------------------------------- eventos do <audio> */

el.addEventListener('timeupdate', () => {
  state.currentTime = el.currentTime || 0;
  state.duration = el.duration || 0;
  emit('time', { currentTime: state.currentTime, duration: state.duration });
});

el.addEventListener('durationchange', () => {
  state.duration = el.duration || 0;
  const t = currentTrack();
  if (t && !t.duration && state.duration) {
    db.updateTrack(t.id, { duration: state.duration }).then(() => { t.duration = state.duration; });
  }
  emit('time', { currentTime: state.currentTime, duration: state.duration });
});

el.addEventListener('ended', () => {
  const t = currentTrack();
  if (t) {
    db.updateTrack(t.id, { playCount: (t.playCount || 0) + 1, lastPlayed: Date.now() })
      .then(() => { t.playCount = (t.playCount || 0) + 1; t.lastPlayed = Date.now(); });
  }
  if (state.repeat === 'one') { el.currentTime = 0; el.play().catch(() => {}); return; }
  next();
});

el.addEventListener('play', () => { state.playing = true; emit('state', state); });
el.addEventListener('pause', () => { state.playing = false; emit('state', state); });
el.addEventListener('playing', () => { errorStreak = 0; });
el.addEventListener('loadeddata', () => { errorStreak = 0; });

// arquivo corrompido ou em formato nao suportado: pula, como faz o iPod.
// o contador evita loop infinito quando a fila inteira e invalida.
let errorStreak = 0;
el.addEventListener('error', () => {
  const t = currentTrack();
  emit('error', t ? `Nao foi possivel tocar "${t.title}"` : 'Nao foi possivel tocar este arquivo');
  state.playing = false;
  emit('state', state);

  if (state.order.length > 1 && errorStreak < state.order.length - 1) {
    errorStreak++;
    setTimeout(() => next(), 400);
  } else {
    errorStreak = 0;
  }
});

/* ----------------------------------------------------- persistencia */

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

export async function saveNow() {
  try {
    await db.kvSet('playback', {
      queue: state.queue,
      order: state.order,
      pos: state.pos,
      trackId: state.trackId,
      time: el.currentTime || 0,
      context: state.context,
    });
  } catch (_) { /* best-effort */ }
}

async function persistSettings() {
  try {
    await db.kvSet('audioSettings', {
      shuffle: state.shuffle, repeat: state.repeat, volume: state.volume,
    });
  } catch (_) { /* best-effort */ }
}

/** Restaura fila e posicao da sessao anterior (sem tocar automaticamente). */
export async function restore() {
  const s = await db.kvGet('audioSettings', null);
  if (s) {
    state.shuffle = s.shuffle || 'off';
    state.repeat = s.repeat || 'off';
    state.volume = typeof s.volume === 'number' ? s.volume : 0.8;
    el.volume = state.volume;
  }
  const p = await db.kvGet('playback', null);
  if (p && p.queue && p.queue.length && lib.getTrack(p.trackId)) {
    state.queue = p.queue.filter((id) => lib.getTrack(id));
    if (!state.queue.length) return;
    state.order = (p.order || []).filter((i) => i < state.queue.length);
    if (!state.order.length) state.order = state.queue.map((_, i) => i);
    state.pos = Math.min(Math.max(0, p.pos || 0), state.order.length - 1);
    state.context = p.context || '';
    state.trackId = p.trackId;

    const blob = await db.getFileBlob(p.trackId);
    if (blob) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      el.src = objectUrl;
      el.addEventListener('loadedmetadata', function once() {
        el.removeEventListener('loadedmetadata', once);
        if (p.time) { try { el.currentTime = p.time; } catch (_) {} }
      });
      el.load();
      emit('track', currentTrack());
      emit('state', state);
    }
  }
}

wireMediaSession();
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
