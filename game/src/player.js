// Jay Rook, the player: on foot with a pistol, or behind the wheel of any
// car in the city. Driving is arcade physics — accelerate, steer, drift a
// little — and stealing a car is what raises the heat.

import { CAR, PALETTE, PLAYER, WORLD_H, WORLD_W } from './config.js';
import { angleDiff, clamp, dist } from './random.js';
import { carXY, hitPed } from './entities.js';
import { resolveCircle } from './city.js';

export function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    cash: 0,
    car: null, // the car object being driven, or null when on foot
    ammo: PLAYER.magSize,
    reserve: 60,
    reloading: 0,
    shootCooldown: 0,
    invulnerable: 0,
    bustedT: 0,
    wasted: false,
    moving: false,
    running: false,
  };
}

export function makeCar(x, y, angle, color, opts) {
  return {
    x, y, angle,
    speed: 0,
    color: color || '#c0392b',
    driver: false, // true while a traffic driver sits in it
    parked: !!(opts && opts.parked),
    gold: !!(opts && opts.gold),
    hp: 100,
    smoke: 0,
  };
}

// The nearest car the player could steal or get into, within reach.
export function nearestCar(state, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of state.traffic) {
    const p = carXY(car);
    const d = dist(state.player.x, state.player.y, p.x, p.y);
    if (d < bestD) { bestD = d; best = { traffic: car, x: p.x, y: p.y }; }
  }
  return best;
}

// Get into a car: traffic cars are stolen (driver bails), parked cars are free.
export function enterCar(state, car) {
  const p = state.player;
  if (car.traffic) {
    const t = car.traffic;
    const pos = carXY(t);
    const stolen = makeCar(pos.x, pos.y, t.angle, t.color, {});
    state.traffic.splice(state.traffic.indexOf(t), 1);
    state.cars.push(stolen);
    p.car = stolen;
    state.events.push({ type: 'steal', x: pos.x, y: pos.y });
    return stolen;
  }
  p.car = car;
  car.driver = false;
  state.events.push({ type: 'enter', x: car.x, y: car.y });
  return car;
}

export function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  p.car = null;
  // Step out to the side of the car.
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  resolveCircle(state.city, p, PLAYER.radius);
}

function driveCar(state, car, input, dt) {
  const up = input.up ? 1 : 0;
  const down = input.down ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;
  if (up) car.speed += CAR.accel * dt;
  else if (down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
  else {
    const drag = 260 * dt;
    car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 20) {
    car.angle += steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 220, 0.25, 1) * Math.sign(car.speed);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  car.x = clamp(nx, 20, WORLD_W - 20);
  car.y = clamp(ny, 20, WORLD_H - 20);
  // Buildings stop the car; a hard hit costs speed and health.
  if (resolveCircle(state.city, car, CAR.width / 2 + 4)) {
    if (Math.abs(car.speed) > 260) {
      state.events.push({ type: 'crash', x: car.x, y: car.y, hard: true });
      car.hp -= 12;
      state.player.health -= 4;
    }
    car.speed *= 0.45;
  }
  // Running over pedestrians.
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
      if (hitPed(state, ped)) state.events.push({ type: 'pedDown', x: ped.x, y: ped.y });
    }
  }
  // Bumping traffic cars slows both.
  for (const t of state.traffic) {
    const p = carXY(t);
    if (dist(car.x, car.y, p.x, p.y) < 42) {
      car.speed *= 0.6;
      t.speed = 0;
    }
  }
  if (Math.abs(car.speed) > 430) car.smoke = Math.min(1, car.smoke + dt * 0.5);
  else car.smoke = Math.max(0, car.smoke - dt);
  return before;
}

export function updatePlayer(state, input, dt) {
  const p = state.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0 && p.reserve > 0) {
      const take = Math.min(PLAYER.magSize, p.reserve);
      p.ammo = take;
      p.reserve -= take;
    }
  }

  if (p.car) {
    driveCar(state, p.car, input, dt);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    p.moving = Math.abs(p.car.speed) > 30;
    return;
  }

  const up = input.up ? 1 : 0;
  const down = input.down ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;
  const mx = right - left;
  const my = down - up;
  p.running = input.run && (mx !== 0 || my !== 0);
  const speed = p.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my) || 1;
    const nx = p.x + (mx / len) * speed * dt;
    const ny = p.y + (my / len) * speed * dt;
    const ox = p.x;
    const oy = p.y;
    p.x = nx;
    if (resolveCircle(state.city, p, PLAYER.radius)) { /* wall stops x */ }
    const afterX = p.x;
    p.y = ny;
    if (resolveCircle(state.city, p, PLAYER.radius)) { /* wall stops y */ }
    // If both axes were blocked, restore the old spot.
    if (afterX === ox && p.y === oy && (mx !== 0 && my !== 0)) { p.x = ox; p.y = oy; }
    p.angle = Math.atan2(my, mx);
  }

  // Aim with the mouse; click (or Space) fires the pistol.
  if (input.mouseX !== undefined) {
    p.aimAngle = Math.atan2(input.mouseY - p.y + state.camera.y, input.mouseX - p.x + state.camera.x);
  }
  if ((input.shoot || input.spaceShoot) && p.shootCooldown <= 0 && p.reloading <= 0) {
    firePistol(state);
  }
  if (input.reload && p.ammo < PLAYER.magSize && p.reserve > 0 && p.reloading <= 0) {
    p.reloading = PLAYER.reloadSeconds;
    state.events.push({ type: 'reload' });
  }
}

function firePistol(state) {
  const p = state.player;
  if (p.ammo <= 0) {
    p.reloading = PLAYER.reloadSeconds;
    state.events.push({ type: 'dryfire' });
    return;
  }
  p.ammo -= 1;
  p.shootCooldown = 0.22;
  const a = p.aimAngle !== undefined ? p.aimAngle : p.angle;
  const spread = (Math.random() - 0.5) * 0.06;
  state.bullets.push({
    x: p.x + Math.cos(a) * 18,
    y: p.y + Math.sin(a) * 18,
    vx: Math.cos(a + spread) * PLAYER.bulletSpeed,
    vy: Math.sin(a + spread) * PLAYER.bulletSpeed,
    life: 0.9,
    fromPlayer: true,
    damage: PLAYER.pistolDamage,
  });
  state.events.push({ type: 'shoot', x: p.x, y: p.y });
}

export function updateBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    // Buildings swallow bullets.
    if (!dead && state.city.buildings.some((r) => r.x <= b.x && b.x <= r.x + r.w && r.y <= b.y && b.y <= r.y + r.h)) dead = true;
    if (!dead) {
      if (b.fromPlayer) {
        for (const ped of state.peds) {
          if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 14) {
            if (hitPed(state, ped)) state.events.push({ type: 'pedDown', x: ped.x, y: ped.y, byBullet: true });
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of state.cops) {
            if (cop.state !== 'down' && dist(b.x, b.y, cop.x, cop.y) < 15) {
              cop.hp -= b.damage;
              if (cop.hp <= 0) {
                cop.state = 'down';
                cop.downT = 0;
                state.events.push({ type: 'copDown', x: cop.x, y: cop.y });
              } else {
                state.events.push({ type: 'copHit', x: cop.x, y: cop.y });
              }
              dead = true;
              break;
            }
          }
        }
      } else if (dist(b.x, b.y, state.player.x, state.player.y) < PLAYER.radius + 2 && !state.player.car) {
        if (state.player.invulnerable <= 0) {
          state.player.health -= b.damage;
          state.player.invulnerable = 0.4;
          state.events.push({ type: 'playerHit', x: state.player.x, y: state.player.y });
        }
        dead = true;
      }
    }
    if (dead) {
      state.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#ffd94d', size: 5, spark: true });
      state.bullets.splice(i, 1);
    }
  }
}
