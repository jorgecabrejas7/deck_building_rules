// Optional table sounds, off until switched on in the menu. Every sound is synthesized with the Web Audio API (no files) and quiet.
// kindOf, soundsFor and allow are pure (scripts/test_table_sound.js); the rest touches the browser.
const KEY = 'pdc_table_sound', GAP = 60; // GAP: ms between two sounds of one kind
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch (err) { /* storage blocked: off */ }
export const soundOn = () => on;

// the sound an action, or the log entry it became, makes; the same fields serve both. A move sounds by where it lands
export function kindOf(e) {
  switch (e.type) {
    case 'tap': return e.tapped ? 'tap' : 'untap';
    case 'untap_all': return 'untap';
    case 'move': return e.shuffle ? 'shuffle' : e.to.zone === 'battlefield' ? 'play' : 'draw';
    case 'shuffle': case 'mulligan': return 'shuffle';
    case 'token': return 'play';
    case 'flip': case 'counter': return 'tap';
    case 'roll': return 'roll';
    default: return null;
  }
}
// what other players' fresh log entries sound like: your own echo is silent (it sounded when you sent it), and a burst of one kind is one sound
export const soundsFor = (entries, you) => [...new Set(entries.filter((e) => e.seat !== you).map(kindOf).filter(Boolean))];
export const allow = (last, kind, now) => now - (last[kind] ?? -Infinity) >= GAP;

let ctx = null, master = null, noise = null;
const last = {};
// created on the first sound after a gesture (browsers keep audio blocked before one), resumed if suspended
function audio() {
  if (!ctx) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const env = (g, t, dur, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
function tone(t, f0, f1, dur, peak, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, dur, peak); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function hiss(t, dur, peak, type, f0, f1, q = 1) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, dur, peak); s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
}
const VOICES = {
  tap: (t) => { tone(t, 1700, 800, 0.05, 0.18, 'triangle'); hiss(t, 0.03, 0.1, 'highpass', 3000, 3000); },
  untap: (t) => tone(t, 2300, 1500, 0.035, 0.1, 'triangle'),
  play: (t) => { tone(t, 150, 55, 0.14, 0.7); hiss(t, 0.08, 0.3, 'lowpass', 1200, 400); },
  draw: (t) => hiss(t, 0.16, 0.22, 'bandpass', 1200, 5000, 0.8),
  shuffle: (t) => { for (let i = 0; i < 8; i++) hiss(t + i * 0.045, 0.035, 0.16, 'bandpass', 2500 + (i % 3) * 700, 3500, 1.2); },
  turn: (t) => { tone(t, 660, 660, 0.1, 0.16); tone(t + 0.09, 880, 880, 0.11, 0.16); },
  roll: (t) => { for (let i = 0; i < 5; i++) tone(t + i * 0.035, 900 + Math.random() * 900, 500, 0.03, 0.12, 'square'); },
  error: (t) => tone(t, 210, 140, 0.13, 0.22, 'triangle'),
};

// plays one sound unless sound is off, the kind just played, or audio is unavailable; true when it started
export function play(kind, now = performance.now()) {
  if (!on || !allow(last, kind, now) || !audio()) return false;
  last[kind] = now;
  VOICES[kind](ctx.currentTime);
  return true;
}
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (err) { /* kept for this visit only */ }
  play('tap');
}
