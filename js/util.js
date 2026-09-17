/* =========================================================================
   util.js — utilitarios de formatacao e DOM
   ========================================================================= */

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtRemaining(cur, dur) {
  const left = Math.max(0, (dur || 0) - (cur || 0));
  return '-' + fmtTime(left);
}

export function fmtBytes(n) {
  if (!n) return '0 KB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Capa generica (nota musical) usada quando o album nao tem arte. */
export const PLACEHOLDER_ART =
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6f757f"/><stop offset="1" stop-color="#3b3f46"/>' +
    '</linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#g)"/>' +
    '<path d="M74 28v44a13 13 0 1 1-8-12V42l-24 6v34a13 13 0 1 1-8-12V44z" fill="#e9eaee" opacity=".92"/>' +
    '</svg>'
  );
