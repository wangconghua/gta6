// All sound is synthesized with WebAudio: engine hum, gunshots, sirens,
// pickup blips and a little bass-line groove. No audio files, no network.

export function makeAudio() {
  return {
    ctx: null,
    master: null,
    muted: false,
    musicOn: false,
    musicTimer: 0,
    musicStep: 0,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenT: 0,
  };
}

function ensure(audio) {
  if (audio.ctx) return true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    return true;
  } catch {
    return false;
  }
}

export function unlockAudio(audio) {
  if (ensure(audio) && audio.ctx.state === 'suspended') audio.ctx.resume();
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  return audio.muted;
}

function blip(audio, freq, dur, type, vol, slideTo) {
  if (!ensure(audio) || audio.muted) return;
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol || 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(audio, dur, vol, filterFreq) {
  if (!ensure(audio) || audio.muted) return;
  const t = audio.ctx.currentTime;
  const len = Math.floor(audio.ctx.sampleRate * dur);
  const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audio.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1800;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  src.start(t);
}

export function playSound(audio, name) {
  if (!audio.ctx && !ensure(audio)) return;
  if (audio.muted) return;
  switch (name) {
    case 'shoot': noiseBurst(audio, 0.12, 0.5, 2400); break;
    case 'copShoot': noiseBurst(audio, 0.1, 0.25, 1800); break;
    case 'pickup': blip(audio, 660, 0.09, 'sine', 0.25); blip(audio, 990, 0.14, 'sine', 0.22); break;
    case 'cash': blip(audio, 880, 0.08, 'triangle', 0.25); setTimeout(() => blip(audio, 1320, 0.12, 'triangle', 0.25), 70); break;
    case 'step': blip(audio, 523, 0.1, 'triangle', 0.25); setTimeout(() => blip(audio, 784, 0.16, 'triangle', 0.25), 90); break;
    case 'mission': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(audio, f, 0.18, 'triangle', 0.28), i * 110)); break;
    case 'crash': noiseBurst(audio, 0.25, 0.5, 900); break;
    case 'busted': [392, 311, 262].forEach((f, i) => setTimeout(() => blip(audio, f, 0.25, 'sawtooth', 0.2), i * 160)); break;
    case 'wasted': [330, 262, 196, 131].forEach((f, i) => setTimeout(() => blip(audio, f, 0.3, 'sawtooth', 0.2), i * 180)); break;
    case 'reload': blip(audio, 300, 0.06, 'square', 0.12); setTimeout(() => blip(audio, 420, 0.06, 'square', 0.12), 90); break;
    case 'dryfire': blip(audio, 180, 0.05, 'square', 0.15); break;
    case 'enter': blip(audio, 220, 0.1, 'sine', 0.2, 440); break;
    default: break;
  }
}

// A looping two-tone police siren while any cop car is near.
export function updateSiren(audio, active) {
  if (!ensure(audio)) return;
  if (active && !audio.sirenOsc) {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 700;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    audio.sirenOsc = osc;
    audio.sirenGain = gain;
    audio.sirenT = 0;
  } else if (!active && audio.sirenOsc) {
    audio.sirenOsc.stop();
    audio.sirenOsc = null;
    audio.sirenGain = null;
  }
  if (audio.sirenOsc) {
    audio.sirenT += 1 / 60;
    const f = 700 + 320 * Math.sin(audio.sirenT * 4.5);
    audio.sirenOsc.frequency.setValueAtTime(f, audio.ctx.currentTime);
    audio.sirenGain.gain.value = audio.muted ? 0 : 0.05;
  }
}

// Engine hum that follows the driven car's speed.
export function updateEngine(audio, speedRatio) {
  if (!ensure(audio)) return;
  if (speedRatio > 0.02 && !audio.engineOsc) {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    gain.gain.value = 0.04;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    osc.start();
    audio.engineOsc = osc;
    audio.engineGain = gain;
  } else if (speedRatio <= 0.02 && audio.engineOsc) {
    audio.engineOsc.stop();
    audio.engineOsc = null;
    audio.engineGain = null;
  }
  if (audio.engineOsc) {
    audio.engineOsc.frequency.setValueAtTime(55 + speedRatio * 130, audio.ctx.currentTime);
    audio.engineGain.gain.value = audio.muted ? 0 : 0.03 + speedRatio * 0.04;
  }
}

// A simple bass groove: root notes walking under the city, one bar at a time.
const BASS_LINE = [55, 0, 55, 65.4, 49, 0, 58.3, 65.4, 55, 0, 55, 65.4, 73.4, 65.4, 58.3, 49];

export function updateMusic(audio, dt, on) {
  if (!on) return;
  if (!ensure(audio) || audio.muted) return;
  audio.musicTimer += dt;
  const stepDur = 0.22;
  if (audio.musicTimer >= stepDur) {
    audio.musicTimer -= stepDur;
    const freq = BASS_LINE[audio.musicStep % BASS_LINE.length];
    audio.musicStep += 1;
    if (freq > 0) blip(audio, freq, 0.2, 'triangle', 0.16);
    if (audio.musicStep % 8 === 0) blip(audio, 220, 0.3, 'sine', 0.05);
  }
}
