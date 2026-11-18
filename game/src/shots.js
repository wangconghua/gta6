// The screenshot scenes behind ?shot=cover|street|mission|title. Each one
// plays the real rules forward from a fresh city for a fixed number of
// steps — a chase, a street on foot, a mission moment — so the frame is
// what a short game really looks like, and the same seed gives the same
// frame. The staged state is returned ready to render.

import { AVENUES, STREETS } from './config.js';
import { enterCar, makeCar } from './player.js';
import { makeCopCar } from './police.js';
import { advanceDialogue, stepGame } from './game.js';
import { startMission } from './missions.js';
import { makeCamera, updateCamera } from './render.js';

const STEP = 1 / 60;

function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    shoot: false, spaceShoot: false, reload: false, pause: false, mute: false,
    enterPressed: false, interactPressed: false,
    mouseX: 640, mouseY: 360, mouseDown: false, anyKey: false,
  };
}

function runSteps(state, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = inputFn ? inputFn(state, i) : blankInput();
    stepGame(state, input, STEP);
    updateCamera(state.camera, state, STEP);
  }
}

// Steer the driven car down its avenue: gas on, angle toward the road.
function chasePilot(state) {
  const car = state.player.car;
  if (!car) return blankInput();
  const input = blankInput();
  input.up = true;
  const target = Math.PI / 2; // south, down the avenue
  let diff = target - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Nudge back to the centre of the avenue.
  const laneError = car.x - AVENUES[3];
  if (laneError > 24) diff -= 0.25;
  if (laneError < -24) diff += 0.25;
  if (diff > 0.06) input.right = true;
  else if (diff < -0.06) input.left = true;
  return input;
}

function stageCover(state) {
  // Three stars, a gold Comet GT tearing down the avenue, two cop cars
  // on its tail, and the bank job's escape as the live objective.
  state.missions.index = 2;
  state.missions.step = 2;
  state.missions.active = true;
  state.wanted = 3;
  const car = makeCar(AVENUES[3], 560, Math.PI / 2, '#f5c542', { gold: true });
  car.speed = 430;
  state.cars.push(car);
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.car = car;
  state.player.angle = Math.PI / 2;
  state.copCars.push(makeCopCar(state, AVENUES[3] - 4, 380));
  state.copCars.push(makeCopCar(state, AVENUES[3] + 20, 460));
  state.copCars[0].angle = Math.PI / 2;
  state.copCars[0].speed = 380;
  state.copCars[1].angle = Math.PI / 2;
  state.copCars[1].speed = 360;
  runSteps(state, 1.8, chasePilot);
  return 'play';
}

function stageStreet(state) {
  // On foot at a downtown intersection, traffic rolling past, pedestrians
  // on the sidewalks, the first job waiting at the warehouse.
  state.player.x = AVENUES[2] + 60;
  state.player.y = STREETS[1] - 60;
  state.player.angle = Math.PI / 4;
  startMission(state.missions, state);
  advanceDialogue(state);
  runSteps(state, 2.5, null);
  state.dialogueLine = null;
  return 'play';
}

function stageMission(state) {
  // At the warehouse door, Sal's line on screen, the package marker lit.
  const spot = state.city.spots.warehouse;
  state.player.x = spot.x;
  state.player.y = spot.y + 46;
  state.player.angle = -Math.PI / 2;
  startMission(state.missions, state);
  advanceDialogue(state);
  runSteps(state, 0.8, null);
  return 'play';
}

/**
 * Stage the named scene on a fresh state and return the screen to draw.
 * Any other name stages the title screen.
 */
export function stageShot(name, state) {
  state.camera = makeCamera();
  // Centre the camera on the player before the sim runs.
  state.camera.x = state.player.x - 640;
  state.camera.y = state.player.y - 360;
  if (name === 'cover') return stageCover(state);
  if (name === 'street') return stageStreet(state);
  if (name === 'mission') return stageMission(state);
  return 'title';
}
