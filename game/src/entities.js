// The people and the traffic of Solmar City: pedestrians who stroll the
// sidewalks and run from gunfire, and cars that drive the road grid in
// right-hand lanes, turning at intersections like real traffic.

import { AVENUES, CAR, PALETTE, ROAD_W, STREETS } from './config.js';
import { angleTo, chance, clamp, dist, pick, range, rangeInt } from './random.js';
import { blocksMovement, onRoad, randomRoadPoint, randomSidewalkPoint } from './city.js';

export function makePed(rng, city) {
  const p = randomSidewalkPoint(rng);
  return {
    kind: 'ped',
    x: p.x, y: p.y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 28, 52),
    color: pick(rng, PALETTE.ped),
    state: 'walk', // walk | flee | down
    tx: p.x, ty: p.y,
    stateT: 0,
    downT: 0,
    seed: rng(),
  };
}

export function makeTrafficCar(rng, city, color) {
  const p = randomRoadPoint(rng);
  const vertical = p.vertical;
  const dir = chance(rng, 0.5) ? 1 : -1;
  return {
    kind: 'car',
    vertical,
    line: vertical ? p.x : p.y,
    pos: vertical ? p.y : p.x,
    dir,
    speed: range(rng, CAR.trafficSpeed * 0.75, CAR.trafficSpeed * 1.15),
    color: color || pick(rng, PALETTE.car),
    angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    driver: true,
    brake: 0,
  };
}

// Screen position of a traffic car from its road description.
export function carXY(car) {
  const off = 18; // right-hand lane
  if (car.vertical) return { x: car.line + (car.dir > 0 ? -off : off), y: car.pos };
  return { x: car.pos, y: car.line + (car.dir > 0 ? off : -off) };
}

// Turn a traffic car onto the crossing road at (ix, iy).
function turnCar(car, ix, iy) {
  if (car.vertical) {
    car.vertical = false;
    car.line = iy;
    car.pos = ix;
    car.dir = chance(Math.random, 0.5) ? 1 : -1;
  } else {
    car.vertical = true;
    car.line = ix;
    car.pos = iy;
    car.dir = chance(Math.random, 0.5) ? 1 : -1;
  }
  car.angle = car.vertical ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
}

function crossingNear(car) {
  const list = car.vertical ? STREETS : AVENUES;
  const pos = car.pos;
  for (const c of list) {
    if (Math.abs(pos - c) < 26) return c;
  }
  return null;
}

export function updateTraffic(state, dt) {
  for (const car of state.traffic) {
    const me = carXY(car);
    // Slow for a car ahead on the same lane.
    let targetSpeed = car.speed;
    for (const other of state.traffic) {
      if (other === car || other.vertical !== car.vertical || other.line !== car.line || other.dir !== car.dir) continue;
      const gap = (other.pos - car.pos) * car.dir;
      if (gap > 0 && gap < 70) { targetSpeed = 0; break; }
    }
    // Slow for the player's car ahead.
    if (state.player.car) {
      const pc = state.player.car;
      const pxy = { x: pc.x, y: pc.y };
      const ahead = car.vertical ? (pc.x - me.x) * 0 + (pc.y - me.y) * car.dir : (pc.x - me.x) * car.dir;
      const lateral = car.vertical ? Math.abs(pc.x - me.x) : Math.abs(pc.y - me.y);
      if (ahead > 0 && ahead < 70 && lateral < 26) targetSpeed = 0;
    }
    const accel = targetSpeed > 0 ? 120 : -260;
    car.speed = clamp(car.speed + accel * dt, 0, CAR.trafficSpeed * 1.2);
    car.pos += car.dir * car.speed * dt;

    // At an intersection, sometimes turn onto the crossing road.
    const cross = crossingNear(car);
    if (cross !== null && Math.random() < 0.006) {
      if (car.vertical) turnCar(car, car.line, cross);
      else turnCar(car, cross, car.line);
    }
    // At the end of the road, turn around.
    const limit = car.vertical ? 1860 : 2520;
    if (car.pos > limit || car.pos < 40) {
      car.dir *= -1;
      car.pos = clamp(car.pos, 40, limit);
      car.angle = car.vertical ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    }
  }
}

export function updatePeds(state, dt) {
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ped.downT += dt;
      continue;
    }
    if (ped.state === 'flee') {
      ped.stateT -= dt;
      const a = angleTo(state.dangerX, state.dangerY, ped.x, ped.y);
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
      ped.angle = a;
      if (ped.stateT <= 0) ped.state = 'walk';
      if (blocksMovement(ped.x, ped.y, state.city)) {
        ped.x -= Math.cos(a) * 150 * dt;
        ped.y -= Math.sin(a) * 150 * dt;
      }
      continue;
    }
    // Strolling: walk toward the current waypoint, pick a new one on arrival.
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 12) {
      const p = randomSidewalkPoint(state.rng);
      ped.tx = p.x;
      ped.ty = p.y;
      continue;
    }
    const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
    ped.angle = a;
    const nx = ped.x + Math.cos(a) * ped.speed * dt;
    const ny = ped.y + Math.sin(a) * ped.speed * dt;
    if (!blocksMovement(nx, ny, state.city) && !onRoad(nx, ny)) {
      ped.x = nx;
      ped.y = ny;
    } else {
      const p = randomSidewalkPoint(state.rng);
      ped.tx = p.x;
      ped.ty = p.y;
    }
  }
  // Faded bodies are cleared and replaced by fresh walkers.
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    if (state.peds[i].state === 'down' && state.peds[i].downT > 14) {
      state.peds[i] = makePed(state.rng, state.city);
    }
  }
}

// Every pedestrian near (x, y) starts running away from it.
export function scarePeds(state, x, y, radius) {
  state.dangerX = x;
  state.dangerY = y;
  for (const ped of state.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.stateT = 2.5;
    }
  }
}

// A car (player or traffic) hitting a pedestrian: the ped goes down.
export function hitPed(state, ped) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downT = 0;
  scarePeds(state, ped.x, ped.y, 260);
  return true;
}
