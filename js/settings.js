/* =========================================================================
   settings.js — preferencias do aparelho (persistidas no IndexedDB)
   ========================================================================= */

import * as db from './db.js';

const DEFAULTS = {
  clicker: true,
  backlight: 30,        // segundos; 0 = sempre ligada
  theme: 'graphite',    // 'graphite' | 'silver'
  clock24: true,
};

export const settings = Object.assign({}, DEFAULTS);

export async function load() {
  const saved = await db.kvGet('settings', null);
  if (saved) Object.assign(settings, DEFAULTS, saved);
  return settings;
}

export async function set(key, value) {
  settings[key] = value;
  await db.kvSet('settings', settings);
  return settings;
}

export async function reset() {
  Object.assign(settings, DEFAULTS);
  await db.kvSet('settings', settings);
  return settings;
}
