// Everything that moves in Palma Bay: cars (traffic, parked, police and the
// player's), pedestrians, police on foot, bullets and particles. The traffic
// drives the road grid, the police chase the player, and the crowd flees gunfire.

import { CAR, LANE, PALETTE, PEDS, POLICE, ROADS, TRAFFIC, WANTED, WORLD } from './config.js';
import { buildingAt, inWater, onRoad, randomRoadPoint, resolveBuildingCollision } from './city.js';
import { pick, randFloat, randInt } from './random.js';

export const CAR_MODELS = [
  { name: 'Civic', color: '#c94f43', top: 1.0 },
  { name: 'Sedan', color: '#4a7fb5', top: 0.95 },
  { name: 'Taxi', color: '#f2c230', top: 1.0 },
  { name: 'Coupe', color: '#8a5fb5', top: 1.12 },
  { name: 'Pickup', color: '#5a7d4a', top: 0.92 },
  { name: 'Van', color: '#d8d8d8', top: 0.85 },
  { name: 'Sports', color: '#e2574c', top: 1.25 },
  { name: 'Hatch', color: '#3fa08a', top: 0.98 },
];

const PED_SHIRTS = ['#e2574c', '#4a7fb5', '#f2c230', '#8a5fb5', '#5a7d4a', '#d8d8d8', '#e08a3c', '#3fa08a'];
const GANG_SHIRTS = ['#7a1f1f', '#5c1a1a', '#8a2a2a'];

export function makeCar(x, y, angle, modelIndex, kind) {
  const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
  return {
    x, y, angle, vx: 0, vy: 0, speed: 0,
    model: model.name, color: model.color, top: model.top,
    kind, // 'traffic' | 'parked' | 'police' | 'player'
    hp: CAR.hp, driver: kind === 'traffic',
    axis: 'v', dir: 1, lane: LANE,
    turnCooldown: 0, honk: 0, siren: 0, smoke: 0,
  };
}

export function makePed(x, y, gang = false) {
  return {
    x, y, angle: 0, speed: 0, hp: gang ? 90 : 30,
    shirt: gang ? pick(Math.random, GANG_SHIRTS) : pick(Math.random, PED_SHIRTS),
    gang, cop: false, dead: false,
    axis: 'v', dir: 1, side: 1, walkSpeed: randFloat(Math.random, PEDS.walkMin, PEDS.walkMax),
    flee: 0, fleeX: 0, fleeY: 0, shootCooldown: randFloat(Math.random, 0.5, 1.5),
    targetX: x, targetY: y, wander: 0,
  };
}

export function makePickup(kind, x, y) {
  return { kind, x, y, bob: Math.random() * Math.PI * 2, respawn: 0 };
}

export function addParticles(G, x, y, count, color, speed, life = 0.6, size = 3) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = randFloat(Math.random, speed * 0.3, speed);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: randFloat(Math.random, life * 0.5, life), maxLife: life, color, size: randFloat(Math.random, size * 0.6, size * 1.4) });
  }
}

/** Raise the wanted level by `stars` (capped) and note the last crime's time. */
export function addWanted(G, stars, reason) {
  const before = G.wanted.stars;
  G.wanted.stars = Math.min(WANTED.maxStars, G.wanted.stars + stars);
  G.wanted.lastCrime = G.time;
  G.wanted.quietTimer = 0;
  if (G.wanted.stars > before && reason) G.toast(reason);
}

/** Scatter the starting traffic, parked cars, pedestrians and pickups. */
export function populateWorld(G) {
  const { city, rng } = G;
  G.cars = [];
  G.peds = [];
  G.bullets = [];
  G.particles = [];
  G.pickups = [];
  // Parked cars along road edges.
  for (let i = 0; i < TRAFFIC.parked; i += 1) {
    const line = pick(rng, city.lines);
    const along = randFloat(rng, 120, WORLD.width - 120);
    const vertical = rng() < 0.5;
    const edge = (ROADS.width / 2 + 18) * (rng() < 0.5 ? -1 : 1);
    const x = vertical ? line + edge : along;
    const y = vertical ? along : line + edge;
    if (inWater(x, y) || buildingAt(city, x, y)) continue;
    G.cars.push(makeCar(x, y, vertical ? Math.PI / 2 : 0, randInt(rng, 0, CAR_MODELS.length - 1), 'parked'));
  }
  // Moving traffic.
  for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTrafficCar(G);
  // Pedestrians on the sidewalks.
  for (let i = 0; i < PEDS.count; i += 1) {
    const line = pick(rng, city.lines);
    const along = randFloat(rng, 100, WORLD.width - 100);
    const vertical = rng() < 0.5;
    const side = (ROADS.width / 2 + 14) * (rng() < 0.5 ? -1 : 1);
    const x = vertical ? line + side : along;
    const y = vertical ? along : line + side;
    if (inWater(x, y)) continue;
    const ped = makePed(x, y);
    ped.axis = vertical ? 'v' : 'h';
    ped.dir = rng() < 0.5 ? 1 : -1;
    G.peds.push(ped);
  }
  // Pickups: cash on the streets, health by the hospital, ammo by the garage.
  const spots = [
    ['cash', 820, 500], ['cash', 1780, 1460], ['cash', 1140, 2100], ['cash', 2100, 820],
    ['cash', 500, 1780], ['cash', 1460, 500], ['health', 900, 2050], ['health', 1460, 1460],
    ['ammo', 1200, 900], ['ammo', 2100, 1700], ['cash', 2280, 2200], ['health', 600, 600],
  ];
  for (const [kind, x, y] of spots) G.pickups.push(makePickup(kind, x, y));
}

/** One traffic car on a random road, a few hundred pixels from the player.
 *  Its axis, lane and heading all match the road it spawns on. */
export function spawnTrafficCar(G) {
  const point = randomRoadPoint(G.city, G.rng, G.player, 350, 900);
  const dir = G.rng() < 0.5 ? 1 : -1;
  const lane = (G.rng() < 0.5 ? -1 : 1) * LANE;
  const x = point.vertical ? point.x + lane : point.x;
  const y = point.vertical ? point.y : point.y + lane;
  const angle = point.vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const car = makeCar(x, y, angle, randInt(G.rng, 0, CAR_MODELS.length - 1), 'traffic');
  car.axis = point.vertical ? 'v' : 'h';
  car.dir = dir;
  car.lane = lane;
  car.speed = randFloat(G.rng, TRAFFIC.speedMin, TRAFFIC.speedMax);
  G.cars.push(car);
  return car;
}

/** A police car on a road some distance from the player, lights flashing. */
export function spawnPoliceCar(G) {
  const point = randomRoadPoint(G.city, G.rng, G.player, 420, 700);
  const lane = (G.rng() < 0.5 ? -1 : 1) * LANE;
  const x = point.vertical ? point.x + lane : point.x;
  const y = point.vertical ? point.y : point.y + lane;
  const car = makeCar(x, y, Math.atan2(G.player.y - point.y, G.player.x - point.x), 1, 'police');
  car.color = '#20242e';
  car.speed = 0;
  car.axis = point.vertical ? 'v' : 'h';
  car.road = point.vertical ? point.x : point.y;
  car.lane = lane;
  car.dir = 1;
  G.cars.push(car);
  G.audio.denied();
  return car;
}

/** A police officer on foot, near the player. */
export function spawnPolicePed(G) {
  const point = randomRoadPoint(G.city, G.rng, G.player, 220, 380);
  const ped = makePed(point.x, point.y);
  ped.cop = true;
  ped.shirt = '#20242e';
  ped.walkSpeed = POLICE.pedSpeed;
  G.peds.push(ped);
  return ped;
}

/** A gang member for the turf mission. */
export function spawnGang(G, x, y) {
  const ped = makePed(x + randFloat(G.rng, -60, 60), y + randFloat(G.rng, -60, 60), true);
  G.peds.push(ped);
  return ped;
}

/** One civilian near the player, on a sidewalk, to replace one that left or died.
 *  Retries until the spot is a real sidewalk, so the crowd never thins out. */
export function spawnCivilianPed(G) {
  for (let tries = 0; tries < 12; tries += 1) {
    const point = randomRoadPoint(G.city, G.rng, G.player, 200, 800);
    const vertical = G.rng() < 0.5;
    const side = (ROADS.width / 2 + 14) * (G.rng() < 0.5 ? -1 : 1);
    const x = vertical ? point.x + side : point.x;
    const y = vertical ? point.y : point.y + side;
    if (inWater(x, y) || buildingAt(G.city, x, y)) continue;
    const ped = makePed(x, y);
    ped.axis = vertical ? 'v' : 'h';
    ped.dir = G.rng() < 0.5 ? 1 : -1;
    G.peds.push(ped);
    return ped;
  }
  return null;
}

function nearestLine(lines, value) {
  let best = lines[0];
  for (const line of lines) {
    if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  }
  return best;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function carAhead(G, car, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = Infinity;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < dist && side < 30 && along < best) best = along;
  }
  return best;
}

/** Drive one traffic car along the grid, turning at intersections, slowing for traffic. */
function updateTrafficCar(G, car, dt) {
  const { city } = G;
  car.turnCooldown -= dt;
  const ahead = carAhead(G, car, 90);
  let targetSpeed = car.speed;
  if (ahead < 70) targetSpeed = Math.min(targetSpeed, 40);
  car.speed += Math.sign(targetSpeed - car.speed) * 140 * dt;
  // At an intersection, sometimes turn onto the cross road.
  const lines = city.lines;
  let nearLine = -1;
  for (const line of lines) {
    const d = car.axis === 'v' ? Math.abs(car.y - line) : Math.abs(car.x - line);
    if (d < 26) { nearLine = line; break; }
  }
  if (nearLine >= 0 && car.turnCooldown <= 0 && G.rng() < 0.012) {
    car.axis = car.axis === 'v' ? 'h' : 'v';
    car.dir = G.rng() < 0.5 ? 1 : -1;
    car.lane = (G.rng() < 0.5 ? -1 : 1) * LANE;
    if (car.axis === 'v') car.x = nearLine + car.lane;
    else car.y = nearLine + car.lane;
    car.turnCooldown = 4;
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Ease the heading toward the axis direction.
  const wantAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  car.angle += angleDiff(car.angle, wantAngle) * Math.min(1, 3 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  // Off the map or into the water: turn around.
  if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60 || inWater(car.x, car.y)) {
    car.dir *= -1;
    car.angle += Math.PI;
    car.x = Math.max(70, Math.min(WORLD.width - 70, car.x));
    car.y = Math.max(70, Math.min(WORLD.height - 70, car.y));
  }
  if (buildingAt(city, car.x, car.y)) {
    car.dir *= -1;
    car.angle += Math.PI;
    car.turnCooldown = 2;
  }
}

/** A police car chases the player along the road grid, turning at intersections
 *  toward them, so it stays on the asphalt instead of cutting through blocks. */
function updatePoliceCar(G, car, dt) {
  const target = G.playerCar ?? G.player;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  car.turnCooldown -= dt;
  // At an intersection, switch to the axis that closes the bigger gap.
  const lines = G.city.lines;
  let nearLine = -1;
  for (const line of lines) {
    const d = car.axis === 'v' ? Math.abs(car.y - line) : Math.abs(car.x - line);
    if (d < 30) { nearLine = line; break; }
  }
  if (nearLine >= 0 && car.turnCooldown <= 0) {
    const wantAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (wantAxis !== car.axis) {
      car.axis = wantAxis;
      car.road = nearLine;
      car.lane = (G.rng() < 0.5 ? -1 : 1) * LANE;
    }
    car.dir = car.axis === 'v' ? (dy >= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);
    car.turnCooldown = 1.5;
  }
  if (car.road === undefined) {
    // Spawned off-grid: adopt the nearest road line on the current axis.
    let best = lines[0];
    for (const line of lines) {
      const d = car.axis === 'v' ? Math.abs(car.x - line) : Math.abs(car.y - line);
      const bd = car.axis === 'v' ? Math.abs(car.x - best) : Math.abs(car.y - best);
      if (d < bd) best = line;
    }
    car.road = best;
    car.lane = 0;
  }
  const top = POLICE.carTopSpeed * (G.wanted.stars >= 4 ? 1.08 : 1);
  const dist = Math.hypot(dx, dy);
  // Do not rear-end the traffic: match the speed of a car right ahead.
  const ahead = carAhead(G, car, 80);
  let topHere = top;
  if (ahead < 70) topHere = Math.min(topHere, 60);
  car.speed = Math.min(topHere, car.speed + POLICE.carAccel * dt * (dist > 80 ? 1 : 0.4));
  const wantAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  car.angle += angleDiff(car.angle, wantAngle) * Math.min(1, 4 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Ease back onto the lane so a shove never leaves the car cross-country.
  if (car.axis === 'v') car.x += (car.road + car.lane - car.x) * Math.min(1, 2.5 * dt);
  else car.y += (car.road + car.lane - car.y) * Math.min(1, 2.5 * dt);
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.siren += dt;
  if (inWater(car.x, car.y)) car.speed *= 0.9;
}

/** Drive the player's car from the held keys: arcade physics with drift. */
export function updatePlayerCar(G, car, input, dt) {
  const held = input.held;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let fwdSpeed = car.vx * fx + car.vy * fy;
  const steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const steerAmount = steer * CAR.steer * Math.min(1, Math.abs(fwdSpeed) / 90) * (fwdSpeed < 0 ? -1 : 1);
  car.angle += steerAmount * dt;
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  if (held.up) {
    fwdSpeed += CAR.accel * dt;
  } else if (held.down) {
    fwdSpeed -= fwdSpeed > 10 ? CAR.brake * dt : CAR.accel * 0.6 * dt;
  } else {
    fwdSpeed -= fwdSpeed * 0.55 * dt;
  }
  const top = CAR.topSpeed * car.top;
  fwdSpeed = Math.max(-CAR.reverseTop, Math.min(top, fwdSpeed));
  // Grip kills sideways velocity: the car mostly goes where it points.
  let sideSpeed = car.vx * -nfy + car.vy * nfx;
  sideSpeed *= Math.exp(-CAR.grip * dt);
  if (Math.abs(steer) > 0 && Math.abs(fwdSpeed) > 160) {
    sideSpeed += steer * 26 * dt * 60 * 0.02;
    if (Math.random() < dt * 14) addParticles(G, car.x - nfx * 18, car.y - nfy * 18, 1, '#9a9a9a', 30, 0.5, 4);
  }
  car.vx = nfx * fwdSpeed + -nfy * sideSpeed;
  car.vy = nfy * fwdSpeed + nfx * sideSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);
  // The player's position rides with the car (camera, minimap, pickups all read it).
  G.player.x = car.x;
  G.player.y = car.y;
  const [nx, ny] = resolveBuildingCollision(G.city, car.x, car.y, CAR.radius);
  if (nx !== car.x || ny !== car.y) {
    const impact = Math.abs(car.speed);
    car.x = nx;
    car.y = ny;
    car.vx *= -0.25;
    car.vy *= -0.25;
    if (impact > 140) {
      damageCar(G, car, impact * 0.04);
      G.audio.crash();
      G.shake = Math.min(10, impact * 0.03);
      addParticles(G, car.x, car.y, 6, '#c9c9c9', 120, 0.5, 4);
    }
  }
  if (inWater(car.x, car.y)) {
    car.vx *= 0.9;
    car.vy *= 0.9;
    car.speed *= 0.9;
  }
  car.x = Math.max(30, Math.min(WORLD.width - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD.height - 30, car.y));
  if (car.hp < 35 && Math.random() < dt * 6) {
    addParticles(G, car.x, car.y - 6, 1, '#555', 40, 0.9, 5);
  }
}

/** Damage a car; at 0 hp it explodes. */
export function damageCar(G, car, amount) {
  if (car.hp <= 0) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    explodeCar(G, car, car === G.playerCar);
  }
}

export function explodeCar(G, car, byPlayer = false) {
  addParticles(G, car.x, car.y, 34, '#ff7a2a', 260, 0.9, 6);
  addParticles(G, car.x, car.y, 22, '#3a3a3a', 160, 1.4, 8);
  addParticles(G, car.x, car.y, 12, '#ffd23f', 320, 0.5, 4);
  G.audio.explosion();
  G.shake = 16;
  for (const other of G.cars) {
    if (other !== car && Math.hypot(other.x - car.x, other.y - car.y) < 100) damageCar(G, other, 55);
  }
  for (const ped of G.peds) {
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 95) damagePed(G, ped, 90, car.x, car.y, byPlayer, 'explosion');
  }
  if (Math.hypot(G.player.x - car.x, G.player.y - car.y) < 130 && G.playerCar !== car) {
    damagePlayer(G, 30);
  }
  if (G.playerCar === car) {
    // The player is thrown clear of the wreck.
    G.player.x = car.x + 40;
    G.player.y = car.y;
    G.playerCar = null;
    damagePlayer(G, 25);
    G.toast('Your car blew up!');
  }
  car.kind = 'wreck';
  car.driver = false;
}

/** Damage a pedestrian; the dead fall and stay where they fell for a while.
 *  Only deaths the player caused raise the wanted level or count as kills.
 *  `cause` is recorded for the debug stats: 'car' | 'bullet' | 'explosion'. */
export function damagePed(G, ped, amount, fromX = 0, fromY = 0, byPlayer = false, cause = 'car') {
  if (ped.dead) return;
  ped.hp -= amount;
  if (ped.hp <= 0) {
    ped.dead = true;
    ped.deadTimer = 14;
    G.stats.pedDeaths = G.stats.pedDeaths ?? {};
    G.stats.pedDeaths[cause] = (G.stats.pedDeaths[cause] ?? 0) + 1;
    addParticles(G, ped.x, ped.y, 10, PALETTE.blood, 90, 0.7, 4);
    if (!byPlayer) return;
    if (ped.cop) addWanted(G, 1, 'Cop down! Wanted level up.');
    else if (ped.gang) G.stats.kills += 1;
    else {
      G.stats.kills += 1;
      addWanted(G, 1, 'Pedestrian down! Wanted level up.');
    }
  } else {
    ped.flee = 2.5;
    ped.fleeX = ped.x - fromX;
    ped.fleeY = ped.y - fromY;
  }
}

/** Hurt the player; at 0 hp the game ends (wasted). */
export function damagePlayer(G, amount) {
  if (G.player.invulnerable > 0 || G.screen !== 'play') return;
  G.player.hp -= amount;
  G.player.invulnerable = 0.5;
  G.shake = Math.max(G.shake, 6);
  if (G.player.hp <= 0) {
    G.player.hp = 0;
    G.screen = 'wasted';
    G.audio.wasted();
    G.audio.setEngine(0);
    G.audio.setSiren(false, 0);
  }
}

/** One pedestrian step: stroll the sidewalks, flee trouble, cops and gang shoot. */
function updatePed(G, ped, dt) {
  if (ped.dead) {
    ped.deadTimer -= dt;
    return;
  }
  const player = G.player;
  const distToPlayer = Math.hypot(player.x - ped.x, player.y - ped.y);
  if (ped.cop || ped.gang) {
    // Hostiles close on the player and shoot when in range.
    if (distToPlayer < 520) {
      const want = Math.atan2(player.y - ped.y, player.x - ped.x);
      ped.angle = want;
      const speed = ped.cop ? POLICE.pedSpeed : 165;
      ped.x += Math.cos(want) * speed * dt;
      ped.y += Math.sin(want) * speed * dt;
      ped.shootCooldown -= dt;
      if (distToPlayer < (ped.cop ? POLICE.shootRange : 400) && ped.shootCooldown <= 0 && G.screen === 'play') {
        ped.shootCooldown = ped.cop ? POLICE.shootSeconds : 1.5;
        const spread = (Math.random() - 0.5) * 0.22;
        fireBullet(G, ped.x, ped.y, want + spread, ped.cop ? 'cop' : 'gang', 7);
        G.audio.enemyShot();
      }
    } else {
      ped.wander -= dt;
      if (ped.wander <= 0) {
        ped.wander = randFloat(G.rng, 2, 5);
        ped.targetX = ped.x + randFloat(G.rng, -160, 160);
        ped.targetY = ped.y + randFloat(G.rng, -160, 160);
      }
      const want = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
      ped.angle = want;
      ped.x += Math.cos(want) * 70 * dt;
      ped.y += Math.sin(want) * 70 * dt;
    }
    const [nx, ny] = resolveBuildingCollision(G.city, ped.x, ped.y, 12);
    ped.x = nx;
    ped.y = ny;
    return;
  }
  // Civilians: flee gunfire and speeding cars, otherwise stroll.
  if (ped.flee <= 0) {
    // Dodge: a fast car bearing down on the pedestrian makes them run clear
    // of the lane instead of standing in its path.
    for (const car of G.cars) {
      if (car.kind === 'wreck') continue;
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 120) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 70) {
        const closing = -(dx * car.vx + dy * car.vy) / (d * speed);
        if (closing > 0.5) {
          // Run straight away from the car, not sideways across the road.
          ped.flee = 1.0;
          ped.fleeX = dx;
          ped.fleeY = dy;
          break;
        }
      }
    }
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
    ped.x += (ped.fleeX / len) * PEDS.fleeSpeed * dt;
    ped.y += (ped.fleeY / len) * PEDS.fleeSpeed * dt;
    ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
  } else {
    ped.wander -= dt;
    if (ped.wander <= 0) {
      ped.wander = randFloat(G.rng, 3, 7);
      if (G.rng() < 0.3) {
        // Turn onto the cross street, snapping onto its sidewalk so the crowd
        // stays out of the traffic instead of jaywalking across the road.
        ped.axis = ped.axis === 'v' ? 'h' : 'v';
        ped.dir = G.rng() < 0.5 ? 1 : -1;
        ped.side = G.rng() < 0.5 ? -1 : 1;
      }
      // However the pedestrian got here (a flee across the road, say), pull
      // them back onto the sidewalk of the street they walk.
      const offset = ped.side * (ROADS.width / 2 + 14);
      if (ped.axis === 'h') ped.y = nearestLine(G.city.lines, ped.y) + offset;
      else ped.x = nearestLine(G.city.lines, ped.x) + offset;
    }
    const speed = ped.walkSpeed;
    if (ped.axis === 'v') ped.y += ped.dir * speed * dt;
    else ped.x += ped.dir * speed * dt;
    ped.angle = ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
    // Turn around at the map edge or the water.
    if (ped.x < 70 || ped.x > WORLD.width - 70 || ped.y < 70 || ped.y > WORLD.height - 70 || inWater(ped.x, ped.y)) {
      ped.dir *= -1;
    }
  }
  const [nx, ny] = resolveBuildingCollision(G.city, ped.x, ped.y, 12);
  ped.x = nx;
  ped.y = ny;
  // A speeding car that touches a civilian in front of it runs them down.
  // A car mid-turn at a corner does not: its sweep across the sidewalk is not
  // a run-over, and the crowd waiting at the corner stays alive.
  for (const car of G.cars) {
    if (car.kind === 'wreck') continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 90) continue;
    if (car !== G.playerCar && car.axis) {
      const axisAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      if (Math.abs(angleDiff(car.angle, axisAngle)) > 0.35) continue;
    }
    const fx = car.vx / speed;
    const fy = car.vy / speed;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > -4 && along < 30 && side < 20) {
      damagePed(G, ped, 100, car.x, car.y, car === G.playerCar, 'car');
      if (car === G.playerCar) G.audio.crash();
    }
  }
}

export function fireBullet(G, x, y, angle, from, damage) {
  const speed = 780;
  G.bullets.push({
    x: x + Math.cos(angle) * 18, y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: 0.75, from, damage,
  });
  addParticles(G, x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, 2, '#ffd23f', 120, 0.15, 3);
}

function updateBullets(G, dt) {
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && buildingAt(G.city, b.x, b.y)) {
      addParticles(G, b.x, b.y, 4, '#c9c9c9', 90, 0.4, 3);
      dead = true;
    }
    if (!dead) {
      for (const car of G.cars) {
        if (car.kind === 'wreck') continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const lx = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
        const ly = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
        if (Math.abs(lx) < CAR.length / 2 + 2 && Math.abs(ly) < CAR.width / 2 + 2) {
          addParticles(G, b.x, b.y, 4, '#ffd23f', 100, 0.3, 3);
          damageCar(G, car, b.damage);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.from !== 'player') {
      const p = G.player;
      if (Math.hypot(b.x - p.x, b.y - p.y) < 14 && G.playerCar === null) {
        damagePlayer(G, b.damage);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      for (const ped of G.peds) {
        if (ped.dead) continue;
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 14) {
          damagePed(G, ped, b.damage, G.player.x, G.player.y, true, 'bullet');
          dead = true;
          break;
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

function updateParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const p = G.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}

/** Car-on-car shoving and ramming damage. */
function updateCarCollisions(G, dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.kind === 'wreck' || b.kind === 'wreck') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 6;
      if (dist > 0.01 && dist < min) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const relSpeed = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        // Impact damage once per shove, not once per frame of contact.
        if (relSpeed > 160 && (a.hurtCooldown ?? 0) <= 0 && (b.hurtCooldown ?? 0) <= 0) {
          damageCar(G, a, relSpeed * 0.02);
          damageCar(G, b, relSpeed * 0.02);
          a.hurtCooldown = 0.6;
          b.hurtCooldown = 0.6;
          if (a === G.playerCar || b === G.playerCar) {
            G.audio.crash();
            G.shake = Math.max(G.shake, 5);
          }
        }
        // Police ramming the player's car hurts it.
        if ((a.kind === 'police' && b === G.playerCar) || (b.kind === 'police' && a === G.playerCar)) {
          const target = a.kind === 'police' ? b : a;
          if (relSpeed > 60) damageCar(G, target, POLICE.ramDamage * dt * 4);
        }
      }
    }
  }
}

/** Wanted level: police spawn, chase, and give up when the player lies low. */
function updateWanted(G, dt) {
  const w = G.wanted;
  if (w.stars > 0) {
    const policeCars = G.cars.filter((c) => c.kind === 'police' && c.hp > 0).length;
    const wantCars = Math.min(WANTED.maxPoliceCars, w.stars * WANTED.policeCarsPerStar);
    w.spawnTimer -= dt;
    if (policeCars < wantCars && w.spawnTimer <= 0) {
      spawnPoliceCar(G);
      w.spawnTimer = 2.5;
    }
    const policePeds = G.peds.filter((p) => p.cop && !p.dead).length;
    const wantPeds = w.stars >= 2 ? Math.min(WANTED.maxPolicePeds, (w.stars - 1) * 2) : 0;
    if (policePeds < wantPeds && w.spawnTimer <= 0) {
      spawnPolicePed(G);
      w.spawnTimer = 2;
    }
    // Lying low: no crime for a while and no police close by cools the heat off.
    const nearPolice = G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - G.player.x, c.y - G.player.y) < 380)
      || G.peds.some((p) => p.cop && !p.dead && Math.hypot(p.x - G.player.x, p.y - G.player.y) < 380);
    if (G.time - w.lastCrime > WANTED.decayQuietSeconds && !nearPolice) {
      w.quietTimer += dt;
      if (w.quietTimer > WANTED.decayStepSeconds) {
        w.quietTimer = 0;
        w.stars -= 1;
        G.toast(w.stars > 0 ? `Wanted level down: ${w.stars} star${w.stars === 1 ? '' : 's'}.` : 'You lost the cops.');
      }
    } else {
      w.quietTimer = 0;
    }
  }
  G.audio.setSiren(w.stars > 0, G.time);
}

/** Pickups: walk or drive over one to take it. */
function updatePickups(G, dt) {
  for (const p of G.pickups) {
    p.bob += dt * 3;
    if (p.respawn > 0) {
      p.respawn -= dt;
      continue;
    }
    const d = Math.hypot(p.x - G.player.x, p.y - G.player.y);
    if (d < 30) {
      if (p.kind === 'cash') {
        G.money += 50;
        G.toast('+$50 found cash.');
        G.audio.cash();
      } else if (p.kind === 'health') {
        G.player.hp = Math.min(100, G.player.hp + 40);
        G.toast('Health +40.');
        G.audio.pickup();
      } else {
        G.player.ammoReserve += 36;
        G.toast('Ammo +36.');
        G.audio.pickup();
      }
      p.respawn = 45;
    }
  }
}

/** Advance every entity one fixed step. */
export function updateEntities(G, dt) {
  for (const car of G.cars) {
    if (car.kind === 'traffic') updateTrafficCar(G, car, dt);
    else if (car.kind === 'police') updatePoliceCar(G, car, dt);
    else if (car.kind === 'player' && car === G.playerCar) updatePlayerCar(G, car, G.input, dt);
    else if (car.kind === 'player') {
      // A stolen car left behind stays where it is.
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
    }
    car.honk -= dt;
    if (car.hurtCooldown > 0) car.hurtCooldown -= dt;
  }
  // Traffic thins out far away and respawns near the player.
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    const car = G.cars[i];
    if (car.kind === 'traffic') {
      const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
      if (d > 1100) {
        G.cars.splice(i, 1);
        spawnTrafficCar(G);
      }
    } else if (car.kind === 'police') {
      const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
      if (d > 1200 || G.wanted.stars === 0) {
        G.cars.splice(i, 1);
      }
    }
  }
  for (let i = G.peds.length - 1; i >= 0; i -= 1) {
    const ped = G.peds[i];
    updatePed(G, ped, dt);
    if (ped.dead && ped.deadTimer <= 0) {
      G.peds.splice(i, 1);
      spawnCivilianPed(G);
    } else if (!ped.dead && !ped.cop && !ped.gang) {
      const d = Math.hypot(ped.x - G.player.x, ped.y - G.player.y);
      if (d > 1200) {
        G.peds.splice(i, 1);
        spawnCivilianPed(G);
      }
    }
  }
  updateBullets(G, dt);
  updateParticles(G, dt);
  updateCarCollisions(G, dt);
  updateWanted(G, dt);
  updatePickups(G, dt);
}
