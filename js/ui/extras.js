/* =========================================================================
   ui/extras.js — telas auxiliares: Relogio, Cronometro, Sobre, Busca
   ========================================================================= */

import { el, esc, fmtTime, fmtBytes, plural, PLACEHOLDER_ART } from '../util.js';
import * as lib from '../library.js';
import * as db from '../db.js';

/* ------------------------------------------------------------- relogio */

export function createClockView() {
  const root = el('div', 'clock-view');
  const t = el('div', 't');
  const d = el('div', 'd');
  root.append(t, d);

  function tick() {
    const now = new Date();
    t.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    d.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick();
  const timer = setInterval(tick, 1000);

  return {
    root, title: 'Relogio', fullscreen: true,
    onScroll() {}, onButton() { return false; },
    destroy() { clearInterval(timer); },
  };
}

/* ---------------------------------------------------------- cronometro */

export function createStopwatchView() {
  const root = el('div', 'stopwatch');
  const t = el('div', 'sw-t', '0:00.0');
  const h = el('div', 'sw-h', 'Centro: iniciar/parar  |  >>: zerar');
  root.append(t, h);

  let running = false, base = 0, acc = 0, raf = 0;

  function fmt(ms) {
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const dec = Math.floor((total * 10) % 10);
    return `${m}:${String(s).padStart(2, '0')}.${dec}`;
  }
  function loop() {
    t.textContent = fmt(acc + (running ? performance.now() - base : 0));
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    root, title: 'Cronometro', fullscreen: true,
    onScroll() {},
    onButton(name) {
      if (name === 'center') {
        if (running) { acc += performance.now() - base; running = false; }
        else { base = performance.now(); running = true; }
        return true;
      }
      if (name === 'next') { running = false; acc = 0; return true; }
      return false;
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}

/* --------------------------------------------------------------- sobre */

export async function createAboutView() {
  const root = el('div', 'pane');
  const est = await db.estimate();
  const persisted = (navigator.storage && navigator.storage.persisted) ? await navigator.storage.persisted().catch(() => false) : false;
  const totalSecs = lib.index.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const totalBytes = lib.index.tracks.reduce((s, t) => s + (t.size || 0), 0);

  root.innerHTML = `
    <h2>Sobre</h2>
    <dl>
      <dt>Musicas</dt><dd>${lib.index.tracks.length}</dd>
      <dt>Albuns</dt><dd>${lib.index.albums.length}</dd>
      <dt>Artistas</dt><dd>${lib.index.artists.length}</dd>
      <dt>Playlists</dt><dd>${lib.playlists.length}</dd>
      <dt>Duracao total</dt><dd>${fmtTime(totalSecs)}</dd>
      <dt>Tamanho</dt><dd>${fmtBytes(totalBytes)}</dd>
      <dt>Disco usado</dt><dd>${fmtBytes(est.usage || 0)}</dd>
      <dt>Disco disponivel</dt><dd>${est.quota ? fmtBytes(est.quota) : 'n/d'}</dd>
      <dt>Armazenam. persistente</dt><dd>${persisted ? 'Sim' : 'Nao'}</dd>
      <dt>Versao</dt><dd>1.0.0</dd>
    </dl>`;

  return {
    root, title: 'Sobre', fullscreen: true,
    onScroll() {}, onButton() { return false; }, destroy() {},
  };
}

/* --------------------------------------------------------------- busca */

const ALPHA = ['⌫', '␣', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')];

export function createSearchView(onOpenTrack) {
  const root = el('div', 'search-view');
  const q = el('div', 'sv-q');
  const alpha = el('div', 'sv-alpha');
  const res = el('div', 'sv-res');
  root.append(q, alpha, res);

  let query = '';
  let letter = 2;                 // comeca em "A"
  let focus = 'alpha';            // 'alpha' | 'results'
  let results = [];
  let sel = 0;

  alpha.innerHTML = ALPHA.map((c, i) => `<span data-i="${i}"${i === letter ? ' class="on"' : ''}>${esc(c)}</span>`).join('');
  const cells = Array.from(alpha.querySelectorAll('span'));

  function renderQuery() {
    q.innerHTML = `<b>${esc(query) || '<span style="color:#9aa0a8">Buscar...</span>'}</b><i></i>`;
  }

  function renderAlpha() {
    cells.forEach((c, i) => c.classList.toggle('on', i === letter && focus === 'alpha'));
  }

  function renderResults() {
    results = query ? lib.search(query) : [];
    if (sel >= results.length) sel = Math.max(0, results.length - 1);
    if (!results.length) {
      res.innerHTML = `<div style="padding:10px;font-size:12px;color:#6b6e76">${
        query ? 'Nenhum resultado' : '>> vai para os resultados | << volta ao teclado'}</div>`;
      return;
    }
    const start = Math.max(0, Math.min(sel - 3, results.length - 7));
    let html = '';
    for (let i = start; i < Math.min(results.length, start + 8); i++) {
      const t = results[i];
      html += `<div class="row${i === sel && focus === 'results' ? ' is-sel' : ''}">
        <img class="row__art" alt="" src="${PLACEHOLDER_ART}" data-artkey="${esc(t.albumKey)}">
        <span class="row__label">${esc(t.title)}</span></div>`;
    }
    res.innerHTML = html;
    res.querySelectorAll('img[data-artkey]').forEach((img) => {
      const cached = lib.artUrlCached(img.dataset.artkey);
      if (cached) img.src = cached;
      else lib.artUrl(img.dataset.artkey).then((u) => { if (u && img.isConnected) img.src = u; });
    });
  }

  function refresh() { renderQuery(); renderAlpha(); renderResults(); }
  refresh();

  return {
    root, title: 'Buscar', fullscreen: true,

    onScroll(dir, steps) {
      if (focus === 'alpha') {
        letter = Math.max(0, Math.min(ALPHA.length - 1, letter + dir * steps));
        renderAlpha();
      } else {
        sel = Math.max(0, Math.min(Math.max(0, results.length - 1), sel + dir * steps));
        renderResults();
      }
    },

    onButton(name) {
      if (name === 'center') {
        if (focus === 'alpha') {
          const c = ALPHA[letter];
          if (c === '⌫') query = query.slice(0, -1);
          else if (c === '␣') query += ' ';
          else query += c;
          sel = 0;
          refresh();
        } else if (results[sel]) {
          onOpenTrack(results[sel], results.map((t) => t.id), sel);
        }
        return true;
      }
      if (name === 'next') { focus = 'results'; refresh(); return true; }
      if (name === 'prev') { focus = 'alpha'; refresh(); return true; }
      return false;
    },

    destroy() {},
  };
}

/* ------------------------------------------------- progresso de importacao */

export function createImportView() {
  const root = el('div', 'empty');
  const h = el('h2', null, 'Importando musicas');
  const p = el('p');
  const barWrap = el('div');
  barWrap.style.cssText = 'width:200px;height:9px;border-radius:5px;background:#d7d9de;overflow:hidden';
  const bar = el('i');
  bar.style.cssText = 'display:block;height:100%;width:0%;background:linear-gradient(180deg,#9fc0ee,#2f63b5)';
  barWrap.appendChild(bar);
  root.append(h, barWrap, p);

  return {
    root, title: 'Importando', fullscreen: true, modal: true,
    update({ done, total, name, added }) {
      bar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
      p.textContent = `${done} de ${plural(total, 'arquivo', 'arquivos')}` + (name ? ` — ${name}` : '') + (added ? ` — ${added} adicionadas` : '');
    },
    finish(result) {
      h.textContent = 'Importacao concluida';
      bar.style.width = '100%';
      const parts = [`${plural(result.added, 'musica adicionada', 'musicas adicionadas')}`];
      if (result.skipped) parts.push(`${result.skipped} ja existiam`);
      if (result.failed) parts.push(`${result.failed} com erro`);
      if (result.unplayable.length) parts.push(`${result.unplayable.length} em formato nao suportado pelo navegador`);
      p.textContent = parts.join(' · ') + '. Pressione Menu para voltar.';
    },
    onScroll() {}, onButton() { return false; }, destroy() {},
  };
}
