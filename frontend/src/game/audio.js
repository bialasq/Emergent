// Procedural Web Audio sfx + low ambient drone — no asset files needed.
let ctx = null;
let muted = false;
let masterGain = null;
let ambientGain = null;
let ambientNodes = [];

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

export function setMuted(v) {
  muted = v;
  if (masterGain) masterGain.gain.value = v ? 0 : 0.6;
}
export function isMuted() { return muted; }

function tone({ freq = 440, duration = 0.15, type = "sine", gain = 0.2, attack = 0.005, release = 0.1, freqEnd = null }) {
  const c = ensure();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), c.currentTime + duration);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration + release);
  o.connect(g); g.connect(masterGain);
  o.start(c.currentTime);
  o.stop(c.currentTime + duration + release + 0.05);
}

function noiseBurst({ duration = 0.1, gain = 0.1, freq = 1200 }) {
  const c = ensure();
  if (!c || muted) return;
  const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(); src.buffer = buffer;
  const filter = c.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = freq;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(filter); filter.connect(g); g.connect(masterGain);
  src.start();
}

export const sfx = {
  step:    () => tone({ freq: 95, duration: 0.05, type: "triangle", gain: 0.06 }),
  attack:  () => tone({ freq: 320, freqEnd: 200, duration: 0.08, type: "sawtooth", gain: 0.12 }),
  hit:     () => { tone({ freq: 180, freqEnd: 60, duration: 0.12, type: "square", gain: 0.18 }); noiseBurst({ duration: 0.06, gain: 0.05, freq: 800 }); },
  hurt:    () => tone({ freq: 220, freqEnd: 80, duration: 0.18, type: "sawtooth", gain: 0.16 }),
  spell:   () => { tone({ freq: 660, freqEnd: 990, duration: 0.18, type: "sine", gain: 0.12 }); tone({ freq: 880, freqEnd: 1320, duration: 0.16, type: "triangle", gain: 0.08 }); },
  heal:    () => { tone({ freq: 523, duration: 0.16, type: "sine", gain: 0.14 }); tone({ freq: 784, duration: 0.16, type: "sine", gain: 0.10, attack: 0.04 }); },
  pickup:  () => { tone({ freq: 880, freqEnd: 1320, duration: 0.10, type: "sine", gain: 0.12 }); },
  levelup: () => { [523, 659, 784, 988].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.18, type: "triangle", gain: 0.14 }), i * 90)); },
  death:   () => { [330, 247, 165, 110].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.30, type: "sawtooth", gain: 0.18 }), i * 140)); },
  victory: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.24, type: "triangle", gain: 0.16 }), i * 120)); },
  descend: () => { tone({ freq: 220, freqEnd: 110, duration: 0.5, type: "sine", gain: 0.18 }); },
};

export function startAmbient() {
  const c = ensure();
  if (!c || ambientGain) return;
  ambientGain = c.createGain();
  ambientGain.gain.value = muted ? 0 : 0.04;
  ambientGain.connect(masterGain);
  // low drone + slow LFO
  const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 55;
  const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = 110;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.15;
  const lfoG = c.createGain(); lfoG.gain.value = 18;
  lfo.connect(lfoG); lfoG.connect(o2.frequency);
  const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 320;
  o1.connect(filter); o2.connect(filter); filter.connect(ambientGain);
  o1.start(); o2.start(); lfo.start();
  ambientNodes = [o1, o2, lfo];
}

export function stopAmbient() {
  for (const n of ambientNodes) { try { n.stop(); } catch { /* ignore */ } }
  ambientNodes = [];
  if (ambientGain) { try { ambientGain.disconnect(); } catch { /* ignore */ } ambientGain = null; }
}
