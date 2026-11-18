// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between six screens: title, play, paused, busted, wasted and the
// end of the story.
//
// ?seed=N fixes the city. ?shot=cover|street|mission|title stages that
// scene instead of running the loop, paints it and sets window.__shotReady
// for a screenshot. ?test=1 runs the scripted self-checks and writes the
// results into the page for the test runner to read.

import { FONT } from './config.js';
import { makeRng } from './random.js';
import { createState, addToast, advanceDialogue, stepGame } from './game.js';
import { carXY } from './entities.js';
import { enterCar } from './player.js';
import { attachInput, endFrameInput, makeInput } from './input.js';
import { makeAudio, playSound, toggleMute, unlockAudio, updateEngine, updateMusic, updateSiren } from './audio.js';
import { SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED, makeCamera, render, updateCamera } from './render.js';
import { stageShot } from './shots.js';
import { clearSave, readSave, writeSave } from './save.js';
import { startMission } from './missions.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const testMode = params.get('test') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const state = createState(seed);
state.camera = makeCamera();
state.save = readSave();
const input = makeInput();
attachInput(input, canvas);
const audio = makeAudio();

let screen = SCREEN_TITLE;
let menuAction = null;

function setScreen(next) {
  screen = next;
  if (statusEl) {
    statusEl.textContent = next === SCREEN_PLAY ? 'Playing Solmar City' : next;
  }
}

function startNewGame() {
  const fresh = createState(state.seed);
  Object.assign(state, fresh);
  state.camera = makeCamera();
  state.save = readSave();
  startMission(state.missions, state);
  advanceDialogue(state);
  setScreen(SCREEN_PLAY);
}

function continueGame() {
  const save = state.save;
  if (!save) return;
  state.player.cash = save.cash || 0;
  state.player.x = save.x || state.player.x;
  state.player.y = save.y || state.player.y;
  state.missions.index = save.missionIndex || 0;
  state.packagesFound = save.packages || 0;
  setScreen(SCREEN_PLAY);
}

function startRoam() {
  state.missions.index = 3;
  state.missions.done = true;
  setScreen(SCREEN_PLAY);
}

function respawnAt(spotsKey) {
  const spot = state.city.spots[spotsKey];
  state.player.x = spot.x;
  state.player.y = spot.y + 50;
  state.player.car = null;
  state.player.health = 100;
  state.player.wasted = false;
  state.wanted = 0;
  state.cops.length = 0;
  state.copCars.length = 0;
  state.bullets.length = 0;
  setScreen(SCREEN_PLAY);
}

function handleFiredEvents(fired) {
  for (const ev of fired) {
    switch (ev.type) {
      case 'shoot': playSound(audio, 'shoot'); break;
      case 'copShoot': playSound(audio, 'copShoot'); break;
      case 'crash': playSound(audio, 'crash'); break;
      case 'reload': playSound(audio, 'reload'); break;
      case 'dryfire': playSound(audio, 'dryfire'); break;
      case 'enter': case 'steal': playSound(audio, 'enter'); break;
      case 'package': case 'stepDone': playSound(audio, 'pickup'); break;
      case 'missionComplete':
        playSound(audio, 'mission');
        writeSave(state);
        if (state.missions.done) setScreen(SCREEN_STORY);
        break;
      case 'busted':
        playSound(audio, 'busted');
        state.player.cash = Math.max(0, state.player.cash - 200);
        setScreen(SCREEN_BUSTED);
        break;
      case 'wasted':
        playSound(audio, 'wasted');
        setScreen(SCREEN_WASTED);
        break;
      default: break;
    }
  }
  if (state.player.health <= 0 && screen === SCREEN_PLAY) {
    state.player.health = 0;
    state.player.cash = Math.floor(state.player.cash * 0.9);
    playSound(audio, 'wasted');
    setScreen(SCREEN_WASTED);
  }
}

function titleClick(mx, my) {
  for (const item of state.menuItems || []) {
    if (mx >= 1280 / 2 - 230 && mx <= 1280 / 2 + 230 && my >= item.y && my <= item.y + item.h) {
      menuAction = item.action;
      return;
    }
  }
}

canvas.addEventListener('click', () => {
  unlockAudio(audio);
  if (screen === SCREEN_TITLE) titleClick(input.mouseX, input.mouseY);
});

let lastTime = 0;
function frame(time) {
  const dt = Math.min(MAX_FRAME, (time - lastTime) / 1000 || STEP);
  lastTime = time;
  const t = time / 1000;

  if (input.mute) toggleMute(audio);
  if (screen === SCREEN_TITLE) {
    if (input.anyKey) unlockAudio(audio);
    // Keyboard menu: 1 start, 2 continue, 3 free roam.
    if (input.enterPressed) menuAction = 'start';
    const pressed = window.__pressedKeys;
    if (pressed && pressed.has('Digit1')) menuAction = 'start';
    if (pressed && pressed.has('Digit2') && state.save) menuAction = 'continue';
    if (pressed && pressed.has('Digit3')) menuAction = 'roam';
    if (menuAction === 'start') startNewGame();
    else if (menuAction === 'continue') continueGame();
    else if (menuAction === 'roam') startRoam();
    menuAction = null;
    // Hover highlight for the menu buttons.
    state.menuHover = null;
    for (const item of state.menuItems || []) {
      if (input.mouseX >= 410 && input.mouseX <= 870 && input.mouseY >= item.y && input.mouseY <= item.y + item.h) {
        state.menuHover = item.action;
      }
    }
    updateCamera(state.camera, state, dt);
    render(canvas.getContext('2d'), state, SCREEN_TITLE, t);
  } else if (screen === SCREEN_PLAY) {
    // Dialogue first: E or click advances it, the world waits.
    if (state.dialogueLine && (input.interactPressed || input.enterPressed)) {
      advanceDialogue(state);
      endFrameInput(input);
      render(canvas.getContext('2d'), state, SCREEN_PLAY, t);
      requestAnimationFrame(frame);
      return;
    }
    if (input.pause) {
      setScreen(SCREEN_PAUSED);
    } else {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(STEP, remaining);
        const fired = stepGame(state, input, step);
        handleFiredEvents(fired);
        remaining -= step;
        if (screen !== SCREEN_PLAY) break;
      }
      updateCamera(state.camera, state, dt);
      updateSiren(audio, state.copCars.length > 0);
      updateEngine(audio, state.player.car ? Math.abs(state.player.car.speed) / 560 : 0);
      updateMusic(audio, dt, true);
    }
    render(canvas.getContext('2d'), state, SCREEN_PLAY, t);
  } else if (screen === SCREEN_PAUSED) {
    if (input.pause) setScreen(SCREEN_PLAY);
    if (window.__pressedKeys && window.__pressedKeys.has('KeyS')) writeSave(state);
    if (window.__pressedKeys && window.__pressedKeys.has('KeyQ')) { state.save = readSave(); setScreen(SCREEN_TITLE); }
    render(canvas.getContext('2d'), state, SCREEN_PAUSED, t);
  } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
    if (input.enterPressed || input.interactPressed) {
      respawnAt(screen === SCREEN_BUSTED ? 'police' : 'hospital');
    }
    render(canvas.getContext('2d'), state, screen, t);
  } else if (screen === SCREEN_STORY) {
    if (input.enterPressed || input.interactPressed) setScreen(SCREEN_PLAY);
    render(canvas.getContext('2d'), state, SCREEN_STORY, t);
  }

  endFrameInput(input);
  requestAnimationFrame(frame);
}

// Track raw key codes for the menu shortcuts (1/2/3, S, Q).
window.__pressedKeys = new Set();
window.addEventListener('keydown', (e) => window.__pressedKeys.add(e.code));
window.addEventListener('keyup', (e) => window.__pressedKeys.delete(e.code));

function runSelfTests() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
  const ctx = canvas.getContext('2d');

  // 1. The player walks: on an avenue, holding up for a second moves north.
  state.player.x = 520;
  state.player.y = 520;
  state.player.car = null;
  const y0 = state.player.y;
  for (let i = 0; i < 60; i += 1) stepGame(state, { ...input, up: true }, STEP);
  check('walk', state.player.y < y0 - 50, 'y ' + y0.toFixed(0) + ' -> ' + state.player.y.toFixed(0));

  // 2. Getting into a parked car works.
  const parked = state.cars[0];
  state.player.x = parked.x + 10;
  state.player.y = parked.y + 10;
  stepGame(state, { ...input, enterPressed: true }, STEP);
  check('enterCar', state.player.car === parked, state.player.car ? 'in car' : 'still on foot');

  // 3. Driving: gas for two seconds builds speed and moves the car.
  const cx0 = parked.x;
  const cy0 = parked.y;
  for (let i = 0; i < 120; i += 1) stepGame(state, { ...input, up: true }, STEP);
  const moved = Math.abs(parked.x - cx0) + Math.abs(parked.y - cy0);
  check('drive', Math.abs(parked.speed) > 100 && moved > 50, 'speed ' + parked.speed.toFixed(0) + ' moved ' + moved.toFixed(0));

  // 4. Shooting fires a bullet and spends ammo.
  const ammo0 = state.player.ammo;
  state.player.car = null;
  state.player.x = 1200;
  state.player.y = 600;
  state.player.aimAngle = 0;
  stepGame(state, { ...input, shoot: true }, STEP);
  check('shoot', state.bullets.length >= 1 && state.player.ammo === ammo0 - 1, 'bullets ' + state.bullets.length + ' ammo ' + state.player.ammo);

  // 5. The first mission advances when Jay reaches the warehouse.
  startMission(state.missions, state);
  const spot = state.city.spots.warehouse;
  state.player.x = spot.x;
  state.player.y = spot.y;
  for (let i = 0; i < 5; i += 1) stepGame(state, { ...input }, STEP);
  check('mission', state.missions.step >= 1, 'step ' + state.missions.step);

  // 6. Stealing a traffic car raises the wanted level.
  const w0 = state.wanted;
  const t = state.traffic[0];
  const tp = carXY(t);
  state.player.car = null;
  state.player.x = tp.x;
  state.player.y = tp.y;
  enterCar(state, { traffic: t, x: tp.x, y: tp.y });
  stepGame(state, { ...input }, STEP);
  check('wanted', state.wanted > w0, 'wanted ' + w0 + ' -> ' + state.wanted);

  // 7. Saving and loading round-trips the cash.
  state.player.cash = 1234;
  writeSave(state);
  const loaded = readSave();
  check('save', loaded && loaded.cash === 1234, loaded ? 'cash ' + loaded.cash : 'no save');

  // 8. The game renders a frame without throwing.
  let rendered = false;
  try {
    render(ctx, state, SCREEN_PLAY, 1.5);
    rendered = true;
  } catch (e) {
    rendered = false;
  }
  check('render', rendered, '');

  const passed = results.filter((r) => r.ok).length;
  const summary = 'SELFTEST ' + passed + '/' + results.length + ' ' + results.map((r) => (r.ok ? 'PASS' : 'FAIL') + ':' + r.name).join(' ');
  document.title = summary;
  window.__testResults = results;
  const pre = document.createElement('pre');
  pre.id = 'test-results';
  pre.textContent = summary + '\n' + results.map((r) => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + ' ' + r.detail).join('\n');
  document.body.appendChild(pre);
  return results;
}

if (testMode) {
  runSelfTests();
} else if (shot) {
  const staged = stageShot(shot, state);
  const ctx = canvas.getContext('2d');
  updateCamera(state.camera, state, 0.1);
  render(ctx, state, staged === 'title' ? SCREEN_TITLE : SCREEN_PLAY, 2.0);
  render(ctx, state, staged === 'title' ? SCREEN_TITLE : SCREEN_PLAY, 2.0);
  window.__shotReady = true;
} else {
  // A slow pan across the city behind the title screen.
  state.camera.x = 600;
  state.camera.y = 300;
  requestAnimationFrame(frame);
}
