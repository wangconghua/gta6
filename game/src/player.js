// The player: on foot (WASD, mouse aim, pistol) and in a car (E to get in and
// out, W/S to drive). Stealing a car with a driver in it throws the driver out
// and raises the wanted level; stealing a parked one is quieter.

import { CAR, PLAYER, WORLD } from './config.js';
import { addWanted, damageCar, fireBullet, makeCar } from './entities.js';
import { buildingAt, inWater, resolveBuildingCollision } from './city.js';
import { CAR_MODELS } from './entities.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: 0, aimAngle: 0,
    hp: PLAYER.hp, invulnerable: 0,
    ammo: PLAYER.magSize, ammoReserve: 48,
    reloading: 0, fireCooldown: 0,
    onFoot: true,
  };
}

/** The nearest car the player could get into, within reach, or null. */
export function nearestCar(G, maxDist = 70) {
  let best = null;
  let bestDist = maxDist;
  for (const car of G.cars) {
    if (car.kind === 'wreck') continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

/** Get into `car`: throw a traffic driver out, take the wheel, note the theft. */
export function enterCar(G, car) {
  if (car.driver) {
    car.driver = false;
    const ped = G.peds.find((p) => !p.dead && Math.hypot(p.x - car.x, p.y - car.y) < 30);
    if (ped) {
      ped.flee = 3;
      ped.fleeX = ped.x - car.x + (Math.random() - 0.5) * 40;
      ped.fleeY = ped.y - car.y + (Math.random() - 0.5) * 40;
    }
    addWanted(G, 1, 'Carjacking! Wanted level up.');
    G.stats.carsStolen += 1;
  } else if (car.kind === 'parked') {
    G.stats.carsStolen += 1;
    G.toast(`Stole a ${car.model}.`);
  }
  car.kind = 'player';
  G.playerCar = car;
  G.player.onFoot = false;
  G.player.x = car.x;
  G.player.y = car.y;
  G.audio.pickup();
}

/** Get out of the car, on its left side. */
export function exitCar(G) {
  const car = G.playerCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  let x = car.x + Math.cos(side) * 34;
  let y = car.y + Math.sin(side) * 34;
  if (buildingAt(G.city, x, y) || inWater(x, y)) {
    x = car.x - Math.cos(side) * 34;
    y = car.y - Math.sin(side) * 34;
  }
  G.player.x = x;
  G.player.y = y;
  G.player.onFoot = true;
  G.playerCar = null;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
}

/** Aim at the mouse (screen space converted through the camera). */
export function updateAim(G, mouse, camera, view) {
  const worldX = mouse.x / view.scale + camera.x + camera.sx;
  const worldY = mouse.y / view.scale + camera.y + camera.sy;
  G.player.aimAngle = Math.atan2(worldY - G.player.y, worldX - G.player.x);
}

/** One on-foot step: move, collide, shoot, reload. */
export function updatePlayerOnFoot(G, input, dt) {
  const p = G.player;
  const held = input.held;
  let mx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  let my = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    const speed = held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
  }
  const [nx, ny] = resolveBuildingCollision(G.city, p.x, p.y, PLAYER.radius);
  p.x = nx;
  p.y = ny;
  if (inWater(p.x, p.y)) {
    // The water is shallow at the shore: wade slowly, never swim out.
    p.y = Math.min(p.y, 2510);
  }
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x));
  p.y = Math.max(20, Math.min(WORLD.height - 20, p.y));
  if (p.invulnerable > 0) p.invulnerable -= dt;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0 && p.ammoReserve > 0) {
      const need = PLAYER.magSize - p.ammo;
      const take = Math.min(need, p.ammoReserve);
      p.ammo += take;
      p.ammoReserve -= take;
    }
  }
  if (held.fire && p.fireCooldown <= 0 && p.reloading <= 0) {
    if (p.ammo > 0) {
      p.ammo -= 1;
      p.fireCooldown = PLAYER.fireSeconds;
      const spread = (Math.random() - 0.5) * 0.06;
      fireBullet(G, p.x, p.y, p.aimAngle + spread, 'player', PLAYER.pistolDamage);
      G.audio.shot();
      G.shake = Math.max(G.shake, 2);
      // Firing in the street is a crime if anyone is watching — but one burst
      // is one crime, not one star per bullet.
      const nearPed = G.peds.some((ped) => !ped.dead && Math.hypot(ped.x - p.x, ped.y - p.y) < 260);
      if (nearPed && G.time - (G.wanted.lastShotWanted ?? -99) > 6) {
        G.wanted.lastShotWanted = G.time;
        addWanted(G, 1, 'Shots fired! Wanted level up.');
      }
      for (const ped of G.peds) {
        if (!ped.dead && !ped.cop && !ped.gang && Math.hypot(ped.x - p.x, ped.y - p.y) < 240) {
          ped.flee = 2.5;
          ped.fleeX = ped.x - p.x;
          ped.fleeY = ped.y - p.y;
        }
      }
    } else if (p.ammoReserve > 0) {
      startReload(G);
    } else {
      G.audio.denied();
      p.fireCooldown = 0.3;
    }
  }
}

export function startReload(G) {
  const p = G.player;
  if (p.reloading <= 0 && p.ammo < PLAYER.magSize && p.ammoReserve > 0) {
    p.reloading = PLAYER.reloadSeconds;
    G.audio.pickup();
  }
}

/** Spawn a fresh car for the player (used by the "free car" garage perk after a mission). */
export function givePlayerCar(G) {
  const car = makeCar(G.player.x + 60, G.player.y, 0, 6, 'parked');
  G.cars.push(car);
  return car;
}

export { CAR_MODELS };
