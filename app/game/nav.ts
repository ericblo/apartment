// Walkable-floor grid baked from the scan (see scripts/build-world.js) plus A* pathfinding.
import navData from "./nav.json";

export type Pt = [number, number]; // world x, z

const NAV = navData as {
  x0: number;
  z0: number;
  cell: number;
  w: number;
  h: number;
  rows: string[];
};
const W = NAV.w;
const H = NAV.h;
const CELL = NAV.cell;
const grid = new Uint8Array(W * H);
NAV.rows.forEach((row, j) => {
  for (let i = 0; i < W; i++) grid[j * W + i] = row.charCodeAt(i) === 49 ? 1 : 0;
});

const ci = (x: number) => Math.floor((x - NAV.x0) / CELL);
const cj = (z: number) => Math.floor((z - NAV.z0) / CELL);
const wx = (i: number) => NAV.x0 + (i + 0.5) * CELL;
const wz = (j: number) => NAV.z0 + (j + 0.5) * CELL;
const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;

export function isWalkable(x: number, z: number) {
  return ok(ci(x), cj(z));
}

/** Closest walkable point to (x, z), searching outward in rings. */
export function nearestWalkable(x: number, z: number, maxR = 40): Pt {
  const i0 = ci(x);
  const j0 = cj(z);
  if (ok(i0, j0)) return [x, z];
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (!ok(i, j)) continue;
        const d = (wx(i) - x) ** 2 + (wz(j) - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [wx(i), wz(j)];
        }
      }
    }
    if (best && r * CELL > Math.sqrt(bestD)) break;
  }
  return best ?? [x, z];
}

function lineOfSight(a: Pt, b: Pt) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    if (!isWalkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

const NB: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** A* over the grid, then string-pulled into a few straight segments. */
export function findPath(from: Pt, to: Pt): Pt[] {
  const a = nearestWalkable(from[0], from[1]);
  const b = nearestWalkable(to[0], to[1]);
  const si = ci(a[0]);
  const sj = cj(a[1]);
  const ti = ci(b[0]);
  const tj = cj(b[1]);
  const start = sj * W + si;
  const goal = tj * W + ti;
  if (start === goal) return [b];

  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap: number[] = [];
  const f = new Float32Array(W * H).fill(Infinity);
  const push = (k: number) => {
    heap.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };
  const hfn = (i: number, j: number) => {
    const dx = Math.abs(i - ti);
    const dy = Math.abs(j - tj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  g[start] = 0;
  f[start] = hfn(si, sj);
  push(start);
  let found = false;
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) {
      found = true;
      break;
    }
    const i = k % W;
    const j = (k / W) | 0;
    for (const [di, dj, cost] of NB) {
      const ni = i + di;
      const nj = j + dj;
      if (!ok(ni, nj)) continue;
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // no corner cutting
      const nk = nj * W + ni;
      if (closed[nk]) continue;
      const ng = g[k] + cost;
      if (ng < g[nk]) {
        g[nk] = ng;
        came[nk] = k;
        f[nk] = ng + hfn(ni, nj);
        push(nk);
      }
    }
  }
  if (!found) return [b];

  const cells: Pt[] = [];
  for (let k = goal; k !== -1; k = came[k]) cells.push([wx(k % W), wz((k / W) | 0)]);
  cells.reverse();
  cells[0] = a;
  cells[cells.length - 1] = b;

  // string pulling
  const out: Pt[] = [];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let far = anchor + 1;
    for (let k = cells.length - 1; k > anchor + 1; k--) {
      if (lineOfSight(cells[anchor], cells[k])) {
        far = k;
        break;
      }
    }
    out.push(cells[far]);
    anchor = far;
  }
  return out;
}

/** A random walkable spot, optionally inside a box [x0, x1, z0, z1]. */
export function randomWalkable(box?: [number, number, number, number]): Pt {
  for (let n = 0; n < 400; n++) {
    const i = Math.floor(Math.random() * W);
    const j = Math.floor(Math.random() * H);
    if (!ok(i, j)) continue;
    // keep a little clear of walls so things placed here are not half inside furniture
    if (!ok(i + 2, j) || !ok(i - 2, j) || !ok(i, j + 2) || !ok(i, j - 2)) continue;
    const x = wx(i);
    const z = wz(j);
    if (box && (x < box[0] || x > box[1] || z < box[2] || z > box[3])) continue;
    return [x, z];
  }
  return [0, -3];
}

export function pathLength(from: Pt, path: Pt[]) {
  let d = 0;
  let p = from;
  for (const q of path) {
    d += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return d;
}
