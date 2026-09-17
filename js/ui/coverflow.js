/* =========================================================================
   ui/coverflow.js — Cover Flow
   -------------------------------------------------------------------------
   Capas em 3D percorridas pela roda. O botao central abre a lista de faixas
   do album selecionado, como no iPod Classic.
   ========================================================================= */

import { el, PLACEHOLDER_ART } from '../util.js';
import * as lib from '../library.js';

const WINDOW = 5;            // capas visiveis de cada lado

export function createCoverFlowView(albums, onOpenAlbum, startIndex) {
  const root = el('div', 'cf');
  const stage = el('div', 'cf__stage');
  const caption = el('div', 'cf__caption');
  root.append(stage, caption);

  let sel = Math.min(Math.max(0, startIndex || 0), Math.max(0, albums.length - 1));
  const nodes = new Map();     // indice -> elemento

  if (!albums.length) {
    caption.innerHTML = '<b>Sem albuns</b><span>Adicione musicas primeiro</span>';
  }

  function nodeFor(i) {
    if (nodes.has(i)) return nodes.get(i);
    const alb = albums[i];
    const item = el('div', 'cf__item');
    const img = el('img');
    img.alt = '';
    img.src = PLACEHOLDER_ART;
    item.style.setProperty('--refl', `url("${PLACEHOLDER_ART}")`);
    item.appendChild(img);
    stage.appendChild(item);
    nodes.set(i, item);

    const cached = lib.artUrlCached(alb.key);
    const apply = (url) => {
      if (!url) return;
      img.src = url;
      item.style.setProperty('--refl', `url("${url}")`);
    };
    if (cached) apply(cached); else lib.artUrl(alb.key).then(apply);
    return item;
  }

  function layout() {
    const from = Math.max(0, sel - WINDOW);
    const to = Math.min(albums.length - 1, sel + WINDOW);

    for (const [i, node] of nodes) {
      if (i < from || i > to) { node.remove(); nodes.delete(i); }
    }
    for (let i = from; i <= to; i++) {
      const node = nodeFor(i);
      const d = i - sel;
      const sign = Math.sign(d);
      let tx, tz, ry, scale;
      if (d === 0) { tx = 0; tz = 72; ry = 0; scale = 1; }
      else {
        tx = sign * (44 + (Math.abs(d) - 1) * 21);
        tz = -Math.abs(d) * 22;
        ry = -sign * 58;
        scale = 0.92;
      }
      node.style.transform = `translate3d(${tx}px,0,${tz}px) rotateY(${ry}deg) scale(${scale})`;
      node.style.zIndex = String(100 - Math.abs(d));
      node.style.opacity = Math.abs(d) >= WINDOW ? '0' : '1';
    }

    const alb = albums[sel];
    if (alb) {
      caption.innerHTML = '';
      const b = el('b', null, alb.name);
      const s = el('span', null, alb.artist);
      caption.append(b, s);
    }
  }

  layout();

  return {
    root,
    title: 'Cover Flow',
    fullscreen: true,

    onScroll(dir, steps) {
      if (!albums.length) return;
      const before = sel;
      sel = Math.max(0, Math.min(albums.length - 1, sel + dir * steps));
      if (sel !== before) layout();
    },

    onButton(name) {
      if (name === 'center' && albums[sel]) { onOpenAlbum(albums[sel], sel); return true; }
      return false;
    },

    destroy() { nodes.clear(); },
  };
}
