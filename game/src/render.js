// Drawing only: the city, its people and cars, the HUD with its minimap,
// and every screen from the title to the end of the story. The camera
// follows Jay; the world is drawn in world coordinates, the HUD in screen
// coordinates, and the minimap is a small live map of the whole city.

import { AVENUES, BEACH_TOP, CAR, FONT, PALETTE, ROAD_W, STREETS, WATER_TOP, WORLD_H, WORLD_W } from './config.js';
import { clamp, dist, lerp } from './random.js';
import { carXY } from './entities.js';
import { missionMarker, missionObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_STORY = 'story';

const VIEW_W = 1280;
const VIEW_H = 720;

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

export function updateCamera(camera, state, dt) {
  const p = state.player;
  const targetZoom = p.car ? 0.82 : 1;
  camera.zoom = lerp(camera.zoom, targetZoom, dt * 2);
  const vw = VIEW_W / camera.zoom;
  const vh = VIEW_H / camera.zoom;
  const lookX = p.car ? Math.cos(p.angle) * 60 : 0;
  const lookY = p.car ? Math.sin(p.angle) * 60 : 0;
  const tx = clamp(p.x + lookX - vw / 2, 0, Math.max(0, WORLD_W - vw));
  const ty = clamp(p.y + lookY - vh / 2, 0, Math.max(0, WORLD_H - vh));
  camera.x = lerp(camera.x, tx, 1 - Math.pow(0.001, dt));
  camera.y = lerp(camera.y, ty, 1 - Math.pow(0.001, dt));
}

function drawCarShape(ctx, x, y, angle, color, opts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const len = CAR.length;
  const wid = CAR.width;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
  // Body.
  ctx.fillStyle = color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Roof and windshield.
  ctx.fillStyle = 'rgba(20,24,32,0.85)';
  roundRect(ctx, -len / 2 + 12, -wid / 2 + 3, 10, wid - 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, -2, -wid / 2 + 3, 14, wid - 6, 3);
  ctx.fill();
  // Headlights and tail lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 2, 4);
  ctx.fillRect(len / 2 - 2, wid / 2 - 6, 2, 4);
  ctx.fillStyle = '#e33e2b';
  ctx.fillRect(-len / 2, -wid / 2 + 2, 2, 4);
  ctx.fillRect(-len / 2, wid / 2 - 6, 2, 4);
  if (opts && opts.cop) {
    // Light bar, flashing red and blue with the clock.
    const phase = Math.floor((opts.time || 0) * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2b2b' : '#2b4fd8';
    ctx.fillRect(-6, -wid / 2 - 2, 5, 5);
    ctx.fillStyle = phase ? '#2b4fd8' : '#ff2b2b';
    ctx.fillRect(1, -wid / 2 - 2, 5, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 4);
  }
  if (opts && opts.gold) {
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 2;
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBuilding(ctx, b, time) {
  // Shadow to the south-east, then the walls, the roof edge and windows.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = b.roof;
  ctx.lineWidth = 4;
  ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  const wx = b.w / (b.cols + 1);
  const wy = b.h / (b.rows + 1);
  for (let i = 1; i <= b.cols; i += 1) {
    for (let j = 1; j <= b.rows; j += 1) {
      const lit = ((i * 7 + j * 13 + Math.floor(b.lit * 100)) % 5) === 0;
      ctx.fillStyle = lit ? 'rgba(255,236,160,0.85)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + i * wx - 5, b.y + j * wy - 4, 10, 8);
    }
  }
  if (b.label) {
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(b.label).width + 14;
    ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y + b.h / 2 - 11, tw, 20);
    ctx.fillStyle = '#f5e9c8';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }
}

function drawCity(ctx, state, time) {
  const city = state.city;
  const cam = state.camera;
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  const x0 = cam.x - 40;
  const y0 = cam.y - 40;
  const x1 = cam.x + vw + 40;
  const y1 = cam.y + vh + 40;

  // Grass everywhere, then the park, the beach and the water.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = PALETTE.parkGrass;
  ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
  ctx.fillStyle = '#4f8fbf';
  ctx.beginPath();
  ctx.ellipse(city.park.x + city.park.w / 2, city.park.y + city.park.h / 2, 42, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(Math.max(x0, 0), BEACH_TOP, Math.min(x1, WORLD_W) - Math.max(x0, 0), WORLD_H - BEACH_TOP);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(Math.max(x0, 0), WATER_TOP, Math.min(x1, WORLD_W) - Math.max(x0, 0), WORLD_H - WATER_TOP);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const wy = WATER_TOP + 14 + i * 22;
    ctx.beginPath();
    for (let x = Math.max(x0, 0); x < Math.min(x1, WORLD_W); x += 40) {
      const yy = wy + Math.sin(x * 0.02 + time * 1.4 + i) * 3;
      if (x === Math.max(x0, 0)) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // Sidewalks, then asphalt, then centre dashes.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - 12, 0, ROAD_W + 24, BEACH_TOP);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2 - 12, WORLD_W, ROAD_W + 24);
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, BEACH_TOP);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.strokeStyle = PALETTE.asphaltLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, BEACH_TOP);
    ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD_W, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings, trees and lamps in view.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    drawBuilding(ctx, b, time);
  }
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    if (t.palm) {
      ctx.strokeStyle = '#8a6a45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + 3, t.y - t.s - 4);
      ctx.stroke();
      ctx.fillStyle = '#3f9d4e';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y - t.s - 4, t.s * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x - t.s * 0.3, t.y - t.s * 0.3, t.s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#3a3a3a';
  for (const l of city.lamps) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    ctx.fillRect(l.x - 2, l.y - 8, 4, 10);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(l.x, l.y - 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3a3a';
  }
}

function drawMarker(ctx, x, y, time, label) {
  const pulse = 1 + Math.sin(time * 5) * 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#ffd94d';
  ctx.strokeStyle = '#7a5b00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(16, -8);
  ctx.lineTo(8, -8);
  ctx.lineTo(8, 8);
  ctx.lineTo(-8, 8);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-16, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7a5b00';
  ctx.beginPath();
  ctx.arc(0, -14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (label) {
    ctx.fillStyle = 'rgba(20,20,20,0.8)';
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width + 14;
    ctx.fillRect(x - tw / 2, y - 58, tw, 20);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(label, x, y - 44);
  }
}

function drawPerson(ctx, x, y, angle, color, down, isCop) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isCop ? '#1d3596' : '#2b2b2b';
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick and, for the player, a gun barrel.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(15, 0);
  ctx.stroke();
  ctx.restore();
}

function drawWorld(ctx, state, time) {
  drawCity(ctx, state, time);

  // Hidden packages glow gold.
  for (const pkg of state.packages) {
    if (pkg.found) continue;
    const bob = Math.sin(time * 3 + pkg.x) * 3;
    ctx.fillStyle = '#ffd94d';
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(pkg.x, pkg.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
  }

  // Mission marker and the next-mission prompt at the garage.
  const marker = missionMarker(state.missions, state.city.spots, state);
  if (marker) drawMarker(ctx, marker.x, marker.y, time, 'OBJECTIVE');
  if (!state.missions.active && state.missions.index < 3) {
    const g = state.city.spots.garage;
    drawMarker(ctx, g.x, g.y, time, 'NEXT JOB');
  }

  // Parked and stolen cars.
  for (const car of state.cars) {
    if (state.player.car === car) continue;
    drawCarShape(ctx, car.x, car.y, car.angle, car.color, { gold: car.gold, time });
  }
  // Traffic.
  for (const car of state.traffic) {
    const p = carXY(car);
    drawCarShape(ctx, p.x, p.y, car.angle, car.color, {});
  }
  // Cop cars.
  for (const car of state.copCars) {
    drawCarShape(ctx, car.x, car.y, car.angle, car.color, { cop: true, time });
  }
  // Pedestrians and foot cops.
  for (const ped of state.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.state === 'down', false);
  }
  for (const cop of state.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#2b4fd8', cop.state === 'down', true);
  }
  // Bullets and sparks.
  ctx.fillStyle = '#ffe9a8';
  for (const b of state.bullets) {
    ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The player: in a car, or on foot with a pistol.
  const p = state.player;
  if (p.car) {
    drawCarShape(ctx, p.car.x, p.car.y, p.car.angle, p.car.color, { gold: p.car.gold, time });
    if (p.car.smoke > 0.2) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(p.car.x - Math.cos(p.car.angle) * 26, p.car.y - Math.sin(p.car.angle) * 26, 8 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const blink = p.invulnerable > 0 && Math.floor(time * 12) % 2 === 0;
    if (!blink) {
      drawPerson(ctx, p.x, p.y, p.angle, PALETTE.player, false, false);
      // Aim line and pistol.
      const aim = p.aimAngle !== undefined ? p.aimAngle : p.angle;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(aim) * 14, p.y + Math.sin(aim) * 14);
      ctx.lineTo(p.x + Math.cos(aim) * 26, p.y + Math.sin(aim) * 26);
      ctx.stroke();
    }
  }
}

function drawStars(ctx, wanted, x, y) {
  ctx.font = '28px ' + FONT;
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? '#ffd94d' : 'rgba(255,255,255,0.35)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    const sx = x + i * 32;
    ctx.strokeText('★', sx, y);
    ctx.fillText('★', sx, y);
  }
}

function drawMinimap(ctx, state) {
  const mw = 210;
  const mh = 156;
  const x = 16;
  const y = VIEW_H - mh - 16;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(12,16,20,0.72)';
  roundRect(ctx, x - 6, y - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x, y, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(x, y, mw, mh);
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(x, y + BEACH_TOP * sy, mw, mh - BEACH_TOP * sy);
  ctx.strokeStyle = '#3d3a38';
  ctx.lineWidth = 3;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(x + ax * sx, y);
    ctx.lineTo(x + ax * sx, y + BEACH_TOP * sy);
    ctx.stroke();
  }
  for (const sy2 of STREETS) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy2 * sy);
    ctx.lineTo(x + mw, y + sy2 * sy);
    ctx.stroke();
  }
  const marker = missionMarker(state.missions, state.city.spots, state);
  if (marker) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of state.copCars) {
    ctx.fillStyle = '#4d7dff';
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR CITY', x, y - 10);
}

function drawHud(ctx, state, time) {
  const p = state.player;
  // Health and cash, top left.
  ctx.fillStyle = 'rgba(12,16,20,0.65)';
  roundRect(ctx, 14, 12, 240, 58, 8);
  ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  roundRect(ctx, 26, 24, 150, 14, 4);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#58c96b' : '#e33e2b';
  roundRect(ctx, 26, 24, 150 * clamp(p.health / 100, 0, 1), 14, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText('♥ ' + Math.ceil(p.health), 182, 36);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 26, 60);
  // Wanted stars, top right.
  drawStars(ctx, state.wanted, VIEW_W - 178, 44);
  // Objective, top centre.
  const objective = missionObjective(state.missions, state.city.spots);
  ctx.font = 'bold 16px ' + FONT;
  const tw = ctx.measureText(objective).width + 28;
  ctx.fillStyle = 'rgba(12,16,20,0.65)';
  roundRect(ctx, VIEW_W / 2 - tw / 2, 12, tw, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.textAlign = 'center';
  ctx.fillText(objective, VIEW_W / 2, 35);

  // Mission progress bar for hold steps.
  if (state.missions.active && state.missions.progress > 0) {
    ctx.fillStyle = 'rgba(12,16,20,0.65)';
    roundRect(ctx, VIEW_W / 2 - 150, 54, 300, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#ffd94d';
    roundRect(ctx, VIEW_W / 2 - 150, 54, 300 * state.missions.progress, 16, 6);
    ctx.fill();
  }

  // Ammo or speed, bottom right.
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
    ctx.fillStyle = 'rgba(12,16,20,0.65)';
    roundRect(ctx, VIEW_W - 150, VIEW_H - 66, 134, 50, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(String(kmh), VIEW_W - 40, VIEW_H - 30);
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText('km/h', VIEW_W - 40, VIEW_H - 14);
    ctx.fillStyle = p.car.hp > 40 ? '#58c96b' : '#e33e2b';
    roundRect(ctx, VIEW_W - 150, VIEW_H - 72, 134 * clamp(p.car.hp / 100, 0, 1), 5, 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(12,16,20,0.65)';
    roundRect(ctx, VIEW_W - 150, VIEW_H - 66, 134, 50, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(p.ammo + ' / ' + p.reserve, VIEW_W - 30, VIEW_H - 30);
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(p.reloading > 0 ? 'RELOADING…' : 'PISTOL', VIEW_W - 30, VIEW_H - 14);
  }

  // Minimap.
  drawMinimap(ctx, state);

  // Waypoint arrow at the screen edge when the marker is off screen.
  const marker = missionMarker(state.missions, state.city.spots, state);
  if (marker) {
    const cam = state.camera;
    const sx = (marker.x - cam.x) * cam.zoom;
    const sy = (marker.y - cam.y) * cam.zoom;
    if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ax = cx + Math.cos(a) * 300;
      const ay = cy + Math.sin(a) * 240;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(dist(p.x, p.y, marker.x, marker.y)) + 'm', ax, ay + 30);
    }
  }

  // Toasts, centre top under the objective.
  let ty = 96;
  for (const toast of state.toasts) {
    ctx.globalAlpha = clamp(toast.life, 0, 1);
    ctx.fillStyle = 'rgba(12,16,20,0.75)';
    ctx.font = 'bold 16px ' + FONT;
    const w = ctx.measureText(toast.text).width + 28;
    roundRect(ctx, VIEW_W / 2 - w / 2, ty, w, 30, 8);
    ctx.fill();
    ctx.fillStyle = toast.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(toast.text, VIEW_W / 2, ty + 21);
    ty += 38;
  }
  ctx.globalAlpha = 1;

  // Dialogue box, bottom centre.
  if (state.dialogueLine) {
    const line = state.dialogueLine;
    ctx.fillStyle = 'rgba(12,16,20,0.82)';
    roundRect(ctx, VIEW_W / 2 - 320, VIEW_H - 150, 640, 76, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(line.who, VIEW_W / 2 - 300, VIEW_H - 122);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px ' + FONT;
    wrapText(ctx, line.text, VIEW_W / 2 - 300, VIEW_H - 98, 540, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText('E / click ▸', VIEW_W / 2 + 300, VIEW_H - 84);
  }

  // Context hint near the player.
  if (state.hint) {
    ctx.fillStyle = 'rgba(12,16,20,0.7)';
    ctx.font = 'bold 14px ' + FONT;
    const w = ctx.measureText(state.hint).width + 20;
    roundRect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 200, w, 28, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(state.hint, VIEW_W / 2, VIEW_H - 181);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function drawTitle(ctx, state, time, save) {
  // A slow pan across the city behind the title.
  const cam = state.camera;
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  drawCity(ctx, state, time);
  ctx.restore();
  ctx.fillStyle = 'rgba(10,14,24,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 92px ' + FONT;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText('SOLMAR CITY', VIEW_W / 2, 210);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px ' + FONT;
  ctx.fillText('A wheelman’s story in the sun', VIEW_W / 2, 252);
  ctx.font = '16px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Steal cars · Outrun the police · Rob the bank', VIEW_W / 2, 286);

  const items = [];
  items.push({ key: '1', label: 'START STORY', action: 'start' });
  if (save) items.push({ key: '2', label: 'CONTINUE — $' + save.cash.toLocaleString('en-US') + ' · Job ' + (save.missionIndex + 1) + ' of 3', action: 'continue' });
  items.push({ key: '3', label: 'FREE ROAM', action: 'roam' });
  state.menuItems = items;
  let y = 360;
  for (const item of items) {
    const hover = state.menuHover === item.action;
    ctx.fillStyle = hover ? '#ffd94d' : 'rgba(12,16,20,0.75)';
    roundRect(ctx, VIEW_W / 2 - 230, y, 460, 52, 10);
    ctx.fill();
    ctx.fillStyle = hover ? '#1a1a1a' : '#ffffff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(item.label, VIEW_W / 2, y + 34);
    item.y = y;
    item.h = 52;
    y += 66;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '15px ' + FONT;
  ctx.fillText('WASD move · Shift run · E enter car · Mouse aim, click to shoot · R reload · P pause · M music', VIEW_W / 2, y + 30);
  ctx.fillText('An original game. No part of it comes from any other game.', VIEW_W / 2, y + 56);
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(8,10,16,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px ' + FONT;
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.font = '18px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('P / Esc to resume · S to save · Q to quit to title', VIEW_W / 2, 350);
}

function drawEndScreen(ctx, title, subtitle, prompt) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = title === 'WASTED' ? '#e33e2b' : '#ffd94d';
  ctx.font = 'bold 84px ' + FONT;
  ctx.fillText(title, VIEW_W / 2, 320);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px ' + FONT;
  ctx.fillText(subtitle, VIEW_W / 2, 370);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '16px ' + FONT;
  ctx.fillText(prompt, VIEW_W / 2, 420);
}

export function render(ctx, state, screen, time) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (screen === SCREEN_TITLE) {
    drawTitle(ctx, state, time, state.save);
    return;
  }
  const cam = state.camera;
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, state, time);
  ctx.restore();
  drawHud(ctx, state, time);
  if (screen === SCREEN_PAUSED) drawPause(ctx);
  if (screen === SCREEN_BUSTED) drawEndScreen(ctx, 'BUSTED', 'The Solmar City Police caught up with you. -$200.', 'Press E to walk free');
  if (screen === SCREEN_WASTED) drawEndScreen(ctx, 'WASTED', 'Jay did not make it. The city keeps moving.', 'Press E to wake up at the hospital');
  if (screen === SCREEN_STORY) drawEndScreen(ctx, 'STORY COMPLETE', 'Three jobs, one bank, and a city that is yours now.', 'Press E to keep roaming Solmar City');
}
