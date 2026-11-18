// The story: six jobs for Mara Voss, who runs Palma Bay's west-side garage and
// wants the Kessler crew pushed out. Each mission is a small state machine with
// stages, a map target and a payout; the chain advances on its own and the
// player is always told what to do next.

import { PLACES } from './city.js';
import { addWanted, spawnGang } from './entities.js';

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Wheels Up',
    reward: 300,
    brief: 'Mara Voss needs a driver. Steal any car off the street and bring it to her garage.',
  },
  {
    id: 'pickup',
    title: 'The Pickup',
    reward: 500,
    brief: 'A crate is waiting at the Marina Docks. Grab it and bring it back to the garage. No questions.',
  },
  {
    id: 'heat',
    title: 'Hot Pursuit',
    reward: 400,
    brief: 'The cops saw too much. Lose the heat — get your wanted level down to zero.',
  },
  {
    id: 'muscle',
    title: 'Muscle Work',
    reward: 800,
    brief: 'Kessler\'s boys are muscling in on the turf at Sun Plaza. Put all four of them down.',
  },
  {
    id: 'getaway',
    title: 'Getaway',
    reward: 1000,
    brief: 'The job went loud. Get across town to the Marina Docks in 75 seconds with the cops on you.',
  },
  {
    id: 'score',
    title: 'The Big Score',
    reward: 2500,
    brief: 'Palma Bank, midday. Hold the vault for 8 seconds, then lose a four-star wanted level at the safehouse.',
  },
];

/** The current objective's map target, or null when the job is "do it anywhere". */
export function missionTarget(G) {
  const m = G.mission;
  if (!m || m.done) return null;
  const def = MISSIONS[m.index];
  if (!def) return null;
  if (def.id === 'wheels') return m.stage === 0 ? null : { x: PLACES.garage.x, y: PLACES.garage.y, label: "Mara's Garage" };
  if (def.id === 'pickup') return m.stage === 0 ? { x: PLACES.docks.x, y: PLACES.docks.y, label: 'Marina Docks' } : { x: PLACES.garage.x, y: PLACES.garage.y, label: "Mara's Garage" };
  if (def.id === 'heat') return null;
  if (def.id === 'muscle') return { x: PLACES.turf.x, y: PLACES.turf.y, label: 'Kessler Turf' };
  if (def.id === 'getaway') return { x: PLACES.docks.x, y: PLACES.docks.y, label: 'Marina Docks' };
  if (def.id === 'score') return m.stage === 0 ? { x: PLACES.bank.x, y: PLACES.bank.y, label: 'Palma Bank' } : { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: 'Safehouse' };
  return null;
}

/** One line for the HUD: what the player should do right now. */
export function missionObjectiveText(G) {
  const m = G.mission;
  if (!m) return 'Free roam — press Enter for the next job.';
  if (m.done) return 'Story complete. Palma Bay is yours — free roam.';
  const def = MISSIONS[m.index];
  if (!def) return 'Next job incoming…';
  if (def.id === 'wheels') return m.stage === 0 ? 'Steal a car (walk up to one, press E)' : 'Drive the car to Mara\'s Garage';
  if (def.id === 'pickup') return m.stage === 0 ? 'Collect the crate at the Marina Docks' : 'Bring the crate back to the garage';
  if (def.id === 'heat') return 'Lose the cops — wanted level to zero';
  if (def.id === 'muscle') return `Take out Kessler's crew (${m.killsDone}/4 down)`;
  if (def.id === 'getaway') return `Reach the Marina Docks — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'score') return m.stage === 0 ? `Hold the bank vault (${Math.ceil(m.hold)}s)` : 'Escape to the Safehouse';
  return def.title;
}

/** Start mission `index` (or finish the story when index is past the last). */
export function startMission(G, index) {
  if (index >= MISSIONS.length) {
    G.mission = { index, done: true, stage: 0, timer: 0, hold: 0, killsDone: 0 };
    G.toast('Story complete — Palma Bay is yours.');
    return;
  }
  const def = MISSIONS[index];
  G.mission = { index, done: false, stage: 0, timer: 0, hold: 0, killsDone: 0, gangSpawned: false };
  G.briefing = { title: `Mission ${index + 1}: ${def.title}`, text: def.brief, timer: 5 };
  G.audio.missionStart();
  if (def.id === 'heat') addWanted(G, 2, 'The cops are onto you!');
  if (def.id === 'getaway') {
    G.mission.timer = 75;
    addWanted(G, 3, 'Three stars — run!');
  }
  if (def.id === 'score') {
    G.mission.hold = 8;
    addWanted(G, 2, 'The alarm is ringing!');
  }
}

function completeMission(G) {
  const def = MISSIONS[G.mission.index];
  G.money += def.reward;
  G.stats.missionsDone += 1;
  G.toast(`Mission complete: ${def.title} — +$${def.reward}.`);
  G.audio.missionDone();
  G.mission = { index: G.mission.index + 1, done: false, stage: 0, timer: 0, hold: 0, killsDone: 0, gangSpawned: false, pending: 4 };
  G.saveGame();
}

/** Advance the active mission one step; returns nothing, mutates G. */
export function updateMission(G, dt) {
  const m = G.mission;
  if (!m || m.done) return;
  if (m.staged) return; // a screenshot scene holds its job still
  if (m.pending !== undefined) {
    m.pending -= dt;
    if (m.pending <= 0) {
      delete m.pending;
      startMission(G, m.index);
    }
    return;
  }
  const def = MISSIONS[m.index];
  const p = G.player;
  const near = (place, dist) => Math.hypot(p.x - place.x, p.y - place.y) < dist;

  if (def.id === 'wheels') {
    if (m.stage === 0 && G.playerCar) m.stage = 1;
    else if (m.stage === 1 && near(PLACES.garage, 110)) completeMission(G);
  } else if (def.id === 'pickup') {
    if (m.stage === 0 && near(PLACES.docks, 80)) {
      m.stage = 1;
      G.toast('Crate collected. Get it back to the garage.');
      G.audio.pickup();
    } else if (m.stage === 1 && near(PLACES.garage, 110)) completeMission(G);
  } else if (def.id === 'heat') {
    if (G.wanted.stars === 0) completeMission(G);
  } else if (def.id === 'muscle') {
    if (!m.gangSpawned) {
      for (let i = 0; i < 4; i += 1) spawnGang(G, PLACES.turf.x, PLACES.turf.y);
      m.gangSpawned = true;
    }
    const alive = G.peds.filter((ped) => ped.gang && !ped.dead).length;
    m.killsDone = 4 - alive;
    if (alive === 0) completeMission(G);
  } else if (def.id === 'getaway') {
    m.timer -= dt;
    if (near(PLACES.docks, 100)) completeMission(G);
    else if (m.timer <= 0) {
      G.toast('Too slow — the job is blown. Try again.');
      G.audio.denied();
      startMission(G, m.index);
    }
  } else if (def.id === 'score') {
    if (m.stage === 0) {
      if (near(PLACES.bank, 110)) {
        m.hold -= dt;
        if (m.hold <= 0) {
          m.stage = 1;
          addWanted(G, 2, 'Vault cracked! Four stars — run for the safehouse!');
          G.toast('Vault cracked. Run for the safehouse!');
        }
      } else {
        m.hold = 8;
      }
    } else if (near(PLACES.safehouse, 110)) {
      G.wanted.stars = 0;
      completeMission(G);
    }
  }
}
