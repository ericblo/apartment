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

let musicTimer: number | null = null;
let musicMode: "party" | "techno" | null = null;
let musicStep = 0;
const BASS = [55, 55, 0, 55, 0, 65.4, 0, 55, 73.4, 0, 55, 0, 65.4, 0, 49, 0];
const ACID = [110, 0, 110, 220, 0, 110, 130.8, 0, 110, 0, 220, 110, 0, 98, 0, 146.8];

function musicTick() {
  const s = musicStep++ % 16;
  if (musicMode === "techno") {
    if (s % 4 === 0) tone(160, 0.14, "sine", 0.28, 0, 42); // pounding kick
    if (s % 4 === 2) tone(8000, 0.025, "square", 0.014);
    if (s % 2 === 1) tone(55, 0.09, "sawtooth", 0.05); // off-beat bass
    if (ACID[s]) tone(ACID[s] * 2, 0.08, "square", 0.018, 0, ACID[s] * 2.6);
    return;
  }
  if (s % 4 === 0) tone(150, 0.17, "sine", 0.24, 0, 46); // kick
  if (s % 4 === 2) tone(7000, 0.03, "square", 0.012); // hat
  if (BASS[s]) tone(BASS[s] * 2, 0.11, "sawtooth", 0.035);
  if (s === 0 || s === 10) [220, 277.2, 329.6].forEach((f) => tone(f * 2, 0.22, "triangle", 0.022));
}

function setMusic(mode: "party" | "techno", on: boolean) {
  if (!on || !enabled) {
    if (musicMode !== mode && enabled) return;
    if (musicTimer !== null) window.clearInterval(musicTimer);
    musicTimer = null;
    musicMode = null;
    return;
  }
  if (musicMode === mode || !ac()) return;
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicMode = mode;
  musicStep = 0;
  musicTimer = window.setInterval(musicTick, mode === "techno" ? 107 : 121); // 140 / 124 bpm
}

export const sfx = {
  setEnabled(on: boolean) {
    if (!on) {
      setMusic("party", false);
      setMusic("techno", false);
    }
    enabled = on;
  },
  /** A simple four-on-the-floor loop while the party is on. */
  party(on: boolean) {
    setMusic("party", on);
  },
  /** Harder, faster loop for Eric's party. */
  techno(on: boolean) {
    setMusic("techno", on);
  },
  /** Rising whoosh for when the room starts to spin. */
  whoosh() {
    tone(120, 1.6, "sawtooth", 0.05, 0, 900);
    tone(180, 1.6, "sine", 0.08, 0.1, 1400);
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
