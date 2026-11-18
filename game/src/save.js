// Save and load: one localStorage slot holding the player's money, story
// progress, position, health and stats. Autosaves on mission complete; the
// pause menu offers a manual save, and the title screen offers Continue.

import { SAVE_KEY } from './config.js';

/** Snapshot the parts of `G` worth keeping between visits. */
export function saveGame(G) {
  try {
    const data = {
      version: 1,
      money: G.money,
      missionIndex: G.mission ? G.mission.index : 0,
      missionsDone: G.stats.missionsDone,
      kills: G.stats.kills,
      carsStolen: G.stats.carsStolen,
      player: { x: G.player.x, y: G.player.y, hp: G.player.hp, ammo: G.player.ammo, ammoReserve: G.player.ammoReserve },
      playTime: G.time,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read the save slot, or null when there is none or it does not parse. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists to continue from. */
export function hasSave() {
  return loadSave() !== null;
}
