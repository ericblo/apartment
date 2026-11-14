// The "video game" version of the apartment: a hand-built, minimalist set that mirrors the
// scan. Every position below is in the same world metres as the scan (x runs west -> east,
// z runs north -> south), measured from top-down renders of it.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Rect = [number, number, number, number]; // x0, x1, z0, z1

/** Floor plan as non-overlapping rectangles. Walls are generated around their outline. */
const FLOOR: Rect[] = [
  [-12.0, -7.9, -3.7, -0.5], // west bedroom
  [-7.9, -7.7, -1.9, -1.2], // its doorway
  [-7.7, -3.3, -3.8, 2.3], // living room
  [-5.5, -3.3, 2.3, 3.6], // bay window with the dining table
  [-3.3, 1.6, -3.8, -1.5], // kitchen and the jute-rug corner
  [1.6, 3.9, -3.8, -2.2], // east end of the kitchen
  [3.9, 5.4, -3.2, -2.2], // hallway
  [5.4, 5.5, -3.1, -2.3], // roommate's doorway
  [5.5, 9.3, -3.8, -0.5], // roommate's room
  [9.3, 10.6, -3.8, -1.0],
  [-3.3, -0.2, 0.8, 3.0], // gallery: reading nook
  [-0.2, 2.9, 1.5, 3.0], // gallery: desk
  [2.9, 5.4, 2.1, 3.0], // gallery: east run
  [5.4, 8.0, 2.2, 3.0], // passage below the red bedroom
  [5.5, 8.0, -0.2, 2.2], // red bedroom
  [8.0, 8.6, 1.0, 2.5], // step through to the sun nook
  [8.6, 10.7, 0.4, 3.2], // sun nook
];

const WALL_H = 2.46;
const INK = 0x3b2a22;

// ------------------------------------------------------------------ textures

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function plankTexture() {
  const r = rng(7);
  return canvasTex(
    512,
    512,
    (g) => {
      const rows = 8;
      const rh = 512 / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 200;
        while (x < 512) {
          const len = 150 + r() * 220;
          const tone = 205 + Math.floor(r() * 22);
          g.fillStyle = `rgb(${tone + 12},${tone - 6},${tone - 44})`;
          g.fillRect(x, i * rh, len, rh);
          g.fillStyle = "rgba(120,95,60,0.35)";
          g.fillRect(x, i * rh, 2, rh);
          x += len;
        }
        g.fillStyle = "rgba(120,95,60,0.3)";
        g.fillRect(0, i * rh, 512, 2);
      }
    },
    true
  );
}

function brickTexture() {
  const r = rng(11);
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#d9c7b4";
      g.fillRect(0, 0, 512, 512);
      const rows = 16;
      const bh = 512 / rows;
      const bw = 64;
      for (let j = 0; j < rows; j++) {
        for (let i = -1; i < 9; i++) {
          const t = r();
          g.fillStyle = t < 0.15 ? "#8d4632" : t < 0.5 ? "#a9553d" : t < 0.85 ? "#b5624a" : "#c27a5e";
          g.fillRect(i * bw + (j % 2) * (bw / 2) + 2, j * bh + 2, bw - 4, bh - 4);
        }
      }
    },
    true
  );
}

type RugStyle = "persian" | "kilim" | "jute" | "picture";
type Palette = { field: string; border: string; accent: string; light: string; dark: string };

/** Best-guess rug designs: one consistent recipe per style, recoloured per rug. */
function rugTexture(wm: number, dm: number, style: RugStyle, p: Palette, seed: number) {
  const s = 150;
  const W = Math.round(wm * s);
  const H = Math.round(dm * s);
  const r = rng(seed);
  return canvasTex(W, H, (g) => {
    const diamond = (x: number, y: number, a: number, b: number) => {
      g.beginPath();
      g.moveTo(x, y - b);
      g.lineTo(x + a, y);
      g.lineTo(x, y + b);
      g.lineTo(x - a, y);
      g.closePath();
      g.fill();
    };
    g.fillStyle = p.field;
    g.fillRect(0, 0, W, H);
    if (style === "jute") {
      g.strokeStyle = "rgba(120,90,50,0.22)";
      g.lineWidth = 2;
      for (let y = 4; y < H; y += 9) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = p.border;
      g.lineWidth = 10;
      g.strokeRect(5, 5, W - 10, H - 10);
      return;
    }
    const b = Math.min(W, H) * 0.11;
    if (style === "kilim") {
      const bands = Math.max(5, Math.round(H / 46));
      const bh = H / bands;
      const cols = [p.field, p.dark, p.accent, p.light];
      for (let i = 0; i < bands; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(0, i * bh, W, bh);
        g.fillStyle = cols[(i + 2) % cols.length];
        const n = Math.max(3, Math.round(W / (bh * 1.1)));
        for (let k = 0; k < n; k++) diamond(((k + 0.5) * W) / n, (i + 0.5) * bh, (W / n) * 0.36, bh * 0.36);
      }
      g.strokeStyle = p.border;
      g.lineWidth = 8;
      g.strokeRect(4, 4, W - 8, H - 8);
      return;
    }
    // border bands
    g.fillStyle = p.border;
    g.fillRect(0, 0, W, H);
    g.fillStyle = p.light;
    g.fillRect(b * 0.28, b * 0.28, W - b * 0.56, H - b * 0.56);
    g.fillStyle = p.border;
    g.fillRect(b * 0.4, b * 0.4, W - b * 0.8, H - b * 0.8);
    // border motifs
    const step = b * 0.9;
    for (let x = b; x < W - b * 0.6; x += step) {
      for (const y of [b * 0.7, H - b * 0.7]) {
        g.fillStyle = (Math.round(x / step) & 1) === 0 ? p.accent : p.light;
        diamond(x, y, b * 0.2, b * 0.2);
      }
    }
    for (let y = b; y < H - b * 0.6; y += step) {
      for (const x of [b * 0.7, W - b * 0.7]) {
        g.fillStyle = (Math.round(y / step) & 1) === 0 ? p.accent : p.light;
        diamond(x, y, b * 0.2, b * 0.2);
      }
    }
    // field
    g.fillStyle = p.field;
    g.fillRect(b, b, W - 2 * b, H - 2 * b);
    if (style === "picture") {
      g.fillStyle = p.accent;
      g.fillRect(W * 0.3, H * 0.3, W * 0.4, H * 0.34);
      g.fillStyle = p.dark;
      for (let i = 0; i < 9; i++) g.fillRect(b * 1.3 + r() * (W - b * 3), b * 1.3 + r() * (H - b * 3), 9, 14);
      return;
    }
    // small repeating flowers
    const cell = Math.min(W, H) * 0.12;
    for (let y = b + cell * 0.7; y < H - b - cell * 0.3; y += cell) {
      for (let x = b + cell * 0.7; x < W - b - cell * 0.3; x += cell) {
        g.fillStyle = r() < 0.5 ? p.dark : p.light;
        g.globalAlpha = 0.55;
        diamond(x, y, cell * 0.13, cell * 0.13);
      }
    }
    g.globalAlpha = 1;
    // corner pieces and a layered centre medallion
    const cx = W / 2;
    const cy = H / 2;
    const ma = (W - 2 * b) * 0.3;
    const mb = (H - 2 * b) * 0.36;
    g.fillStyle = p.dark;
    for (const [x, y] of [
      [b, b],
      [W - b, b],
      [b, H - b],
      [W - b, H - b],
    ])
      diamond(x, y, ma * 0.62, mb * 0.5);
    g.fillStyle = p.field;
    g.fillRect(0, 0, W, b * 0.99);
    g.fillRect(0, H - b * 0.99, W, b);
    g.fillRect(0, 0, b * 0.99, H);
    g.fillRect(W - b * 0.99, 0, b, H);
    // (re-stroke the border the corner pieces spilled over)
    g.fillStyle = p.border;
    g.fillRect(0, 0, W, b);
    g.fillRect(0, H - b, W, b);
    g.fillRect(0, 0, b, H);
    g.fillRect(W - b, 0, b, H);
    g.fillStyle = p.light;
    for (let x = b * 0.9; x < W - b * 0.5; x += step) {
      diamond(x, b * 0.5, b * 0.2, b * 0.2);
      diamond(x, H - b * 0.5, b * 0.2, b * 0.2);
    }
    for (let y = b * 0.9; y < H - b * 0.5; y += step) {
      diamond(b * 0.5, y, b * 0.2, b * 0.2);
      diamond(W - b * 0.5, y, b * 0.2, b * 0.2);
    }
    g.strokeStyle = p.accent;
    g.lineWidth = 3;
    g.strokeRect(b * 0.96, b * 0.96, W - b * 1.92, H - b * 1.92);
    const layers: [number, string][] = [
      [1, p.dark],
      [0.78, p.light],
      [0.58, p.accent],
      [0.34, p.border],
      [0.16, p.light],
    ];
    for (const [k, col] of layers) {
      g.fillStyle = col;
      diamond(cx, cy, ma * k, mb * k);
    }
  });
}

// ------------------------------------------------------------------ building blocks

class Builder {
  group = new THREE.Group();
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  constructor(private clip: THREE.Plane) {}

  /** Shared flat-colour material. "tall" ones are cut at wall height like the walls are. */
  mat(color: number, o: { tall?: boolean; flat?: boolean; map?: THREE.Texture } = {}) {
    const key = `${color}|${o.tall ? 1 : 0}|${o.flat ? 1 : 0}|${o.map?.uuid ?? ""}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, map: o.map ?? null, flatShading: !!o.flat });
      if (o.tall) m.clippingPlanes = [this.clip];
      this.mats.set(key, m);
    }
    return m;
  }

  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, o: { ry?: number; rx?: number; rz?: number; cast?: boolean } = {}) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    mesh.castShadow = o.cast ?? true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Box by extents. `r` rounds the edges (for anything soft). */
  box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, color: number, o: { r?: number; tall?: boolean; ry?: number; cast?: boolean } = {}) {
    const w = Math.abs(x1 - x0);
    const h = y1 - y0;
    const d = Math.abs(z1 - z0);
    const r = Math.min(o.r ?? 0, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const geo = r > 0.005 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, this.mat(color, { tall: o.tall }), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, { ry: o.ry, cast: o.cast });
  }

  cyl(x: number, z: number, r: number, y0: number, y1: number, color: number, o: { rTop?: number; seg?: number; tall?: boolean } = {}) {
    return this.add(new THREE.CylinderGeometry(o.rTop ?? r, r, y1 - y0, o.seg ?? 20), this.mat(color, { tall: o.tall }), x, (y0 + y1) / 2, z);
  }

  blob(x: number, y: number, z: number, r: number, color: number, sy = 1) {
    const m = this.add(new THREE.IcosahedronGeometry(r, 1), this.mat(color, { flat: true }), x, y, z);
    m.scale.y = sy;
    return m;
  }

  rug(x0: number, x1: number, z0: number, z1: number, style: RugStyle, p: Palette, seed: number) {
    const w = x1 - x0;
    const d = z1 - z0;
    const tex = rugTexture(w, d, style, p, seed);
    const m = this.add(new THREE.BoxGeometry(w, 0.02, d), this.mat(0xffffff, { map: tex }), (x0 + x1) / 2, 0.012, (z0 + z1) / 2, { cast: false });
    // only the top face should carry the design; a box maps it on every side, which is fine at 2cm
    return m;
  }

  legs(x0: number, x1: number, z0: number, z1: number, h: number, color: number, t = 0.05) {
    for (const x of [x0 + t, x1 - t]) for (const z of [z0 + t, z1 - t]) this.box(x - t / 2, x + t / 2, z - t / 2, z + t / 2, 0, h, color);
  }

  table(x0: number, x1: number, z0: number, z1: number, h: number, top: number, leg = top, thick = 0.05) {
    this.box(x0, x1, z0, z1, h - thick, h, top, { r: 0.012 });
    this.legs(x0 + 0.03, x1 - 0.03, z0 + 0.03, z1 - 0.03, h - thick, leg);
  }

  /** Simple dining/desk chair facing `ry` (0 = facing south, +z). */
  chair(x: number, z: number, ry: number, color: number, seat = 0.46) {
    const g = new THREE.Group();
    const m = this.mat(color);
    const part = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    part(0.42, 0.05, 0.42, 0, seat, 0);
    part(0.42, 0.42, 0.05, 0, seat + 0.24, -0.19);
    for (const sx of [-0.18, 0.18]) for (const sz of [-0.18, 0.18]) part(0.04, seat, 0.04, sx, seat / 2, sz);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
  }

  /**
   * Sofa section. `back` is the side the backrest is on. Cushions are split along the long axis.
   */
  sofa(x0: number, x1: number, z0: number, z1: number, back: "n" | "s" | "e" | "w" | null, color: number, o: { seat?: number; top?: number; arms?: ("n" | "s" | "e" | "w")[]; cushions?: number } = {}) {
    const seat = o.seat ?? 0.46;
    const top = o.top ?? 0.82;
    const dark = new THREE.Color(color).multiplyScalar(0.86).getHex();
    this.box(x0, x1, z0, z1, 0.06, seat - 0.1, dark, { r: 0.04 });
    const bt = 0.26;
    let sx0 = x0, sx1 = x1, sz0 = z0, sz1 = z1;
    const side = (s: "n" | "s" | "e" | "w", h: number, t: number) => {
      if (s === "n") this.box(x0, x1, z0, z0 + t, 0.1, h, color, { r: 0.07 });
      if (s === "s") this.box(x0, x1, z1 - t, z1, 0.1, h, color, { r: 0.07 });
      if (s === "w") this.box(x0, x0 + t, z0, z1, 0.1, h, color, { r: 0.07 });
      if (s === "e") this.box(x1 - t, x1, z0, z1, 0.1, h, color, { r: 0.07 });
      if (s === "n") sz0 += t;
      if (s === "s") sz1 -= t;
      if (s === "w") sx0 += t;
      if (s === "e") sx1 -= t;
    };
    if (back) side(back, top, bt);
    for (const a of o.arms ?? []) side(a, seat + 0.16, 0.18);
    const alongX = sx1 - sx0 > sz1 - sz0;
    const n = o.cushions ?? Math.max(1, Math.round((alongX ? sx1 - sx0 : sz1 - sz0) / 0.85));
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const b = (i + 1) / n;
      const g = 0.012;
      if (alongX) this.box(sx0 + (sx1 - sx0) * a + g, sx0 + (sx1 - sx0) * b - g, sz0 + g, sz1 - g, seat - 0.12, seat, color, { r: 0.05 });
      else this.box(sx0 + g, sx1 - g, sz0 + (sz1 - sz0) * a + g, sz0 + (sz1 - sz0) * b - g, seat - 0.12, seat, color, { r: 0.05 });
    }
  }

  pillow(x: number, y: number, z: number, color: number, ry = 0, s = 0.42) {
    const m = this.add(new RoundedBoxGeometry(s, s, 0.14, 3, 0.06), this.mat(color), x, y + s / 2, z, { ry, rx: -0.25 });
    return m;
  }

  bed(x0: number, x1: number, z0: number, z1: number, head: "n" | "s" | "e" | "w", o: { frame: number; sheet: number; duvet: number; pillow: number; h?: number }) {
    const h = o.h ?? 0.6;
    this.box(x0 - 0.03, x1 + 0.03, z0 - 0.03, z1 + 0.03, 0, 0.26, o.frame, { r: 0.02 });
    this.box(x0, x1, z0, z1, 0.26, h - 0.08, o.sheet, { r: 0.05 });
    const lenX = head === "e" || head === "w";
    const k = 0.3; // pillow end
    let dx0 = x0, dx1 = x1, dz0 = z0, dz1 = z1;
    if (head === "w") dx0 = x0 + (x1 - x0) * k;
    if (head === "e") dx1 = x1 - (x1 - x0) * k;
    if (head === "n") dz0 = z0 + (z1 - z0) * k;
    if (head === "s") dz1 = z1 - (z1 - z0) * k;
    this.box(dx0 - 0.03, dx1 + 0.03, dz0 - 0.03, dz1 + 0.03, h - 0.12, h + 0.02, o.duvet, { r: 0.06 });
    for (const s of [-1, 1]) {
      const px = lenX ? (head === "w" ? x0 + 0.3 : x1 - 0.3) : (x0 + x1) / 2 + s * (x1 - x0) * 0.24;
      const pz = lenX ? (z0 + z1) / 2 + s * (z1 - z0) * 0.24 : head === "n" ? z0 + 0.3 : z1 - 0.3;
      const w = lenX ? 0.42 : (x1 - x0) * 0.42;
      const d = lenX ? (z1 - z0) * 0.42 : 0.42;
      this.box(px - w / 2, px + w / 2, pz - d / 2, pz + d / 2, h - 0.08, h + 0.08, o.pillow, { r: 0.07 });
    }
  }

  /** Low-poly plants. kind: bush | tall | palm | trail */
  plant(x: number, z: number, kind: "bush" | "tall" | "palm" | "trail", s = 1, pot = 0xc2703d, y = 0) {
    const greens = [0x4f8f4a, 0x3f7a45, 0x6aa654, 0x2f6a3f];
    const pr = 0.14 * s;
    this.cyl(x, z, pr * 0.8, y, y + 0.24 * s, pot, { rTop: pr, seg: 12 });
    const top = y + 0.24 * s;
    if (kind === "bush") {
      this.blob(x, top + 0.2 * s, z, 0.24 * s, greens[0]);
      this.blob(x + 0.14 * s, top + 0.32 * s, z + 0.06 * s, 0.17 * s, greens[2]);
      this.blob(x - 0.13 * s, top + 0.3 * s, z - 0.08 * s, 0.16 * s, greens[1]);
    } else if (kind === "tall") {
      this.cyl(x, z, 0.025 * s, top, top + 0.9 * s, 0x6b4a2f, { seg: 6 });
      this.blob(x, top + 1.0 * s, z, 0.3 * s, greens[1], 1.15);
      this.blob(x + 0.16 * s, top + 0.72 * s, z + 0.1 * s, 0.2 * s, greens[0]);
      this.blob(x - 0.15 * s, top + 0.82 * s, z - 0.08 * s, 0.18 * s, greens[3]);
    } else if (kind === "palm") {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = this.add(new THREE.ConeGeometry(0.09 * s, 0.75 * s, 5), this.mat(greens[i % 4], { flat: true }), x + Math.cos(a) * 0.16 * s, top + 0.36 * s, z + Math.sin(a) * 0.16 * s);
        leaf.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      }
    } else {
      this.blob(x, top + 0.1 * s, z, 0.2 * s, greens[2], 0.7);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        this.blob(x + Math.cos(a) * 0.17 * s, top - 0.06 * s - i * 0.03, z + Math.sin(a) * 0.17 * s, 0.1 * s, greens[i % 4]);
      }
    }
  }
}

// ------------------------------------------------------------------ shell (floor + walls)

function buildShell(b: Builder, caps: THREE.Group, clip: THREE.Plane) {
  const planks = plankTexture();
  const floorMat = new THREE.MeshLambertMaterial({ map: planks });
  for (const [x0, x1, z0, z1] of FLOOR) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      // world-space UVs so planks line up across rooms
      const wx = x0 + uv.getX(i) * (x1 - x0);
      const wz = z0 + (1 - uv.getY(i)) * (z1 - z0);
      uv.setXY(i, wx / 2.4, -wz / 2.4);
    }
    const m = new THREE.Mesh(geo, floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    b.group.add(m);
  }

  // rasterise the plan at 10 cm and trace its outline
  const K = (v: number) => Math.round(v * 10);
  const cells = new Set<number>();
  const key = (i: number, j: number) => (i + 500) * 2000 + (j + 500);
  for (const [x0, x1, z0, z1] of FLOOR) for (let i = K(x0); i < K(x1); i++) for (let j = K(z0); j < K(z1); j++) cells.add(key(i, j));
  const has = (i: number, j: number) => cells.has(key(i, j));

  const brick = brickTexture();
  const plaster = new THREE.MeshLambertMaterial({ color: 0xf4eee3, clippingPlanes: [clip] });
  const brickMat = new THREE.MeshLambertMaterial({ map: brick, clippingPlanes: [clip] });
  const capMat = new THREE.MeshBasicMaterial({ color: INK });
  const T = 0.11;

  // dir: which side of the cell the wall is on
  const wall = (dir: "n" | "s" | "w" | "e", a0: number, a1: number, at: number) => {
    const len = a1 - a0;
    const mid = (a0 + a1) / 2;
    const isBrick =
      (dir === "n" && at <= -3.75 && a0 >= -3.35 && a1 <= 3.95) || // behind the kitchen
      (dir === "s" && at >= 2.95 && a0 >= -3.35 && a1 <= 5.45) || // gallery window wall
      (dir === "n" && at <= -3.75 && a0 >= 5.45 && a1 <= 10.65); // roommate's room
    const geo = new THREE.PlaneGeometry(len, WALL_H);
    if (isBrick) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 1.5, (uv.getY(i) * WALL_H) / 1.1);
    }
    const m = new THREE.Mesh(geo, isBrick ? brickMat : plaster);
    m.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(len + 2 * T, T), capMat);
    cap.rotation.x = -Math.PI / 2;
    if (dir === "n") {
      m.position.set(mid, WALL_H / 2, at);
      cap.position.set(mid, 0, at - T / 2);
    } else if (dir === "s") {
      m.position.set(mid, WALL_H / 2, at);
      m.rotation.y = Math.PI;
      cap.position.set(mid, 0, at + T / 2);
    } else if (dir === "w") {
      m.position.set(at, WALL_H / 2, mid);
      m.rotation.y = Math.PI / 2;
      cap.rotation.z = Math.PI / 2;
      cap.position.set(at - T / 2, 0, mid);
    } else {
      m.position.set(at, WALL_H / 2, mid);
      m.rotation.y = -Math.PI / 2;
      cap.rotation.z = Math.PI / 2;
      cap.position.set(at + T / 2, 0, mid);
    }
    // remember which way the wall faces, so its cap can hide along with it
    const n = dir === "n" ? [0, 1] : dir === "s" ? [0, -1] : dir === "w" ? [1, 0] : [-1, 0];
    cap.userData = { nx: n[0], nz: n[1], px: m.position.x, pz: m.position.z };
    b.group.add(m);
    caps.add(cap);
  };

  const BREAKS = new Set([-33, 39, 55]);
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
  for (const [x0, x1, z0, z1] of FLOOR) {
    minI = Math.min(minI, K(x0));
    maxI = Math.max(maxI, K(x1));
    minJ = Math.min(minJ, K(z0));
    maxJ = Math.max(maxJ, K(z1));
  }
  for (let j = minJ; j < maxJ; j++) {
    for (const [dir, dj] of [["n", -1], ["s", 1]] as const) {
      let start: number | null = null;
      for (let i = minI; i <= maxI; i++) {
        const edge = has(i, j) && !has(i, j + dj);
        if (edge && start === null) start = i;
        // break runs where the wall finish changes (plaster <-> brick)
        if (edge && start !== null && start !== i && BREAKS.has(i)) {
          wall(dir, start / 10, i / 10, (dir === "n" ? j : j + 1) / 10);
          start = i;
        }
        if (!edge && start !== null) {
          wall(dir, start / 10, i / 10, (dir === "n" ? j : j + 1) / 10);
          start = null;
        }
      }
    }
  }
  for (let i = minI; i < maxI; i++) {
    for (const [dir, di] of [["w", -1], ["e", 1]] as const) {
      let start: number | null = null;
      for (let j = minJ; j <= maxJ; j++) {
        const edge = has(i, j) && !has(i + di, j);
        if (edge && start === null) start = j;
        if (!edge && start !== null) {
          wall(dir, start / 10, j / 10, (dir === "w" ? i : i + 1) / 10);
          start = null;
        }
      }
    }
  }
}

// ------------------------------------------------------------------ the apartment

const PERSIAN_RED: Palette = { field: "#8f4034", border: "#2a3350", accent: "#c9a36a", light: "#dcc7a6", dark: "#5a2a26" };
const PERSIAN_PEACH: Palette = { field: "#d39a78", border: "#8a4a3a", accent: "#f0d9b8", light: "#f3e3cc", dark: "#a3604a" };
const PERSIAN_PINK: Palette = { field: "#d8a59a", border: "#a85f5a", accent: "#f2e2d2", light: "#f5e9dc", dark: "#b97a72" };
const PERSIAN_SAND: Palette = { field: "#d9c3a1", border: "#b08d68", accent: "#c98f6b", light: "#efe2c8", dark: "#b89c78" };
const DEEP_RED: Palette = { field: "#ab1f28", border: "#2a1416", accent: "#c9a15a", light: "#e0c2a0", dark: "#6f1119" };
const KILIM_RED: Palette = { field: "#8f2f2c", border: "#2b2a35", accent: "#c98f5a", light: "#d9c3a1", dark: "#3b2530" };
const JUTE: Palette = { field: "#cfae7c", border: "#a98556", accent: "", light: "", dark: "" };
const PICTURE: Palette = { field: "#e9dcc0", border: "#7c1f1f", accent: "#c0392b", light: "#f1e6cf", dark: "#2a2622" };
const SAGE: Palette = { field: "#c9d3bd", border: "#9aaa8c", accent: "#eef0e2", light: "#e3e8d6", dark: "#a9b89a" };

function furnish(b: Builder) {
  const WOOD = 0x9a6a3c;
  const DARKWOOD = 0x5b4636;
  const LIGHTWOOD = 0xcfa663;
  const BLACK = 0x26262b;
  const STEEL = 0xb3b8bd;
  const WHITE = 0xf2efe8;

  // ---------- west bedroom
  b.bed(-9.8, -7.95, -3.5, -2.25, "e", { frame: 0xd8d2c6, sheet: 0xf3f0ea, duvet: 0xfbfaf6, pillow: 0xffffff, h: 0.62 });
  b.sofa(-11.75, -10.8, -3.3, -2.2, "w", 0xb9713f, { seat: 0.42, top: 0.78, arms: ["n", "s"], cushions: 1 }); // tan leather armchair
  b.pillow(-11.3, 0.42, -2.75, 0x2b2b30, Math.PI / 2, 0.36);
  b.table(-11.4, -9.55, -1.2, -0.55, 0.76, LIGHTWOOD, 0x8a8f96);
  b.chair(-10.4, -1.55, 0, BLACK);
  b.box(-10.9, -10.45, -1.0, -0.72, 0.76, 0.79, 0xdfe3e8); // laptop
  b.plant(-11.7, -1.9, "palm", 1.5, 0xc2703d);
  b.plant(-11.75, -0.9, "palm", 1.3, 0xe8e2d6);
  b.plant(-11.45, -2.0, "bush", 0.9);
  b.box(-11.995, -11.97, -2.7, -1.4, 0.9, 2.1, 0xbfe0ee, { tall: true, cast: false }); // window

  // ---------- living room
  b.rug(-6.6, -3.95, -2.95, 0.63, "persian", PERSIAN_RED, 1);
  const TAUPE = 0x8d8373;
  b.sofa(-7.4, -6.35, -1.7, 1.66, "w", TAUPE, { arms: ["n"], cushions: 4 }); // sectional, back to the west wall
  b.sofa(-6.35, -5.55, -0.2, 1.66, null, TAUPE, { cushions: 2 }); // chaise
  b.pillow(-6.9, 0.46, 1.25, 0xd9b27c, Math.PI / 2);
  b.pillow(-7.0, 0.46, -1.3, 0x2b2b30, Math.PI / 2, 0.4);
  // live-edge coffee table
  b.box(-5.9, -5.27, -1.6, -0.5, 0.36, 0.47, WOOD, { r: 0.05 });
  b.box(-5.75, -5.42, -1.4, -0.7, 0, 0.36, 0x6e4a2a, { r: 0.03 });
  b.cyl(-5.7, -1.35, 0.05, 0.47, 0.5, 0xdfe6ea); // coasters
  b.cyl(-5.45, -0.75, 0.05, 0.47, 0.5, 0xdfe6ea);
  // brown leather loveseat on the north wall
  b.sofa(-6.25, -4.27, -3.62, -2.78, "n", 0x6b3f2a, { seat: 0.42, top: 0.8, arms: ["w", "e"], cushions: 2 });
  b.pillow(-5.75, 0.42, -3.2, 0xf1ede2, 0);
  b.pillow(-5.4, 0.42, -3.15, 0x3f8f72, 0.2);
  // keyboard on its stand, wicker chair, little teal table
  b.box(-7.4, -6.5, -3.62, -3.32, 0.66, 0.72, BLACK, { r: 0.01 });
  b.box(-7.36, -6.54, -3.47, -3.34, 0.72, 0.735, 0xf5f2ea);
  for (let k = 0; k < 9; k++) b.box(-7.3 + k * 0.088, -7.26 + k * 0.088, -3.47, -3.4, 0.735, 0.745, BLACK, { cast: false });
  b.box(-7.3, -7.25, -3.5, -3.44, 0, 0.66, 0x55585e);
  b.box(-6.65, -6.6, -3.5, -3.44, 0, 0.66, 0x55585e);
  b.cyl(-6.7, -2.85, 0.36, 0.3, 0.4, 0xd8b98a, { seg: 14 }); // wicker chair seat
  b.cyl(-6.7, -2.85, 0.05, 0, 0.3, 0xc7a676, { seg: 8 });
  const wb = b.add(new THREE.CylinderGeometry(0.4, 0.36, 0.75, 14, 1, true, Math.PI * 0.75, Math.PI * 1.1), b.mat(0xd8b98a), -6.7, 0.75, -2.85);
  (wb.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  b.box(-6.42, -6.2, -3.75, -3.5, 0, 0.5, 0x2f8f86, { r: 0.02 });
  // bookshelf
  b.box(-4.2, -3.72, -3.78, -3.45, 0, 1.55, BLACK, { tall: true });
  const bookCols = [0xc0392b, 0xe0b24a, 0x2f6a8f, 0xf1ede2, 0x4f8f4a, 0x8a4a3a];
  for (let s = 0; s < 4; s++) for (let k = 0; k < 6; k++) b.box(-4.16 + k * 0.07, -4.11 + k * 0.07, -3.46, -3.43, 0.12 + s * 0.36, 0.38 + s * 0.36, bookCols[(k + s) % 6], { tall: true, cast: false });
  // media console + TV against the short wall, facing the sofa
  b.box(-3.72, -3.34, -1.35, 0.35, 0, 0.5, 0xe9e4d8, { r: 0.02 });
  b.box(-3.5, -3.44, -1.1, 0.1, 0.56, 1.24, BLACK, { tall: true });
  b.box(-3.515, -3.5, -1.06, 0.06, 0.6, 1.2, 0x3d4a66, { tall: true, cast: false });
  b.box(-3.56, -3.4, -0.6, -0.4, 0.5, 0.56, BLACK);
  // black cabinet with the printer
  b.box(-3.82, -3.32, 0.36, 0.78, 0, 0.55, BLACK, { r: 0.02 });
  b.box(-3.78, -3.38, 0.4, 0.74, 0.55, 0.7, 0xc9cdd2, { r: 0.02 });
  b.plant(-3.6, -1.75, "tall", 0.9, 0xe8e2d6);

  // ---------- bay window: dining table
  b.rug(-5.35, -3.5, 2.2, 3.1, "persian", { ...PERSIAN_RED, field: "#7d4a3a", border: "#3a2f45" }, 2);
  b.cyl(-4.53, 2.75, 0.62, 0.69, 0.74, 0xc98a3c, { seg: 28 });
  b.cyl(-4.53, 2.75, 0.07, 0, 0.69, 0x8a5a33, { seg: 10 });
  b.cyl(-4.53, 2.75, 0.3, 0, 0.04, 0x8a5a33, { seg: 16 });
  b.chair(-5.2, 2.55, Math.PI / 2, WOOD);
  b.chair(-4.2, 2.1, 0.5, WOOD);
  b.cyl(-4.6, 2.7, 0.07, 0.74, 0.92, 0x6f8fa8, { rTop: 0.04, seg: 10 }); // jug
  b.cyl(-4.3, 2.9, 0.1, 0.74, 0.77, 0xf2efe8);
  b.plant(-5.25, 3.3, "bush", 1.3, 0xe8e2d6);
  b.plant(-4.75, 3.42, "trail", 1.2, 0xc2703d, 0.45);
  b.plant(-4.2, 3.42, "bush", 1.1, 0x6f8fa8, 0.3);
  b.plant(-3.65, 3.3, "tall", 1.0);
  b.plant(-3.6, 2.55, "bush", 0.9, 0xe8e2d6);
  b.plant(-5.3, 2.5, "palm", 1.1);
  b.box(-5.3, -3.5, 3.585, 3.6, 0.8, 2.1, 0xbfe0ee, { tall: true, cast: false }); // bay windows

  // ---------- kitchen
  b.rug(-3.85, -2.0, -3.4, -2.25, "jute", JUTE, 3);
  // fridge with its magnets and photos
  b.box(-1.73, -0.98, -2.22, -1.52, 0, 1.75, STEEL, { r: 0.02 });
  b.box(-1.7, -1.01, -2.235, -2.22, 1.12, 1.13, 0x8f949a, { cast: false });
  b.box(-1.08, -1.05, -2.25, -2.22, 0.5, 1.0, 0x8f949a);
  b.box(-1.08, -1.05, -2.25, -2.22, 1.2, 1.6, 0x8f949a);
  const magnets = [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xf5f2ea, 0xe67e22, 0x9b59b6, 0xf5f2ea];
  magnets.forEach((c, i) => {
    const mx = -1.62 + (i % 4) * 0.13;
    const my = 0.55 + Math.floor(i / 4) * 0.72 + (i % 3) * 0.06;
    b.box(mx, mx + 0.09, -2.232, -2.22, my, my + 0.11, c, { cast: false });
  });
  // stove
  b.box(-0.75, -0.1, -2.15, -1.52, 0, 0.9, 0x9a9da1, { r: 0.01 });
  b.box(-0.75, -0.1, -2.15, -1.52, 0.9, 0.93, BLACK);
  for (const [sx, sz] of [[-0.58, -1.98], [-0.27, -1.98], [-0.58, -1.68], [-0.27, -1.68]]) {
    b.cyl(sx, sz, 0.1, 0.93, 0.945, 0x55585e, { seg: 14 });
    b.cyl(sx, sz, 0.05, 0.945, 0.955, BLACK, { seg: 10 });
  }
  b.box(-0.7, -0.15, -2.17, -2.15, 0.2, 0.7, 0x3a3d42, { cast: false });
  b.box(-0.68, -0.17, -2.2, -2.17, 0.72, 0.75, 0xd9dde1);
  for (let k = 0; k < 4; k++) b.cyl(-0.63 + k * 0.14, -2.17, 0.025, 0.8, 0.85, BLACK, { seg: 8 }).rotation.x = Math.PI / 2;
  // counter run with the sink
  b.box(-0.1, 1.57, -2.13, -1.52, 0, 0.86, 0xece8df);
  b.box(-0.1, 1.6, -2.16, -1.52, 0.86, 0.91, 0x2a2a2f);
  for (let k = 0; k < 3; k++) b.box(0.0 + k * 0.55, 0.47 + k * 0.55, -2.14, -2.13, 0.1, 0.78, 0xf7f4ee, { cast: false });
  b.box(0.66, 1.2, -2.08, -1.66, 0.895, 0.915, 0x8d949b); // sink
  b.box(0.71, 1.15, -2.03, -1.71, 0.9, 0.918, 0x5d646b, { cast: false });
  b.cyl(0.93, -1.6, 0.02, 0.91, 1.15, 0xc9cdd2, { seg: 8 });
  b.box(0.91, 0.95, -1.78, -1.6, 1.13, 1.16, 0xc9cdd2);
  b.box(1.25, 1.55, -2.05, -1.6, 0.91, 0.93, 0xd8a45c); // cutting board
  b.box(-0.08, 0.14, -1.75, -1.55, 0.91, 1.2, 0x3a3d42, { r: 0.02 }); // kettle/toaster
  // upper cabinets and the microwave (cut away with the walls)
  b.box(-0.1, 1.57, -1.85, -1.52, 1.45, 2.2, 0xf2efe8, { tall: true });
  b.box(-0.75, -0.1, -1.9, -1.52, 1.5, 1.85, 0xd9dde1, { tall: true });
  b.box(-1.73, -0.98, -2.1, -1.52, 1.78, 2.2, 0x3a3d42, { tall: true });
  // north side: metal rack, stool, plants, art
  b.box(-1.55, -0.25, -3.78, -3.42, 0.42, 0.46, 0x8f949a);
  b.box(-1.55, -0.25, -3.78, -3.42, 0.86, 0.9, 0x8f949a);
  b.legs(-1.55, -0.25, -3.78, -3.42, 0.9, 0x6f747a, 0.03);
  b.box(-1.45, -1.1, -3.72, -3.48, 0.9, 1.12, 0xd9dde1, { r: 0.03 });
  b.cyl(-0.85, -3.6, 0.13, 0.9, 1.08, 0x2a2a2f, { seg: 12 });
  b.box(-0.6, -0.35, -3.72, -3.5, 0.46, 0.7, 0xc98a3c, { r: 0.03 });
  b.box(-1.4, -0.9, -3.72, -3.5, 0.46, 0.62, 0x6f8fa8, { r: 0.03 });
  b.cyl(-0.05, -3.5, 0.17, 0, 0.45, 0xd8a45c, { seg: 14 }); // stool
  b.plant(0.75, -3.55, "tall", 1.25, 0x3a3d42);
  b.plant(1.35, -3.6, "bush", 0.9, 0xe8e2d6);
  b.box(0.2, 0.6, -3.795, -3.78, 1.0, 1.55, 0xd8c7a0, { tall: true, cast: false }); // framed print
  b.box(0.25, 0.55, -3.778, -3.775, 1.05, 1.5, 0xf5f2ea, { tall: true, cast: false });
  // east end: recycling
  b.box(2.3, 2.75, -3.75, -3.4, 0, 0.42, 0x2f5fa8, { r: 0.03 });
  b.box(1.5, 1.85, -3.75, -3.4, 0, 0.45, 0x55585e, { r: 0.04 });

  // ---------- hallway
  b.rug(5.2, 5.95, -3.05, -2.45, "picture", PICTURE, 4);

  // ---------- roommate's room (his bed is added by the engine)
  b.rug(6.8, 8.15, -3.55, -2.7, "kilim", KILIM_RED, 5);
  b.rug(8.2, 9.35, -2.95, -1.4, "persian", DEEP_RED, 6);
  const GRAY = 0x9da3aa;
  b.sofa(9.45, 10.55, -3.6, -1.1, "e", GRAY, { arms: ["s"], cushions: 3 });
  b.sofa(8.55, 9.45, -3.7, -2.95, "n", GRAY, { cushions: 1 });
  b.pillow(10.15, 0.46, -3.25, 0xc0392b, -Math.PI / 2);
  b.pillow(10.15, 0.46, -2.75, 0xd94f8a, -Math.PI / 2, 0.38);
  b.pillow(10.1, 0.46, -1.6, 0xe9e2d0, -Math.PI / 2);
  b.table(5.55, 6.65, -3.75, -3.25, 0.76, DARKWOOD);
  b.box(5.9, 6.3, -3.6, -3.35, 0.76, 0.78, 0xdfe3e8);
  b.chair(6.1, -2.95, Math.PI, 0xf2efe8);
  b.box(7.97, 8.34, -1.45, -0.92, 0.1, 0.45, 0xd9a82e, { r: 0.06 }); // mustard chair
  b.box(7.97, 8.34, -1.0, -0.92, 0.45, 0.85, 0xd9a82e, { r: 0.04 });
  b.box(7.55, 9.25, -0.92, -0.55, 0, 0.6, DARKWOOD, { r: 0.02 }); // low dresser
  b.cyl(8.0, -0.72, 0.09, 0.6, 0.78, 0xf2efe8, { seg: 10 });
  b.cyl(8.5, -0.72, 0.12, 0.6, 0.7, 0x6f8fa8, { seg: 12 });
  b.box(8.9, 9.15, -0.85, -0.62, 0.6, 0.85, 0x2a2a2f, { r: 0.02 });
  // wall TV and the record wall
  b.box(7.2, 8.4, -3.795, -3.76, 1.05, 1.75, BLACK, { tall: true });
  b.box(7.24, 8.36, -3.76, -3.755, 1.09, 1.71, 0x3d4a66, { tall: true, cast: false });
  const sleeves = [0x8a4a3a, 0xe9e2d0, 0x7a1f3a, 0xe74c3c, 0x2a2a2f, 0xd9a82e, 0x2f6a8f, 0xf1ede2];
  sleeves.forEach((c, i) => {
    const sx = 8.75 + (i % 4) * 0.42;
    const sy = 1.2 + Math.floor(i / 4) * 0.42;
    b.box(sx, sx + 0.31, -3.795, -3.78, sy, sy + 0.31, c, { tall: true, cast: false });
  });

  // ---------- red bedroom
  b.bed(5.6, 7.65, -0.05, 1.33, "w", { frame: 0x4a2a22, sheet: 0xc92f2f, duvet: 0xe04038, pillow: 0xb3262b, h: 0.64 });
  b.rug(5.72, 7.98, 1.38, 2.2, "persian", DEEP_RED, 7);
  b.box(7.68, 7.98, 0.18, 1.26, 0, 0.5, BLACK, { r: 0.03 }); // black bench/speaker
  b.box(5.5, 5.78, 1.4, 2.05, 0, 0.5, DARKWOOD, { r: 0.02 });
  b.cyl(5.64, 1.6, 0.06, 0.5, 0.72, 0xf2efe8, { seg: 10 });

  // ---------- gallery
  b.rug(-3.1, -0.55, 1.3, 2.95, "persian", PERSIAN_PEACH, 8);
  b.rug(0.5, 2.35, 1.7, 2.7, "persian", PERSIAN_PINK, 9);
  b.rug(3.15, 5.3, 2.15, 2.95, "persian", PERSIAN_SAND, 10);
  // cream tufted lounge chair
  const CREAM = 0xebe1c4;
  b.box(-2.3, -1.48, 2.25, 2.95, 0.22, 0.4, CREAM, { r: 0.06 });
  b.box(-2.3, -1.48, 2.82, 3.0, 0.3, 0.86, CREAM, { r: 0.06 });
  b.legs(-2.26, -1.52, 2.3, 2.95, 0.22, 0x9a9da1, 0.03);
  for (let k = 0; k < 3; k++) b.box(-2.28 + k * 0.27, -2.27 + k * 0.27, 2.27, 2.82, 0.4, 0.405, 0xd4c9a8, { cast: false });
  b.plant(-1.0, 2.75, "bush", 1.5, 0xc2703d);
  b.plant(-2.9, 2.8, "trail", 1.1, 0xe8e2d6, 0.35);
  b.box(-0.88, -0.2, 0.82, 1.14, 0, 0.45, 0x8a4a2f, { r: 0.05 }); // leather trunk
  b.box(-2.72, -1.95, 0.82, 1.12, 0, 0.75, 0x3a3d42, { r: 0.02 }); // shoe rack
  // desk and office chair
  b.table(0.95, 1.95, 2.48, 2.95, 0.76, 0xe0b24a, 0x55585e);
  b.box(1.2, 1.7, 2.6, 2.75, 0.76, 0.78, BLACK);
  b.box(1.25, 1.65, 2.86, 2.9, 0.82, 1.15, BLACK);
  b.cyl(1.45, 2.15, 0.24, 0.42, 0.5, BLACK, { seg: 14 });
  b.cyl(1.45, 2.15, 0.03, 0.08, 0.42, 0x55585e, { seg: 8 });
  b.cyl(1.45, 2.15, 0.25, 0.04, 0.08, 0x55585e, { seg: 5 });
  b.box(1.22, 1.68, 1.9, 1.96, 0.5, 0.98, BLACK, { r: 0.03 });
  // the plant wall along the windows
  b.plant(-0.1, 2.8, "bush", 1.0, 0xe8e2d6, 0.35);
  b.plant(0.45, 2.82, "trail", 1.0, 0x6f8fa8, 0.5);
  b.plant(2.3, 2.8, "bush", 1.15, 0xe8e2d6);
  b.plant(2.75, 2.82, "palm", 0.9, 0xc2703d);
  b.plant(3.3, 2.85, "bush", 1.3, 0xc2703d);
  b.box(3.9, 5.05, 2.84, 2.99, 0, 0.3, LIGHTWOOD, { r: 0.02 }); // low bench
  b.plant(5.9, 2.75, "tall", 0.8, 0x3a3d42);
  for (const wx of [-0.3, 2.2]) b.box(wx, wx + 1.1, 2.985, 3.0, 0.9, 2.1, 0xbfe0ee, { tall: true, cast: false });

  // ---------- sun nook
  b.rug(8.7, 9.6, 1.25, 3.05, "persian", SAGE, 11);
  b.sofa(9.5, 10.5, 1.38, 3.14, "e", 0xeee6d2, { seat: 0.5, top: 0.8, cushions: 2 });
  b.pillow(10.05, 0.5, 2.0, 0xb3262b, -Math.PI / 2, 0.46);
  b.box(9.7, 10.2, 2.45, 2.95, 0.5, 0.58, 0xf5efe0, { r: 0.04 }); // sheepskin
  const pouf = b.add(new THREE.SphereGeometry(0.37, 18, 12), b.mat(0xe4d5b4), 8.9, 0.22, 2.3);
  pouf.scale.y = 0.6;
  // DJ deck on its stand
  b.box(8.3, 8.9, 0.95, 1.38, 0, 0.72, DARKWOOD, { r: 0.02 });
  b.box(8.33, 8.87, 0.98, 1.35, 0.72, 0.78, BLACK, { r: 0.01 });
  b.cyl(8.47, 1.17, 0.09, 0.78, 0.79, 0x55585e, { seg: 16 });
  b.cyl(8.73, 1.17, 0.09, 0.78, 0.79, 0x55585e, { seg: 16 });
  b.plant(9.85, 0.8, "palm", 1.2, 0x3a3d42);
  b.plant(10.35, 0.95, "bush", 1.2, 0xc2703d);
  b.plant(9.25, 0.75, "bush", 0.9, 0xe8e2d6);
  b.plant(8.85, 3.0, "bush", 0.8, 0xc2703d);
  b.plant(10.45, 3.05, "trail", 1.0, 0xe8e2d6, 0.4);
  b.box(10.685, 10.7, 1.3, 2.7, 0.9, 2.1, 0xbfe0ee, { tall: true, cast: false });
}

/** Collapse hundreds of little meshes into one per material. */
function merge(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(m.matrixWorld);
    const mat = m.material as THREE.Material;
    const k = mat.uuid + (m.castShadow ? "c" : "n");
    let bkt = buckets.get(k);
    if (!bkt) buckets.set(k, (bkt = { mat, cast: m.castShadow, geos: [] }));
    bkt.geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, cast, geos } of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  return out;
}

export function buildStylized(clip: THREE.Plane) {
  const b = new Builder(clip);
  const caps = new THREE.Group();
  buildShell(b, caps, clip);
  furnish(b);
  const group = merge(b.group);
  group.add(caps);
  return {
    group,
    /**
     * Wall caps ride at the cut height, and only show on walls that face the camera,
     * matching how the walls themselves disappear when seen from behind.
     */
    update(h: number, cam: THREE.Vector3) {
      caps.position.y = Math.min(h, WALL_H);
      for (const c of caps.children) {
        const u = c.userData as { nx: number; nz: number; px: number; pz: number };
        c.visible = u.nx * (cam.x - u.px) + u.nz * (cam.z - u.pz) > 0;
      }
    },
  };
}
