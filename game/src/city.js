// Solmar City itself: a road grid, the blocks between the roads, the beach
// and the water, and every named place the story uses. One seed builds one
// city, so the same seed always gives the same streets and screenshots.
// All collision is axis-aligned rectangles; cars and people are circles.

import { AVENUES, BEACH_TOP, PALETTE, ROAD_W, STREETS, WATER_TOP, WORLD_H, WORLD_W } from './config.js';
import { chance, makeRng, pick, range, rangeInt } from './random.js';

// The park sits in this block (column, row of the block grid).
const PARK_COL = 3;
const PARK_ROW = 1;

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Named places the story points at, one per block, with a sign on the roof.
  const named = {
    warehouse: { col: 6, row: 1, label: 'WAREHOUSE' },
    motel: { col: 1, row: 4, label: 'SEASIDE MOTEL' },
    garage: { col: 0, row: 0, label: 'GARAGE' },
    bank: { col: 3, row: 2, label: 'SOLMAR BANK' },
    safehouse: { col: 0, row: 2, label: 'SAFEHOUSE' },
    hospital: { col: 5, row: 0, label: 'HOSPITAL' },
    police: { col: 2, row: 0, label: 'POLICE' },
    docks: { col: 7, row: 4, label: 'DOCKS' },
  };

  const blockW = (i) => AVENUES[i + 1] - AVENUES[i];
  const blockH = (j) => STREETS[j + 1] - STREETS[j];

  for (let i = 0; i < AVENUES.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const x0 = AVENUES[i] + ROAD_W / 2 + 16;
      const y0 = STREETS[j] + ROAD_W / 2 + 16;
      const x1 = AVENUES[i + 1] - ROAD_W / 2 - 16;
      const y1 = STREETS[j + 1] - ROAD_W / 2 - 16;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 40 || h < 40) continue;

      if (i === PARK_COL && j === PARK_ROW) {
        // The park: grass, a pond and a ring of trees, no buildings.
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: range(rng, x0 + 10, x1 - 10), y: range(rng, y0 + 10, y1 - 10), s: range(rng, 9, 15) });
        }
        continue;
      }

      // Find this block's named place, if any.
      let spot = null;
      for (const key of Object.keys(named)) {
        if (named[key].col === i && named[key].row === j) spot = { key, ...named[key] };
      }

      if (spot && (spot.key === 'bank' || spot.key === 'warehouse')) {
        // Landmark buildings take most of their block.
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, w - 16, h - 16, spot.label));
        continue;
      }

      // Ordinary blocks: one or two buildings plus a few trees.
      const split = chance(rng, 0.55) && w > 150;
      if (split) {
        const cut = x0 + w * range(rng, 0.42, 0.58);
        buildings.push(makeBuilding(rng, x0, y0, cut - x0 - 10, h, spot ? spot.label : null));
        buildings.push(makeBuilding(rng, cut + 10, y0, x1 - cut - 10, h, null));
      } else {
        buildings.push(makeBuilding(rng, x0, y0, w, h, spot ? spot.label : null));
      }
      for (let t = 0; t < rangeInt(rng, 1, 3); t += 1) {
        trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), s: range(rng, 8, 13) });
      }
    }
  }

  // Bottom row of blocks, between the last street and the beach.
  for (let i = 0; i < AVENUES.length - 1; i += 1) {
    const x0 = AVENUES[i] + ROAD_W / 2 + 16;
    const y0 = STREETS[STREETS.length - 1] + ROAD_W / 2 + 16;
    const x1 = AVENUES[i + 1] - ROAD_W / 2 - 16;
    const y1 = BEACH_TOP - 16;
    if (x1 - x0 < 40 || y1 - y0 < 40) continue;
    let spot = null;
    for (const key of Object.keys(named)) {
      if (named[key].col === i && named[key].row === 4) spot = { key, ...named[key] };
    }
    if (i === 4) { // a beachfront car park, no building
      continue;
    }
    buildings.push(makeBuilding(rng, x0, y0, x1 - x0, y1 - y0, spot ? spot.label : null));
    for (let t = 0; t < 2; t += 1) {
      trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), s: range(rng, 8, 12) });
    }
  }

  // Palm trees along the beach and lamps at every intersection.
  for (let x = 80; x < WORLD_W; x += 130) {
    trees.push({ x: x + range(rng, -20, 20), y: range(rng, BEACH_TOP + 30, BEACH_TOP + 110), s: range(rng, 10, 16), palm: true });
  }
  for (const ax of AVENUES) {
    for (const sy of STREETS) lamps.push({ x: ax + ROAD_W / 2 + 6, y: sy - ROAD_W / 2 - 6 });
  }

  // Keep trees out of buildings and off the roads.
  const keptTrees = trees.filter((t) => !buildings.some((b) => pointInRect(t.x, t.y, b)) && !onRoad(t.x, t.y));

  return {
    seed,
    buildings,
    trees: keptTrees,
    lamps,
    park: { x: AVENUES[PARK_COL] + ROAD_W / 2, y: STREETS[PARK_ROW] + ROAD_W / 2, w: blockW(PARK_COL) - ROAD_W, h: blockH(PARK_ROW) - ROAD_W },
    spots: spotPositions(buildings),
  };
}

function makeBuilding(rng, x, y, w, h, label) {
  const color = pick(rng, PALETTE.building);
  return {
    x, y, w, h,
    color,
    roof: pick(rng, PALETTE.roof),
    label: label || null,
    // Window grid, drawn from the size so no two buildings match.
    cols: Math.max(1, Math.floor(w / 34)),
    rows: Math.max(1, Math.floor(h / 30)),
    lit: rng(),
  };
}

// Where each named place's door is: the middle of the building's street side.
function spotPositions(buildings) {
  const spots = {};
  for (const b of buildings) {
    if (!b.label) continue;
    const key = { WAREHOUSE: 'warehouse', 'SEASIDE MOTEL': 'motel', GARAGE: 'garage', 'SOLMAR BANK': 'bank', SAFEHOUSE: 'safehouse', HOSPITAL: 'hospital', POLICE: 'police', DOCKS: 'docks' }[b.label];
    if (key) spots[key] = { x: b.x + b.w / 2, y: b.y + b.h + 26, building: b };
  }
  return spots;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function onRoad(x, y) {
  if (y >= BEACH_TOP) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

export function inWater(x, y) {
  return y >= WATER_TOP;
}

export function blocksMovement(x, y, city) {
  if (x < 12 || y < 12 || x > WORLD_W - 12 || y > WORLD_H - 12) return true;
  if (inWater(x, y)) return true;
  for (const b of city.buildings) if (pointInRect(x, y, b)) return true;
  return false;
}

// Push a circle out of every building and the water; returns true if moved.
export function resolveCircle(city, body, r) {
  let moved = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * r;
        body.y = cy + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the shortest side.
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) body.x = b.x - r;
        else if (m === right) body.x = b.x + b.w + r;
        else if (m === top) body.y = b.y - r;
        else body.y = b.y + b.h + r;
      }
      moved = true;
    }
  }
  if (body.y + r > WATER_TOP) { body.y = WATER_TOP - r; moved = true; }
  body.x = Math.max(12 + r, Math.min(WORLD_W - 12 - r, body.x));
  body.y = Math.max(12 + r, Math.min(WORLD_H - 12 - r, body.y));
  return moved;
}

// The closest point on any road centreline to (x, y).
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const py = Math.max(0, Math.min(BEACH_TOP, y));
    const d = Math.hypot(x - ax, y - py);
    if (d < bestD) { bestD = d; best = { x: ax, y: py, vertical: true }; }
  }
  for (const sy of STREETS) {
    const px = Math.max(0, Math.min(WORLD_W, x));
    const d = Math.hypot(x - px, y - sy);
    if (d < bestD) { bestD = d; best = { x: px, y: sy, vertical: false }; }
  }
  return best;
}

// A random point on a random road, for spawning traffic and police.
export function randomRoadPoint(rng) {
  if (chance(rng, 0.5)) {
    return { x: pick(rng, AVENUES), y: range(rng, 60, BEACH_TOP - 40), vertical: true };
  }
  return { x: range(rng, 60, WORLD_W - 60), y: pick(rng, STREETS), vertical: false };
}

// A point on a sidewalk beside a road, for spawning pedestrians.
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = ROAD_W / 2 + 14;
  if (p.vertical) return { x: p.x + (chance(rng, 0.5) ? off : -off), y: p.y };
  return { x: p.x, y: p.y + (chance(rng, 0.5) ? off : -off) };
}
