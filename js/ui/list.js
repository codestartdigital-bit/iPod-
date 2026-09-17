/* =========================================================================
   ui/list.js — view de menu (lista + painel de preview do iPod 6G)
   -------------------------------------------------------------------------
   Renderizacao com janela deslizante: mesmo com 10.000 musicas apenas as
   linhas visiveis vao para o DOM.
   ========================================================================= */

import { el, clear, esc } from '../util.js';
import * as lib from '../library.js';
import { PLACEHOLDER_ART } from '../util.js';

const ROW_H = 25;
const VIEW_H = 218;                       // 240 - barra de status
const VISIBLE = Math.ceil(VIEW_H / ROW_H);

const CHEVRON =
  '<svg viewBox="0 0 7 11" width="7" height="11" aria-hidden="true">' +
  '<path d="M1 1l4.5 4.5L1 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * @param {Object} opts
 *  title      {string}
 *  items      {Array}  { label, value, chev, art, num, badge, preview, onSelect, onPlay }
 *  split      {boolean} mostra o painel direito (padrao: true)
 *  selected   {number}  indice inicial
 *  emptyText  {string}
 *  onSelectionChange {(item, idx)=>void}
 */
export function createListView(opts) {
  const items = opts.items || [];
  const split = opts.split !== false;

  const root = el('div', 'menu-view' + (split ? '' : ' no-split'));
  const listEl = el('div', 'menu-list');
  const innerEl = el('div', 'menu-list__inner');
  listEl.appendChild(innerEl);
  root.appendChild(listEl);

  let previewEl = null, previewArt = null, previewWrap = null, previewT1 = null, previewT2 = null;
  if (split) {
    previewEl = el('div', 'preview');
    previewWrap = el('div', 'preview__art-wrap');
    previewArt = el('img', 'preview__art');
    previewArt.alt = '';
    previewWrap.appendChild(previewArt);
    previewT1 = el('div', 'preview__t1');
    previewT2 = el('div', 'preview__t2');
    previewEl.append(previewWrap, previewT1, previewT2);
    root.appendChild(previewEl);
  }

  let sel = Math.min(Math.max(0, opts.selected || 0), Math.max(0, items.length - 1));
  let top = 0;
  let renderedTop = -1;

  if (!items.length) {
    const empty = el('div', 'empty');
    empty.innerHTML =
      `<h2>${esc(opts.emptyTitle || 'Vazio')}</h2>` +
      `<p>${esc(opts.emptyText || 'Nada para mostrar aqui.')}</p>`;
    listEl.appendChild(empty);
  }

  function ensureVisible() {
    if (sel < top) top = sel;
    else if (sel > top + VISIBLE - 2) top = sel - VISIBLE + 2;
    top = Math.max(0, Math.min(top, Math.max(0, items.length - VISIBLE + 1)));
  }

  function rowHTML(it, i) {
    const parts = [];
    if (it.num != null) parts.push(`<span class="row__num">${esc(it.num)}</span>`);
    if (it.art !== undefined) parts.push(`<img class="row__art" alt="" data-artkey="${esc(it.art || '')}" src="${PLACEHOLDER_ART}">`);
    parts.push(`<span class="row__label">${esc(it.label)}</span>`);
    if (it.value != null && it.value !== '') parts.push(`<span class="row__value">${esc(it.value)}</span>`);
    if (it.chev) parts.push(`<span class="row__chev">${CHEVRON}</span>`);
    const cls = 'row' + (i === sel ? ' is-sel' : '') + (it.playing ? ' is-playing' : '');
    return `<div class="${cls}" data-i="${i}">${parts.join('')}</div>`;
  }

  function render(force) {
    if (!items.length) return;
    ensureVisible();
    if (force || top !== renderedTop) {
      const end = Math.min(items.length, top + VISIBLE + 1);
      let html = '';
      for (let i = top; i < end; i++) html += rowHTML(items[i], i);
      innerEl.innerHTML = html;
      innerEl.style.transform = 'translateY(0)';
      renderedTop = top;
      loadRowArt();
    } else {
      const prev = innerEl.querySelector('.row.is-sel');
      if (prev) prev.classList.remove('is-sel');
      const cur = innerEl.querySelector(`.row[data-i="${sel}"]`);
      if (cur) cur.classList.add('is-sel');
    }
    updatePreview();
  }

  function loadRowArt() {
    innerEl.querySelectorAll('img.row__art[data-artkey]').forEach((img) => {
      const key = img.dataset.artkey;
      if (!key) return;
      const cached = lib.artUrlCached(key);
      if (cached) { img.src = cached; return; }
      lib.artUrl(key).then((url) => { if (url && img.isConnected) img.src = url; });
    });
  }

  let previewToken = 0;
  function updatePreview() {
    if (!split) return;
    const it = items[sel];
    const p = (it && it.preview) || {};
    previewT1.textContent = p.t1 || '';
    previewT2.textContent = p.t2 || '';
    const token = ++previewToken;
    const key = p.art;
    if (!key) {
      previewArt.src = PLACEHOLDER_ART;
      previewWrap.style.setProperty('--refl', `url("${PLACEHOLDER_ART}")`);
      return;
    }
    const cached = lib.artUrlCached(key);
    const apply = (url) => {
      if (token !== previewToken) return;
      const src = url || PLACEHOLDER_ART;
      previewArt.src = src;
      previewWrap.style.setProperty('--refl', `url("${src}")`);
    };
    if (cached) apply(cached);
    else { apply(null); lib.artUrl(key).then(apply); }
  }

  render(true);

  /* --------------------------------------------------------- interface */

  return {
    root,
    title: opts.title || '',
    get selectedIndex() { return sel; },
    get selectedItem() { return items[sel] || null; },
    itemCount: items.length,

    onScroll(dir, steps) {
      if (!items.length) return;
      const before = sel;
      sel = Math.max(0, Math.min(items.length - 1, sel + dir * steps));
      if (sel === before) return;
      render(false);
      if (opts.onSelectionChange) opts.onSelectionChange(items[sel], sel);
    },

    onButton(name) {
      const it = items[sel];
      if (name === 'center') {
        if (it && it.onSelect) { it.onSelect(it, sel); return true; }
        return false;
      }
      if (name === 'playpause' && it && it.onPlay) { it.onPlay(it, sel); return true; }
      return false;
    },

    onHold(name) {
      const it = items[sel];
      if (name === 'center' && it && it.onHold) { it.onHold(it, sel); return true; }
      return false;
    },

    refreshRows() { renderedTop = -1; render(true); },

    destroy() { clear(root); },
  };
}

export { ROW_H, VISIBLE };
