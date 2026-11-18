// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, play, paused, help and
// wasted. ?seed=N fixes the city; ?shot=chase|street|fight|beach (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.

import { MONEY, STEP } from './config.js';
import { createCity, PLACES } from './city.js';
import { makeRng } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_ACCEPT, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, ACTION_SAVE, createInput } from './input.js';
import { createPlayer, enterCar, exitCar, nearestCar, startReload, updateAim, updatePlayerOnFoot } from './player.js';
import { populateWorld, updateEntities } from './entities.js';
import { startMission, updateMission } from './missions.js';
import { loadSave, saveGame as persistSave } from './save.js';
import { createRenderer, SCREEN_HELP, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How close the player must drive to Lou's Spray Shop to get a fresh paint job. */
const SPRAY_RADIUS = 110;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

/** Build a fresh game: the city, the player at the safehouse, the traffic and the crowd. */
function createGame() {
  const rng = makeRng(seed);
  const city = createCity(seed);
  const G = {
    seed, rng, city, time: 0, screen: SCREEN_TITLE,
    player: createPlayer(PLACES.safehouse.x, PLACES.safehouse.y + 130),
    playerCar: null, cars: [], peds: [], bullets: [], particles: [], pickups: [],
    wanted: { stars: 0, lastCrime: -999, quietTimer: 0, spawnTimer: 0 },
    mission: null, briefing: null, toasts: [],
    money: MONEY.start, stats: { missionsDone: 0, kills: 0, carsStolen: 0 },
    camera: { x: 0, y: 0, sx: 0, sy: 0 },
    attract: { x: 1300, y: 1300, angle: 0 },
    shake: 0, hoverButton: null,
    saveMoney: 0, saveMissions: 0,
    input, audio,
    toast(text) {
      this.toasts.push({ text, timer: 4 });
      if (this.toasts.length > 4) this.toasts.shift();
    },
    saveGame() {
      const ok = persistSave(this);
      if (ok) this.toast('Game saved.');
      return ok;
    },
  };
  populateWorld(G);
  const save = loadSave();
  if (save) {
    G.saveMoney = save.money;
    G.saveMissions = save.missionsDone;
  }
  return G;
}

const G = createGame();

/** One fixed step of the live game (also what the screenshot scenes drive). */
function stepGame(dt) {
  G.time += dt;
  if (G.briefing) {
    G.briefing.timer -= dt;
    if (G.briefing.timer <= 0) G.briefing = null;
  }
  for (let i = G.toasts.length - 1; i >= 0; i -= 1) {
    G.toasts[i].timer -= dt;
    if (G.toasts[i].timer <= 0) G.toasts.splice(i, 1);
  }
  const mouse = input.mouse();
  updateAim(G, mouse, G.camera, renderer.view);
  // A scripted aim (the fight screenshot) overrides the mouse.
  if (G.aimTarget) {
    G.player.aimAngle = Math.atan2(G.aimTarget.y - G.player.y, G.aimTarget.x - G.player.x);
  }
  if (G.playerCar) {
    // Driving is advanced inside updateEntities, from the same held keys.
    if (G.player.invulnerable > 0) G.player.invulnerable -= dt;
  } else {
    updatePlayerOnFoot(G, input, dt);
  }
  updateEntities(G, dt);
  updateMission(G, dt);
  // Lou's Spray Shop: drive in with heat and $200, drive out clean.
  if (G.playerCar && G.wanted.stars > 0 && G.money >= MONEY.sprayCost
    && Math.hypot(G.player.x - PLACES.spray.x, G.player.y - PLACES.spray.y) < SPRAY_RADIUS) {
    G.money -= MONEY.sprayCost;
    G.wanted.stars = 0;
    G.wanted.quietTimer = 0;
    G.toast("Fresh paint at Lou's — the heat is gone. -$200.");
    audio.cash();
  }
  audio.setEngine(G.playerCar ? Math.min(1, Math.hypot(G.playerCar.vx, G.playerCar.vy) / 320) : 0);
}

G.step = stepGame;

function announce(message) {
  status.textContent = message;
}

function newGame() {
  const fresh = createGame();
  Object.keys(fresh).forEach((key) => { G[key] = fresh[key]; });
  G.screen = SCREEN_PLAY;
  G.money = MONEY.start;
  startMission(G, 0);
  announce('Palma City. Mission 1: Wheels Up. Steal a car and bring it to Mara\'s Garage.');
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  const fresh = createGame();
  Object.keys(fresh).forEach((key) => { G[key] = fresh[key]; });
  G.screen = SCREEN_PLAY;
  G.money = save.money;
  G.stats.missionsDone = save.missionsDone;
  G.stats.kills = save.kills;
  G.stats.carsStolen = save.carsStolen;
  G.player.x = save.player.x;
  G.player.y = save.player.y;
  G.player.hp = save.player.hp;
  G.player.ammo = save.player.ammo;
  G.player.ammoReserve = save.player.ammoReserve;
  G.time = save.playTime;
  if (save.missionIndex >= 6) {
    G.mission = { index: 6, done: true, stage: 0, timer: 0, hold: 0, killsDone: 0 };
  } else {
    startMission(G, save.missionIndex);
  }
  announce('Welcome back to Palma City.');
}

function respawn() {
  G.money = Math.max(0, G.money - MONEY.hospitalFee);
  G.player.hp = 100;
  G.player.x = PLACES.hospital.x;
  G.player.y = PLACES.hospital.y + 120;
  G.player.ammo = 12;
  G.player.ammoReserve = Math.max(G.player.ammoReserve, 24);
  G.wanted.stars = 0;
  G.playerCar = null;
  G.player.onFoot = true;
  G.screen = SCREEN_PLAY;
  G.toast('You wake up at Palma General. -$100.');
  announce('Back on the streets.');
}

/** Which menu button, if any, is under the mouse right now. */
function buttonUnderMouse() {
  const mouse = input.mouse();
  for (const b of renderer.buttons()) {
    if (mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) return b.id;
  }
  return null;
}

function handleMenuAction(id) {
  if (G.screen === SCREEN_TITLE) {
    if (id === 'new') newGame();
    else if (id === 'continue') continueGame();
    else if (id === 'help') G.screen = SCREEN_HELP;
  } else if (G.screen === SCREEN_HELP) {
    if (id === 'back') G.screen = G.returnScreen ?? SCREEN_TITLE;
  } else if (G.screen === SCREEN_PAUSED) {
    if (id === 'resume') G.screen = SCREEN_PLAY;
    else if (id === 'save') G.saveGame();
    else if (id === 'help') {
      G.returnScreen = SCREEN_PAUSED;
      G.screen = SCREEN_HELP;
    } else if (id === 'quit') G.screen = SCREEN_TITLE;
  } else if (G.screen === SCREEN_WASTED) {
    if (id === 'respawn') respawn();
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    G.toast(muted ? 'Sound off.' : 'Sound on.');
  }
  if (G.screen === SCREEN_TITLE || G.screen === SCREEN_HELP || G.screen === SCREEN_PAUSED || G.screen === SCREEN_WASTED) {
    if (actions & ACTION_ACCEPT) {
      const id = buttonUnderMouse();
      if (id) handleMenuAction(id);
      else if (G.screen === SCREEN_TITLE) newGame();
      else if (G.screen === SCREEN_WASTED) respawn();
      else if (G.screen === SCREEN_PAUSED) G.screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE && G.screen === SCREEN_PAUSED) G.screen = SCREEN_PLAY;
    return;
  }
  // Playing.
  if (actions & ACTION_PAUSE) {
    G.screen = SCREEN_PAUSED;
    announce('Paused.');
    return;
  }
  if (actions & ACTION_SAVE) {
    G.saveGame();
    return;
  }
  if (actions & ACTION_ENTER) {
    if (G.playerCar) exitCar(G);
    else {
      const car = nearestCar(G);
      if (car) enterCar(G, car);
    }
  }
  if (actions & ACTION_RELOAD) startReload(G);
}

function runShot(name) {
  stageShot(name, G);
  // Snap the camera onto the player so the first painted frame is the scene.
  const vw = renderer.view.cssW / renderer.view.scale;
  const vh = renderer.view.cssH / renderer.view.scale;
  G.camera.x = Math.max(0, Math.min(Math.max(0, 2600 - vw), G.player.x - vw / 2));
  G.camera.y = Math.max(0, Math.min(Math.max(0, 2600 - vh), G.player.y - vh / 2));
  let painted = 0;
  function paint() {
    renderer.draw(G, G.screen, loadSave() !== null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // Hover state for the menu buttons.
    G.hoverButton = (G.screen === SCREEN_TITLE || G.screen === SCREEN_HELP || G.screen === SCREEN_PAUSED || G.screen === SCREEN_WASTED)
      ? buttonUnderMouse()
      : null;
    if (G.screen === SCREEN_TITLE) {
      // Attract mode: drift the camera over downtown while traffic moves.
      G.attract.angle += 0.0004;
      G.attract.x = 1300 + Math.cos(G.attract.angle) * 260;
      G.attract.y = 1300 + Math.sin(G.attract.angle * 0.7) * 200;
      while (accumulator >= STEP) {
        G.time += STEP;
        updateEntities(G, STEP);
        accumulator -= STEP;
      }
    } else if (G.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepGame(STEP);
        accumulator -= STEP;
        if (G.screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
    }
    const save = loadSave();
    renderer.draw(G, G.screen, save !== null);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === SCREEN_PLAY) {
      G.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Palma City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// For play-testing and screenshots: the whole game, inspectable from the console.
window.PALMA = G;

if (shot) runShot(shot);
else runGame();
