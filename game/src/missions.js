// The story: Jay Rook, a wheelman new to Solmar City, works three jobs for
// Sal Moretti and ends up robbing the Solmar Bank. Each mission is a chain
// of steps — go somewhere, pick something up, lose the cops — with a marker
// on the map and a line of dialogue to carry it.

import { MISSION_REWARDS } from './config.js';
import { dist } from './random.js';

export const MISSION_NAMES = [
  '1 · The Pickup',
  '2 · Hot Wheels',
  '3 · The Big Score',
];

// Dialogue is a queue of {who, text}; the game shows one line at a time.
function say(who, text) {
  return { who, text };
}

export function makeMissionState() {
  return {
    index: 0, // which mission, 0..2; 3 means the story is done
    step: 0,
    done: false,
    timer: 0,
    progress: 0,
    dialogue: [],
    active: false,
  };
}

function missionSteps(m, spots) {
  switch (m) {
    case 0:
      return [
        {
          kind: 'goto', spot: spots.warehouse, radius: 70,
          objective: 'Pick up the package at the warehouse',
          onArrive: () => [say('Sal', 'Good, you found it. A little something for a friend across town.'), say('Jay', 'Across town. In this traffic. Great.')],
        },
        {
          kind: 'goto', spot: spots.motel, radius: 70,
          objective: 'Deliver the package to the Seaside Motel',
          onArrive: () => [say('Sal', 'Delivered clean. You drive like you mean it, kid.'), say('Jay', 'So what is the next job, Sal?')],
        },
      ];
    case 1:
      return [
        {
          kind: 'enterGoldCar', radius: 60,
          objective: 'Steal the gold Comet GT parked downtown',
          onArrive: () => [say('Sal', 'That Comet is worth more than my house. Take it. Quietly.'), say('Jay', 'Quietly. Sure. With the alarm screaming.')],
        },
        {
          kind: 'goto', spot: spots.garage, radius: 80,
          objective: 'Lose the cops, then deliver the Comet to the garage',
          heat: 2,
          onArrive: () => [say('Sal', 'Beautiful. The buyer pays double for a car this clean.'), say('Jay', 'Double? Then I want a raise.')],
        },
      ];
    case 2:
      return [
        {
          kind: 'goto', spot: spots.bank, radius: 70,
          objective: 'Get to the Solmar Bank',
          onArrive: () => [say('Jay', 'Alright. In and out, sixty seconds, no heroes.'), say('Sal', 'The vault is through the back. Go.')],
        },
        {
          kind: 'hold', spot: spots.bank, radius: 60, holdSeconds: 8,
          objective: 'Grab the cash — stay in the vault!',
          onArrive: () => [say('Jay', 'Cash in the bag. Now the whole city is coming.'), say('Sal', 'Then drive like your life depends on it. It does.')],
        },
        {
          kind: 'goto', spot: spots.safehouse, radius: 80,
          objective: 'Escape to the safehouse',
          heat: 3,
          onArrive: () => [say('Sal', 'You did it, Jay. Solmar City is yours now.'), say('Jay', 'Then let us spend it before they find us.')],
        },
      ];
    default:
      return [];
  }
}

export function currentStep(missions, spots) {
  const steps = missionSteps(missions.index, spots);
  return steps[missions.step] || null;
}

export function missionObjective(missions, spots) {
  if (missions.index >= 3) return 'Free roam — Solmar City is yours';
  const step = currentStep(missions, spots);
  return step ? step.objective : '';
}

export function missionMarker(missions, spots, state) {
  if (missions.index >= 3) return null;
  const step = currentStep(missions, spots);
  if (!step) return null;
  if (step.kind === 'enterGoldCar') return { x: state.goldCar.x, y: state.goldCar.y };
  return { x: step.spot.x, y: step.spot.y };
}

export function startMission(missions, state) {
  missions.active = true;
  missions.step = 0;
  missions.timer = 0;
  missions.progress = 0;
  missions.dialogue = [];
  missions.dialogue.push(say('Sal', missionIntro(missions.index)));
  if (missions.index === 1) {
    state.events.push({ type: 'missionStart', name: MISSION_NAMES[1] });
  }
}

function missionIntro(index) {
  return [
    'Jay, I have work for you. Pick up a package at the warehouse and take it to the Seaside Motel.',
    'A gold Comet GT is parked downtown. Steal it and bring it to my garage. The cops will not like it.',
    'This is the big one, Jay. The Solmar Bank. Get in, grab the cash, and get to the safehouse.',
  ][index];
}

// Advance the mission state; called every frame while a mission is active.
export function updateMissions(state, dt) {
  const missions = state.missions;
  if (missions.index >= 3 || !missions.active) return;
  const step = currentStep(missions, state.city.spots);
  if (!step) return;
  const p = state.player;

  if (step.kind === 'goto') {
    if (dist(p.x, p.y, step.spot.x, step.spot.y) < step.radius) {
      advanceStep(state, step);
    }
  } else if (step.kind === 'enterGoldCar') {
    if (p.car === state.goldCar) {
      advanceStep(state, step);
      if (step.heat === undefined) addHeat(state, 2);
    }
  } else if (step.kind === 'hold') {
    if (dist(p.x, p.y, step.spot.x, step.spot.y) < step.radius) {
      missions.progress += dt / step.holdSeconds;
      if (missions.progress >= 1) advanceStep(state, step);
    } else {
      missions.progress = Math.max(0, missions.progress - dt * 0.5);
    }
  }
}

function addHeat(state, stars) {
  state.wanted = Math.max(state.wanted, stars);
  state.quietT = 0;
  state.events.push({ type: 'wantedUp', stars: state.wanted });
}

function advanceStep(state, step) {
  const missions = state.missions;
  if (step.onArrive) missions.dialogue.push(...step.onArrive());
  if (step.heat) addHeat(state, step.heat);
  state.events.push({ type: 'stepDone' });
  missions.step += 1;
  missions.progress = 0;
  missions.timer = 0;
  const next = currentStep(missions, state.city.spots);
  if (!next) {
    // Mission complete: pay up and roll into the next one.
    const reward = MISSION_REWARDS[`m${missions.index + 1}`] || 0;
    state.player.cash += reward;
    state.events.push({ type: 'missionComplete', name: MISSION_NAMES[missions.index], reward });
    missions.index += 1;
    missions.active = false;
    missions.done = missions.index >= 3;
    if (missions.index < 3) {
      missions.dialogue.push(say('Sal', `Job done. $${reward} is yours. Come see me when you are ready for the next one.`));
    } else {
      missions.dialogue.push(say('Sal', 'That is the whole story, Jay. The city is yours — go enjoy it.'));
    }
  }
}

// The player starts the next mission by walking into the marker at Sal's garage.
export function tryStartNextMission(state) {
  const missions = state.missions;
  if (missions.active || missions.index >= 3) return false;
  const garage = state.city.spots.garage;
  if (dist(state.player.x, state.player.y, garage.x, garage.y) < 80) {
    startMission(missions, state);
    return true;
  }
  return false;
}
