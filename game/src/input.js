// Keyboard and pointer input. Held keys are read every step; one-shot presses
// (enter car, shoot is held, pause, reload, mission accept) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_ENTER = 1; // E: get in / out of a car
export const ACTION_PAUSE = 2; // P or Escape
export const ACTION_RELOAD = 4; // R
export const ACTION_ACCEPT = 8; // Enter / Space on menus and briefings
export const ACTION_MUTE = 16; // M
export const ACTION_SAVE = 32; // F5 is the browser's; use Q to quick-save in pause

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, fire: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    const name = KEYS[event.code];
    if (name) {
      held[name] = true;
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_ACCEPT;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyQ') actions |= ACTION_SAVE;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = KEYS[event.code];
    if (name) held[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      held.fire = true;
      actions |= ACTION_ACCEPT; // clicking also starts from menus
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) {
      mouseDown = false;
      held.fire = false;
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Mouse position in CSS pixels relative to the canvas. */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
  };
}
