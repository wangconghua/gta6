// Saving and loading: cash, story progress and where Jay stands, kept in
// this browser's localStorage so a session can pick up where it left off.

import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      cash: state.player.cash,
      missionIndex: state.missions.index,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      packages: state.packagesFound,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage may be unavailable; a fresh start is the fallback.
  }
}
