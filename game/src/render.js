// Drawing only: the city, the cars and people in it, the HUD with its minimap,
// and the title, pause and end screens. The camera follows the player; the
// minimap is a small live map of the whole city in the corner.

import { BEACH_Y, PLACES, WATER_Y } from './city.js';
import { CAR, FONT, PALETTE, ROADS, WORLD } from './config.js';
import { missionObjectiveText, missionTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_HELP = 'help';

const MINIMAP = 196;

/** Buttons the renderer laid out on the last frame, in CSS pixels: {id, x, y, w, h}. */
let lastButtons = [];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, cssW: 1280, cssH: 720 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.cssW = window.innerWidth;
    view.cssH = window.innerHeight;
    canvas.width = Math.round(view.cssW * ratio);
    canvas.height = Math.round(view.cssH * ratio);
    view.scale = Math.max(0.55, Math.min(1.6, Math.min(view.cssW / 1050, view.cssH / 680)));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Update the camera so the player stays centred, clamped to the city. */
  function updateCamera(G) {
    const vw = view.cssW / view.scale;
    const vh = view.cssH / view.scale;
    const focus = G.screen === 'title' ? G.attract : G.player;
    const tx = focus.x - vw / 2;
    const ty = focus.y - vh / 2;
    const maxX = Math.max(0, WORLD.width - vw);
    const maxY = Math.max(0, WORLD.height - vh);
    G.camera.x += (Math.max(0, Math.min(maxX, tx)) - G.camera.x) * 0.12;
    G.camera.y += (Math.max(0, Math.min(maxY, ty)) - G.camera.y) * 0.12;
    if (G.shake > 0) {
      G.camera.sx = (Math.random() - 0.5) * G.shake;
      G.camera.sy = (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - 0.6);
    } else {
      G.camera.sx = 0;
      G.camera.sy = 0;
    }
  }

  function worldToScreen(x, y) {
    return { x: (x - G_camera.x) * view.scale, y: (y - G_camera.y) * view.scale };
  }
  let G_camera = { x: 0, y: 0, sx: 0, sy: 0 };

  function beginWorld(G) {
    updateCamera(G);
    G_camera = G.camera;
    ctx.save();
    ctx.scale(view.scale, view.scale);
    ctx.translate(-(G.camera.x + G.camera.sx), -(G.camera.y + G.camera.sy));
  }

  function drawGround(G) {
    const { city } = G;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // The park block, darker green.
    const parkX = city.lines[2] + ROADS.width / 2 + 14;
    const parkY = city.lines[5] + ROADS.width / 2 + 14;
    const parkW = ROADS.step - ROADS.width - 28;
    const parkH = ROADS.step - ROADS.width - 28;
    ctx.fillStyle = PALETTE.grassDark;
    ctx.fillRect(parkX, parkY, parkW, parkH);
    // Beach and water along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_Y, WORLD.width, WORLD.height - BEACH_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, WORLD.width, WORLD.height - WATER_Y);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      ctx.fillRect(x + ((G.time * 12) % 90), WATER_Y + 26, 46, 3);
      ctx.fillRect(x + 40 + ((G.time * 9) % 90), WATER_Y + 64, 30, 3);
    }
    // Marina pier at the docks.
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(PLACES.docks.x - 90, WATER_Y - 120, 180, 130);
    ctx.fillStyle = '#6f5232';
    ctx.fillRect(PLACES.docks.x - 90, WATER_Y - 120, 180, 8);
  }

  function drawRoads(G) {
    const { lines } = G.city;
    // Sidewalks first (wider, pale), then the asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const line of lines) {
      ctx.fillRect(line - ROADS.width / 2 - 12, 0, ROADS.width + 24, WORLD.height);
      ctx.fillRect(0, line - ROADS.width / 2 - 12, WORLD.width, ROADS.width + 24);
    }
    ctx.fillStyle = PALETTE.road;
    for (const line of lines) {
      ctx.fillRect(line - ROADS.width / 2, 0, ROADS.width, WORLD.height);
      ctx.fillRect(0, line - ROADS.width / 2, WORLD.width, ROADS.width);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const line of lines) {
      for (let d = 0; d < WORLD.height; d += 46) {
        ctx.fillRect(line - 2, d, 4, 24);
        ctx.fillRect(d, line - 2, 24, 4);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = '#e8e8e8';
    for (const lx of lines) {
      for (const ly of lines) {
        for (let s = -40; s <= 40; s += 16) {
          ctx.fillRect(lx - ROADS.width / 2 - 4, ly + s - 3, 12, 6);
          ctx.fillRect(lx + ROADS.width / 2 - 8, ly + s - 3, 12, 6);
          ctx.fillRect(lx + s - 3, ly - ROADS.width / 2 - 4, 6, 12);
          ctx.fillRect(lx + s - 3, ly + ROADS.width / 2 - 8, 6, 12);
        }
      }
    }
  }

  function drawBuildings(G) {
    for (const b of G.city.buildings) {
      // Fake height: a shadow and a dark south face.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x, b.y + b.h - b.height * 4, b.w, b.height * 4);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      if (b.downtown) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 22) {
          for (let wy = b.y + 14; wy < b.y + b.h - 14; wy += 22) {
            ctx.fillRect(wx, wy, 10, 12);
          }
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 6, 16, 12);
      }
      if (b.place) {
        const label = PLACES[b.place].label;
        text(label, b.x + b.w / 2, b.y - 8, 15, '#20242e', 'center', '700');
      }
    }
  }

  function drawTrees(G) {
    for (const t of G.city.trees) {
      if (t.palm) {
        ctx.strokeStyle = '#8a6a44';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + 4, t.y - 16);
        ctx.stroke();
        ctx.fillStyle = PALETTE.palm;
        for (let f = 0; f < 5; f += 1) {
          const a = (f / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(t.x + 4 + Math.cos(a) * 9, t.y - 16 + Math.sin(a) * 7, 10, 4, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
        ctx.fillStyle = PALETTE.tree;
        ctx.beginPath();
        ctx.arc(t.x, t.y - 8, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.treeDark;
        ctx.beginPath();
        ctx.arc(t.x - 4, t.y - 11, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#5a5a5a';
    for (const lamp of G.city.lamps) {
      ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 10);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a5a5a';
    }
  }

  function drawCar(G, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#16181d';
    ctx.fillRect(-CAR.length / 2 + 4, -CAR.width / 2 - 3, 10, 6);
    ctx.fillRect(-CAR.length / 2 + 4, CAR.width / 2 - 3, 10, 6);
    ctx.fillRect(CAR.length / 2 - 14, -CAR.width / 2 - 3, 10, 6);
    ctx.fillRect(CAR.length / 2 - 14, CAR.width / 2 - 3, 10, 6);
    // Body.
    ctx.fillStyle = car.hp <= 0 ? '#3a3a3a' : car.color;
    rr(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx.fill();
    // Windshield and roof.
    ctx.fillStyle = 'rgba(180,220,235,0.85)';
    ctx.fillRect(CAR.length / 2 - 16, -CAR.width / 2 + 4, 8, CAR.width - 8);
    ctx.fillRect(-CAR.length / 2 + 6, -CAR.width / 2 + 4, 7, CAR.width - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-6, -CAR.width / 2 + 3, 12, CAR.width - 6);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 8, 3, 5);
    if (car.kind === 'police') {
      const on = Math.floor(car.siren * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff3b30' : '#2f6df6';
      ctx.fillRect(-4, -CAR.width / 2 + 2, 8, 6);
      ctx.fillStyle = on ? '#2f6df6' : '#ff3b30';
      ctx.fillRect(-4, CAR.width / 2 - 8, 8, 6);
    }
    if (car.kind === 'player') {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      rr(-CAR.length / 2 - 2, -CAR.width / 2 - 2, CAR.length + 4, CAR.width + 4, 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPed(G, ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.dead) {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (ped.cop) {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(0, -6, 8, 12);
      text('P', 4, 4, 9, '#fff', 'center', '700');
    } else if (ped.gang) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(8, -2, 7, 4);
    }
    ctx.restore();
  }

  function drawPlayer(G) {
    const p = G.player;
    if (G.playerCar) return; // the driver is inside the car
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0) return; // blink
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // Aim: a short gun barrel toward the mouse.
    ctx.rotate(p.aimAngle);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(8, -2, 12, 4);
    ctx.restore();
  }

  function drawPickups(G) {
    for (const pk of G.pickups) {
      if (pk.respawn > 0) continue;
      const bob = Math.sin(pk.bob) * 2;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2f9d4a';
        ctx.fillRect(-10, -7, 20, 14);
        text('$', 0, 5, 13, '#fff', 'center', '700');
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#d93838';
        ctx.fillRect(-3, -7, 6, 14);
        ctx.fillRect(-7, -3, 14, 6);
      } else {
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#20242e';
        ctx.fillRect(-6, -4, 12, 8);
      }
      ctx.restore();
    }
  }

  function drawMissionMarker(G) {
    const target = missionTarget(G);
    if (!target) return;
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    // Light beam.
    ctx.fillStyle = 'rgba(255,210,63,0.14)';
    ctx.fillRect(target.x - 26, target.y - 130, 52, 130);
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#20242e';
    ctx.lineWidth = 2;
    const s = 16 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    text(target.label, target.x, target.y - 40, 15, '#20242e', 'center', '700');
    // Edge arrow when the target is off screen.
    const vw = view.cssW / view.scale;
    const vh = view.cssH / view.scale;
    const cam = G.camera;
    const inView = target.x > cam.x && target.x < cam.x + vw && target.y > cam.y && target.y < cam.y + vh;
    if (!inView) {
      const cx = cam.x + vw / 2;
      const cy = cam.y + vh / 2;
      const ang = Math.atan2(target.y - cy, target.x - cx);
      const ax = cx + Math.cos(ang) * (vw / 2 - 40);
      const ay = cy + Math.sin(ang) * (vh / 2 - 40);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWorld(G) {
    beginWorld(G);
    drawGround(G);
    drawRoads(G);
    drawBuildings(G);
    drawTrees(G);
    drawPickups(G);
    drawMissionMarker(G);
    for (const car of G.cars) if (car.kind !== 'player') drawCar(G, car);
    if (G.playerCar) drawCar(G, G.playerCar);
    for (const ped of G.peds) drawPed(G, ped);
    drawPlayer(G);
    // Bullets.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    for (const b of G.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of G.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMinimap(G) {
    const x0 = view.cssW - MINIMAP - 14;
    const y0 = 64;
    const s = MINIMAP / WORLD.width;
    ctx.save();
    ctx.fillStyle = 'rgba(16,19,26,0.85)';
    rr(x0 - 5, y0 - 5, MINIMAP + 10, MINIMAP + 10, 8);
    ctx.fill();
    ctx.beginPath();
    rr(x0, y0, MINIMAP, MINIMAP, 4);
    ctx.clip();
    ctx.fillStyle = '#567d4a';
    ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.fillStyle = '#2f9db4';
    ctx.fillRect(x0, y0 + WATER_Y * s, MINIMAP, MINIMAP);
    ctx.fillStyle = '#ecd9a0';
    ctx.fillRect(x0, y0 + BEACH_Y * s, MINIMAP, (WATER_Y - BEACH_Y) * s);
    ctx.fillStyle = '#33353c';
    for (const line of G.city.lines) {
      ctx.fillRect(x0 + line * s - 4, y0, 8, MINIMAP);
      ctx.fillRect(x0, y0 + line * s - 4, MINIMAP, 8);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (const b of G.city.buildings) ctx.fillRect(x0 + b.x * s, y0 + b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    ctx.fillStyle = '#2f9d4a';
    for (const pk of G.pickups) {
      if (pk.respawn <= 0) ctx.fillRect(x0 + pk.x * s - 1, y0 + pk.y * s - 1, 3, 3);
    }
    const target = missionTarget(G);
    if (target) {
      ctx.fillStyle = '#ffd23f';
      const pulse = 4 + Math.sin(G.time * 4) * 1.5;
      ctx.beginPath();
      ctx.arc(x0 + target.x * s, y0 + target.y * s, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of G.cars) {
      if (car.kind === 'wreck') continue;
      ctx.fillStyle = car.kind === 'police' ? '#5a8dff' : 'rgba(255,255,255,0.75)';
      ctx.fillRect(x0 + car.x * s - 1.5, y0 + car.y * s - 1.5, 3, 3);
    }
    // The player: a white arrow that turns with them.
    ctx.save();
    ctx.translate(x0 + G.player.x * s, y0 + G.player.y * s);
    ctx.rotate(G.playerCar ? G.playerCar.angle : G.player.aimAngle);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#20242e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    text('PALMA BAY', x0 + MINIMAP / 2, y0 + MINIMAP + 20, 11, 'rgba(244,241,230,0.8)', 'center', '700');
  }

  function drawHud(G) {
    // Health + money, top left.
    ctx.fillStyle = 'rgba(16,19,26,0.8)';
    rr(12, 12, 240, 58, 8);
    ctx.fill();
    text('♥', 26, 40, 20, G.player.hp > 30 ? '#e2574c' : '#ff3b30');
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(52, 24, 180, 12);
    ctx.fillStyle = G.player.hp > 30 ? '#4caf50' : '#ff3b30';
    ctx.fillRect(52, 24, Math.max(0, 180 * (G.player.hp / 100)), 12);
    text(`$${G.money.toLocaleString('en-US')}`, 52, 58, 20, '#ffd23f', 'left', '700');
    // Wanted stars, top right above the minimap.
    const stars = G.wanted.stars;
    ctx.fillStyle = 'rgba(16,19,26,0.8)';
    rr(view.cssW - 14 - 5 * 30 - 16, 12, 5 * 30 + 16, 40, 8);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      text(i < stars ? '★' : '☆', view.cssW - 22 - i * 30, 42, 26, i < stars ? '#ffd23f' : 'rgba(244,241,230,0.4)', 'right', '700');
    }
    drawMinimap(G);
    // Mission objective, top centre.
    const objective = missionObjectiveText(G);
    ctx.font = `700 16px ${FONT}`;
    const ow = ctx.measureText(objective).width + 28;
    ctx.fillStyle = 'rgba(16,19,26,0.8)';
    rr((view.cssW - ow) / 2, 12, ow, 36, 8);
    ctx.fill();
    text('◆ ' + objective, view.cssW / 2, 36, 16, '#ffd23f', 'center', '700');
    // Weapon / vehicle, bottom left.
    ctx.fillStyle = 'rgba(16,19,26,0.8)';
    rr(12, view.cssH - 58, 250, 46, 8);
    ctx.fill();
    if (G.playerCar) {
      const car = G.playerCar;
      text(`${car.model.toUpperCase()}  ${Math.round(car.speed * 0.45)} km/h`, 26, view.cssH - 36, 16, '#f4f1e6', 'left', '700');
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(26, view.cssH - 28, 150, 8);
      ctx.fillStyle = car.hp > 30 ? '#4caf50' : '#ff3b30';
      ctx.fillRect(26, view.cssH - 28, Math.max(0, 150 * Math.min(1, car.hp / 100)), 8);
      text('E — get out', 190, view.cssH - 20, 12, 'rgba(244,241,230,0.7)');
    } else {
      const reloading = G.player.reloading > 0;
      text(reloading ? 'RELOADING…' : `PISTOL  ${G.player.ammo} / ${G.player.ammoReserve}`, 26, view.cssH - 36, 16, '#f4f1e6', 'left', '700');
      text('E — enter car   Click — shoot   R — reload', 26, view.cssH - 20, 12, 'rgba(244,241,230,0.7)');
    }
    // Clock, bottom right.
    const hours = 9 + Math.floor(G.time / 240);
    const minutes = Math.floor((G.time % 240) / 4);
    const clock = `${String(((hours - 1) % 12) + 1).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours >= 12 && hours < 24 ? 'PM' : 'AM'}`;
    text(clock, view.cssW - 16, view.cssH - 16, 16, '#f4f1e6', 'right', '700');
    text(`Missions ${G.stats.missionsDone}/6`, view.cssW - 16, view.cssH - 38, 13, 'rgba(244,241,230,0.7)', 'right');
    // Briefing card.
    if (G.briefing && G.briefing.timer > 0) {
      const bw = Math.min(560, view.cssW - 40);
      ctx.fillStyle = 'rgba(16,19,26,0.92)';
      rr((view.cssW - bw) / 2, 64, bw, 96, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect((view.cssW - bw) / 2, 64, 5, 96);
      text(G.briefing.title, (view.cssW - bw) / 2 + 22, 96, 20, '#ffd23f', 'left', '700');
      ctx.font = `15px ${FONT}`;
      const words = G.briefing.text.split(' ');
      let line = '';
      let ly = 120;
      for (const word of words) {
        if (ctx.measureText(line + word).width > bw - 44) {
          text(line, (view.cssW - bw) / 2 + 22, ly, 15, '#f4f1e6');
          line = '';
          ly += 19;
        }
        line += word + ' ';
      }
      text(line, (view.cssW - bw) / 2 + 22, ly, 15, '#f4f1e6');
    }
    // Toasts, bottom centre.
    let ty = view.cssH - 92;
    for (let i = G.toasts.length - 1; i >= 0; i -= 1) {
      const toast = G.toasts[i];
      ctx.globalAlpha = Math.min(1, toast.timer);
      ctx.font = `700 15px ${FONT}`;
      const tw = ctx.measureText(toast.text).width + 24;
      ctx.fillStyle = 'rgba(16,19,26,0.85)';
      rr((view.cssW - tw) / 2, ty - 24, tw, 30, 8);
      ctx.fill();
      text(toast.text, view.cssW / 2, ty - 3, 15, '#f4f1e6', 'center', '700');
      ctx.globalAlpha = 1;
      ty -= 36;
    }
    // Early controls hint.
    if (G.time < 14) {
      text('WASD move · Mouse aim · Click shoot · E enter car · Shift run · P pause', view.cssW / 2, view.cssH - 72, 14, 'rgba(244,241,230,0.85)', 'center');
    }
  }

  function drawButton(x, y, w, h, label, hot) {
    ctx.fillStyle = hot ? '#ffd23f' : 'rgba(244,241,230,0.12)';
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = hot ? '#ffd23f' : 'rgba(244,241,230,0.4)';
    ctx.lineWidth = 1.5;
    rr(x, y, w, h, 8);
    ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 6, 18, hot ? '#20242e' : '#f4f1e6', 'center', '700');
  }

  function drawPanel(G, title, subtitle, buttons, footer) {
    const w = Math.min(640, view.cssW - 40);
    const x = (view.cssW - w) / 2;
    const y = 120;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.fillRect(0, 0, view.cssW, view.cssH);
    ctx.fillStyle = '#10131a';
    rr(x, y, w, 420, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,63,0.5)';
    ctx.lineWidth = 2;
    rr(x, y, w, 420, 14);
    ctx.stroke();
    text(title, view.cssW / 2, y + 78, 52, '#ffd23f', 'center', '800');
    text(subtitle, view.cssW / 2, y + 112, 17, '#f4f1e6', 'center');
    lastButtons = [];
    let by = y + 150;
    for (const b of buttons) {
      const bw = 300;
      const bx = view.cssW / 2 - bw / 2;
      const hot = G.hoverButton === b.id;
      drawButton(bx, by, bw, 46, b.label, hot);
      lastButtons.push({ id: b.id, x: bx, y: by, w: bw, h: 46 });
      by += 58;
    }
    if (footer) {
      ctx.font = `14px ${FONT}`;
      const words = footer.split(' ');
      let line = '';
      let ly = by + 8;
      for (const word of words) {
        if (ctx.measureText(line + word).width > w - 80) {
          text(line, view.cssW / 2, ly, 14, 'rgba(244,241,230,0.75)', 'center');
          line = '';
          ly += 19;
        }
        line += word + ' ';
      }
      text(line, view.cssW / 2, ly, 14, 'rgba(244,241,230,0.75)', 'center');
    }
  }

  function drawTitle(G, hasSave) {
    // Attract mode: the world behind the panel, slowly panning.
    drawWorld(G);
    const buttons = [{ id: 'new', label: '▶  New Game' }];
    if (hasSave) buttons.push({ id: 'continue', label: 'Continue — $' + G.saveMoney + ' · ' + G.saveMissions + '/6 missions' });
    buttons.push({ id: 'help', label: 'How to play' });
    drawPanel(
      G,
      'PALMA CITY',
      'An open-world crime story — a sun-soaked city, yours to take.',
      buttons,
      'Steal cars, outrun the Palma Bay police, run six jobs for Mara Voss and take down the Kessler crew. WASD to move, mouse to aim, E to get in a car.',
    );
    text('A completely original game — no Rockstar content, no GTA assets.', view.cssW / 2, view.cssH - 24, 12, 'rgba(244,241,230,0.55)', 'center');
  }

  function drawPaused(G) {
    drawWorld(G);
    drawHud(G);
    drawPanel(
      G,
      'PAUSED',
      `Palma Bay waits for you.  $${G.money.toLocaleString('en-US')}  ·  ${G.stats.missionsDone}/6 missions`,
      [
        { id: 'resume', label: 'Resume' },
        { id: 'save', label: 'Save game' },
        { id: 'help', label: 'How to play' },
        { id: 'quit', label: 'Quit to title' },
      ],
      'Q quick-saves too. Your progress also autosaves after every mission.',
    );
  }

  function drawHelp(G) {
    drawWorld(G);
    drawPanel(
      G,
      'HOW TO PLAY',
      'Palma Bay is open. Do the jobs, or just cause trouble.',
      [{ id: 'back', label: '← Back' }],
      'Move WASD (Shift to run) · Aim with the mouse, click to shoot · E to steal or enter a car, E again to get out · R reload · Stealing cars, shooting and running people over raise your wanted level · Lose the cops to cool off, or pay $200 at Lou\'s Spray Shop to clear it · Yellow diamond on the map is your next job · M mute · Pick up green cash, white health and yellow ammo around the city.',
    );
  }

  function drawWasted(G) {
    drawWorld(G);
    drawPanel(
      G,
      'WASTED',
      'You were taken down in Palma Bay.',
      [{ id: 'respawn', label: 'Wake up at the hospital — $100' }],
      'The city does not wait. Your car is gone; your money is lighter.',
    );
  }

  /** Paint one frame for the screen the game is on. */
  function draw(G, screen, hasSave) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawTitle(G, hasSave);
      return;
    }
    if (screen === SCREEN_HELP) {
      drawHelp(G);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPaused(G);
      return;
    }
    if (screen === SCREEN_WASTED) {
      drawWasted(G);
      return;
    }
    drawWorld(G);
    drawHud(G);
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** The buttons laid out on the last drawn frame (for click handling). */
    buttons() {
      return lastButtons;
    },
    /** Convert a mouse position in CSS pixels to world coordinates. */
    screenToWorld(mx, my) {
      return { x: (mx / view.scale) + G_camera.x + G_camera.sx, y: (my / view.scale) + G_camera.y + G_camera.sy };
    },
    view,
  };
}
