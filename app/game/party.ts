// Party mode: friends arrive through the hallway, the lights go disco, everybody dances.
import * as THREE from "three";
import { Character, type Look } from "./character";
import { findPath, nearestWalkable, type Pt } from "./nav";
import { FRONT_DOOR } from "./data";

type GuestDef = { name: string; look: Partial<Look> };

export const GUESTS: GuestDef[] = [
  { name: "Jen", look: { hair: 0x2a1a12, tee: 0xe0457b, shorts: 0x2f3a5f, stripes: false, longHair: true, scale: 0.94, skin: 0xf0c3a0 } },
  { name: "Eric", look: { hair: 0x5a3d28, tee: 0x2f6fb0, shorts: 0x3a3d42, stripes: false, skin: 0xe9b48f } },
  { name: "Alex", look: { hair: 0x1c1c1c, tee: 0xf2c230, shorts: 0x1c1c22, stripes: false, skin: 0xc68e62 } },
  { name: "Ian", look: { hair: 0xb5651d, tee: 0x2e8b57, shorts: 0x6b4a2f, stripes: false, scale: 1.05, skin: 0xf2cdb0 } },
  { name: "Maya", look: { hair: 0x151515, tee: 0x8e44ad, shorts: 0x22252b, stripes: false, longHair: true, scale: 0.92, skin: 0xa86f47 } },
  { name: "Sam", look: { hair: 0xd9b36a, tee: 0xf5f2ea, shorts: 0x7a1f1f, stripes: true, skin: 0xf0c3a0 } },
  { name: "Priya", look: { hair: 0x1a1210, tee: 0xff7a3d, shorts: 0x1f4a4a, stripes: false, longHair: true, scale: 0.9, skin: 0xb9794f } },
  { name: "Leo", look: { hair: 0x3a2a20, tee: 0x1c1c22, shorts: 0x8a8f96, stripes: false, scale: 1.02, skin: 0xd9a070 } },
  { name: "Lea", look: { hair: 0xc9a25a, tee: 0x35c2c9, shorts: 0xf5f2ea, stripes: false, longHair: true, scale: 0.93, skin: 0xf2cdb0 } },
  { name: "Mateo", look: { hair: 0x17110d, tee: 0xd63a2f, shorts: 0x23262d, stripes: true, scale: 1.03, skin: 0xc48a5e } },
  { name: "Other Ian", look: { hair: 0x6e4a2a, tee: 0x9ad13b, shorts: 0x2f3a5f, stripes: false, scale: 0.98, skin: 0xf0c3a0 } },
  { name: "Andrea", look: { hair: 0x4a2418, tee: 0xf06aa8, shorts: 0x151515, stripes: false, longHair: true, scale: 0.95, skin: 0xd9a070 } },
];

/** Where guests come in and go out. */
const DOOR: Pt = FRONT_DOOR;
/** The dance floor: the living-room rug and the space around it. */
const SPOTS: Pt[] = [
  [-4.5, -1.9],
  [-4.3, -0.9],
  [-4.6, 0.1],
  [-4.2, 1.0],
  [-5.1, -2.3],
  [-5.1, 1.6],
  [-3.7, -2.5],
  [-5.9, 2.0],
  [-3.9, 0.2],
  [-5.2, 0.9],
  [-4.0, -1.5],
  [-4.9, -2.8],
];
/** Some guests end up dancing on the furniture: [x, height, z], by guest index. */
const PERCH: Record<number, [number, number, number]> = {
  2: [-5.58, 0.47, -1.05], // Alex, on the coffee table
  5: [-6.85, 0.46, 0.4], // Sam, on the sectional
  8: [-5.7, 0.42, -3.2], // Lea, on the loveseat
  9: [-6.85, 0.46, -0.8], // Mateo, on the sectional
};
type Move = "dance" | "twerk" | "pogo" | "chug" | "spin";
const MOVES: Move[] = ["twerk", "twerk", "twerk", "pogo", "pogo", "dance", "chug", "spin"];
const MOVE_FX: Record<Move, string[]> = {
  twerk: ["🍑", "🔥", "💦", "🥵"],
  pogo: ["🤘", "🔥", "💥"],
  dance: ["🎶", "✨", "💃", "🕺"],
  chug: ["🍺", "🍻", "🥴"],
  spin: ["🌀", "😵‍💫", "✨"],
};
export const ROOMMATE_SPOT: Pt = [-4.9, -0.4];
const FLOOR_CENTRE = new THREE.Vector3(-4.8, 0, -0.5);
const WALK = 2.3;

type Guest = {
  ch: Character;
  name: string;
  pos: THREE.Vector3;
  path: Pt[] | null;
  state: "waiting" | "arriving" | "dancing" | "leaving" | "gone";
  wait: number;
  spot: Pt;
  tag: HTMLDivElement;
  perch: [number, number, number] | null;
  move: Move;
  moveT: number;
  heading: number;
};

export class Party {
  active = false;
  /** 0 = normal lighting, 1 = full disco. Eases in and out. */
  mix = 0;
  private guests: Guest[] = [];
  private rig = new THREE.Group();
  private lights: THREE.PointLight[] = [];
  private spots: THREE.Mesh[] = [];
  private ball: THREE.Mesh;
  private t = 0;
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private overlay: HTMLDivElement,
    private fx: (glyph: string, at: THREE.Vector3) => void
  ) {
    // mirror ball over the rug
    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x8899bb, emissiveIntensity: 0.6, flatShading: true })
    );
    this.ball.position.set(FLOOR_CENTRE.x, 2.25, FLOOR_CENTRE.z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0x3b2a22 }));
    cord.position.set(FLOOR_CENTRE.x, 2.78, FLOOR_CENTRE.z);
    this.rig.add(this.ball, cord);

    // coloured lights that sweep the rooms
    const homes: [number, number][] = [
      [-5.6, -1.6],
      [-4.2, 0.6],
      [-5.0, 2.4],
      [-1.5, -2.8],
      [1.5, 2.3],
      [7.5, -2.0],
    ];
    homes.forEach(([x, z], i) => {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.4);
      l.position.set(x, 2.1, z);
      l.userData = { x, z, ph: i * 1.7 };
      this.lights.push(l);
      this.rig.add(l);
    });

    // pools of colour on the floor (these also show on the unlit scan)
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.04;
      m.renderOrder = 4;
      m.userData = { ph: i * 0.9, r: 1.2 + (i % 3) * 0.9, cx: i < 6 ? FLOOR_CENTRE.x : -1 + (i - 6) * 3, cz: i < 6 ? FLOOR_CENTRE.z : i === 7 ? 2.4 : -3 };
      this.spots.push(m);
      this.rig.add(m);
    }
    this.rig.visible = false;
    scene.add(this.rig);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.clearGuests();
    GUESTS.forEach((def, i) => {
      const ch = new Character(def.look);
      ch.danceStyle = i % 3;
      ch.dancePhase = i * 1.3;
      ch.root.visible = false;
      this.scene.add(ch.root);
      const tag = document.createElement("div");
      tag.className = "nametag";
      tag.textContent = def.name;
      tag.style.display = "none";
      this.overlay.appendChild(tag);
      const [dx, dz] = nearestWalkable(DOOR[0], DOOR[1]);
      const perch = PERCH[i] ?? null;
      const spot: Pt = perch ? [perch[0], perch[2]] : SPOTS[i % SPOTS.length];
      this.guests.push({ ch, name: def.name, pos: new THREE.Vector3(dx, 0, dz), path: null, state: "waiting", wait: 0.5 + i * 0.6, spot, tag, perch, move: "twerk", moveT: 0, heading: 0 });
    });
  }

  /** Guests head for the door. Lighting fades back as they go. */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.guests.forEach((g, i) => {
      if (g.state === "waiting") {
        g.state = "gone";
        return;
      }
      g.state = "leaving";
      g.wait = i * 0.3;
      g.path = null;
      if (g.perch) {
        // hop down off the furniture
        const [x, z] = nearestWalkable(g.pos.x, g.pos.z);
        g.pos.set(x, 0, z);
      }
    });
  }

  /** True while any guest is still around (arriving, dancing or on their way out). */
  get busy() {
    return this.guests.length > 0;
  }

  get guestsHere() {
    return this.guests.filter((g) => g.state === "dancing").length;
  }

  private clearGuests() {
    for (const g of this.guests) {
      this.scene.remove(g.ch.root);
      g.tag.remove();
    }
    this.guests = [];
  }

  update(dt: number, real: number) {
    this.t += real;
    const target = this.active ? 1 : 0;
    this.mix += (target - this.mix) * (1 - Math.exp(-real * 2.2));
    if (Math.abs(this.mix - target) < 0.004) this.mix = target;
    this.rig.visible = this.mix > 0.01;

    const t = this.t;
    this.ball.rotation.y = t * 1.5;
    const col = new THREE.Color();
    this.lights.forEach((l, i) => {
      const u = l.userData as { x: number; z: number; ph: number };
      col.setHSL((t * 0.35 + i * 0.19) % 1, 1, 0.55);
      l.color.copy(col);
      const beat = 0.65 + 0.35 * Math.abs(Math.sin(t * 6.6 + u.ph));
      l.intensity = 7 * this.mix * beat;
      l.position.x = u.x + Math.cos(t * 0.9 + u.ph) * 1.1;
      l.position.z = u.z + Math.sin(t * 1.1 + u.ph) * 0.9;
    });
    this.spots.forEach((m, i) => {
      const u = m.userData as { ph: number; r: number; cx: number; cz: number };
      const a = t * (1.6 + (i % 3) * 0.5) * (i % 2 ? 1 : -1) + u.ph;
      m.position.x = u.cx + Math.cos(a) * u.r;
      m.position.z = u.cz + Math.sin(a) * u.r * 0.8;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setHSL((t * 0.2 + i * 0.137) % 1, 1, 0.5);
      mat.opacity = 0.42 * this.mix;
    });

    // confetti and debris raining over the dance floor
    if (this.active && Math.random() < real * 5) {
      const junk = ["🎊", "🎉", "🍕", "🍺", "🧻", "🎊", "🥳", "🍾"];
      this.fx(junk[Math.floor(Math.random() * junk.length)], this.tmp.set(FLOOR_CENTRE.x + (Math.random() - 0.5) * 5, 1.6 + Math.random() * 0.8, FLOOR_CENTRE.z + (Math.random() - 0.5) * 5));
    }

    let anyone = false;
    for (const g of this.guests) {
      if (g.state === "gone") continue;
      anyone = true;
      if (g.state === "waiting") {
        g.wait -= dt;
        if (g.wait <= 0) {
          g.state = "arriving";
          g.ch.root.visible = true;
          g.tag.style.display = "";
          g.path = findPath([g.pos.x, g.pos.z], g.spot);
          this.fx("🎉", this.tmp.copy(g.pos).setY(1.9));
        }
      } else if (g.state === "arriving" || g.state === "leaving") {
        if (g.state === "leaving" && g.wait > 0) {
          g.wait -= dt;
          g.ch.setAnim("cheer");
        } else {
          if (!g.path) g.path = findPath([g.pos.x, g.pos.z], DOOR);
          g.ch.setAnim("walk");
          let budget = WALK * dt;
          while (budget > 0 && g.path.length) {
            const [tx, tz] = g.path[0];
            const dx = tx - g.pos.x;
            const dz = tz - g.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 1e-4) {
              g.path.shift();
              continue;
            }
            g.ch.face(Math.atan2(dx, dz));
            const m = Math.min(d, budget);
            g.pos.x += (dx / d) * m;
            g.pos.z += (dz / d) * m;
            g.ch.advanceWalk(m);
            budget -= m;
            if (m >= d) g.path.shift();
          }
          if (!g.path.length) {
            if (g.state === "arriving") {
              g.state = "dancing";
              if (g.perch) g.pos.set(...g.perch);
              g.heading = Math.atan2(FLOOR_CENTRE.x - g.pos.x, FLOOR_CENTRE.z - g.pos.z);
              g.moveT = 0;
            } else {
              g.state = "gone";
              g.ch.root.visible = false;
              g.tag.style.display = "none";
            }
          }
        }
      } else if (g.state === "dancing") {
        // everyone keeps switching moves; nobody stays civilised for long
        g.moveT -= dt;
        if (g.moveT <= 0) {
          g.move = MOVES[Math.floor(Math.random() * MOVES.length)];
          g.moveT = 2.5 + Math.random() * 3.5;
          g.ch.danceStyle = Math.floor(Math.random() * 3);
          // twerkers turn their backs to the room
          g.ch.face(g.move === "twerk" ? g.heading + Math.PI : g.heading);
          g.ch.setAnim(g.move === "spin" ? "pogo" : g.move);
        }
        if (g.move === "spin") g.ch.face(g.ch.heading + 2.4);
        if (Math.random() < dt * 0.9) {
          const fx = MOVE_FX[g.move];
          this.fx(fx[Math.floor(Math.random() * fx.length)], g.ch.headWorld(this.tmp));
        }
      }
      g.ch.root.position.copy(g.pos);
      g.ch.update(dt);
    }
    if (!anyone && !this.active && this.guests.length) this.clearGuests();
  }

  /** Keep each name tag over its guest's head. */
  updateTags(project: (v: THREE.Vector3) => [number, number, boolean]) {
    for (const g of this.guests) {
      if (g.state === "gone" || g.state === "waiting") continue;
      const [x, y, vis] = project(g.ch.headWorld(this.tmp));
      g.tag.style.visibility = vis ? "visible" : "hidden";
      g.tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  dispose() {
    this.clearGuests();
    this.scene.remove(this.rig);
  }
}
