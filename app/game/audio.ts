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

export const sfx = {
  setEnabled(on: boolean) {
    enabled = on;
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
