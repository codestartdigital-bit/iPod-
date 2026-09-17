/* =========================================================================
   click.js — clicker do Click Wheel (sintetizado, sem arquivos de audio)
   -------------------------------------------------------------------------
   Reproduz um estalo curto a cada passo da roda, como o alto-falante
   piezoeletrico do iPod. Usa um contexto proprio para nao interferir na
   reproducao musical.
   ========================================================================= */

let ctx = null;
let buffer = null;
let enabled = true;
let lastAt = 0;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 0.012);          // 12 ms
  buffer = ctx.createBuffer(1, len, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    // ruido com decaimento exponencial = estalo seco
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6) * 0.5;
  }
  return ctx;
}

/** Deve ser chamado dentro de um gesto do usuario (exigencia do iOS). */
export function unlock() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setEnabled(v) { enabled = !!v; }
export function isEnabled() { return enabled; }

export function click() {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastAt < 18) return;                 // limita em giros muito rapidos
  lastAt = now;

  const c = ensureContext();
  if (!c || c.state !== 'running') return;
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = 0.35;
  src.buffer = buffer;
  src.connect(gain).connect(c.destination);
  src.start();
}

/** Vibracao curta onde houver suporte (Android; iOS ignora). */
export function haptic() {
  if (!enabled) return;
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) { /* noop */ } }
}
