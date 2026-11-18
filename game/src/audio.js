// All sound is synthesised with WebAudio: no audio files, no network. Gunshots,
// sirens, engine hum, pickups, mission jingles and a low-key bass-and-hats groove
// are all oscillators and filtered noise built here. Audio starts on the first
// user gesture, as browsers require.

const NOTE = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47, C3: 130.81, E3: 164.81, G3: 196.0, A3: 220.0 };

/** A two-bar bass line and a hat pattern, looped while the game runs. */
const BASS_LINE = [NOTE.C2, 0, NOTE.C2, NOTE.G2, 0, NOTE.A2, 0, NOTE.G2, NOTE.F2, 0, NOTE.F2, NOTE.G2, 0, NOTE.E2, NOTE.D2, 0];
const BEAT = 0.22; // seconds per sixteenth note

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that wails between two tones while wanted.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ctx || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, duration, type, gainValue, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainValue, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function startMusic() {
    if (musicTimer !== null || !ctx) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const note = BASS_LINE[step % BASS_LINE.length];
      if (note > 0) tone(note, BEAT * 1.8, 'triangle', 0.5);
      if (step % 4 === 2) noiseBurst(0.03, 8000, 0.06, 'highpass'); // hat
      if (step % 16 === 0) tone(NOTE.C3, BEAT * 2, 'sine', 0.12);
      step += 1;
    }, BEAT * 1000);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shot() {
      noiseBurst(0.12, 1800, 0.5);
      tone(160, 0.08, 'square', 0.18, 0, 60);
    },
    enemyShot() {
      noiseBurst(0.1, 1400, 0.22);
    },
    punch() {
      noiseBurst(0.08, 500, 0.4);
    },
    crash() {
      noiseBurst(0.35, 700, 0.6);
      tone(90, 0.3, 'sine', 0.4, 0, 40);
    },
    explosion() {
      noiseBurst(0.8, 400, 0.9);
      tone(70, 0.7, 'sine', 0.5, 0, 28);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.3);
      tone(990, 0.14, 'sine', 0.3, 0.08);
    },
    cash() {
      tone(880, 0.08, 'triangle', 0.3);
      tone(1174, 0.1, 'triangle', 0.3, 0.07);
      tone(1568, 0.16, 'triangle', 0.3, 0.14);
    },
    denied() {
      tone(220, 0.16, 'square', 0.2, 0, 160);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.35, i * 0.11));
    },
    missionStart() {
      [392, 523, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.3, i * 0.09));
    },
    busted() {
      [330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.2, i * 0.22));
    },
    wasted() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.34, 'sawtooth', 0.22, i * 0.24));
    },
    /** Engine hum follows `speedRatio` 0..1; 0 silences it. */
    setEngine(speedRatio) {
      if (!ctx || muted) return;
      engineGain.gain.setTargetAtTime(speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, ctx.currentTime, 0.1);
    },
    /** Siren wail on while wanted; `t` is the running clock for the wail. */
    setSiren(on, t) {
      if (!ctx || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(720 + Math.sin(t * 2.4) * 260, ctx.currentTime, 0.05);
    },
  };
}
