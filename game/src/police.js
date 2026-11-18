// The Solmar City Police: wanted stars, cop cars that chase the player
// down the roads, foot cops who run the player down, and what happens
// when they catch you — busted, or wasted.

import { PALETTE, PLAYER, WANTED, WANTED_TABLE } from './config.js';
import { angleDiff, angleTo, clamp, dist, pick, range } from './random.js';
import { makeCar } from './player.js';
import { nearestRoadPoint, randomRoadPoint } from './city.js';

export function makeCopCar(state, x, y) {
  const car = makeCar(x, y, 0, PALETTE.cop, {});
  car.cop = true;
  car.hp = 120;
  return car;
}

export function makeFootCop(state, x, y) {
  return {
    kind: 'cop',
    x, y,
    angle: 0,
    hp: 60,
    state: 'chase', // chase | down
    downT: 0,
    shootT: range(Math.random, 0.5, 1.5),
    touchT: 0,
    speed: 200,
  };
}

// Raise the heat; returns the new star count.
export function addWanted(state, amount) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + amount, 0, 5);
  state.quietT = 0;
  if (state.wanted > before) state.events.push({ type: 'wantedUp', stars: state.wanted });
  return state.wanted;
}

// A cop who can see the player, or a crime just committed, resets the clock.
export function anyCopSeesPlayer(state) {
  const p = state.player;
  for (const cop of state.cops) {
    if (cop.state === 'down') continue;
    if (dist(cop.x, cop.y, p.x, p.y) < 520) return true;
  }
  for (const car of state.copCars) {
    if (dist(car.x, car.y, p.x, p.y) < 560) return true;
  }
  return false;
}

export function updateWanted(state, dt) {
  if (state.wanted === 0) return;
  if (anyCopSeesPlayer(state)) {
    state.quietT = 0;
  } else {
    state.quietT += dt;
    if (state.quietT >= WANTED.decaySeconds) {
      state.wanted -= 1;
      state.quietT = 0;
      state.events.push({ type: 'wantedDown', stars: state.wanted });
    }
  }
  // Keep the street staffed to the table for the current stars.
  const want = WANTED_TABLE[state.wanted];
  while (state.copCars.length < want.cars) {
    const spot = randomRoadPoint(state.rng);
    const near = nearestRoadPoint(state.player.x, state.player.y);
    // Spawn a few blocks away, off the player's screen.
    const sx = clamp(near.x + (state.rng() < 0.5 ? -1 : 1) * 700, 60, 2500);
    const sy = clamp(near.y + (state.rng() < 0.5 ? -1 : 1) * 500, 60, 1800);
    const p = nearestRoadPoint(sx, sy);
    state.copCars.push(makeCopCar(state, p.x, p.y));
  }
  while (state.cops.length < want.foot) {
    const a = range(state.rng, 0, Math.PI * 2);
    state.cops.push(makeFootCop(state, state.player.x + Math.cos(a) * 420, state.player.y + Math.sin(a) * 420));
  }
  while (state.copCars.length > want.cars) state.copCars.pop();
  while (state.cops.length > want.foot) state.cops.pop();
}

export function updateCops(state, dt) {
  const p = state.player;
  for (const car of state.copCars) {
    // Chase: steer toward the player, faster than traffic, ramming to stop them.
    const target = angleTo(car.x, car.y, p.x, p.y);
    const turn = clamp(angleDiff(car.angle, target), -1, 1);
    car.angle += turn * 3.1 * dt;
    const maxSpeed = 480 + state.wanted * 22;
    car.speed = clamp(car.speed + 420 * dt, 0, maxSpeed);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Cop cars slide along buildings instead of stopping dead.
    if (state.city.buildings.some((r) => r.x <= car.x && car.x <= r.x + r.w && r.y <= car.y && car.y <= r.y + r.h)) {
      car.x -= Math.cos(car.angle) * car.speed * dt;
      car.y -= Math.sin(car.angle) * car.speed * dt;
      car.angle += 0.9 * dt;
      car.speed *= 0.7;
    }
    // Ramming the player's car hurts it and the player.
    if (p.car && dist(car.x, car.y, p.car.x, p.car.y) < 46) {
      p.car.hp -= 26 * dt;
      p.car.speed *= 0.94;
      car.speed *= 0.8;
      if (p.car.hp <= 0) {
        state.events.push({ type: 'carWrecked', x: p.car.x, y: p.car.y });
        p.health -= 30;
        p.car = null;
      }
    }
  }
  for (const cop of state.cops) {
    if (cop.state === 'down') {
      cop.downT += dt;
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.car) {
      // On foot a cop cannot catch a car: run to the nearest road and wait.
      const road = nearestRoadPoint(cop.x, cop.y);
      const a = angleTo(cop.x, cop.y, road.x, road.y);
      cop.x += Math.cos(a) * cop.speed * 0.7 * dt;
      cop.y += Math.sin(a) * cop.speed * 0.7 * dt;
      cop.angle = a;
      continue;
    }
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = a;
    cop.x += Math.cos(a) * cop.speed * dt;
    cop.y += Math.sin(a) * cop.speed * dt;
    // Caught: a foot cop who stays on the player busts them.
    if (d < 30) {
      cop.touchT += dt;
      if (cop.touchT > 1.2) state.events.push({ type: 'busted', x: p.x, y: p.y });
    } else {
      cop.touchT = Math.max(0, cop.touchT - dt * 2);
    }
    // Foot cops shoot when close and the player is armed and wanted.
    cop.shootT -= dt;
    if (d < 340 && cop.shootT <= 0 && state.wanted >= 2) {
      cop.shootT = range(Math.random, 1.1, 2.0);
      const spread = (Math.random() - 0.5) * 0.35;
      const aim = angleTo(cop.x, cop.y, p.x, p.y) + spread;
      state.bullets.push({
        x: cop.x + Math.cos(aim) * 18,
        y: cop.y + Math.sin(aim) * 18,
        vx: Math.cos(aim) * 700,
        vy: Math.sin(aim) * 700,
        life: 0.8,
        fromPlayer: false,
        damage: 9,
      });
      state.events.push({ type: 'copShoot', x: cop.x, y: cop.y });
    }
  }
  // Fallen cops get back up after a while, away from the player.
  for (let i = state.cops.length - 1; i >= 0; i -= 1) {
    if (state.cops[i].state === 'down' && state.cops[i].downT > 12) {
      state.cops.splice(i, 1);
    }
  }
}
