// The screenshot scenes behind ?shot=chase|street|fight|beach. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a small autopilot (drive toward waypoints, walk toward the job, aim at the
// nearest gang member), so the frame is what real play looks like and the same
// seed always gives the same frame.

import { STEP } from './config.js';
import { makeCar, spawnPoliceCar } from './entities.js';
import { enterCar } from './player.js';
import { startMission } from './missions.js';

/** Steer the player's car toward `target` by setting the held keys. */
function driveToward(G, target) {
  const car = G.playerCar;
  if (!car) return;
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Brake for the corner so the turn does not end in a wall — but keep enough
  // speed that the car is still moving when the frame is taken.
  G.input.held.up = dist > 140;
  G.input.held.down = dist <= 140 && car.speed > 200;
  G.input.held.left = diff < -0.08;
  G.input.held.right = diff > 0.08;
}

/** Walk on foot toward `target`. */
function walkToward(G, target) {
  const p = G.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  G.input.held.up = dy < -len * 0.3;
  G.input.held.down = dy > len * 0.3;
  G.input.held.left = dx < -len * 0.3;
  G.input.held.right = dx > len * 0.3;
}

/** Run `seconds` of fixed steps with `pilot` steering each step. */
function simulate(G, seconds, pilot) {
  G.player.invulnerable = 9999; // the staged player does not die mid-scene
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    pilot(i);
    G.step(STEP);
  }
  G.input.held.up = false;
  G.input.held.down = false;
  G.input.held.left = false;
  G.input.held.right = false;
  G.input.held.fire = false;
}

function finishStaging(G) {
  G.player.hp = 100;
  G.player.invulnerable = 0;
  G.player.ammo = 12;
  G.briefing = null;
  G.aimTarget = null;
  G.toasts.length = 0;
  G.screen = 'play';
}

/** A sports car, the player at the wheel, three stars and police behind. */
function stageChase(G) {
  const car = makeCar(500, 1140, 0, 6, 'parked');
  car.color = '#e2574c';
  car.hp = 250; // the hero car survives the staged chase
  G.cars.push(car);
  G.player.x = car.x - 10;
  G.player.y = car.y;
  enterCar(G, car);
  startMission(G, 4);
  G.mission.timer = 60;
  G.wanted.stars = 3;
  G.wanted.lastCrime = G.time;
  const cop1 = spawnPoliceCar(G);
  cop1.x = 330;
  cop1.y = 1140;
  cop1.angle = 0;
  cop1.axis = 'h';
  cop1.road = 1140;
  cop1.lane = 24;
  cop1.dir = 1;
  const cop2 = spawnPoliceCar(G);
  cop2.x = 280;
  cop2.y = 1190;
  cop2.angle = 0;
  cop2.axis = 'h';
  cop2.road = 1140;
  cop2.lane = -24;
  cop2.dir = 1;
  // One fast run east down the downtown road: no corners to get wedged in,
  // the police right behind the whole way.
  simulate(G, 5, () => driveToward(G, { x: 2500, y: 1140 }));
  finishStaging(G);
}

/** On foot in the downtown streets: traffic, pedestrians, the job marker ahead. */
function stageStreet(G) {
  G.player.x = 1500;
  G.player.y = 1000;
  // The turf job, marker visible, but the crew is not spawned for this shot.
  G.mission = { index: 3, done: false, stage: 0, timer: 0, hold: 0, killsDone: 0, gangSpawned: true, staged: true };
  simulate(G, 5, () => {
    walkToward(G, { x: 1780, y: 820 });
    G.input.held.fire = false;
  });
  finishStaging(G);
}

/** The turf fight: the player trading shots with Kessler's crew. */
function stageFight(G) {
  G.player.x = 1620;
  G.player.y = 980;
  startMission(G, 3);
  G.mission.gangSpawned = false; // updateMission spawns the four on the first step
  simulate(G, 5, () => {
    // Aim at the nearest living gang member and fire in bursts.
    let best = null;
    let bestD = Infinity;
    for (const ped of G.peds) {
      if (!ped.gang || ped.dead) continue;
      const d = Math.hypot(ped.x - G.player.x, ped.y - G.player.y);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    if (best) {
      G.aimTarget = { x: best.x, y: best.y };
      G.input.held.fire = G.time % 0.9 < 0.55;
      // Strafe sideways so the frame has motion in it.
      G.input.held.left = Math.floor(G.time * 2) % 2 === 0;
      G.input.held.right = !G.input.held.left;
    }
  });
  finishStaging(G);
}

/** A fast drive down the beach road, palms and water, one star behind. */
function stageBeach(G) {
  const car = makeCar(500, 2420, 0, 6, 'parked');
  car.color = '#ff7a1a'; // bright orange: unmistakable against the road
  car.hp = 250; // the hero car survives the staged drive
  G.cars.push(car);
  G.player.x = car.x - 10;
  G.player.y = car.y;
  enterCar(G, car);
  startMission(G, 4);
  G.mission.timer = 55;
  G.wanted.stars = 1;
  G.wanted.lastCrime = G.time;
  const cop = spawnPoliceCar(G);
  cop.x = 320;
  cop.y = 2420;
  cop.angle = 0;
  cop.axis = 'h';
  cop.road = 2420;
  cop.lane = 24;
  cop.dir = 1;
  // One fast run east along the beach road; no turn at the end, so the car
  // never swings off the road into the blocks.
  simulate(G, 5, () => driveToward(G, { x: 2600, y: 2420 }));
  finishStaging(G);
}

/**
 * Set the game to the named scene (chase, street, fight or beach; anything else
 * is chase) and leave it frozen on a played frame.
 */
export function stageShot(name, G) {
  G.screen = 'play';
  if (name === 'street') stageStreet(G);
  else if (name === 'fight') stageFight(G);
  else if (name === 'beach') stageBeach(G);
  else stageChase(G);
}
