// The roommate: a chunky low-poly figure built from primitives and animated procedurally.
// Looks are based on the scan (white tee, black three-stripe shorts, barefoot).
// To use real photos later, map a face texture onto `head` in buildModel().
import * as THREE from "three";

export type Anim =
  | "idle"
  | "walk"
  | "wash"
  | "scrub"
  | "vacuum"
  | "water"
  | "carry"
  | "toss"
  | "makebed"
  | "fluff"
  | "sit"
  | "sleep"
  | "keys"
  | "eat"
  | "shrug"
  | "cheer"
  | "dance"
  | "twerk"
  | "pogo"
  | "chug"
  | "type"
  | "limp";

export type Prop = "none" | "sponge" | "vacuum" | "can" | "bag" | "pizza";

type Pose = {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shL: number;
  shR: number;
  shLz: number;
  shRz: number;
  elL: number;
  elR: number;
  torso: number;
  twist: number;
  headX: number;
  headY: number;
  lift: number;
  tilt: number;
};

const REST: Pose = {
  hipL: 0,
  hipR: 0,
  kneeL: 0,
  kneeR: 0,
  shL: 0,
  shR: 0,
  shLz: 0.12,
  shRz: 0.12,
  elL: -0.15,
  elR: -0.15,
  torso: 0,
  twist: 0,
  headX: 0,
  headY: 0,
  lift: 0,
  tilt: 0,
};

const SKIN = 0xe9b48f;
const HAIR = 0x4a3324;
const TEE = 0xf7f4ee;
const SHORTS = 0x1c1c22;

/** How a character looks. The roommate uses the defaults; party guests vary them. */
export type Look = { skin: number; hair: number; tee: number; shorts: number; stripes: boolean; longHair: boolean; scale: number };
const DEFAULT_LOOK: Look = { skin: SKIN, hair: HAIR, tee: TEE, shorts: SHORTS, stripes: true, longHair: false, scale: 1 };

export class Character {
  root = new THREE.Group(); // position + heading
  private tiltG = new THREE.Group(); // lying down
  private body = new THREE.Group(); // bob / lift
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elL = new THREE.Group();
  private elR = new THREE.Group();
  private handR = new THREE.Group();
  private props: Record<Exclude<Prop, "none">, THREE.Object3D>;
  private shadow: THREE.Mesh;
  private eyelids: THREE.Mesh[] = [];

  private pose: Pose = { ...REST };
  private target: Pose = { ...REST };
  anim: Anim = "idle";
  prop: Prop = "none";
  heading = 0;
  private headingTarget = 0;
  private t = 0;
  private walkPhase = 0;
  speedFactor = 1;

  /** 0-2: which dance this character does, and where in the beat they start. */
  danceStyle = 0;
  dancePhase = 0;
  private look: Look;

  constructor(look: Partial<Look> = {}) {
    this.look = { ...DEFAULT_LOOK, ...look };
    this.tiltG.scale.setScalar(this.look.scale);
    this.root.add(this.tiltG);
    this.tiltG.add(this.body);
    this.props = this.buildModel();
    const sg = new THREE.CircleGeometry(0.34, 24);
    this.shadow = new THREE.Mesh(
      sg,
      new THREE.MeshBasicMaterial({ color: 0x1a0f0a, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
  }

  private buildModel() {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const L = this.look;
    const skin = mat(L.skin);
    const tee = mat(L.tee);
    const shorts = mat(L.shorts);
    const white = mat(L.stripes ? 0xffffff : L.shorts);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);

    // legs
    const leg = (hip: THREE.Group, knee: THREE.Group, side: number) => {
      hip.position.set(0.1 * side, 0.9, 0);
      this.body.add(hip);
      add(hip, cap(0.085, 0.26), skin, 0, -0.2, 0);
      add(hip, new THREE.CylinderGeometry(0.108, 0.112, 0.3, 16), shorts, 0, -0.13, 0);
      for (let s = 0; s < 3; s++) {
        add(hip, new THREE.BoxGeometry(0.01, 0.27, 0.016), white, 0.107 * side, -0.135, -0.032 + s * 0.032);
      }
      knee.position.set(0, -0.42, 0);
      hip.add(knee);
      add(knee, cap(0.068, 0.3), skin, 0, -0.2, 0);
      const foot = add(knee, new THREE.CapsuleGeometry(0.05, 0.14, 4, 10), skin, 0, -0.44, 0.06);
      foot.rotation.x = Math.PI / 2;
    };
    leg(this.hipL, this.kneeL, -1);
    leg(this.hipR, this.kneeR, 1);

    // torso
    this.torso.position.set(0, 0.9, 0);
    this.body.add(this.torso);
    const pelvis = add(this.torso, new THREE.CapsuleGeometry(0.115, 0.16, 6, 14), shorts, 0, 0.04, 0);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.95);
    const chest = add(this.torso, new THREE.CapsuleGeometry(0.17, 0.26, 8, 18), tee, 0, 0.36, 0);
    chest.scale.set(1.12, 1, 0.78);
    add(this.torso, new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), skin, 0, 0.68, 0);

    // head
    this.head.position.set(0, 0.72, 0);
    this.torso.add(this.head);
    const skull = add(this.head, new THREE.SphereGeometry(0.15, 24, 18), skin, 0, 0.13, 0);
    skull.scale.set(0.95, 1.05, 1);
    const hair = add(
      this.head,
      new THREE.SphereGeometry(0.158, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mat(L.hair),
      0,
      0.145,
      -0.012
    );
    hair.rotation.x = -0.28;
    if (L.longHair) {
      const back = add(this.head, new THREE.CapsuleGeometry(0.13, 0.2, 6, 14), mat(L.hair), 0, 0.02, -0.07);
      back.scale.set(1.15, 1, 0.6);
    }
    const dark = mat(0x2a211c);
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.019, 10, 8), dark, 0.055 * s, 0.14, 0.136);
      const lid = add(this.head, new THREE.SphereGeometry(0.024, 10, 8), skin, 0.055 * s, 0.14, 0.133);
      lid.visible = false;
      this.eyelids.push(lid);
      add(this.head, new THREE.SphereGeometry(0.03, 10, 8), skin, 0.15 * s, 0.12, 0); // ears
    }
    add(this.head, new THREE.SphereGeometry(0.024, 10, 8), mat(0xdca07c), 0, 0.105, 0.148);

    // arms
    const arm = (sh: THREE.Group, el: THREE.Group, side: number) => {
      sh.position.set(0.225 * side, 0.6, 0);
      this.torso.add(sh);
      add(sh, cap(0.062, 0.2), skin, 0, -0.14, 0);
      add(sh, new THREE.CapsuleGeometry(0.076, 0.07, 6, 12), tee, 0, -0.05, 0);
      el.position.set(0, -0.29, 0);
      sh.add(el);
      add(el, cap(0.052, 0.19), skin, 0, -0.12, 0);
      const hand = add(el, new THREE.SphereGeometry(0.058, 12, 10), skin, 0, -0.27, 0);
      return hand;
    };
    arm(this.shL, this.elL, -1);
    arm(this.shR, this.elR, 1);
    this.handR.position.set(0, -0.3, 0);
    this.elR.add(this.handR);

    // props
    const sponge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), mat(0xffd23f));
    sponge.position.set(0, -0.03, 0.03);
    this.handR.add(sponge);

    const can = new THREE.Group();
    add(can, new THREE.CylinderGeometry(0.08, 0.09, 0.16, 16), mat(0x2a9d8f), 0, -0.1, 0);
    const spout = add(can, new THREE.CylinderGeometry(0.015, 0.025, 0.2, 8), mat(0x2a9d8f), 0, -0.06, 0.14);
    spout.rotation.x = 1.0;
    const handle = add(can, new THREE.TorusGeometry(0.05, 0.012, 8, 16, Math.PI), mat(0x238579), 0, -0.02, -0.02);
    handle.rotation.y = Math.PI / 2;
    this.handR.add(can);

    const bag = new THREE.Group();
    const sack = add(bag, new THREE.SphereGeometry(0.17, 14, 12), mat(0x2b2d33), 0, -0.2, 0);
    sack.scale.set(1, 1.15, 0.9);
    add(bag, new THREE.ConeGeometry(0.06, 0.1, 8), mat(0x2b2d33), 0, -0.02, 0);
    this.handR.add(bag);

    const pizza = new THREE.Group();
    const slice = add(pizza, new THREE.CylinderGeometry(0.11, 0.11, 0.015, 3), mat(0xf4b942), 0, 0, 0.06);
    slice.rotation.y = Math.PI / 6;
    for (const [px, pz] of [
      [0.02, 0.04],
      [-0.03, 0.08],
      [0.035, 0.1],
    ]) {
      add(pizza, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), mat(0xc0392b), px, 0.005, pz);
    }
    this.handR.add(pizza);

    // vacuum rides along with the body, in front of the feet
    const vac = new THREE.Group();
    const stick = add(vac, new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8), mat(0x9aa3ad), 0.16, 0.5, 0.42);
    stick.rotation.x = 0.62;
    const tank = add(vac, new THREE.CapsuleGeometry(0.07, 0.2, 6, 12), mat(0xe76f51), 0.16, 0.42, 0.48);
    tank.rotation.x = 0.62;
    add(vac, new THREE.BoxGeometry(0.3, 0.07, 0.16), mat(0x3a3f47), 0.16, 0.05, 0.72);
    this.root.add(vac);

    const props = { sponge, can, bag, pizza, vacuum: vac } as Record<Exclude<Prop, "none">, THREE.Object3D>;
    for (const k in props) props[k as Exclude<Prop, "none">].visible = false;
    return props;
  }

  setProp(p: Prop) {
    this.prop = p;
    for (const k in this.props) this.props[k as Exclude<Prop, "none">].visible = k === p;
  }

  setAnim(a: Anim) {
    if (this.anim !== a) {
      this.anim = a;
      this.t = 0;
    }
  }

  face(angle: number, snap = false) {
    this.headingTarget = angle;
    if (snap) this.heading = angle;
  }

  /** World position of the head, for speech bubbles. */
  headWorld(out: THREE.Vector3) {
    return this.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.34, 0));
  }

  handWorld(out: THREE.Vector3) {
    return this.handR.getWorldPosition(out);
  }

  advanceWalk(dist: number) {
    this.walkPhase += dist * 5.6;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const p: Pose = { ...REST };
    const sin = Math.sin;
    const walkLegs = (amp: number) => {
      const w = this.walkPhase;
      p.hipL = -amp * sin(w);
      p.hipR = amp * sin(w);
      p.kneeL = Math.max(0, amp * 1.3 * sin(w + 1.2));
      p.kneeR = Math.max(0, amp * 1.3 * sin(w + 1.2 + Math.PI));
      p.lift = Math.abs(sin(w)) * 0.035;
    };
    switch (this.anim) {
      case "idle":
        p.torso = 0.02 * sin(t * 1.6);
        p.headY = 0.25 * sin(t * 0.5);
        p.shL = 0.04 * sin(t * 1.6);
        p.shR = -0.04 * sin(t * 1.6);
        break;
      case "walk":
        walkLegs(0.62);
        p.shL = 0.5 * sin(this.walkPhase);
        p.shR = -0.5 * sin(this.walkPhase);
        p.elL = -0.35;
        p.elR = -0.35;
        p.torso = 0.06;
        break;
      case "carry":
        walkLegs(0.55);
        p.shL = 0.45 * sin(this.walkPhase);
        p.shR = -0.1;
        p.shRz = 0.3;
        p.elR = -0.1;
        p.torso = 0.08;
        p.twist = -0.08;
        break;
      case "vacuum":
        walkLegs(0.42);
        p.shR = -0.85 + 0.18 * sin(t * 6);
        p.elR = -0.5 - 0.15 * sin(t * 6);
        p.shL = -0.3;
        p.elL = -0.7;
        p.torso = 0.2;
        p.headX = 0.25;
        break;
      case "wash":
        p.torso = 0.3;
        p.headX = 0.3;
        p.shL = -0.95 + 0.12 * sin(t * 7);
        p.shR = -0.95 + 0.12 * sin(t * 7 + 2);
        p.elL = -0.75 + 0.2 * sin(t * 7 + 1);
        p.elR = -0.75 + 0.2 * sin(t * 7 + 3);
        p.shLz = -0.12;
        p.shRz = -0.12;
        p.lift = 0.01 * sin(t * 7);
        break;
      case "scrub":
        p.torso = 0.42;
        p.headX = 0.3;
        p.shR = -1.15;
        p.elR = -0.35 + 0.25 * sin(t * 10);
        p.shRz = -0.1 + 0.35 * sin(t * 10);
        p.shL = -0.5;
        p.elL = -0.9;
        p.twist = 0.12 * sin(t * 10);
        break;
      case "water":
        p.shR = -1.25;
        p.elR = -0.25 + 0.1 * sin(t * 2);
        p.shRz = -0.05;
        p.torso = 0.12;
        p.headX = 0.2;
        p.shL = 0.1;
        break;
      case "toss":
        p.shR = -2.4 + Math.min(1, t * 2) * 1.6;
        p.elR = -0.2;
        p.torso = 0.15;
        p.twist = 0.25;
        break;
      case "makebed":
        p.torso = 0.62;
        p.headX = 0.15;
        p.shL = -1.25;
        p.shR = -1.25;
        p.shLz = 0.25 * sin(t * 3.2);
        p.shRz = -0.25 * sin(t * 3.2);
        p.elL = -0.2;
        p.elR = -0.2;
        p.hipL = -0.25;
        p.hipR = -0.25;
        p.kneeL = 0.3;
        p.kneeR = 0.3;
        p.lift = -0.03 + 0.03 * sin(t * 6.4);
        break;
      case "fluff":
        p.torso = 0.45;
        p.shL = -1.0 + 0.5 * sin(t * 9);
        p.shR = -1.0 + 0.5 * sin(t * 9 + Math.PI);
        p.elL = -0.6;
        p.elR = -0.6;
        break;
      case "sit":
        p.hipL = -1.45;
        p.hipR = -1.45;
        p.kneeL = 1.45;
        p.kneeR = 1.45;
        p.lift = -0.4;
        p.torso = -0.12;
        p.shL = -0.25;
        p.shR = -0.25;
        p.elL = -0.9;
        p.elR = -0.9;
        p.headY = 0.12 * sin(t * 0.7);
        break;
      case "sleep":
        p.tilt = -Math.PI / 2;
        p.shLz = 0.25;
        p.shRz = 0.25;
        p.hipL = 0.04;
        p.hipR = -0.04;
        p.headY = 0.3;
        p.lift = 0.008 * sin(t * 1.3);
        break;
      case "keys":
        p.shL = -0.95;
        p.shR = -0.95;
        p.elL = -0.7 + 0.22 * Math.max(0, sin(t * 9));
        p.elR = -0.7 + 0.22 * Math.max(0, sin(t * 9 + 2.1));
        p.torso = 0.14 + 0.05 * sin(t * 4.5);
        p.headX = 0.12;
        p.headY = 0.3 * sin(t * 2.25);
        p.lift = 0.015 * Math.abs(sin(t * 4.5));
        break;
      case "eat":
        p.shR = -0.7;
        p.elR = -2.0 + 0.25 * sin(t * 5);
        p.shRz = -0.25;
        p.headX = 0.1 * sin(t * 5);
        break;
      case "shrug":
        p.shLz = 0.75;
        p.shRz = 0.75;
        p.elL = -1.5;
        p.elR = -1.5;
        p.headY = 0.45 * sin(t * 7);
        p.torso = -0.05;
        break;
      case "cheer":
        p.shL = -2.9;
        p.shR = -2.9;
        p.shLz = 0.3;
        p.shRz = 0.3;
        p.elL = -0.2;
        p.elR = -0.2;
        p.lift = 0.09 * Math.abs(sin(t * 8));
        p.kneeL = 0.2 * Math.abs(sin(t * 8 + 1.5));
        p.kneeR = p.kneeL;
        break;
      case "dance": {
        const b = t * 6.6 + this.dancePhase; // half-time sway; the bounce runs at double this
        p.lift = 0.05 * Math.abs(sin(b));
        p.kneeL = 0.25 + 0.25 * Math.max(0, sin(b));
        p.kneeR = 0.25 + 0.25 * Math.max(0, -sin(b));
        p.hipL = -0.12 - 0.12 * Math.max(0, sin(b));
        p.hipR = -0.12 - 0.12 * Math.max(0, -sin(b));
        p.headX = 0.12 * sin(b * 2);
        if (this.danceStyle === 0) {
          // fist pumps
          p.shL = -2.4 + 0.5 * sin(b * 2);
          p.shR = -2.4 - 0.5 * sin(b * 2);
          p.elL = -0.9;
          p.elR = -0.9;
          p.twist = 0.25 * sin(b);
        } else if (this.danceStyle === 1) {
          // side-to-side groove
          p.shL = -0.7 + 0.3 * sin(b);
          p.shR = -0.7 - 0.3 * sin(b);
          p.shLz = 0.35;
          p.shRz = 0.35;
          p.elL = -1.5;
          p.elR = -1.5;
          p.twist = 0.5 * sin(b);
          p.torso = 0.08;
          p.headY = 0.3 * sin(b);
        } else {
          // one arm in the air
          p.shR = -2.8;
          p.shRz = 0.25 + 0.35 * sin(b * 2);
          p.elR = -0.3;
          p.shL = -0.3;
          p.shLz = 0.5;
          p.elL = -1.2 + 0.3 * sin(b * 2);
          p.twist = 0.3 * sin(b);
          p.torso = -0.05;
        }
        break;
      }
      case "twerk": {
        // bent over, hands on knees, hips doing all the work
        const b = t * 15 + this.dancePhase;
        p.torso = 1.0 + 0.16 * sin(b);
        p.hipL = -0.85;
        p.hipR = -0.85;
        p.kneeL = 1.0 + 0.12 * sin(b);
        p.kneeR = 1.0 + 0.12 * sin(b);
        p.lift = -0.2 + 0.07 * sin(b);
        p.twist = 0.14 * sin(b * 0.5);
        p.shL = -0.75;
        p.shR = -0.75;
        p.shLz = 0.3;
        p.shRz = 0.3;
        p.elL = -0.35;
        p.elR = -0.35;
        p.headX = -0.75;
        p.headY = 0.5 * sin(b * 0.25);
        break;
      }
      case "pogo": {
        // jumping up and down, arms everywhere, headbanging
        const b = t * 9.5 + this.dancePhase;
        p.lift = 0.28 * Math.abs(sin(b));
        p.kneeL = 0.5 * Math.abs(Math.cos(b));
        p.kneeR = p.kneeL;
        p.hipL = -0.25 * Math.abs(Math.cos(b));
        p.hipR = p.hipL;
        p.shL = -2.7 + 0.5 * sin(b * 2.3);
        p.shR = -2.7 + 0.5 * sin(b * 1.7 + 1);
        p.shLz = 0.4 + 0.4 * sin(b * 1.3);
        p.shRz = 0.4 + 0.4 * sin(b * 1.9 + 2);
        p.elL = -0.4;
        p.elR = -0.4;
        p.headX = 0.45 * sin(b * 2);
        p.torso = 0.15 * sin(b * 2);
        break;
      }
      case "limp": {
        // a slow, lopsided hobble: one stiff leg, a hand on the hip
        const w = this.walkPhase;
        p.hipL = -0.5 * sin(w);
        p.kneeL = Math.max(0, 0.7 * sin(w + 1.2));
        p.hipR = 0.12 * sin(w);
        p.kneeR = 0.05;
        p.lift = -0.03 - 0.05 * Math.max(0, sin(w));
        p.torso = 0.22;
        p.twist = 0.18 * sin(w);
        p.shL = 0.35 * sin(w);
        p.elL = -0.3;
        p.shR = 0.5;
        p.shRz = 0.5;
        p.elR = -1.6;
        p.headX = 0.15;
        break;
      }
      case "type":
        // seated at a desk, typing
        p.hipL = -1.45;
        p.hipR = -1.45;
        p.kneeL = 1.45;
        p.kneeR = 1.45;
        p.lift = -0.4;
        p.torso = 0.1;
        p.shL = -1.0;
        p.shR = -1.0;
        p.elL = -0.6 + 0.12 * Math.max(0, sin(t * 11));
        p.elR = -0.6 + 0.12 * Math.max(0, sin(t * 11 + 2));
        p.headX = 0.12;
        break;
      case "chug":
        p.shR = -1.0;
        p.shRz = -0.2;
        p.elR = -2.15;
        p.headX = -0.55;
        p.torso = -0.2;
        p.shL = -2.6;
        p.shLz = 0.4;
        p.elL = -0.3;
        p.lift = 0.03 * Math.abs(sin(t * 8));
        p.kneeL = 0.15;
        p.kneeR = 0.15;
        break;
    }
    this.target = p;

    const k = 1 - Math.exp(-dt * 11);
    for (const key in this.pose) {
      const q = key as keyof Pose;
      this.pose[q] += (this.target[q] - this.pose[q]) * k;
    }
    const s = this.pose;
    this.hipL.rotation.x = s.hipL;
    this.hipR.rotation.x = s.hipR;
    this.kneeL.rotation.x = s.kneeL;
    this.kneeR.rotation.x = s.kneeR;
    this.shL.rotation.set(s.shL, 0, -s.shLz);
    this.shR.rotation.set(s.shR, 0, s.shRz);
    this.elL.rotation.x = s.elL;
    this.elR.rotation.x = s.elR;
    this.torso.rotation.set(s.torso, s.twist, 0);
    this.head.rotation.set(s.headX, s.headY, 0);
    this.body.position.y = s.lift;
    this.tiltG.rotation.x = s.tilt;

    // heading, shortest way round
    let d = this.headingTarget - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * (1 - Math.exp(-dt * 10));
    this.root.rotation.y = this.heading;

    const lying = Math.abs(s.tilt) > 0.5;
    this.shadow.visible = !lying;
    const asleep = this.anim === "sleep";
    const blink = !asleep && Math.sin(this.t * 0.9 + 1) > 0.992;
    for (const lid of this.eyelids) lid.visible = asleep || blink;
  }
}
