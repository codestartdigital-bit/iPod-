/* =========================================================================
   nav.js — pilha de telas, arvore de menus e roteamento do Click Wheel
   -------------------------------------------------------------------------
   Toda a "sensacao de iPod" mora aqui: o que cada botao faz em cada tela,
   como as listas se encadeiam e como a luz de fundo se comporta.
   ========================================================================= */

import { createListView } from './ui/list.js';
import { createNowPlayingView } from './ui/nowplaying.js';
import { createCoverFlowView } from './ui/coverflow.js';
import * as extras from './ui/extras.js';
import * as lib from './library.js';
import * as player from './audio.js';
import * as click from './click.js';
import { settings, set as setSetting, reset as resetSettings } from './settings.js';
import { plural, fmtTime } from './util.js';

const viewport = document.getElementById('viewport');
const sbTitle = document.getElementById('sb-title');
const ipodEl = document.getElementById('ipod');
const toastEl = document.getElementById('toast');

const ONTHEGO = 'Lista Rapida';

const stack = [];
let importHandler = null;

export const current = () => stack[stack.length - 1] || null;
export function setImportHandler(fn) { importHandler = fn; }

/* ------------------------------------------------------ pilha de telas */

function mount(view) {
  viewport.appendChild(view.root);
  sbTitle.textContent = view.title || 'iPod';
  if (view.onEnter) view.onEnter();
}

export function push(view) {
  const cur = current();
  if (cur) { cur.root.remove(); if (cur.onExit) cur.onExit(); }
  stack.push(view);
  mount(view);
}

export function replaceTop(view) {
  const cur = stack.pop();
  if (cur) { cur.root.remove(); if (cur.destroy) cur.destroy(); }
  stack.push(view);
  mount(view);
}

export function pop() {
  if (stack.length <= 1) return false;
  const v = stack.pop();
  v.root.remove();
  if (v.destroy) v.destroy();
  mount(current());
  return true;
}

/** Profundidade atual da pilha (a tela do topo esta nesta posicao). */
export const depth = () => stack.length;

/** Descarta telas ate a profundidade alvo sem remontar (uso interno). */
function popSilent(target) {
  while (stack.length > Math.max(1, target)) {
    const v = stack.pop();
    v.root.remove();
    if (v.destroy) v.destroy();
  }
}

/** Volta ate a profundidade alvo e remonta a tela que ficou no topo. */
export function popTo(target) {
  popSilent(target);
  if (stack.length) mount(current());
}

export function home() {
  while (stack.length > 1) {
    const v = stack.pop();
    v.root.remove();
    if (v.destroy) v.destroy();
  }
  if (stack.length) mount(current());
}

export function resetToHome() {
  while (stack.length) {
    const v = stack.pop();
    v.root.remove();
    if (v.destroy) v.destroy();
  }
  push(buildMainMenu());
}

/* ----------------------------------------------------------- luz / toast */

let backlightTimer = 0;

export function wake() {
  const wasOff = ipodEl.dataset.backlight === 'off';
  ipodEl.dataset.backlight = 'on';
  armBacklight();
  return wasOff;
}

export function armBacklight() {
  clearTimeout(backlightTimer);
  if (settings.backlight > 0) {
    backlightTimer = setTimeout(() => { ipodEl.dataset.backlight = 'off'; }, settings.backlight * 1000);
  }
}

export function sleep() {
  clearTimeout(backlightTimer);
  ipodEl.dataset.backlight = 'off';
}

let toastTimer = 0;
export function toast(text, ms) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 1600);
}

/* ------------------------------------------------- roteamento de eventos */

export function handleScroll(dir, steps) {
  if (wake()) return;                 // primeiro toque so acende a tela
  click.click();
  const v = current();
  if (v && v.onScroll) v.onScroll(dir, steps);
}

export function handleButton(name) {
  if (wake()) return;
  click.haptic();
  const v = current();
  if (v && v.onButton && v.onButton(name)) return;

  switch (name) {
    case 'menu':
      pop();
      break;
    case 'playpause':
      if (player.state.trackId) player.toggle();
      break;
    case 'prev':
      if (player.state.trackId) player.prev();
      break;
    case 'next':
      if (player.state.trackId) player.next();
      break;
    default:
      break;
  }
}

export function handleHold(name) {
  if (wake()) return;
  const v = current();
  if (v && v.onHold && v.onHold(name)) return;

  if (name === 'menu') home();
  else if (name === 'prev') player.startScan(-1);
  else if (name === 'next') player.startScan(1);
  else if (name === 'playpause') sleep();
}

export function handleHoldEnd(name) {
  if (name === 'prev' || name === 'next') player.stopScan();
}

/* ==========================================================================
   MENUS
   ========================================================================== */

function nowPlayingPreview() {
  const t = player.currentTrack();
  if (!t) return { art: null, t1: 'iPod', t2: `${plural(lib.trackCount(), 'musica', 'musicas')}` };
  return { art: t.albumKey, t1: t.title, t2: t.artist };
}

export function openNowPlaying() {
  const cur = current();
  if (cur && cur.isNowPlaying) return;
  push(createNowPlayingView());
}

function playTracks(ids, startIdx, context) {
  player.playQueue(ids, startIdx, context);
  openNowPlaying();
}

/* --------------------------------------------------------- menu principal */

export function buildMainMenu() {
  const preview = nowPlayingPreview();
  const items = [];

  if (!lib.trackCount()) {
    items.push({
      label: 'Adicionar Musicas', chev: true, preview,
      onSelect: () => { if (importHandler) importHandler(); },
    });
  }

  items.push({ label: 'Musica', chev: true, preview, onSelect: () => push(buildMusicMenu()) });
  items.push({ label: 'Extras', chev: true, preview, onSelect: () => push(buildExtrasMenu()) });
  items.push({ label: 'Ajustes', chev: true, preview, onSelect: () => push(buildSettingsMenu(0)) });
  items.push({
    label: 'Aleatorio', preview,
    onSelect: () => {
      const ids = lib.allSongIds();
      if (!ids.length) { toast('Nenhuma musica na biblioteca'); return; }
      player.setShuffle('songs');
      playTracks(ids, Math.floor(Math.random() * ids.length), 'Aleatorio');
    },
  });

  if (player.state.trackId) {
    items.push({ label: 'Tocando Agora', chev: true, preview, onSelect: () => openNowPlaying() });
  }

  return createListView({ title: 'iPod', items });
}

/* ------------------------------------------------------------ menu musica */

export function buildMusicMenu() {
  const preview = nowPlayingPreview();
  const items = [
    { label: 'Cover Flow', chev: true, preview, onSelect: () => push(buildCoverFlow()) },
    { label: 'Playlists', chev: true, preview, onSelect: () => push(buildPlaylistsMenu()) },
    { label: 'Artistas', chev: true, preview, onSelect: () => push(buildArtistsMenu()) },
    { label: 'Albuns', chev: true, preview, onSelect: () => push(buildAlbumsMenu()) },
    { label: 'Musicas', chev: true, preview, onSelect: () => push(buildSongsMenu()) },
    { label: 'Generos', chev: true, preview, onSelect: () => push(buildGenresMenu()) },
    { label: 'Compositores', chev: true, preview, onSelect: () => push(buildComposersMenu()) },
    { label: 'Buscar', chev: true, preview, onSelect: () => push(buildSearch()) },
  ];
  return createListView({ title: 'Musica', items });
}

function buildCoverFlow() {
  return createCoverFlowView(lib.index.albums, (album) => {
    push(buildAlbumTracks(album));
  }, 0);
}

function buildSearch() {
  return extras.createSearchView((track, ids, idx) => {
    playTracks(ids, idx, 'Busca');
  });
}

/* ---------------------------------------------------------------- artistas */

export function buildArtistsMenu() {
  const items = lib.index.artists.map((a) => ({
    label: a.name,
    value: String(a.trackIds.length),
    chev: true,
    preview: { art: a.albumKeys[0], t1: a.name, t2: plural(a.albumKeys.length, 'album', 'albuns') },
    onSelect: () => push(buildArtistAlbums(a)),
    onPlay: () => playTracks(a.trackIds, 0, a.name),
  }));
  return createListView({
    title: 'Artistas', items,
    emptyTitle: 'Sem artistas',
    emptyText: 'Adicione musicas em Ajustes > Adicionar Musicas.',
  });
}

function buildArtistAlbums(artist) {
  const items = [{
    label: 'Todas as musicas',
    chev: true,
    preview: { art: artist.albumKeys[0], t1: artist.name, t2: plural(artist.trackIds.length, 'musica', 'musicas') },
    onSelect: () => push(buildTrackList(artist.trackIds, artist.name, { showArtist: false })),
    onPlay: () => playTracks(artist.trackIds, 0, artist.name),
  }];

  for (const key of artist.albumKeys) {
    const alb = lib.getAlbum(key);
    if (!alb) continue;
    items.push({
      label: alb.name,
      value: alb.year ? String(alb.year) : '',
      art: alb.key,
      chev: true,
      preview: { art: alb.key, t1: alb.name, t2: alb.artist },
      onSelect: () => push(buildAlbumTracks(alb)),
      onPlay: () => playTracks(alb.trackIds, 0, alb.name),
    });
  }
  return createListView({ title: artist.name, items });
}

/* ------------------------------------------------------------------ albuns */

export function buildAlbumsMenu() {
  const items = lib.index.albums.map((a) => ({
    label: a.name,
    value: a.artist,
    art: a.key,
    chev: true,
    preview: { art: a.key, t1: a.name, t2: a.artist },
    onSelect: () => push(buildAlbumTracks(a)),
    onPlay: () => playTracks(a.trackIds, 0, a.name),
  }));
  return createListView({
    title: 'Albuns', items,
    emptyTitle: 'Sem albuns',
    emptyText: 'Adicione musicas em Ajustes > Adicionar Musicas.',
  });
}

function buildAlbumTracks(album) {
  return buildTrackList(album.trackIds, album.name, { numbered: true, artKey: album.key });
}

/* ----------------------------------------------------------------- musicas */

export function buildSongsMenu() {
  return buildTrackList(lib.allSongIds(), 'Musicas', { showArtist: true });
}

/**
 * Lista de faixas reutilizavel.
 * opts: numbered, showArtist, artKey
 */
function buildTrackList(ids, title, opts) {
  const o = opts || {};
  const live = ids.filter((id) => lib.getTrack(id));

  const items = live.map((id, i) => {
    const t = lib.getTrack(id);
    return {
      label: t.title,
      value: o.showArtist ? t.artist : fmtTime(t.duration),
      num: o.numbered ? (t.trackNo || i + 1) : undefined,
      playing: player.state.trackId === id,
      preview: { art: t.albumKey, t1: t.title, t2: `${t.artist} · ${t.album}` },
      onSelect: () => playTracks(live, i, title),
      onPlay: () => playTracks(live, i, title),
      // segurar o centro abre as acoes da faixa (a lista esta no topo agora)
      onHold: () => push(buildTrackActions(t, live, i, title, o, depth())),
    };
  });

  return createListView({
    title, items,
    selected: o.selected || 0,
    emptyTitle: 'Sem musicas',
    emptyText: 'Adicione musicas em Ajustes > Adicionar Musicas.',
  });
}

/* ------------------------------------------------- acoes sobre a faixa */

function buildTrackActions(track, ids, idx, title, opts, listDepth) {
  const items = [
    {
      label: `Adicionar a ${ONTHEGO}`,
      onSelect: () => { addToOnTheGo(track); pop(); },
    },
    {
      label: 'Apagar Musica',
      chev: true,
      onSelect: () => push(buildConfirm(
        'Apagar esta musica?', 'Apagar',
        () => removeTrackAndRefresh(track, ids, idx, title, opts, listDepth)
      )),
    },
  ];
  return createListView({ title: track.title, items, split: false });
}

/**
 * Apaga a faixa da biblioteca e volta para a lista, ja sem ela.
 * As telas anteriores (albuns, artistas) sao remontadas ao serem abertas
 * de novo, e faixas ausentes sao sempre filtradas na abertura da lista.
 */
async function removeTrackAndRefresh(track, ids, idx, title, opts, listDepth) {
  player.forgetTrack(track.id);
  await lib.removeTrack(track.id);

  const remaining = ids.filter((id) => id !== track.id && lib.getTrack(id));
  if (!remaining.length) {
    popTo(listDepth - 1);            // a lista ficou vazia: sobe um nivel
  } else {
    popSilent(listDepth - 1);        // descarta confirmacao, acoes e lista antiga
    push(buildTrackList(remaining, title, Object.assign({}, opts, {
      selected: Math.min(idx, remaining.length - 1),
    })));
  }
  toast('Musica apagada');
}

async function addToOnTheGo(track) {
  let pl = lib.playlists.find((p) => p.name === ONTHEGO);
  if (!pl) pl = await lib.createPlaylist(ONTHEGO, []);
  await lib.addToPlaylist(pl.id, track.id);
  toast(`Adicionada a "${ONTHEGO}"`);
}

/* --------------------------------------------------------------- playlists */

export function buildPlaylistsMenu() {
  const items = lib.playlists.map((p) => {
    const first = p.trackIds.map((id) => lib.getTrack(id)).find(Boolean);
    return {
      label: p.name,
      value: String(p.trackIds.length),
      chev: true,
      preview: { art: first ? first.albumKey : null, t1: p.name, t2: plural(p.trackIds.length, 'musica', 'musicas') },
      onSelect: () => push(buildTrackList(p.trackIds.filter((id) => lib.getTrack(id)), p.name, { showArtist: true })),
      onPlay: () => {
        const ids = p.trackIds.filter((id) => lib.getTrack(id));
        if (ids.length) playTracks(ids, 0, p.name);
      },
      onHold: async () => {
        await lib.removePlaylist(p.id);
        toast('Playlist removida');
        replaceTop(buildPlaylistsMenu());
      },
    };
  });

  items.push({
    label: 'Adicionadas recentemente', chev: true,
    preview: nowPlayingPreview(),
    onSelect: () => push(buildTrackList(lib.index.recent.slice(0, 200), 'Recentes', { showArtist: true })),
  });
  items.push({
    label: 'Mais tocadas', chev: true,
    preview: nowPlayingPreview(),
    onSelect: () => {
      const ids = lib.index.tracks.slice().sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 100).map((t) => t.id);
      push(buildTrackList(ids, 'Mais tocadas', { showArtist: true }));
    },
  });

  return createListView({
    title: 'Playlists', items,
    emptyTitle: 'Sem playlists',
    emptyText: `Segure o botao central sobre uma musica e escolha "Adicionar a ${ONTHEGO}".`,
  });
}

/* ------------------------------------------------------ generos / autores */

export function buildGenresMenu() {
  const items = lib.index.genres.map((g) => {
    const first = lib.getTrack(g.trackIds[0]);
    return {
      label: g.name,
      value: String(g.trackIds.length),
      chev: true,
      preview: { art: first ? first.albumKey : null, t1: g.name, t2: plural(g.trackIds.length, 'musica', 'musicas') },
      onSelect: () => push(buildTrackList(g.trackIds, g.name, { showArtist: true })),
      onPlay: () => playTracks(g.trackIds, 0, g.name),
    };
  });
  return createListView({ title: 'Generos', items, emptyTitle: 'Sem generos', emptyText: 'Adicione musicas primeiro.' });
}

export function buildComposersMenu() {
  const items = lib.index.composers.map((c) => {
    const first = lib.getTrack(c.trackIds[0]);
    return {
      label: c.name,
      value: String(c.trackIds.length),
      chev: true,
      preview: { art: first ? first.albumKey : null, t1: c.name, t2: plural(c.trackIds.length, 'musica', 'musicas') },
      onSelect: () => push(buildTrackList(c.trackIds, c.name, { showArtist: true })),
      onPlay: () => playTracks(c.trackIds, 0, c.name),
    };
  });
  return createListView({
    title: 'Compositores', items,
    emptyTitle: 'Sem compositores',
    emptyText: 'Nenhum arquivo importado traz a tag de compositor.',
  });
}

/* ------------------------------------------------------------------ extras */

export function buildExtrasMenu() {
  const preview = nowPlayingPreview();
  const items = [
    { label: 'Relogio', chev: true, preview, onSelect: () => push(extras.createClockView()) },
    { label: 'Cronometro', chev: true, preview, onSelect: () => push(extras.createStopwatchView()) },
    { label: 'Sobre', chev: true, preview, onSelect: () => { extras.createAboutView().then(push); } },
  ];
  return createListView({ title: 'Extras', items });
}

/* ----------------------------------------------------------------- ajustes */

const BACKLIGHT_OPTIONS = [10, 30, 60, 0];
const backlightLabel = (v) => (v === 0 ? 'Sempre ligada' : `${v} segundos`);

export function buildSettingsMenu(selected) {
  const preview = nowPlayingPreview();
  const rebuild = (idx) => replaceTop(buildSettingsMenu(idx));

  const shuffleLabel = player.state.shuffle === 'off' ? 'Desligado' : 'Musicas';
  const repeatLabel = player.state.repeat === 'off' ? 'Desligado'
    : player.state.repeat === 'one' ? 'Uma' : 'Todas';

  const items = [
    {
      label: 'Adicionar Musicas', chev: true, preview,
      onSelect: () => { if (importHandler) importHandler(); },
    },
    {
      label: 'Aleatorio', value: shuffleLabel, preview,
      onSelect: () => { player.setShuffle(player.state.shuffle === 'off' ? 'songs' : 'off'); rebuild(1); },
    },
    {
      label: 'Repetir', value: repeatLabel, preview,
      onSelect: () => {
        const order = ['off', 'all', 'one'];
        player.setRepeat(order[(order.indexOf(player.state.repeat) + 1) % order.length]);
        rebuild(2);
      },
    },
    {
      label: 'Clicker', value: settings.clicker ? 'Ligado' : 'Desligado', preview,
      onSelect: () => {
        setSetting('clicker', !settings.clicker).then(() => {
          click.setEnabled(settings.clicker);
          rebuild(3);
        });
      },
    },
    {
      label: 'Luz de fundo', value: backlightLabel(settings.backlight), preview,
      onSelect: () => {
        const i = BACKLIGHT_OPTIONS.indexOf(settings.backlight);
        const next = BACKLIGHT_OPTIONS[(i + 1) % BACKLIGHT_OPTIONS.length];
        setSetting('backlight', next).then(() => { armBacklight(); rebuild(4); });
      },
    },
    {
      label: 'Acabamento', value: settings.theme === 'silver' ? 'Prata' : 'Grafite', preview,
      onSelect: () => {
        const next = settings.theme === 'silver' ? 'graphite' : 'silver';
        setSetting('theme', next).then(() => { ipodEl.dataset.theme = next; rebuild(5); });
      },
    },
    { label: 'Sobre', chev: true, preview, onSelect: () => { extras.createAboutView().then(push); } },
    { label: 'Restaurar ajustes', chev: true, preview, onSelect: () => push(buildConfirm(
      'Restaurar ajustes?', 'Restaurar',
      async () => {
        await resetSettings();
        click.setEnabled(settings.clicker);
        ipodEl.dataset.theme = settings.theme;
        armBacklight();
        pop(); replaceTop(buildSettingsMenu(7));
        toast('Ajustes restaurados');
      })) },
    { label: 'Apagar biblioteca', chev: true, preview, onSelect: () => push(buildConfirm(
      'Apagar TODAS as musicas?', 'Apagar tudo',
      async () => {
        player.pause();
        await lib.wipe();
        toast('Biblioteca apagada');
        resetToHome();
      })) },
  ];

  return createListView({ title: 'Ajustes', items, selected: selected || 0 });
}

function buildConfirm(question, confirmLabel, onConfirm) {
  const items = [
    { label: 'Cancelar', onSelect: () => pop() },
    { label: confirmLabel, onSelect: () => onConfirm() },
  ];
  return createListView({ title: question, items, split: false, selected: 0 });
}

/* ------------------------------------------------------- importacao (UI) */

export function showImportProgress() {
  const view = extras.createImportView();
  push(view);
  return view;
}
