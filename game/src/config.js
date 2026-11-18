// Palma City — tuning numbers, palette and constants in one place.
// The world is a fixed 2600 x 2600 city; the renderer scales the camera view to the window,
// so no rule below depends on the screen size.

export const WORLD = { width: 2600, height: 2600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Road grid: centre lines every 320 px, starting at 180; roads are 100 px wide. */
export const ROADS = { start: 180, step: 320, count: 8, width: 100 };
export const LANE = 24; // offset of a traffic lane from a road's centre line

export const PLAYER = {
  radius: 13,
  walkSpeed: 205,
  runSpeed: 285,
  hp: 100,
  pistolDamage: 34,
  pistolRange: 560,
  magSize: 12,
  reloadSeconds: 1.1,
  fireSeconds: 0.16,
};

export const CAR = {
  length: 46,
  width: 24,
  radius: 19,
  topSpeed: 335,
  accel: 240,
  brake: 420,
  reverseTop: 140,
  steer: 2.6,
  grip: 3.2,
  hp: 100,
};

export const POLICE = {
  carTopSpeed: 315,
  carAccel: 265,
  ramDamage: 9,
  pedSpeed: 235,
  shootRange: 420,
  shootSeconds: 1.15,
};

export const WANTED = {
  maxStars: 5,
  decayQuietSeconds: 22,
  decayStepSeconds: 8,
  policeCarsPerStar: 1,
  maxPoliceCars: 6,
  maxPolicePeds: 8,
};

export const TRAFFIC = { cars: 14, parked: 7, speedMin: 125, speedMax: 185 };
export const PEDS = { count: 26, walkMin: 55, walkMax: 95, fleeSpeed: 210 };

export const MONEY = {
  start: 150,
  sprayCost: 200,
  cashPickup: 50,
  hospitalFee: 100,
};

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#6f9c55',
  sidewalk: '#d9c9a3',
  road: '#3d3f46',
  roadEdge: '#2f3138',
  lane: '#e8d44d',
  sand: '#ecd9a0',
  water: '#2f9db4',
  waterDeep: '#1f7d99',
  building: ['#e8b48a', '#d98f7a', '#c9a86a', '#a8b8c4', '#e3d3b8', '#b98a9e', '#8fb0a0', '#d9c08a'],
  roof: ['#b0724f', '#9c5f52', '#8f7a4a', '#7d8b96', '#a89468', '#8a5f6d', '#5f7a6a', '#a08a58'],
  downtown: ['#c9d6e2', '#b8c4d4', '#aab8cc', '#d4c9b8'],
  tree: '#3e7d44',
  treeDark: '#2f6234',
  palm: '#4d8f4a',
  player: '#f2f2f2',
  playerShirt: '#e2574c',
  hud: '#10131a',
  hudText: '#f4f1e6',
  accent: '#ffc53d',
  mission: '#ffd23f',
  police: '#2f6df6',
  policeLight: '#ff3b30',
  blood: '#b03030',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'palma-city.save.v1';
export const BEST_KEY = 'palma-city.best';
