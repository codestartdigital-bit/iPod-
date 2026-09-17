/* =========================================================================
   ui/nowplaying.js — tela "Tocando Agora"
   -------------------------------------------------------------------------
   O botao central percorre os modos do iPod:
     volume  ->  scrub (barra de progresso)  ->  avaliacao  ->  volume
   Sem interacao por 5 s, volta para volume (mesmo comportamento do aparelho).
   ========================================================================= */

import { el, fmtTime, fmtRemaining, PLACEHOLDER_ART } from '../util.js';
import * as lib from '../library.js';
import * as player from '../audio.js';
import * as db from '../db.js';

const MODES = ['volume', 'scrub', 'rating'];
const MODE_TIMEOUT = 5000;

export function createNowPlayingView() {
  const root = el('div', 'np');

  const main = el('div', 'np__main');
  const artWrap = el('div', 'np__artwrap');
  const art = el('img', 'np__art');
  art.alt = '';
  artWrap.appendChild(art);

  const meta = el('div', 'np__meta');
  const idx = el('div', 'np__idx');
  const title = el('div', 'np__title');
  const artist = el('div', 'np__artist');
  const album = el('div', 'np__album');
  const badges = el('div', 'np__badges');
  meta.append(idx, title, artist, album, badges);
  main.append(artWrap, meta);

  const bottom = el('div', 'np__bottom');
  const times = el('div', 'np__times');
  const tCur = el('span'), tRem = el('span');
  times.append(tCur, tRem);
  const bar = el('div', 'np__bar');
  const fill = el('div', 'np__fill');
  bar.appendChild(fill);
  const modeLine = el('div', 'np__mode');
  bottom.append(times, bar, modeLine);

  root.append(main, bottom);

  let mode = 'volume';
  let modeTimer = 0;
  let scrubTarget = null;         // posicao provisoria durante o scrub
  let artToken = 0;
  const unsubs = [];

  /* ------------------------------------------------------------ render */

  function renderTrack() {
    const t = player.currentTrack();
    if (!t) {
      title.textContent = 'Nada tocando';
      artist.textContent = ''; album.textContent = ''; idx.textContent = '';
      art.src = PLACEHOLDER_ART;
      return;
    }
    title.textContent = t.title;
    artist.textContent = t.artist;
    album.textContent = t.album + (t.year ? `  (${t.year})` : '');
    idx.textContent = `${player.queueIndex()} de ${player.queueLength()}`;

    const token = ++artToken;
    const cached = lib.artUrlCached(t.albumKey);
    if (cached) art.src = cached;
    else {
      art.src = PLACEHOLDER_ART;
      lib.artUrl(t.albumKey).then((url) => { if (url && token === artToken) art.src = url; });
    }
    renderBadges(t);
  }

  function renderBadges(t) {
    const b = [];
    if (player.state.shuffle !== 'off') b.push('Aleatorio');
    if (player.state.repeat === 'all') b.push('Repetir tudo');
    if (player.state.repeat === 'one') b.push('Repetir uma');
    if (t && t.rating) b.push('&#9733;'.repeat(t.rating));
    badges.innerHTML = b.map((x) => `<span>${x}</span>`).join('');
  }

  function renderTime() {
    const { currentTime, duration } = player.getTime();
    const cur = scrubTarget != null ? scrubTarget : currentTime;
    tCur.textContent = fmtTime(cur);
    tRem.textContent = duration ? fmtRemaining(cur, duration) : '--:--';
    fill.style.width = duration ? `${Math.min(100, (cur / duration) * 100)}%` : '0%';
  }

  function renderMode() {
    root.classList.toggle('np--scrub', mode === 'scrub');
    const t = player.currentTrack();
    if (mode === 'volume') {
      modeLine.innerHTML = `Volume <span style="display:inline-block;width:80px;height:6px;border-radius:3px;background:#c3c6cc;vertical-align:middle;overflow:hidden">
        <i style="display:block;height:100%;width:${Math.round(player.state.volume * 100)}%;background:#2f63b5"></i></span>`;
    } else if (mode === 'scrub') {
      modeLine.textContent = 'Avancar / retroceder';
    } else {
      const r = t ? (t.rating || 0) : 0;
      modeLine.innerHTML = `<span class="stars">${'&#9733;'.repeat(r)}${'&#9734;'.repeat(5 - r)}</span>`;
    }
  }

  function armModeTimeout() {
    clearTimeout(modeTimer);
    if (mode === 'volume') return;
    modeTimer = setTimeout(() => {
      if (mode === 'scrub' && scrubTarget != null) { player.seek(scrubTarget); scrubTarget = null; }
      mode = 'volume';
      renderMode(); renderTime();
    }, MODE_TIMEOUT);
  }

  /* ------------------------------------------------------- assinaturas */

  unsubs.push(player.on('track', () => { renderTrack(); renderTime(); }));
  unsubs.push(player.on('time', renderTime));
  unsubs.push(player.on('state', () => { renderBadges(player.currentTrack()); renderMode(); }));
  unsubs.push(player.on('volume', () => { if (mode === 'volume') renderMode(); }));

  renderTrack();
  renderTime();
  renderMode();

  /* --------------------------------------------------------- interface */

  return {
    root,
    title: 'Tocando Agora',
    isNowPlaying: true,

    onScroll(dir, steps) {
      if (mode === 'volume') {
        player.setVolume(player.state.volume + dir * 0.04 * steps);
        renderMode();
        return;
      }
      if (mode === 'scrub') {
        const { currentTime, duration } = player.getTime();
        if (!duration) return;
        const base = scrubTarget != null ? scrubTarget : currentTime;
        const stepSec = Math.max(1, duration / 120) * steps;
        scrubTarget = Math.max(0, Math.min(duration, base + dir * stepSec));
        renderTime();
        armModeTimeout();
        return;
      }
      if (mode === 'rating') {
        const t = player.currentTrack();
        if (!t) return;
        const r = Math.max(0, Math.min(5, (t.rating || 0) + dir * (steps > 1 ? 1 : 1)));
        if (r !== t.rating) {
          t.rating = r;
          db.updateTrack(t.id, { rating: r });
          renderMode(); renderBadges(t);
        }
        armModeTimeout();
      }
    },

    onButton(name) {
      if (name !== 'center') return false;
      if (mode === 'scrub' && scrubTarget != null) { player.seek(scrubTarget); scrubTarget = null; }
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      renderMode(); renderTime(); armModeTimeout();
      return true;
    },

    onEnter() { mode = 'volume'; renderTrack(); renderTime(); renderMode(); },

    destroy() {
      clearTimeout(modeTimer);
      for (const u of unsubs) u();
    },
  };
}
