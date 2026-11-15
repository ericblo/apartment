// Eric lives here too. He splits his time between the red bedroom and the office desk in
// the gallery, comes home through the front door on demand, and occasionally throws a
// very exclusive party under the red covers.
import * as THREE from "three";
import { Character } from "./character";
import { GUESTS } from "./party";
import { FRONT_DOOR } from "./data";
import { findPath, nearestWalkable, type Pt } from "./nav";

type Walker = { ch: Character; pos: THREE.Vector3; path: Pt[] | null; tag: HTMLDivElement; delay: number };

type State =
  | "toDesk"
  | "work"
  | "toRoom"
  | "chill"
  | "entering" // just got home, heading for the living room
  | "spin" // everything is spinning
  | "partyIn" // leading his guests to the red bedroom
  | "covers" // under the red covers
  | "partyOut"; // waiting for the guests to leave

const DESK_STAND: Pt = [1.45, 2.05];
const DESK_SEAT = { x: 1.45, y: 0.03, z: 2.2, h: 0 }; // on the office chair, facing the monitor
const ROOM_STAND: Pt = [6.6, 1.75];
const BED_SEAT = { x: 6.6, y: 0.21, z: 1.12, h: 0 }; // perched on the edge of the red bed
const BED_CENTRE = new THREE.Vector3(6.75, 0.64, 0.64);
const LIVING: Pt = [-4.5, -0.7];
const WALK = 2.2;
const COVERS_TIME = 26;

const GIRLS: { name: string; hair: number; tee: number; skin: number }[] = [
  { name: "Chloe", hair: 0xd9b36a, tee: 0xe0457b, skin: 0xf2cdb0 },
  { name: "Bianca", hair: 0x1a1210, tee: 0xb3262b, skin: 0xc48a5e },
  { name: "Sofia", hair: 0x6e3a1e, tee: 0x8e44ad, skin: 0xe9b48f },
  { name: "Nina", hair: 0x151515, tee: 0xf5f2ea, skin: 0xa86f47 },
  { name: "Zoe", hair: 0xb5451d, tee: 0x35c2c9, skin: 0xf0c3a0 },
];

export class Eric {
  private me: Walker;
  private girls: Walker[] = [];
  private state: State = "work";
  private timer = 20;
  private covers = new THREE.Group();
  private lumps: THREE.Mesh[] = [];
  private lights: THREE.PointLight[] = [];
  private t = 0;
  private tmp = new THREE.Vector3();
  /** 0..1: how red the room lighting should be. */
  redMix = 0;
  partyLeft = 0;

  constructor(
    private scene: THREE.Scene,
    private overlay: HTMLDivElement,
    private fx: (glyph: string, at: THREE.Vector3) => void
  ) {
    this.me = this.walker("Eric", new Character(GUESTS.find((g) => g.name === "Eric")?.look));
    this.sitAt(DESK_SEAT, "type");

    // the heap under the red duvet
    const duvet = new THREE.MeshLambertMaterial({ color: 0xe04038 });
    const spots: [number, number, number][] = [
      [-0.45, -0.25, 0.42],
      [0.35, -0.3, 0.38],
      [0, 0.2, 0.5],
      [-0.55, 0.3, 0.36],
      [0.6, 0.25, 0.4],
      [0.1, -0.05, 0.44],
    ];
    for (const [x, z, r] of spots) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), duvet);
      m.position.set(BED_CENTRE.x + x, BED_CENTRE.y, BED_CENTRE.z + z);
      m.userData = { ph: x * 5 + z * 3, r };
      this.lumps.push(m);
      this.covers.add(m);
    }
    this.covers.visible = false;
    scene.add(this.covers);

    for (const [x, z] of [
      [6.2, 0.3],
      [7.3, 1.4],
    ]) {
      const l = new THREE.PointLight(0xff1a1a, 0, 7, 1.3);
      l.position.set(x, 1.9, z);
      this.lights.push(l);
      scene.add(l);
    }
  }

  private walker(name: string, ch: Character): Walker {
    this.scene.add(ch.root);
    const tag = document.createElement("div");
    tag.className = "nametag";
    tag.textContent = name;
    this.overlay.appendChild(tag);
    return { ch, pos: new THREE.Vector3(), path: null, tag, delay: 0 };
  }

  private sitAt(seat: { x: number; y: number; z: number; h: number }, anim: "sit" | "type") {
    this.me.pos.set(seat.x, seat.y, seat.z);
    this.me.ch.face(seat.h, true);
    this.me.ch.setAnim(anim);
    this.me.path = null;
  }

  private go(w: Walker, to: Pt) {
    // stand up first if seated
    const [x, z] = nearestWalkable(w.pos.x, w.pos.z);
    w.pos.set(x, 0, z);
    w.path = findPath([x, z], to);
  }

  /** Moves a walker along its path. True once it has arrived. */
  private step(w: Walker, dt: number) {
    if (w.delay > 0) {
      w.delay -= dt;
      w.ch.setAnim("idle");
      return false;
    }
    if (!w.path || !w.path.length) return true;
    w.ch.setAnim("walk");
    let budget = WALK * dt;
    while (budget > 0 && w.path.length) {
      const [tx, tz] = w.path[0];
      const dx = tx - w.pos.x;
      const dz = tz - w.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        w.path.shift();
        continue;
      }
      w.ch.face(Math.atan2(dx, dz));
      const m = Math.min(d, budget);
      w.pos.x += (dx / d) * m;
      w.pos.z += (dz / d) * m;
      w.ch.advanceWalk(m);
      budget -= m;
      if (m >= d) w.path.shift();
    }
    return w.path.length === 0;
  }

  private atDoor(w: Walker) {
    const [x, z] = nearestWalkable(FRONT_DOOR[0], FRONT_DOOR[1]);
    w.pos.set(x, 0, z);
    w.ch.root.visible = true;
    w.tag.style.display = "";
  }

  get partying() {
    return this.state === "partyIn" || this.state === "covers" || this.state === "partyOut";
  }

  /** He walks in the front door; the engine spins the world until it calls stopSpin(). */
  comeHome() {
    if (this.partying) return false;
    this.atDoor(this.me);
    this.me.path = findPath([this.me.pos.x, this.me.pos.z], LIVING);
    this.state = "entering";
    this.fx("🌀", this.tmp.copy(this.me.pos).setY(1.9));
    return true;
  }

  stopSpin() {
    if (this.state !== "spin" && this.state !== "entering") return;
    this.state = "toRoom";
    this.go(this.me, ROOM_STAND);
  }

  startParty() {
    if (this.partying) return;
    this.atDoor(this.me);
    this.me.path = findPath([this.me.pos.x, this.me.pos.z], ROOM_STAND);
    this.girls = GIRLS.map((g, i) => {
      const w = this.walker(g.name, new Character({ hair: g.hair, tee: g.tee, skin: g.skin, shorts: 0x1c1c22, stripes: false, longHair: true, scale: 0.9 + (i % 3) * 0.02 }));
      this.atDoor(w);
      w.delay = 0.5 + i * 0.45;
      w.path = findPath([w.pos.x, w.pos.z], [ROOM_STAND[0] + (i - 2) * 0.35, ROOM_STAND[1] + (i % 2) * 0.3]);
      return w;
    });
    this.state = "partyIn";
    this.partyLeft = COVERS_TIME;
  }

  endParty() {
    if (this.state === "partyIn") {
      // called off before anyone made it to the bed
      this.state = "partyOut";
      this.girls.forEach((w) => this.go(w, FRONT_DOOR));
      this.go(this.me, ROOM_STAND);
      return;
    }
    if (this.state !== "covers") return;
    this.covers.visible = false;
    this.state = "partyOut";
    this.sitAt(BED_SEAT, "sit");
    this.me.ch.root.visible = true;
    this.me.tag.style.display = "";
    this.girls.forEach((w, i) => {
      const [x, z] = nearestWalkable(ROOM_STAND[0] + (i - 2) * 0.3, ROOM_STAND[1]);
      w.pos.set(x, 0, z);
      w.ch.root.visible = true;
      w.tag.style.display = "";
      w.delay = i * 0.4;
      w.path = findPath([x, z], FRONT_DOOR);
    });
  }

  update(dt: number, real: number) {
    this.t += real;
    const me = this.me;
    switch (this.state) {
      case "work":
      case "chill":
        this.timer -= dt;
        if (this.state === "work" && Math.random() < dt * 0.15) this.fx(["💻", "⌨️", "☕", "📈"][Math.floor(Math.random() * 4)], me.ch.headWorld(this.tmp));
        if (this.timer <= 0) {
          const next = this.state === "work" ? ROOM_STAND : DESK_STAND;
          this.state = this.state === "work" ? "toRoom" : "toDesk";
          this.go(me, next);
        }
        break;
      case "toDesk":
        if (this.step(me, dt)) {
          this.state = "work";
          this.timer = 28 + Math.random() * 15;
          this.sitAt(DESK_SEAT, "type");
        }
        break;
      case "toRoom":
        if (this.step(me, dt)) {
          this.state = "chill";
          this.timer = 20 + Math.random() * 12;
          this.sitAt(BED_SEAT, "sit");
        }
        break;
      case "entering":
        if (this.step(me, dt)) this.state = "spin";
        break;
      case "spin":
        me.ch.setAnim("pogo");
        me.ch.face(me.ch.heading + 2.6);
        break;
      case "partyIn": {
        let all = this.step(me, dt);
        for (const w of this.girls) all = this.step(w, dt) && all;
        if (all) {
          this.state = "covers";
          this.covers.visible = true;
          for (const w of [me, ...this.girls]) {
            w.ch.root.visible = false;
            w.tag.style.display = "none";
          }
        }
        break;
      }
      case "covers":
        this.partyLeft -= dt;
        if (Math.random() < real * 4) {
          const at = this.tmp.set(BED_CENTRE.x + (Math.random() - 0.5) * 1.6, 1.3, BED_CENTRE.z + (Math.random() - 0.5) * 1.1);
          this.fx(["❤️‍🔥", "💋", "🔥", "😈", "💦", "❤️"][Math.floor(Math.random() * 6)], at);
        }
        if (this.partyLeft <= 0) this.endParty();
        break;
      case "partyOut": {
        let gone = true;
        for (const w of this.girls) {
          const arrived = this.step(w, dt);
          if (arrived && w.ch.root.visible) {
            w.ch.root.visible = false;
            w.tag.style.display = "none";
          }
          gone = gone && arrived;
        }
        if (me.path) this.step(me, dt);
        if (gone) {
          for (const w of this.girls) {
            this.scene.remove(w.ch.root);
            w.tag.remove();
          }
          this.girls = [];
          this.state = "chill";
          this.timer = 12;
          if (me.path) this.sitAt(BED_SEAT, "sit");
        }
        break;
      }
    }

    // the duvet heap thumps along to the techno
    if (this.covers.visible) {
      const beat = this.t * 14.66;
      for (const m of this.lumps) {
        const u = m.userData as { ph: number; r: number };
        const b = Math.abs(Math.sin(beat * 0.5 + u.ph));
        m.scale.set(1.15, 0.55 + 0.5 * b, 1.1);
        m.position.y = BED_CENTRE.y + 0.05 + 0.22 * b;
      }
    }
    const want = this.state === "covers" || this.state === "partyIn" ? 1 : 0;
    this.redMix += (want - this.redMix) * (1 - Math.exp(-real * 2.5));
    if (Math.abs(this.redMix - want) < 0.004) this.redMix = want;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 7.33));
    this.lights.forEach((l) => (l.intensity = 8 * this.redMix * pulse));

    for (const w of [me, ...this.girls]) {
      w.ch.root.position.copy(w.pos);
      w.ch.update(dt);
    }
  }

  updateTags(project: (v: THREE.Vector3) => [number, number, boolean]) {
    for (const w of [this.me, ...this.girls]) {
      if (!w.ch.root.visible) continue;
      const [x, y, vis] = project(w.ch.headWorld(this.tmp));
      w.tag.style.visibility = vis ? "visible" : "hidden";
      w.tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  dispose() {
    for (const w of [this.me, ...this.girls]) {
      this.scene.remove(w.ch.root);
      w.tag.remove();
    }
    this.scene.remove(this.covers);
    this.lights.forEach((l) => this.scene.remove(l));
  }
}
