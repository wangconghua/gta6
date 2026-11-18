// The game's state and one fixed step of it: everything that happens in
// Solmar City, from traffic to the police to the story, with no drawing
// and no browser in it. main.js runs this; shots.js fast-forwards it.

import { AVENUES, CAR, MISSION_REWARDS, PACKAGE_REWARD, PALETTE, PLAYER, STREETS } from './config.js';
import { buildCity, randomRoadPoint, randomSidewalkPoint } from './city.js';
import { makeRng, pick, range, rangeInt } from './random.js';
import { makePed, makeTrafficCar, scarePeds, updatePeds, updateTraffic } from './entities.js';
import { enterCar, exitCar, makeCar, makePlayer, nearestCar, updateBullets, updatePlayer } from './player.js';
import { addWanted, updateCops, updateWanted } from './police.js';
import { currentStep, makeMissionState, missionMarker, startMission, tryStartNextMission, updateMissions } from './missions.js';

export function createState(seed) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const state = {
    seed,
    rng,
    city,
    time: 0,
    player: makePlayer(city.spots.garage.x + 40, city.spots.garage.y + 60),
    cars: [],
    traffic: [],
    peds: [],
    cops: [],
    copCars: [],
    bullets: [],
    particles: [],
    packages: [],
    wanted: 0,
    quietT: 0,
    dangerX: 0,
    dangerY: 0,
    missions: makeMissionState(),
    events: [],
    toasts: [],
    dialogueLine: null,
    hint: null,
    goldCar: null,
    packagesFound: 0,
    camera: null,
    save: null,
  };

  // Parked cars around the city, plus the gold Comet GT downtown.
  for (let i = 0; i < 9; i += 1) {
    const p = randomRoadPoint(rng);
    const vertical = p.vertical;
    const angle = vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const off = 26;
    const x = vertical ? p.x + (angle === Math.PI / 2 ? -off : off) : p.x;
    const y = vertical ? p.y : p.y + (angle === 0 ? off : -off);
    state.cars.push(makeCar(x, y, angle, pick(rng, PALETTE.car), { parked: true }));
  }
  const gold = makeCar(AVENUES[2] + 26, STREETS[1] + 90, Math.PI / 2, PALETTE.gold, { parked: true, gold: true });
  state.cars.push(gold);
  state.goldCar = gold;

  for (let i = 0; i < CAR.trafficCount; i += 1) state.traffic.push(makeTrafficCar(rng, city));
  for (let i = 0; i < CAR.pedCount; i += 1) state.peds.push(makePed(rng, city));

  // Five hidden packages pay $100 each.
  for (let i = 0; i < 5; i += 1) {
    const p = randomSidewalkPoint(rng);
    state.packages.push({ x: p.x, y: p.y, found: false });
  }
  return state;
}

export function addToast(state, text, color) {
  state.toasts.push({ text, color: color || '#ffffff', life: 3 });
  if (state.toasts.length > 3) state.toasts.shift();
}

// One fixed step of the whole simulation.
export function stepGame(state, input, dt) {
  state.time += dt;
  const p = state.player;

  // Getting in and out of cars.
  if (input.enterPressed) {
    if (p.car) {
      exitCar(state);
    } else {
      const car = nearestCar(state, 70);
      if (car) enterCar(state, car);
      else tryStartNextMission(state);
    }
  }

  updatePlayer(state, input, dt);
  updateTraffic(state, dt);
  updatePeds(state, dt);
  updateCops(state, dt);
  updateWanted(state, dt);
  updateMissions(state, dt);
  updateBullets(state, dt);

  // Particles and toasts fade.
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.life -= dt;
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.toasts.length - 1; i >= 0; i -= 1) {
    state.toasts[i].life -= dt;
    if (state.toasts[i].life <= 0) state.toasts.splice(i, 1);
  }

  // Hidden packages.
  for (const pkg of state.packages) {
    if (!pkg.found && Math.hypot(p.x - pkg.x, p.y - pkg.y) < 34) {
      pkg.found = true;
      state.packagesFound += 1;
      p.cash += PACKAGE_REWARD;
      state.events.push({ type: 'package', x: pkg.x, y: pkg.y });
    }
  }

  // Context hint under the player.
  state.hint = null;
  if (!p.car) {
    const car = nearestCar(state, 70);
    if (car) state.hint = car.traffic ? 'E — steal this car' : 'E — get in the car';
    else if (!state.missions.active && state.missions.index < 3) {
      const g = state.city.spots.garage;
      if (Math.hypot(p.x - g.x, p.y - g.y) < 90) state.hint = 'E — start the next job';
    }
  } else {
    state.hint = 'E — get out of the car';
  }

  // Health slowly recovers out of trouble.
  if (state.wanted === 0 && p.health < PLAYER.health && !p.car) {
    p.health = Math.min(PLAYER.health, p.health + 2 * dt);
  }

  // Hand the events that fired this step back to the caller (screens,
  // sounds) before the queue is cleared.
  const fired = state.events.slice();
  processEvents(state);
  state.events.length = 0;
  return fired;
}

function processEvents(state) {
  const p = state.player;
  for (const ev of state.events) {
    switch (ev.type) {
      case 'steal':
        addWanted(state, 1);
        addToast(state, 'Car stolen — the cops noticed', '#ffb14d');
        break;
      case 'pedDown':
        addWanted(state, 1);
        addToast(state, 'Pedestrian down — wanted level up', '#ffb14d');
        break;
      case 'copDown':
        addWanted(state, 2);
        addToast(state, 'Cop down — wanted level up', '#ff7a5c');
        break;
      case 'shoot':
        scarePeds(state, ev.x, ev.y, 300);
        break;
      case 'package':
        addToast(state, 'Hidden package found — +$100', '#7dff8a');
        break;
      case 'missionComplete':
        addToast(state, ev.name + ' complete — +$' + ev.reward, '#7dff8a');
        break;
      case 'wantedUp':
        break;
      case 'crash':
        break;
      default:
        break;
    }
  }
}

// The next line of dialogue, or null when the queue is empty.
export function advanceDialogue(state) {
  const next = state.missions.dialogue.shift();
  state.dialogueLine = next || null;
  return state.dialogueLine;
}
