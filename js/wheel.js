/* =========================================================================
   wheel.js — motor de gestos do Click Wheel
   -------------------------------------------------------------------------
   Converte toque/mouse/teclado nos eventos logicos do iPod:
     scroll   { dir: -1|1, steps }   giro do aro, com aceleracao
     button   'menu'|'prev'|'next'|'playpause'|'center'   toque curto
     hold     idem                                       toque longo (>550ms)
     holdend  idem                                       fim do toque longo

   Regras herdadas do aparelho original:
     - girar sobre o aro rola a lista; o botao sob o dedo e cancelado
     - o botao central nunca gira
     - segurar >> / << faz avanco/retrocesso rapido
   ========================================================================= */

const STEP_DEG = 14;        // graus por "clique" do aro
const HOLD_MS = 550;        // limiar de toque longo
const CANCEL_DEG = 10;      // giro que cancela o toque no botao

const listeners = new Map();

function emit(evt, payload) {
  const set = listeners.get(evt);
  if (set) for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
}

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

/* ------------------------------------------------------------- estado */

let wheelEl = null;
let active = false;
let pointerId = null;
let cx = 0, cy = 0, outerR = 0, innerR = 0;
let lastAngle = 0;
let accumDeg = 0;          // acumulado desde o ultimo tick
let totalDeg = 0;          // acumulado absoluto do gesto
let lastTickAt = 0;
let pendingBtn = null;
let holdTimer = 0;
let holdFired = false;
let onRing = false;

const angleAt = (x, y) => Math.atan2(y - cy, x - cx) * 180 / Math.PI;

function measure() {
  const r = wheelEl.getBoundingClientRect();
  cx = r.left + r.width / 2;
  cy = r.top + r.height / 2;
  outerR = r.width / 2;
  innerR = outerR * 0.42;   // raio do botao central (ver CSS)
}

function btnOf(target) {
  const el = target && target.closest ? target.closest('[data-btn]') : null;
  return el ? el.dataset.btn : null;
}

/* ----------------------------------------------------------- gestos */

function onDown(ev) {
  if (active) return;
  measure();

  const x = ev.clientX, y = ev.clientY;
  const dist = Math.hypot(x - cx, y - cy);
  onRing = dist > innerR && dist <= outerR + 6;

  active = true;
  pointerId = ev.pointerId;
  lastAngle = angleAt(x, y);
  accumDeg = 0;
  totalDeg = 0;
  lastTickAt = performance.now();
  holdFired = false;
  pendingBtn = btnOf(ev.target);

  wheelEl.classList.add('is-down');
  try { wheelEl.setPointerCapture(pointerId); } catch (_) { /* noop */ }

  if (pendingBtn) {
    clearTimeout(holdTimer);
    const btn = pendingBtn;
    holdTimer = setTimeout(() => {
      if (!active || pendingBtn !== btn) return;
      holdFired = true;
      emit('hold', btn);
    }, HOLD_MS);
  }
  ev.preventDefault();
}

function onMove(ev) {
  if (!active || ev.pointerId !== pointerId) return;
  ev.preventDefault();
  if (!onRing) return;                     // giro so vale no aro

  const a = angleAt(ev.clientX, ev.clientY);
  let d = a - lastAngle;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  lastAngle = a;

  accumDeg += d;
  totalDeg += Math.abs(d);

  if (pendingBtn && totalDeg > CANCEL_DEG) {   // virou giro, nao toque
    pendingBtn = null;
    clearTimeout(holdTimer);
  }

  while (Math.abs(accumDeg) >= STEP_DEG) {
    const dir = accumDeg > 0 ? 1 : -1;
    accumDeg -= dir * STEP_DEG;

    const now = performance.now();
    const dt = now - lastTickAt;
    lastTickAt = now;
    // aceleracao: giros rapidos avancam varias linhas por clique
    const steps = dt < 22 ? 4 : dt < 38 ? 3 : dt < 60 ? 2 : 1;
    emit('scroll', { dir, steps });
  }
}

function onUp(ev) {
  if (!active || (ev && ev.pointerId !== pointerId)) return;
  active = false;
  clearTimeout(holdTimer);
  wheelEl.classList.remove('is-down');
  try { wheelEl.releasePointerCapture(pointerId); } catch (_) { /* noop */ }

  if (pendingBtn) {
    if (holdFired) emit('holdend', pendingBtn);
    else emit('button', pendingBtn);
  }
  pendingBtn = null;
  pointerId = null;
}

/* ------------------------------------------------- mouse wheel / teclado */

let wheelAccum = 0;
function onWheelEvent(ev) {
  ev.preventDefault();
  wheelAccum += ev.deltaY;
  const unit = 40;
  while (Math.abs(wheelAccum) >= unit) {
    const dir = wheelAccum > 0 ? 1 : -1;
    wheelAccum -= dir * unit;
    emit('scroll', { dir, steps: 1 });
  }
}

const KEY_BTN = {
  Escape: 'menu', Backspace: 'menu',
  ArrowLeft: 'prev', ArrowRight: 'next',
  Enter: 'center', ' ': 'playpause', Spacebar: 'playpause',
};

const keyHeld = new Set();

function onKeyDown(ev) {
  if (ev.key === 'ArrowDown') { emit('scroll', { dir: 1, steps: ev.shiftKey ? 5 : 1 }); ev.preventDefault(); return; }
  if (ev.key === 'ArrowUp') { emit('scroll', { dir: -1, steps: ev.shiftKey ? 5 : 1 }); ev.preventDefault(); return; }
  const btn = KEY_BTN[ev.key];
  if (!btn) return;
  ev.preventDefault();
  if (ev.repeat) {
    if (!keyHeld.has(btn)) { keyHeld.add(btn); emit('hold', btn); }
    return;
  }
  keyHeld.delete(btn);
}

function onKeyUp(ev) {
  const btn = KEY_BTN[ev.key];
  if (!btn) return;
  ev.preventDefault();
  if (keyHeld.has(btn)) { keyHeld.delete(btn); emit('holdend', btn); }
  else emit('button', btn);
}

/* --------------------------------------------------------------- init */

export function init(element) {
  wheelEl = element;
  wheelEl.addEventListener('pointerdown', onDown);
  wheelEl.addEventListener('pointermove', onMove);
  wheelEl.addEventListener('pointerup', onUp);
  wheelEl.addEventListener('pointercancel', onUp);
  wheelEl.addEventListener('lostpointercapture', onUp);
  wheelEl.addEventListener('contextmenu', (e) => e.preventDefault());
  wheelEl.addEventListener('wheel', onWheelEvent, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', () => setTimeout(measure, 120));
  measure();
}
