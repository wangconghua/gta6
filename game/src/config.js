// Solmar City — tuning, palette and key bindings for the whole game.
// Everything here is a plain constant; the world, the cars and the missions
// all read from this file so one place decides how the game feels.

export const WORLD_W = 2560;
export const WORLD_H = 1920;

// Roads: vertical avenues and horizontal streets, spaced 320 px apart,
// 72 px wide. The city is a grid; the south strip is beach and water.
export const ROAD_W = 72;
export const AVENUES = [200, 520, 840, 1160, 1480, 1800, 2120, 2440];
export const STREETS = [200, 520, 840, 1160, 1480];
export const BEACH_TOP = 1640;
export const WATER_TOP = 1800;

// Sun-soaked coastal palette: warm asphalt, pale sidewalks, pastel walls.
export const PALETTE = {
  grass: '#7fae62',
  parkGrass: '#69a854',
  asphalt: '#3d3a38',
  asphaltLine: '#d8c95e',
  sidewalk: '#c9bda6',
  sand: '#e8d39a',
  water: '#2f7fa8',
  waterDeep: '#256b8f',
  building: ['#e8b04b', '#d97b54', '#7fb3a8', '#e6d3a3', '#c96f6f', '#8fa8c9', '#b98ac9', '#e0a35e'],
  roof: ['#a8763e', '#8a4f3d', '#5d8a80', '#b09a6a', '#9a5454', '#6a84a3'],
  tree: '#3f7d3a',
  treeDark: '#2f6130',
  player: '#e33e2b',
  playerDark: '#a82618',
  cop: '#2b4fd8',
  copDark: '#1d3596',
  ped: ['#f2c14e', '#4ecdc4', '#ff8c42', '#95a5a6', '#e67e22', '#1abc9c'],
  car: ['#c0392b', '#2980b9', '#f39c12', '#8e44ad', '#16a085', '#e5e5e5', '#2c3e50', '#d35400'],
  gold: '#f5c542',
};

export const PLAYER = {
  walkSpeed: 185,
  runSpeed: 265,
  radius: 13,
  health: 100,
  pistolDamage: 34,
  magSize: 12,
  reloadSeconds: 1.1,
  bulletSpeed: 900,
};

export const CAR = {
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  grip: 3.2,
  length: 46,
  width: 22,
  trafficSpeed: 150,
  trafficCount: 14,
  pedCount: 26,
};

// Wanted stars: how many cop cars and foot cops each level fields.
export const WANTED_TABLE = [
  { cars: 0, foot: 0 },
  { cars: 1, foot: 1 },
  { cars: 2, foot: 2 },
  { cars: 3, foot: 2 },
  { cars: 4, foot: 3 },
  { cars: 5, foot: 4 },
];

export const WANTED = {
  decaySeconds: 14, // quiet seconds before one star fades
  stealCar: 1,
  killPed: 1,
  killCop: 2,
  shootNearCop: 1,
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  reload: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  interact: ['KeyE', 'Space'],
};

export const SAVE_KEY = 'solmar-city-save-v1';
export const MISSION_REWARDS = { m1: 700, m2: 1200, m3: 5000 };
export const PACKAGE_REWARD = 100;
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
