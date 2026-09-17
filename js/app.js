/* =========================================================================
   app.js — inicializacao e integracao
   -------------------------------------------------------------------------
   Amarra tudo: escala da tela, Click Wheel, importacao de arquivos,
   barra de status, restauracao de estado e service worker.
   ========================================================================= */

import * as db from './db.js';
import * as lib from './library.js';
import * as player from './audio.js';
import * as wheel from './wheel.js';
import * as click from './click.js';
import * as nav from './nav.js';
import { load as loadSettings, settings } from './settings.js';

const ipodEl = document.getElementById('ipod');
const frameEl = document.querySelector('.screen-frame');
const screenEl = document.getElementById('screen');
const wheelEl = document.getElementById('wheel');
const fileInput = document.getElementById('file-input');
const sbPlay = document.getElementById('sb-play');
const sbClock = document.getElementById('sb-clock');
const sbBattery = document.getElementById('sb-battery');

/* ======================================================= escala da tela */

/**
 * A tela e desenhada em 320x240 e escalada. A roda ocupa o espaco restante.
 * Proporcoes seguem o iPod Classic: tela em cima, roda grande embaixo.
 */
function layout() {
  const body = document.querySelector('.ipod__body');
  const cs = getComputedStyle(body);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = body.clientWidth - padX;
  const availH = body.clientHeight - padY;
  if (availW <= 0 || availH <= 0) return;

  const BEZEL = 16;                       // 8px de padding em cada lado
  const GAP = Math.max(10, availH * 0.03);

  // a tela nunca passa de 46% da altura util nem da largura disponivel
  const maxScreenH = availH * 0.50;
  const scale = Math.max(0.2, Math.min((availW - BEZEL) / 320, (maxScreenH - BEZEL) / 240));

  const frameW = Math.round(320 * scale + BEZEL);
  const frameH = Math.round(240 * scale + BEZEL);
  frameEl.style.width = frameW + 'px';
  frameEl.style.height = frameH + 'px';
  screenEl.style.setProperty('--sc', String(scale));

  const wheelSpace = availH - frameH - GAP;
  const size = Math.max(120, Math.min(availW * 0.72, wheelSpace * 0.86));
  wheelEl.style.setProperty('--wheel-size', Math.round(size) + 'px');
}

const relayout = () => requestAnimationFrame(layout);
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', () => setTimeout(relayout, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

/* ==================================================== barra de status */

function updateClock() {
  const now = new Date();
  sbClock.textContent = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', hour12: !settings.clock24,
  });
}

function updatePlayIcon() {
  if (!player.state.trackId) { sbPlay.removeAttribute('data-state'); return; }
  sbPlay.dataset.state = player.state.playing ? 'play' : 'pause';
}

async function initBattery() {
  const set = (level, charging) => {
    sbBattery.querySelector('i').style.setProperty('--lvl', Math.round(level * 100) + '%');
    sbBattery.dataset.charging = charging ? '1' : '0';
  };
  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      const sync = () => set(b.level, b.charging);
      sync();
      b.addEventListener('levelchange', sync);
      b.addEventListener('chargingchange', sync);
      return;
    } catch (_) { /* cai no padrao */ }
  }
  set(1, false);
}

/* ================================================ importacao de arquivos */

function requestImport() {
  // precisa ser chamado de forma sincrona dentro do gesto do usuario (iOS)
  fileInput.click();
}

async function handleFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;

  const view = nav.showImportProgress();
  let result;
  try {
    result = await lib.importFiles(list, (p) => view.update(p));
    await lib.rebuild();
    await lib.loadPlaylists();
  } catch (err) {
    console.error('[app] importacao falhou', err);
    nav.toast('Falha ao importar');
    nav.pop();
    return;
  }

  view.finish(result);
  // ao sair da tela de importacao, o menu principal e reconstruido
  view.onButton = (name) => {
    if (name === 'menu') { nav.resetToHome(); return true; }
    return false;
  };
  if (result.added) db.requestPersistence();
}

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  handleFiles(files);
  fileInput.value = '';
});

/* arrastar e soltar (desktop) */
['dragenter', 'dragover'].forEach((e) =>
  window.addEventListener(e, (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; }));
window.addEventListener('drop', (ev) => {
  ev.preventDefault();
  const files = ev.dataTransfer && ev.dataTransfer.files;
  if (files && files.length) handleFiles(files);
});

/* ============================================== bloqueios do navegador */

// impede zoom por duplo toque e gestos de pinca dentro do aparelho
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ======================================================= inicializacao */

async function boot() {
  layout();
  updateClock();
  setInterval(updateClock, 10000);
  initBattery();

  await loadSettings();
  ipodEl.dataset.theme = settings.theme;
  ipodEl.dataset.backlight = 'on';
  click.setEnabled(settings.clicker);

  try {
    await db.open();
    await lib.rebuild();
    await lib.loadPlaylists();
    await player.restore();
  } catch (err) {
    console.error('[app] falha ao abrir a biblioteca', err);
    nav.toast('Armazenamento indisponivel neste navegador', 4000);
  }

  nav.setImportHandler(requestImport);
  nav.resetToHome();
  nav.armBacklight();

  // eventos do Click Wheel -> navegacao
  wheel.init(wheelEl);
  wheel.on('scroll', ({ dir, steps }) => nav.handleScroll(dir, steps));
  wheel.on('button', (name) => nav.handleButton(name));
  wheel.on('hold', (name) => nav.handleHold(name));
  wheel.on('holdend', (name) => nav.handleHoldEnd(name));

  // libera o audio do clicker no primeiro toque (exigencia do iOS)
  const unlockOnce = () => { click.unlock(); window.removeEventListener('pointerdown', unlockOnce); };
  window.addEventListener('pointerdown', unlockOnce);

  // barra de status reflete o player
  player.on('state', updatePlayIcon);
  player.on('track', updatePlayIcon);
  player.on('blocked', () => nav.toast('Toque em ▶‖ para iniciar', 2200));
  player.on('error', (msg) => nav.toast(String(msg), 2600));
  updatePlayIcon();

  layout();
}

boot();

/* ==================================================== service worker */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('[app] service worker nao registrado', err);
    });
  });
}
