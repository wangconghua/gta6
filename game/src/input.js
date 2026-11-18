// Keyboard and mouse state, read fresh every frame. The game asks this
// module what is held down; it never touches DOM events itself.

import { KEYS } from './config.js';

export function makeInput() {
  return {
    up: false, down: false, left: false, right: false,
    run: false, shoot: false, spaceShoot: false,
    reload: false, pause: false, mute: false,
    enterPressed: false, interactPressed: false,
    mouseX: 640, mouseY: 360, mouseDown: false,
    anyKey: false,
  };
}

function has(list, code) {
  return list.indexOf(code) !== -1;
}

export function attachInput(input, canvas) {
  const down = (e) => {
    input.anyKey = true;
    if (has(KEYS.up, e.code)) input.up = true;
    if (has(KEYS.down, e.code)) input.down = true;
    if (has(KEYS.left, e.code)) input.left = true;
    if (has(KEYS.right, e.code)) input.right = true;
    if (has(KEYS.run, e.code)) input.run = true;
    if (has(KEYS.reload, e.code)) input.reload = true;
    if (has(KEYS.pause, e.code)) input.pause = true;
    if (has(KEYS.mute, e.code)) input.mute = true;
    if (has(KEYS.enterCar, e.code)) input.enterPressed = true;
    if (e.code === 'Space') {
      input.spaceShoot = true;
      input.interactPressed = true;
      e.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) e.preventDefault();
  };
  const up = (e) => {
    if (has(KEYS.up, e.code)) input.up = false;
    if (has(KEYS.down, e.code)) input.down = false;
    if (has(KEYS.left, e.code)) input.left = false;
    if (has(KEYS.right, e.code)) input.right = false;
    if (has(KEYS.run, e.code)) input.run = false;
    if (has(KEYS.reload, e.code)) input.reload = false;
    if (has(KEYS.pause, e.code)) input.pause = false;
    if (has(KEYS.mute, e.code)) input.mute = false;
    if (e.code === 'Space') input.spaceShoot = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    input.shoot = true;
    input.interactPressed = true;
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
    input.shoot = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Clear the one-frame presses after the game has read them.
export function endFrameInput(input) {
  input.enterPressed = false;
  input.interactPressed = false;
  input.pause = false;
  input.mute = false;
  input.reload = false;
}
