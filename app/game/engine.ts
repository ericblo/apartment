// The game: renders the scanned apartment, runs the roommate, chores, needs and mess.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Character, type Anim, type Prop } from "./character";
import { findPath, nearestWalkable, randomWalkable, type Pt } from "./nav";
import { store, type ChoreId, type QueueItem } from "./store";
import { sfx } from "./audio";
import {
  ACTIONS,
  BASE_PATH,
  BED,
  BIN_POS,
  CHORES,
  DIRT_RATE,
  DISH_POS,
  DUST_ZONES,
  LINES,
  PLANTS,
  SPOT,
  STATIONS,
  pick,
  type ActionDef,
  type ActionId,
} from "./data";

type Step =
  | { t: "walk"; to: Pt; anim: Anim }
  | {
      t: "act";
      anim: Anim;
      dur: number;
      face?: number;
      place?: { x: number; y: number; z: number; h: number };
      start?: () => void;
      tick?: (dt: number, frac: number) => void;
      end?: () => void;
    };

type Running = {
  uid: number;
  def: ActionDef;
  steps: Step[];
  i: number;
  auto: boolean;
  stepT: number;
  path: Pt[] | null;
  startDirt: number;
  placedFrom: THREE.Vector3 | null;
};

type Queued = QueueItem & { arg?: Pt };

type Particle = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; g: number; size: number; active: boolean };

const WALL_LOW = 1.32;
const WALL_HIGH = 2.46;
const WALK_SPEED = 1.9;
const MAX_BUNNIES = 12;
const WORLD = { cx: -0.4, cz: 0.35, w: 24, d: 9.3 };

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private ro: ResizeObserver;
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), WALL_LOW);
  private wallTarget = WALL_LOW;

  private guy = new Character();
  private pos = new THREE.Vector3(7.1, 0, -1.7);
  private queue: Queued[] = [];
  private running: Running | null = null;
  private uid = 1;
  private idleT = 0;
  private started = false;

  private energy = 0.8;
  private fun = 0.7;
  private dirt: Record<ChoreId, number> = { ...store.get().dirt };
  private stars = 0;
  private choresDone = 0;
  private minutes = 9 * 60;
  private speed = 1;
  private pizzaCd = 0;
  private hudT = 0;
  private secT = 0;
  private fxAcc = 0;

  private bunnies: { g: THREE.Group; x: number; z: number; ph: number }[] = [];
  private plates: THREE.Mesh[] = [];
  private binBag!: THREE.Mesh;
  private duvetNeat!: THREE.Object3D;
  private duvetMessy!: THREE.Object3D;
  private ring!: THREE.Mesh;
  private ringT = 0;

  private particles: Particle[] = [];
  private glyphs = new Map<string, THREE.Texture>();

  private markers: { el: HTMLButtonElement; pos: THREE.Vector3; chore?: ChoreId; id: string }[] = [];
  private bubble: HTMLDivElement;
  private bubbleT = 0;
  private menu: HTMLDivElement | null = null;
  private menuPos: THREE.Vector3 | null = null;

  private azimuthLeft = 0;
  private zoomLeft = 0;
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null =
    null;
  private follow = false;
  private down: { x: number; y: number; t: number } | null = null;
  private tmp = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x000000, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 70;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.2;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb59c88, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.5);
    sun.position.set(5, 10, 6);
    this.scene.add(sun);

    this.bubble = document.createElement("div");
    this.bubble.className = "bubble";
    overlay.appendChild(this.bubble);

    try {
      const saved = JSON.parse(localStorage.getItem("apartment.score") ?? "null") as { stars?: number; chores?: number } | null;
      this.stars = Number(saved?.stars) || 0;
      this.choresDone = Number(saved?.chores) || 0;
    } catch {}

    this.buildStatic();
    this.buildMarkers();
    this.placeOnBed();
    this.frameOverview(true);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("contextmenu", this.noMenu);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();

    void this.load();
    this.loop();
  }

  // ---------------------------------------------------------------- setup

  private async load() {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${BASE_PATH}/world/apartment.glb`, (e) => {
        const total = e.total || 3_190_000;
        store.set({ loadProgress: Math.min(0.98, e.loaded / total) });
      });
      if (this.disposed) return;
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const old = m.material as THREE.MeshStandardMaterial;
        const map = old.map;
        if (map) map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        // Unlit: the scan already has its lighting baked in. Vertex colours carry the
        // exposure fix for the dark hallway (0.2 == unchanged, hence the x5 here).
        const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.FrontSide });
        mat.color.setRGB(5, 5, 5);
        mat.clippingPlanes = [this.clip];
        m.material = mat;
        old.dispose();
      });
      this.scene.add(gltf.scene);
      store.set({ loadProgress: 1, phase: "intro" });
    } catch (err) {
      store.set({ loadError: err instanceof Error ? err.message : "Could not load the apartment." });
    }
  }

  private buildStatic() {
    const tl = new THREE.TextureLoader();
    const floorTex = tl.load(`${BASE_PATH}/world/floor.png`);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.w, WORLD.d),
      new THREE.MeshBasicMaterial({ map: floorTex, alphaTest: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD.cx, -0.015, WORLD.cz);
    this.scene.add(floor);

    const shadowTex = tl.load(`${BASE_PATH}/world/shadow.png`);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.w * 1.05, WORLD.d * 1.1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(WORLD.cx + 0.25, -0.12, WORLD.cz + 0.4);
    shadow.renderOrder = -1;
    this.scene.add(shadow);

    const L = (c: number) => new THREE.MeshLambertMaterial({ color: c });

    // bed (replaces the scanned one, which had the roommate baked into it)
    const bed = new THREE.Group();
    const bw = BED.x1 - BED.x0;
    const bd = BED.z1 - BED.z0;
    const bx = (BED.x0 + BED.x1) / 2;
    const bz = (BED.z0 + BED.z1) / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.06, 0.26, bd + 0.06), L(0x5b4636));
    base.position.set(bx, 0.13, bz);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.26, bd), L(0xf4efe6));
    mattress.position.set(bx, 0.39, bz);
    bed.add(base, mattress);
    const stripes = this.stripeTexture();
    const duvetMat = new THREE.MeshLambertMaterial({ map: stripes });
    const neat = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.08, 0.09, 1.5), duvetMat);
    neat.position.set(bx, 0.55, BED.z0 + 0.74);
    this.duvetNeat = neat;
    const messy = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 1.0), duvetMat);
    m1.rotation.y = 0.42;
    m1.rotation.z = 0.06;
    m1.position.set(bx + 0.22, 0.57, BED.z0 + 0.62);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.7), duvetMat);
    m2.rotation.set(0.1, -0.5, -0.12);
    m2.position.set(bx - 0.3, 0.6, BED.z0 + 1.0);
    const m3 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.5), duvetMat);
    m3.rotation.set(-0.08, 1.1, 0.1);
    m3.position.set(bx + 0.1, 0.66, BED.z0 + 0.85);
    messy.add(m3);
    messy.add(m1, m2);
    this.duvetMessy = messy;
    for (const s of [-1, 1]) {
      const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 6, 12), L(0xe9e2d4));
      pillow.rotation.z = Math.PI / 2;
      pillow.scale.set(1, 1, 1.9);
      pillow.position.set(bx + 0.4 * s, 0.6, BED.z1 - 0.3);
      bed.add(pillow);
    }
    bed.add(neat, messy);
    this.scene.add(bed);

    // kitchen bin
    const bin = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.5, 20), L(0x8d99a6));
    can.position.y = 0.25;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 24), L(0x6f7a86));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    this.binBag = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), L(0x2b2d33));
    this.binBag.position.y = 0.55;
    bin.add(can, rim, this.binBag);
    bin.position.set(...BIN_POS);
    this.scene.add(bin);

    // dirty plates by the sink
    for (let i = 0; i < 7; i++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.075, 0.022, 20), L(i % 3 === 1 ? 0xbcd7e6 : 0xfaf7f0));
      plate.position.set(DISH_POS[0] + (i % 2) * 0.012, DISH_POS[1] + 0.012 + i * 0.024, DISH_POS[2] + (i % 3) * 0.008);
      plate.rotation.z = (i % 2 ? 1 : -1) * 0.04;
      this.plates.push(plate);
      this.scene.add(plate);
    }

    // "walk here" ripple
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.22, 32),
      new THREE.MeshBasicMaterial({ color: 0xff7a59, transparent: true, opacity: 0, depthTest: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;
    this.scene.add(this.ring);

    this.scene.add(this.guy.root);
  }

  private stripeTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#efe6d6";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = "#93a3b8";
      g.fillRect(0, y, 256, 9);
      g.fillStyle = "#c7b8a0";
      g.fillRect(0, y + 15, 256, 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildMarkers() {
    for (const st of STATIONS) {
      const el = document.createElement("button");
      el.className = "marker";
      el.type = "button";
      el.setAttribute("aria-label", st.actions.map((a) => ACTIONS[a].label).join(", "));
      el.innerHTML = `<span class="marker-icon">${st.icon}</span>`;
      const pos = new THREE.Vector3(...st.pos);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        sfx.click();
        if (st.actions.length === 1) this.enqueue(st.actions[0]);
        else this.openMenu(pos, st.actions);
      });
      this.overlay.appendChild(el);
      this.markers.push({ el, pos, chore: st.chore, id: st.id });
    }
  }

  private openMenu(pos: THREE.Vector3, actions: ActionId[]) {
    this.closeMenu();
    const m = document.createElement("div");
    m.className = "pie";
    for (const id of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span>${ACTIONS[id].icon}</span>${ACTIONS[id].label}`;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.enqueue(id);
        this.closeMenu();
      });
      m.appendChild(b);
    }
    this.overlay.appendChild(m);
    this.menu = m;
    this.menuPos = pos.clone();
  }

  private closeMenu() {
    this.menu?.remove();
    this.menu = null;
    this.menuPos = null;
  }

  // ---------------------------------------------------------------- public API (HUD)

  start(name: string) {
    const clean = name.trim().slice(0, 18) || "Roomie";
    store.set({ phase: "playing", name: clean });
    try {
      localStorage.setItem("apartment.name", clean);
    } catch {}
    this.started = true;
    sfx.done();
    // glide to the roommate's room
    this.tweenCamera(new THREE.Vector3(7.3, 0, -1.2), 13);
    window.setTimeout(() => this.say("…five more minutes."), 1400);
  }

  enqueue(id: ActionId, arg?: Pt) {
    if (!this.started) return;
    const def = ACTIONS[id];
    if (id === "walk") this.queue = this.queue.filter((q) => q.actionId !== "walk");
    else if (this.queue.some((q) => q.actionId === id) || (this.running && !this.running.auto && this.running.def.id === id)) {
      this.toast(`${def.icon} Already on the list`);
      return;
    }
    if (this.queue.length >= 6) {
      this.toast("That's enough bossing for now");
      return;
    }
    this.queue.push({ uid: this.uid++, actionId: id, icon: def.icon, label: def.label, arg });
    sfx.queue();
    if (this.running?.auto) this.cancelRunning(true);
    this.pushHud();
  }

  cancel(uid: number) {
    if (this.running && this.running.uid === uid) this.cancelRunning(false);
    else this.queue = this.queue.filter((q) => q.uid !== uid);
    sfx.click();
    this.pushHud();
  }

  pizza() {
    if (!this.started || this.pizzaCd > 0) return;
    this.pizzaCd = 75;
    this.queue.unshift({ uid: this.uid++, actionId: "pizza", icon: "🍕", label: "Pizza bribe" });
    if (this.running) this.cancelRunning(true);
    sfx.yum();
    this.pushHud();
  }

  setSpeed(s: number) {
    this.speed = s;
    store.set({ speed: s });
  }

  toggleWalls() {
    const up = !store.get().wallsUp;
    this.wallTarget = up ? WALL_HIGH : WALL_LOW;
    store.set({ wallsUp: up });
  }

  toggleFollow() {
    this.follow = !this.follow;
    store.set({ follow: this.follow });
  }

  toggleSound() {
    const on = !store.get().sound;
    sfx.setEnabled(on);
    store.set({ sound: on });
  }

  rotate(dir: number) {
    this.azimuthLeft += (dir * Math.PI) / 4;
  }

  zoom(dir: number) {
    this.zoomLeft += dir;
  }

  findRoommate() {
    this.tweenCamera(this.pos.clone().setY(0), Math.min(16, this.camera.position.distanceTo(this.controls.target)));
  }

  overview() {
    this.frameOverview(false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("contextmenu", this.noMenu);
    this.controls.dispose();
    this.overlay.replaceChildren();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- camera + input

  private resize() {
    const p = this.canvas.parentElement;
    const w = p?.clientWidth || window.innerWidth;
    const h = p?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frameOverview(snap: boolean) {
    const aspect = this.camera.aspect || 1.6;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const wide = aspect > 1.15;
    // wide screens see the whole place; tall screens start on the main living space
    const target = wide ? new THREE.Vector3(WORLD.cx, 0, 0.2) : new THREE.Vector3(-3.2, 0, 0);
    const span = wide ? 13.2 : 5.2;
    const dist = Math.min(66, Math.max(14, span / (half * aspect)));
    if (snap) {
      this.controls.target.copy(target);
      this.setOrbit(dist, 0.34, 0.74);
    } else this.tweenCamera(target, dist);
  }

  private setOrbit(dist: number, azimuth: number, polar: number) {
    const t = this.controls.target;
    this.camera.position.set(
      t.x + dist * Math.sin(polar) * Math.sin(azimuth),
      t.y + dist * Math.cos(polar),
      t.z + dist * Math.sin(polar) * Math.cos(azimuth)
    );
    this.camera.lookAt(t);
    this.controls.update();
  }

  private tweenCamera(target: THREE.Vector3, dist: number) {
    const off = this.camera.position.clone().sub(this.controls.target).setLength(dist);
    this.camTween = {
      from: this.camera.position.clone(),
      to: target.clone().add(off),
      fromT: this.controls.target.clone(),
      toT: target.clone(),
      t: 0,
    };
  }

  private noMenu = (e: Event) => e.preventDefault();

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.closeMenu();
    this.camTween = null;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || !this.started || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || performance.now() - d.t > 450) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    const [x, z] = nearestWalkable(hit.x, hit.z, 6);
    if (Math.hypot(x - hit.x, z - hit.z) > 0.6) return;
    this.ring.position.set(x, 0.03, z);
    this.ringT = 1;
    this.enqueue("walk", [x, z]);
  };

  // ---------------------------------------------------------------- roommate helpers

  private placeOnBed() {
    this.pos.set((BED.x0 + BED.x1) / 2 + 0.05, BED.top + 0.15, BED.z0 + 0.2);
    this.guy.root.position.copy(this.pos);
    this.guy.face(Math.PI, true);
    this.guy.setAnim("sleep");
    // lounging in bed until told otherwise
    this.running = {
      uid: this.uid++,
      def: { ...ACTIONS.nap, doing: "Lying in bed" },
      steps: [{ t: "act", anim: "sleep", dur: 1e9 }],
      i: 0,
      auto: true,
      stepT: 0,
      path: null,
      startDirt: 0,
      placedFrom: new THREE.Vector3(...this.snap(SPOT.bedside)),
    };
  }

  private snap(p: Pt): [number, number, number] {
    const [x, z] = nearestWalkable(p[0], p[1]);
    return [x, 0, z];
  }

  private say(text: string, dur = 2.6) {
    this.bubble.textContent = text;
    this.bubble.classList.add("show");
    this.bubbleT = dur;
  }

  private toast(text: string) {
    const id = Date.now() + Math.random();
    store.set({ toasts: [...store.get().toasts.slice(-2), { id, text }] });
    window.setTimeout(() => store.set({ toasts: store.get().toasts.filter((t) => t.id !== id) }), 2600);
  }

  private mood() {
    return 0.5 * this.energy + 0.5 * this.fun;
  }

  private cancelRunning(quiet: boolean) {
    const r = this.running;
    if (!r) return;
    const wasAsleep = this.guy.anim === "sleep";
    this.finishPlacement(r);
    this.guy.setProp("none");
    this.guy.setAnim("idle");
    this.running = null;
    if (wasAsleep) this.say(pick(LINES.wake));
    else if (!quiet) this.say("Fine by me.");
  }

  private finishPlacement(r: Running) {
    if (r.placedFrom) {
      this.pos.copy(r.placedFrom);
      r.placedFrom = null;
    }
  }

  // ---------------------------------------------------------------- actions

  private build(id: ActionId, arg?: Pt): Step[] {
    const walk = (to: Pt, anim: Anim = "walk"): Step => ({ t: "walk", to, anim });
    const drain = (c: ChoreId, dur: number) => (dt: number) => {
      const r = this.running;
      if (r) this.dirt[c] = Math.max(0, this.dirt[c] - (dt * Math.max(0.2, r.startDirt)) / dur);
    };
    const prop = (p: Prop) => () => this.guy.setProp(p);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    switch (id) {
      case "dishes": {
        const at = V(0.93, 1.0, -1.92);
        return [
          walk(SPOT.sink),
          {
            t: "act",
            anim: "wash",
            dur: 9,
            face: 0,
            start: prop("sponge"),
            tick: (dt) => {
              drain("dishes", 9)(dt);
              this.emit("🫧", at, 7, dt, { spread: 0.25, up: 0.5, life: 1.3, size: 0.16 });
            },
            end: () => (this.dirt.dishes = 0),
          },
        ];
      }
      case "stove": {
        const at = V(-0.44, 1.0, -1.92);
        return [
          walk(SPOT.stove),
          {
            t: "act",
            anim: "scrub",
            dur: 7,
            face: 0,
            start: prop("sponge"),
            tick: (dt) => {
              drain("stove", 7)(dt);
              this.emit("✨", at, 4, dt, { spread: 0.3, up: 0.35, life: 0.9, size: 0.17 });
            },
            end: () => (this.dirt.stove = 0),
          },
        ];
      }
      case "trash":
        return [
          walk(SPOT.bin),
          {
            t: "act",
            anim: "scrub",
            dur: 1.1,
            face: Math.PI,
            end: () => {
              this.guy.setProp("bag");
              this.dirt.trash = 0.05;
            },
          },
          walk(SPOT.door, "carry"),
          {
            t: "act",
            anim: "toss",
            dur: 0.9,
            face: Math.PI / 2,
            end: () => {
              this.guy.setProp("none");
              this.dirt.trash = 0;
              this.burst("✨", this.guy.handWorld(this.tmp), 6);
              sfx.pop();
            },
          },
        ];
      case "plants": {
        const steps: Step[] = [];
        // start with whichever plant is closest
        const order = [...PLANTS].sort(
          (a, b) => Math.abs(a.stand[0] - this.pos.x) - Math.abs(b.stand[0] - this.pos.x)
        );
        const first = order[0];
        const sorted = [first, ...order.slice(1).sort((a, b) => Math.abs(a.stand[0] - first.stand[0]) - Math.abs(b.stand[0] - first.stand[0]))];
        for (const p of sorted) {
          const at = V(...p.plant);
          const [sx, , sz] = this.snap(p.stand);
          steps.push(walk(p.stand), {
            t: "act",
            anim: "water",
            dur: 2.6,
            face: Math.atan2(p.plant[0] - sx, p.plant[2] - sz),
            start: prop("can"),
            tick: (dt) => {
              drain("plants", 2.6 * PLANTS.length)(dt);
              this.emit("💧", this.guy.handWorld(this.tmp).lerp(at, 0.55), 9, dt, { spread: 0.12, up: -0.1, life: 0.7, size: 0.12, g: 2.4 });
            },
            end: () => this.burst("🌿", at, 2),
          });
        }
        steps.push({ t: "act", anim: "idle", dur: 0.1, end: () => (this.dirt.plants = 0) });
        return steps;
      }
      case "floors": {
        const steps: Step[] = [];
        const left = [...this.bunnies];
        let cx = this.pos.x;
        let cz = this.pos.z;
        while (left.length) {
          let bi = 0;
          let bd = Infinity;
          left.forEach((b, i) => {
            const d = Math.hypot(b.x - cx, b.z - cz);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          });
          const b = left.splice(bi, 1)[0];
          cx = b.x;
          cz = b.z;
          steps.push(walk([b.x, b.z], "vacuum"), {
            t: "act",
            anim: "vacuum",
            dur: 0.3,
            end: () => this.popBunny(b.g),
          });
        }
        if (!steps.length) steps.push(walk([-4.6, -0.9], "vacuum"), { t: "act", anim: "vacuum", dur: 2 });
        const firstStep = steps[0];
        if (firstStep.t === "walk") steps.unshift({ t: "act", anim: "idle", dur: 0.05, start: prop("vacuum") });
        steps.push({
          t: "act",
          anim: "idle",
          dur: 0.1,
          end: () => {
            for (const b of [...this.bunnies]) this.popBunny(b.g);
            this.dirt.floors = 0;
          },
        });
        return steps;
      }
      case "bed":
        return [
          walk(SPOT.bedside),
          {
            t: "act",
            anim: "makebed",
            dur: 5.5,
            face: -Math.PI / 2,
            tick: drain("bed", 5.5),
            end: () => (this.dirt.bed = 0),
          },
        ];
      case "nap":
        return [
          walk(SPOT.bedside),
          {
            t: "act",
            anim: "sleep",
            dur: 14,
            place: { x: (BED.x0 + BED.x1) / 2 + 0.05, y: BED.top + 0.15, z: BED.z0 + 0.2, h: Math.PI },
            start: () => {
              this.dirt.bed = 1;
              this.say(pick(LINES.nap));
            },
            tick: (dt) => {
              this.energy = Math.min(1, this.energy + dt * 0.065);
              this.emit("💤", this.guy.headWorld(this.tmp), 0.9, dt, { spread: 0.05, up: 0.35, life: 1.8, size: 0.2 });
            },
          },
        ];
      case "tv":
        return [
          walk(SPOT.sofa),
          {
            t: "act",
            anim: "sit",
            dur: 11,
            place: { x: -6.5, y: 0.03, z: -0.25, h: Math.PI / 2 },
            tick: (dt) => {
              this.fun = Math.min(1, this.fun + dt * 0.055);
              this.energy = Math.min(1, this.energy + dt * 0.012);
              this.emit(pick(["😂", "📺", "🍿"]), this.guy.headWorld(this.tmp), 0.7, dt, { spread: 0.15, up: 0.4, life: 1.4, size: 0.19 });
            },
          },
        ];
      case "keys":
        return [
          walk(SPOT.keys),
          {
            t: "act",
            anim: "keys",
            dur: 9,
            face: Math.atan2(-6.96 - this.snap(SPOT.keys)[0], -3.46 - this.snap(SPOT.keys)[2]),
            tick: (dt) => {
              this.fun = Math.min(1, this.fun + dt * 0.07);
              if (this.emit(pick(["🎵", "🎶"]), V(-6.96, 1.0, -3.4), 2.6, dt, { spread: 0.4, up: 0.6, life: 1.5, size: 0.2 })) sfx.note();
            },
          },
        ];
      case "snack":
        return [
          walk(SPOT.fridge),
          {
            t: "act",
            anim: "eat",
            dur: 4.5,
            face: 0.25,
            start: prop("pizza"),
            tick: (dt) => {
              this.fun = Math.min(1, this.fun + dt * 0.05);
              this.energy = Math.min(1, this.energy + dt * 0.035);
              this.emit("🧀", this.guy.headWorld(this.tmp).setY(1.35), 1.5, dt, { spread: 0.1, up: 0.1, life: 0.8, size: 0.1, g: 1.5 });
            },
            end: () => (this.dirt.dishes = Math.min(1, this.dirt.dishes + 0.18)),
          },
        ];
      case "pizza":
        return [
          {
            t: "act",
            anim: "cheer",
            dur: 1.2,
            start: () => {
              this.say(pick(LINES.pizza));
              this.burst("🍕", this.guy.headWorld(this.tmp), 5);
            },
          },
          {
            t: "act",
            anim: "eat",
            dur: 3.5,
            start: prop("pizza"),
            tick: (dt) => {
              this.fun = Math.min(1, this.fun + dt * 0.16);
              this.energy = Math.min(1, this.energy + dt * 0.06);
            },
            end: () => (this.dirt.trash = Math.min(1, this.dirt.trash + 0.15)),
          },
        ];
      case "walk":
        return [walk(arg ?? [this.pos.x, this.pos.z])];
      case "wander":
        return [walk(randomWalkable()), { t: "act", anim: "idle", dur: 2.5 }];
    }
  }

  private startNext() {
    let next: Queued | undefined = this.queue.shift();
    let auto = false;
    if (!next) {
      const id = this.autonomy();
      if (!id) return;
      next = { uid: this.uid++, actionId: id, icon: ACTIONS[id].icon, label: ACTIONS[id].label };
      auto = true;
    }
    const def = ACTIONS[next.actionId as ActionId];
    if (def.kind === "chore") {
      if (this.mood() < 0.22) {
        // too miserable: refuses, and the chore is dropped
        this.say(pick(LINES.refuse), 3);
        sfx.grumble();
        this.toast(`${store.get().name} refused to ${def.label.toLowerCase()}`);
        this.running = this.mkRunning(next.uid, { ...def, doing: "Refusing" }, [{ t: "act", anim: "shrug", dur: 2.2 }], true);
        return;
      }
      this.say(this.mood() < 0.42 ? pick(LINES.grumpy) : pick(LINES.accept));
      if (this.mood() < 0.42) sfx.grumble();
    }
    const steps = this.build(def.id, next.arg);
    this.running = this.mkRunning(next.uid, def, steps, auto);
    if (def.kind === "chore") this.running.startDirt = this.dirt[def.id as ChoreId];
  }

  private mkRunning(uid: number, def: ActionDef, steps: Step[], auto: boolean): Running {
    return { uid, def, steps, i: 0, auto, stepT: 0, path: null, startDirt: 0, placedFrom: null };
  }

  /** What he gets up to when nobody is bossing him around. */
  private autonomy(): ActionId | null {
    if (this.idleT < 4.5) return null;
    this.idleT = 0;
    if (this.energy < 0.3) return "nap";
    if (this.fun < 0.45) return Math.random() < 0.5 ? "tv" : "keys";
    const r = Math.random();
    if (r < 0.3) return "wander";
    if (r < 0.45) return "snack";
    if (r < 0.6) return "tv";
    if (r < 0.7) this.say(pick(LINES.idle));
    return null;
  }

  private finishAction(r: Running) {
    this.guy.setProp("none");
    this.running = null;
    this.idleT = 0;
    if (r.def.kind === "chore" && r.def.doing !== "Refusing") {
      const gained = 3 + Math.round(r.startDirt * 10);
      this.stars += gained;
      this.choresDone++;
      try {
        localStorage.setItem("apartment.score", JSON.stringify({ stars: this.stars, chores: this.choresDone }));
      } catch {}
      this.toast(`${r.def.icon} ${r.def.label} — done! +${gained} ⭐`);
      sfx.done();
      this.burst("⭐", this.guy.headWorld(this.tmp), 5);
      if (!this.queue.length) {
        this.say(pick(LINES.done));
        this.running = this.mkRunning(this.uid++, { ...ACTIONS.wander, doing: "Feeling accomplished" }, [{ t: "act", anim: "cheer", dur: 1.1 }], true);
      }
    }
  }

  private stepRunning(dt: number) {
    const r = this.running;
    if (!r) return;
    const step = r.steps[r.i];
    if (!step) {
      this.finishAction(r);
      return;
    }
    const slow = r.def.kind === "chore" && this.mood() < 0.42 ? 0.75 : 1;
    if (step.t === "walk") {
      if (!r.path) {
        r.path = findPath([this.pos.x, this.pos.z], step.to);
        this.pos.y = 0;
      }
      this.guy.setAnim(step.anim);
      let budget = WALK_SPEED * slow * dt;
      while (budget > 0 && r.path.length) {
        const [tx, tz] = r.path[0];
        const dx = tx - this.pos.x;
        const dz = tz - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4) {
          r.path.shift();
          continue;
        }
        this.guy.face(Math.atan2(dx, dz));
        const m = Math.min(d, budget);
        this.pos.x += (dx / d) * m;
        this.pos.z += (dz / d) * m;
        this.guy.advanceWalk(m);
        budget -= m;
        if (m >= d) r.path.shift();
      }
      if (!r.path.length) {
        r.path = null;
        r.i++;
        r.stepT = 0;
      }
      return;
    }
    // act
    if (r.stepT === 0) {
      if (step.place) {
        r.placedFrom = this.pos.clone();
        this.pos.set(step.place.x, step.place.y, step.place.z);
        this.guy.face(step.place.h, true);
      } else if (step.face !== undefined) this.guy.face(step.face);
      this.guy.setAnim(step.anim);
      step.start?.();
    }
    const d = dt * slow;
    r.stepT += d;
    step.tick?.(d, Math.min(1, r.stepT / step.dur));
    if (r.stepT >= step.dur) {
      step.end?.();
      this.finishPlacement(r);
      r.i++;
      r.stepT = 0;
    }
  }

  // ---------------------------------------------------------------- mess + effects

  private spawnBunny() {
    const zone = pick(DUST_ZONES);
    const [x, z] = randomWalkable(zone);
    const g = new THREE.Group();
    const fluff = new THREE.MeshLambertMaterial({ color: 0xa39c94 });
    const blob = (r: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), fluff);
      m.position.set(px, py, pz);
      g.add(m);
    };
    blob(0.085, 0, 0.08, 0);
    blob(0.06, 0.07, 0.06, 0.02);
    blob(0.055, -0.065, 0.055, -0.02);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), white);
      eye.position.set(0.032 * s, 0.11, 0.07);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), black);
      pupil.position.set(0.032 * s, 0.11, 0.09);
      g.add(eye, pupil);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    g.scale.setScalar(0.01);
    this.scene.add(g);
    this.bunnies.push({ g, x, z, ph: Math.random() * 6 });
  }

  private popBunny(g: THREE.Group) {
    const i = this.bunnies.findIndex((b) => b.g === g);
    if (i < 0) return;
    this.bunnies.splice(i, 1);
    this.burst("💨", g.position.clone().setY(0.2), 3);
    this.scene.remove(g);
    this.dirt.floors = Math.max(0, this.dirt.floors - 1 / MAX_BUNNIES);
    sfx.pop();
    if (Math.random() < 0.25) this.say(pick(LINES.dust), 1.4);
  }

  private glyph(ch: string) {
    let t = this.glyphs.get(ch);
    if (!t) {
      const c = document.createElement("canvas");
      c.width = c.height = 96;
      const g = c.getContext("2d")!;
      g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(ch, 48, 54);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.glyphs.set(ch, t);
    }
    return t;
  }

  private spawn(ch: string, at: THREE.Vector3, o: { spread?: number; up?: number; life?: number; size?: number; g?: number }) {
    let p = this.particles.find((q) => !q.active);
    if (!p) {
      if (this.particles.length > 90) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      this.scene.add(s);
      p = { s, v: new THREE.Vector3(), life: 0, max: 1, g: 0, size: 0.2, active: false };
      this.particles.push(p);
    }
    const sp = o.spread ?? 0.2;
    p.s.material.map = this.glyph(ch);
    p.s.material.needsUpdate = true;
    p.s.position.set(at.x + (Math.random() - 0.5) * sp, at.y + (Math.random() - 0.5) * sp * 0.5, at.z + (Math.random() - 0.5) * sp);
    p.v.set((Math.random() - 0.5) * sp * 1.2, (o.up ?? 0.4) * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * sp * 1.2);
    p.max = p.life = o.life ?? 1.2;
    p.g = o.g ?? 0;
    p.size = o.size ?? 0.2;
    p.active = true;
    p.s.visible = true;
  }

  /** Emit at a steady rate; returns true on frames where something spawned. */
  private emit(ch: string, at: THREE.Vector3, rate: number, dt: number, o: Parameters<Game["spawn"]>[2]) {
    this.fxAcc += rate * dt;
    let did = false;
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      this.spawn(ch, at, o);
      did = true;
    }
    return did;
  }

  private burst(ch: string, at: THREE.Vector3, n: number) {
    const p = at.clone();
    for (let i = 0; i < n; i++) this.spawn(ch, p, { spread: 0.5, up: 0.9, life: 1.1, size: 0.22, g: 1.2 });
  }

  // ---------------------------------------------------------------- main loop

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta();
    const real = Math.min(0.05, raw);
    const dt = this.started ? real * this.speed : 0;

    if (this.started && dt > 0) this.simulate(dt);
    this.guy.root.position.copy(this.pos);
    this.guy.update(this.started ? dt : real);
    this.updateFx(real, dt);
    this.updateCamera(Math.min(0.25, raw));
    this.renderer.render(this.scene, this.camera);
    this.updateOverlay(real);

    this.hudT += real;
    if (this.hudT > 0.12) {
      this.hudT = 0;
      this.pushHud();
    }
  };

  private simulate(dt: number) {
    this.minutes += dt;
    this.pizzaCd = Math.max(0, this.pizzaCd - dt);

    const r = this.running;
    const working = r?.def.kind === "chore";
    const resting = this.guy.anim === "sleep" || this.guy.anim === "sit";
    if (!resting) this.energy = Math.max(0, this.energy - dt * (working ? 0.011 : 0.004));
    this.fun = Math.max(0, this.fun - dt * (working ? 0.017 : 0.0035));
    if (this.guy.anim === "sleep" && r?.auto) this.energy = Math.min(1, this.energy + dt * 0.02);

    for (const c of CHORES) {
      const busy = r && !r.auto && r.def.id === c;
      if (!busy) this.dirt[c] = Math.min(1, this.dirt[c] + DIRT_RATE[c] * dt);
    }

    if (!this.running) {
      this.idleT += dt;
      this.guy.setAnim("idle");
      this.startNext();
    }
    this.stepRunning(dt);

    this.secT += dt;
    if (this.secT > 0.5) {
      this.secT = 0;
      if (this.bunnies.length < Math.floor(this.dirt.floors * MAX_BUNNIES)) this.spawnBunny();
      if (this.dirt.trash > 0.75 && Math.random() < 0.5)
        this.spawn("🪰", new THREE.Vector3(BIN_POS[0], 0.8, BIN_POS[2]), { spread: 0.5, up: 0.25, life: 1.6, size: 0.13 });
      if (this.dirt.dishes > 0.8 && Math.random() < 0.35)
        this.spawn("🤢", new THREE.Vector3(DISH_POS[0], 1.2, DISH_POS[2]), { spread: 0.2, up: 0.3, life: 1.4, size: 0.16 });
      if (this.dirt.plants > 0.8 && Math.random() < 0.4) {
        const p = pick(PLANTS).plant;
        this.spawn("🥀", new THREE.Vector3(p[0], p[1] + 0.3, p[2]), { spread: 0.2, up: 0.25, life: 1.5, size: 0.17 });
      }
    }
  }

  private updateFx(real: number, dt: number) {
    const t = this.clock.elapsedTime;
    for (const b of this.bunnies) {
      const s = Math.min(1, b.g.scale.x + real * 3);
      b.g.scale.setScalar(s);
      b.g.position.y = Math.abs(Math.sin(t * 3 + b.ph)) * 0.035;
      b.g.rotation.y += real * 0.4 * Math.sin(t + b.ph);
    }
    const plates = Math.round(this.dirt.dishes * this.plates.length);
    this.plates.forEach((p, i) => (p.visible = i < plates));
    this.binBag.visible = this.dirt.trash > 0.45;
    this.binBag.scale.setScalar(0.7 + this.dirt.trash * 0.5);
    const made = this.dirt.bed < 0.5;
    this.duvetNeat.visible = made;
    this.duvetMessy.visible = !made;

    const step = dt > 0 ? dt : real;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= step;
      if (p.life <= 0) {
        p.active = false;
        p.s.visible = false;
        continue;
      }
      p.v.y -= p.g * step;
      p.s.position.addScaledVector(p.v, step);
      const k = p.life / p.max;
      p.s.material.opacity = Math.min(1, k * 2.2);
      p.s.scale.setScalar(p.size * (0.6 + 0.4 * Math.min(1, (1 - k) * 5)));
    }

    if (this.ringT > 0) {
      this.ringT = Math.max(0, this.ringT - real * 1.6);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = this.ringT;
      this.ring.scale.setScalar(1 + (1 - this.ringT) * 1.4);
    }

    const c = this.clip.constant;
    if (Math.abs(c - this.wallTarget) > 0.002) this.clip.constant = c + (this.wallTarget - c) * (1 - Math.exp(-real * 7));
  }

  private updateCamera(real: number) {
    const tgt = this.controls.target;
    if (this.camTween) {
      const tw = this.camTween;
      tw.t = Math.min(1, tw.t + real / 1.3);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.from, tw.to, e);
      tgt.lerpVectors(tw.fromT, tw.toT, e);
      if (tw.t >= 1) this.camTween = null;
    } else if (!this.started) {
      // slow showroom spin behind the welcome card
      this.orbitBy(real * 0.045);
    }
    if (Math.abs(this.azimuthLeft) > 1e-3) {
      const a = this.azimuthLeft * (1 - Math.exp(-real * 9));
      this.azimuthLeft -= a;
      this.orbitBy(a);
    }
    if (Math.abs(this.zoomLeft) > 1e-3) {
      const z = this.zoomLeft * (1 - Math.exp(-real * 9));
      this.zoomLeft -= z;
      const off = this.camera.position.clone().sub(tgt);
      const len = THREE.MathUtils.clamp(off.length() * Math.pow(0.72, z), this.controls.minDistance, this.controls.maxDistance);
      this.camera.position.copy(tgt).add(off.setLength(len));
    }
    if (this.follow && this.started && !this.camTween && !this.down) {
      const k = 1 - Math.exp(-real * 3);
      const dx = (this.pos.x - tgt.x) * k;
      const dz = (this.pos.z - tgt.z) * k;
      tgt.x += dx;
      tgt.z += dz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    // keep the view on the apartment
    const cx = THREE.MathUtils.clamp(tgt.x, -12.5, 11.5);
    const cz = THREE.MathUtils.clamp(tgt.z, -4.5, 5);
    if (cx !== tgt.x || cz !== tgt.z || tgt.y !== 0) {
      this.camera.position.x += cx - tgt.x;
      this.camera.position.z += cz - tgt.z;
      this.camera.position.y -= tgt.y;
      tgt.set(cx, 0, cz);
    }
    this.controls.update();
  }

  private orbitBy(angle: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.camera.position.copy(this.controls.target).add(off);
  }

  private project(v: THREE.Vector3): [number, number, boolean] {
    const p = this.tmp.copy(v).project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, p.z < 1 && p.z > -1];
  }

  private updateOverlay(real: number) {
    const show = this.started;
    for (const m of this.markers) {
      const [x, y, vis] = this.project(m.pos);
      m.el.style.display = show && vis ? "" : "none";
      m.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (m.chore) {
        const d = this.dirt[m.chore];
        m.el.style.setProperty("--dirt", d.toFixed(2));
        m.el.dataset.level = d > 0.7 ? "high" : d > 0.4 ? "mid" : "low";
      }
    }
    if (this.menu && this.menuPos) {
      const [x, y] = this.project(this.menuPos);
      this.menu.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= real;
      if (this.bubbleT <= 0) this.bubble.classList.remove("show");
    }
    const head = this.guy.headWorld(new THREE.Vector3());
    const [bx, by] = this.project(head);
    this.bubble.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
  }

  private pushHud() {
    const mood = this.mood();
    const [moodLabel, moodIcon] =
      mood > 0.75 ? ["Thriving", "😄"] : mood > 0.5 ? ["Content", "🙂"] : mood > 0.3 ? ["Grumpy", "😒"] : mood > 0.22 ? ["Fed up", "😩"] : ["On strike", "😤"];
    const r = this.running;
    const m = Math.floor(this.minutes);
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    const clock = `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
    const avg = CHORES.reduce((s, c) => s + this.dirt[c], 0) / CHORES.length;
    let progress = 0;
    const first = r?.steps[0];
    if (r && first && !(first.t === "act" && first.dur === 1e9)) {
      const st = r.steps[r.i];
      const frac = st && st.t === "act" ? Math.min(1, r.stepT / st.dur) : 0.5;
      progress = Math.min(1, (r.i + frac) / r.steps.length);
    }
    const queue: QueueItem[] = [];
    if (r && !r.auto) queue.push({ uid: r.uid, actionId: r.def.id, icon: r.def.icon, label: r.def.label });
    for (const q of this.queue) queue.push({ uid: q.uid, actionId: q.actionId, icon: q.icon, label: q.label });
    store.set({
      energy: this.energy,
      fun: this.fun,
      mood,
      moodLabel,
      moodIcon,
      activity: r ? r.def.doing : "Standing around",
      activityIcon: r ? r.def.icon : "🧍",
      activityProgress: progress,
      queue,
      dirt: { ...this.dirt },
      cleanliness: 1 - avg,
      stars: this.stars,
      choresDone: this.choresDone,
      clock,
      day: 1 + Math.floor(m / 1440),
      pizzaCooldown: this.pizzaCd,
      currentUid: r && !r.auto ? r.uid : null,
    });
  }
}
