// Palma Bay itself: the road grid, the blocks and buildings on it, the beach, the
// park, the named places (garage, bank, safehouse, spray shop, hospital, docks) and
// the trees and lamps that dress it. Pure data, built once from a seed; no drawing here.

import { PALETTE, ROADS, WORLD } from './config.js';
import { makeRng, pick, randFloat, randInt } from './random.js';

/** Where the sand starts and where the water starts, on the south edge. */
export const BEACH_Y = 2340;
export const WATER_Y = 2480;

/** Named places the missions and the free-roam activities use. */
export const PLACES = {
  garage: { x: 1140, y: 820, label: "Mara's Garage" },
  bank: { x: 1460, y: 1140, label: 'Palma Bank' },
  safehouse: { x: 500, y: 500, label: 'Safehouse' },
  spray: { x: 2100, y: 1780, label: "Lou's Spray Shop" },
  hospital: { x: 820, y: 2100, label: 'Palma General' },
  docks: { x: 2280, y: 2290, label: 'Marina Docks' },
  turf: { x: 1780, y: 820, label: 'Kessler Turf' },
  plaza: { x: 1460, y: 1460, label: 'Sun Plaza' },
};

const PARK_BLOCK = { col: 2, row: 5 };
const DOWNTOWN = { colMin: 3, colMax: 4, rowMin: 3, rowMax: 4 };

/** The road centre lines, both directions. */
export function roadLines() {
  const lines = [];
  for (let i = 0; i < ROADS.count; i += 1) lines.push(ROADS.start + i * ROADS.step);
  return lines;
}

/** Is `x, y` on a road (the drivable asphalt, not the sidewalk)? */
export function onRoad(city, x, y) {
  for (const line of city.lines) {
    if (Math.abs(x - line) < ROADS.width / 2) return true;
    if (Math.abs(y - line) < ROADS.width / 2) return true;
  }
  return false;
}

/** Is `x, y` inside a building? Returns the building or null. */
export function buildingAt(city, x, y) {
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
  }
  return null;
}

/** Is `x, y` in the water? */
export function inWater(x, y) {
  return y > WATER_Y;
}

/** Is `x, y` on the sand? */
export function onSand(x, y) {
  return y > BEACH_Y && y <= WATER_Y;
}

/** Push a circle of `radius` at `x, y` out of every building it overlaps. Returns corrected [x, y]. */
export function resolveBuildingCollision(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      } else {
        // Dead centre: push out along the smallest penetration axis.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - radius;
        else if (m === right) x = b.x + b.w + radius;
        else if (m === top) y = b.y - radius;
        else y = b.y + b.h + radius;
      }
    }
  }
  return [x, y];
}

/** A random point on a road near `near`, for spawning traffic and police.
 *  Returns the point and whether it sits on a vertical road, so the spawned
 *  car can drive along that road instead of across it. */
export function randomRoadPoint(city, rng, near, minDist, maxDist) {
  for (let tries = 0; tries < 24; tries += 1) {
    const line = pick(rng, city.lines);
    const along = randFloat(rng, 80, WORLD.width - 80);
    const vertical = rng() < 0.5;
    const x = vertical ? line : along;
    const y = vertical ? along : line;
    const d = Math.hypot(x - near.x, y - near.y);
    if (d >= minDist && d <= maxDist && !inWater(x, y)) return { x, y, vertical };
  }
  return { x: near.x + 400, y: near.y, vertical: true };
}

/** Build the whole city from a seed. */
export function createCity(seed) {
  const rng = makeRng(seed);
  const lines = roadLines();
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Named places get their own drawn buildings (the garage, the bank, the hospital).
  // A place's address is a road intersection, but its building sits inside the
  // block south-east of it, so no building ever blocks a road.
  const placeBuildings = [
    { key: 'garage', w: 150, h: 90, color: '#c96f4a', roof: '#8f4a2e' },
    { key: 'bank', w: 170, h: 110, color: '#c9d6e2', roof: '#7d8b96', downtown: true, height: 5 },
    { key: 'hospital', w: 170, h: 100, color: '#e8e8e8', roof: '#b03030' },
    { key: 'spray', w: 130, h: 80, color: '#7a9cc6', roof: '#4a6a96' },
    { key: 'safehouse', w: 120, h: 90, color: '#d9c08a', roof: '#8f7a4a' },
  ];
  const placeRects = placeBuildings.map((pb) => {
    const p = PLACES[pb.key];
    return { ...pb, cx: p.x + 150, cy: p.y + 105 };
  });
  // The blocks a place building sits in get no generic buildings or trees.
  const occupiedBlocks = new Set();
  for (const pb of placeRects) {
    for (let col = 0; col < ROADS.count - 1; col += 1) {
      for (let row = 0; row < ROADS.count - 1; row += 1) {
        const bx = lines[col] + ROADS.width / 2;
        const by = lines[row] + ROADS.width / 2;
        if (pb.cx > bx && pb.cx < bx + ROADS.step - ROADS.width && pb.cy > by && pb.cy < by + ROADS.step - ROADS.width) {
          occupiedBlocks.add(`${col},${row}`);
        }
      }
    }
  }

  // One building (or a pair) per block between the roads; the park block stays green,
  // downtown blocks get taller glass towers, the beach strip stays open sand.
  for (let col = 0; col < ROADS.count - 1; col += 1) {
    for (let row = 0; row < ROADS.count - 1; row += 1) {
      const bx = lines[col] + ROADS.width / 2 + 14;
      const by = lines[row] + ROADS.width / 2 + 14;
      const bw = ROADS.step - ROADS.width - 28;
      const bh = ROADS.step - ROADS.width - 28;
      if (by + bh > BEACH_Y) continue; // beach strip: no buildings
      if (occupiedBlocks.has(`${col},${row}`)) continue; // a named place lives here
      if (col === PARK_BLOCK.col && row === PARK_BLOCK.row) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: bx + randFloat(rng, 10, bw - 10), y: by + randFloat(rng, 10, bh - 10), palm: false });
        }
        continue;
      }
      const downtown = col >= DOWNTOWN.colMin && col <= DOWNTOWN.colMax && row >= DOWNTOWN.rowMin && row <= DOWNTOWN.rowMax;
      const palette = downtown ? PALETTE.downtown : PALETTE.building;
      const roofs = downtown ? PALETTE.downtown : PALETTE.roof;
      const count = downtown || rng() < 0.45 ? 1 : 2;
      for (let k = 0; k < count; k += 1) {
        const w = count === 1 ? bw * randFloat(rng, 0.62, 0.86) : bw * randFloat(rng, 0.36, 0.46);
        const h = count === 1 ? bh * randFloat(rng, 0.62, 0.86) : bh * randFloat(rng, 0.36, 0.46);
        const x = count === 1 ? bx + (bw - w) / 2 : bx + (k === 0 ? 6 : bw - w - 6);
        const y = count === 1 ? by + (bh - h) / 2 : by + (k === 0 ? 6 : bh - h - 6);
        buildings.push({
          x, y, w, h,
          height: downtown ? randInt(rng, 3, 6) : randInt(rng, 1, 3),
          color: pick(rng, palette),
          roof: pick(rng, roofs),
          downtown,
        });
      }
      // A couple of street trees on the block's corners.
      for (let t = 0; t < 2; t += 1) {
        trees.push({ x: bx + randFloat(rng, 4, bw - 4), y: by + randFloat(rng, 4, bh - 4), palm: rng() < 0.5 });
      }
    }
  }

  for (const pb of placeRects) {
    buildings.push({ x: pb.cx - pb.w / 2, y: pb.cy - pb.h / 2, w: pb.w, h: pb.h, height: pb.height ?? 2, color: pb.color, roof: pb.roof, downtown: !!pb.downtown, place: pb.key });
  }

  // Palm trees along the beach and lamps at every intersection.
  for (let x = 120; x < WORLD.width; x += 130) {
    trees.push({ x: x + randFloat(rng, -20, 20), y: BEACH_Y + randFloat(rng, 30, 90), palm: true });
  }
  for (const lx of lines) {
    for (const ly of lines) lamps.push({ x: lx + ROADS.width / 2 + 6, y: ly + ROADS.width / 2 + 6 });
  }

  return { seed, lines, buildings, trees, lamps, park: PARK_BLOCK };
}
