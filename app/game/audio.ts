// A handful of tiny synthesized sound effects (no audio files).
let ctx: AudioContext | null = null;
let enabled = true;

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let partyTimer: number | null = null;
let partyStep = 0;
const BASS = [55, 55, 0, 55, 0, 65.4, 0, 55, 73.4, 0, 55, 0, 65.4, 0, 49, 0];

function partyTick() {
  const s = partyStep++ % 16;
  if (s % 4 === 0) tone(150, 0.17, "sine", 0.24, 0, 46); // kick
  if (s % 4 === 2) tone(7000, 0.03, "square", 0.012); // hat
  if (BASS[s]) tone(BASS[s] * 2, 0.11, "sawtooth", 0.035);
  if (s === 0 || s === 10) [220, 277.2, 329.6].forEach((f) => tone(f * 2, 0.22, "triangle", 0.022));
}

function stopParty() {
  if (partyTimer !== null) window.clearInterval(partyTimer);
  partyTimer = null;
}

export const sfx = {
  setEnabled(on: boolean) {
    enabled = on;
    if (!on) stopParty();
  },
  /** A simple four-on-the-floor loop at 124 bpm while the party is on. */
  party(on: boolean) {
    if (!on || !enabled) return stopParty();
    if (partyTimer !== null || !ac()) return;
    partyStep = 0;
    partyTimer = window.setInterval(partyTick, 121);
  },
  click() {
    tone(660, 0.07, "triangle", 0.08);
  },
  queue() {
    tone(520, 0.08, "triangle", 0.09);
    tone(780, 0.1, "triangle", 0.09, 0.07);
  },
  done() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.1, i * 0.09));
  },
  grumble() {
    tone(150, 0.22, "sawtooth", 0.05, 0, 95);
    tone(120, 0.25, "sawtooth", 0.05, 0.2, 80);
  },
  pop() {
    tone(900, 0.09, "sine", 0.1, 0, 300);
  },
  note() {
    const scale = [392, 440, 523, 587, 659, 784];
    tone(scale[Math.floor(Math.random() * scale.length)], 0.22, "sine", 0.07);
  },
  yum() {
    tone(440, 0.1, "triangle", 0.09);
    tone(660, 0.1, "triangle", 0.09, 0.1);
    tone(880, 0.18, "triangle", 0.09, 0.2);
  },
};
