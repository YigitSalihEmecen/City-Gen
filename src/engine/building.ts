import { acUnit, balconyLife, curtains, dish, drainpipe, fireEscape, flowerBox, oriel, roofLife, shopBrand, shopUnit, solarSlope, type Brand } from './details.ts';
import { Builder, color, dome, ONION, shade, type Part, type RGB, type V3 } from './mesh.ts';
import { rng, type Rng } from './rng.ts';
import type { RoofType, Shape, Style } from './styles.ts';

export type Corner = 'auto' | 'none' | 'left' | 'right' | 'both';

export interface BuildingParams {
  style: Style;
  seed: number;
  width: number;
  depth: number;
  detail: number;
  floors?: number;
  shape?: Shape | 'auto';
  roof?: RoofType | 'auto';
  corner?: Corner;
  /** sides facing a side street (corner lots): they get windows/shops instead of party walls */
  open?: 'left' | 'right' | 'both';
  heightScale?: number;
  /** roof spots [x, z, radius] that props must leave free (helipads, domes placed by the caller) */
  reserve?: [number, number, number][];
}

export interface BuildingInfo {
  style: string;
  shape: Shape;
  roof: RoofType;
  floors: number;
  height: number;
}

export interface Grid {
  nx: number;
  nz: number;
  cx: number;
  cz: number;
  W: number;
  D: number;
  cells: Uint8Array;
}

interface RoofRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  axis: 'x' | 'z';
}

interface Ellipse {
  x: number;
  z: number;
  a: number;
  b: number;
}

interface Tier {
  grid: Grid;
  rects: RoofRect[];
  f0: number;
  f1: number;
  round?: Ellipse;
  fans: [number, number][][];
}

export interface Seg {
  x0: number;
  z0: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  len: number;
  cv0: boolean;
  cv1: boolean;
  street?: boolean;
  /** ellipse [cx, cz, rx, rz] the segment approximates; used for smooth shading */
  rc?: [number, number, number, number];
}

export interface Ctx {
  b: Builder;
  r: Rng;
  st: Style;
  d: number;
  floors: number;
  bay: number;
  groundH: number;
  floorH: number;
  winW: number;
  winH: number;
  arch: boolean;
  shutters: boolean;
  shops: boolean;
  lit: number;
  curtains: number;
  curtain: RGB;
  doorW: number;
  doorH: number;
  doorPlaced: boolean;
  fireDone: boolean;
  solar: boolean;
  balconyRows: Set<number>;
  open: Set<number>;
  reserve: [number, number, number][];
  wall: RGB;
  baseWall: RGB;
  trim: RGB;
  roof: RGB;
  glass: RGB;
  accent: RGB;
  spandrel: RGB;
}

export type Quad = (part: Part, u0: number, v0: number, u1: number, v1: number, w: number, col: RGB, emit?: number) => void;
export type Box = (part: Part, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number, col: RGB, emit?: number) => void;

/** A facade's local frame: u along the wall, v up, w outward. */
export interface Face {
  s: Seg;
  out: V3;
  fp: (u: number, v: number, w: number) => V3;
  quad: Quad;
  box: Box;
}

const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];
const FLAT_TOPS: RoofType[] = ['flat', 'spire', 'dome', 'onion'];

export function filled(g: Grid, x: number, z: number) {
  const i = Math.floor((x + g.W / 2) / g.cx);
  const j = Math.floor((z + g.D / 2) / g.cz);
  return i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.cells[i + j * g.nx] === 1;
}

function seg(ax: number, az: number, bx: number, bz: number, extra: Partial<Seg> = {}): Seg {
  const len = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / len, tz = (bz - az) / len;
  return { x0: ax, z0: az, tx, tz, nx: -tz, nz: tx, len, cv0: true, cv1: true, ...extra };
}

/** Boundary of a cell grid as maximal straight facade segments with outward normals. */
export function outline(g: Grid): Seg[] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.cells[i + j * g.nx] === 1;
  const runs = new Map<string, number[]>();
  const add = (key: string, k: number) => (runs.get(key) ?? runs.set(key, []).get(key)!).push(k);
  for (let j = 0; j < g.nz; j++)
    for (let i = 0; i < g.nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add(`0,-1,${j}`, i);
      if (!at(i, j + 1)) add(`0,1,${j + 1}`, i);
      if (!at(i - 1, j)) add(`-1,0,${i}`, j);
      if (!at(i + 1, j)) add(`1,0,${i + 1}`, j);
    }
  const segs: Seg[] = [];
  const X = (i: number) => -g.W / 2 + i * g.cx;
  const Z = (j: number) => -g.D / 2 + j * g.cz;
  const e = 1e-4;
  for (const [key, ks] of runs) {
    const [nx, nz, line] = key.split(',').map(Number);
    ks.sort((a, b) => a - b);
    let start = ks[0];
    for (let k = 1; k <= ks.length; k++) {
      if (k < ks.length && ks[k] === ks[k - 1] + 1) continue;
      const end = ks[k - 1] + 1;
      const tx = nz, tz = -nx;
      let a: [number, number], len: number;
      if (nx === 0) {
        len = (end - start) * g.cx;
        a = [tx > 0 ? X(start) : X(end), Z(line)];
      } else {
        len = (end - start) * g.cz;
        a = [X(line), tz > 0 ? Z(start) : Z(end)];
      }
      const bx = a[0] + tx * len, bz = a[1] + tz * len;
      segs.push({
        x0: a[0], z0: a[1], tx, tz, nx, nz, len,
        cv0: !filled(g, a[0] - tx * e - nx * e, a[1] - tz * e - nz * e),
        cv1: !filled(g, bx + tx * e - nx * e, bz + tz * e - nz * e),
      });
      if (k < ks.length) start = ks[k];
    }
  }
  return segs;
}

/** Ellipse as facets of roughly one bay each, ordered so normals point outward. */
export function ellipseSegs(e: Ellipse, bay: number): Seg[] {
  const { a, b } = e;
  const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const n = Math.max(10, Math.round(perim / bay));
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [e.x + a * Math.cos(t), e.z - b * Math.sin(t)];
  });
  return pts.slice(0, n).map((p, i) => seg(p[0], p[1], pts[i + 1][0], pts[i + 1][1], { rc: [e.x, e.z, a, b] }));
}

/** Replaces a convex rect corner by a quarter-ellipse of facets; clears the cut cells and records a roof fan. */
function roundCorner(c: Ctx, tier: Tier, segs: Seg[], corner: number): Seg[] {
  const g = tier.grid, rr = tier.rects[0];
  const [px, pz] = [[rr.x0, rr.z1], [rr.x1, rr.z1], [rr.x1, rr.z0], [rr.x0, rr.z0]][corner];
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const A = segs.find((s) => near(s.x0 + s.tx * s.len, px) && near(s.z0 + s.tz * s.len, pz));
  const B = segs.find((s) => near(s.x0, px) && near(s.z0, pz));
  if (!A || !B) return [];
  const cellA = Math.abs(A.tx) > 0.5 ? g.cx : g.cz, cellB = Math.abs(B.tx) > 0.5 ? g.cx : g.cz;
  const m = Math.min(c.r.int(1, 2), Math.floor(A.len / cellA / 2 - 0.5), Math.floor(B.len / cellB / 2 - 0.5));
  if (m < 1) return [];
  const rA = m * cellA, rB = m * cellB;
  const cx = px - A.tx * rA - A.nx * rB, cz = pz - A.tz * rA - A.nz * rB;
  A.len -= rA;
  B.x0 += B.tx * rB;
  B.z0 += B.tz * rB;
  B.len -= rB;
  A.street = B.street = true;
  const rx = Math.abs(A.nx) > 0.5 ? rB : rA, rz = Math.abs(A.nx) > 0.5 ? rA : rB;
  const n = Math.max(2, Math.round((Math.PI / 2) * ((rA + rB) / 2) / (c.bay * 0.85)));
  const arc: [number, number][] = Array.from({ length: n + 1 }, (_, i) => {
    const phi = (i / n) * (Math.PI / 2);
    return [cx + A.nx * rB * Math.cos(phi) + A.tx * rA * Math.sin(phi), cz + A.nz * rB * Math.cos(phi) + A.tz * rA * Math.sin(phi)];
  });
  for (let j = 0; j < g.nz; j++)
    for (let i = 0; i < g.nx; i++) {
      const x = -g.W / 2 + (i + 0.5) * g.cx, z = -g.D / 2 + (j + 0.5) * g.cz;
      if ((x - px) * (x - cx) < 0 && (z - pz) * (z - cz) < 0) g.cells[i + j * g.nx] = 0;
    }
  tier.fans.push([[cx, cz], ...arc]);
  return arc.slice(0, n).map((p, i) => seg(p[0], p[1], arc[i + 1][0], arc[i + 1][1], { street: true, rc: [cx, cz, rx, rz] }));
}

function makeGrid(nx: number, nz: number, W: number, D: number, keep: (i: number, j: number) => boolean): Grid {
  const cells = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) cells[i + j * nx] = keep(i, j) ? 1 : 0;
  return { nx, nz, cx: W / nx, cz: D / nz, W, D, cells };
}

/** Footprint cells plus roof rectangles; wings run into the main ridge so their roofs intersect cleanly. */
function footprint(shape: Shape, nx: number, nz: number, W: number, D: number, r: Rng) {
  const rect = (i0: number, j0: number, i1: number, j1: number, axis: 'x' | 'z'): RoofRect => ({
    x0: -W / 2 + (i0 * W) / nx, x1: -W / 2 + (i1 * W) / nx, z0: -D / 2 + (j0 * D) / nz, z1: -D / 2 + (j1 * D) / nz, axis,
  });
  const fb = Math.min(nz - 1, Math.max(2, Math.round(nz * r.range(0.45, 0.6))));
  const back = nz - fb;
  const wingCap = Math.max(1, Math.floor((fb * D) / nz / (W / nx)));
  const wing = (max: number) => Math.max(1, Math.min(wingCap, max, Math.round(nx * r.range(0.28, 0.42))));
  const main = rect(0, back, nx, nz, nx >= fb ? 'x' : 'z');
  const ridge = nz - fb / 2;
  switch (shape) {
    case 'L': {
      const w = wing(nx - 1);
      const i0 = r.chance(0.5) ? 0 : nx - w;
      return { grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || (i >= i0 && i < i0 + w)), rects: [main, rect(i0, 0, i0 + w, ridge, 'z')] };
    }
    case 'T': {
      const w = wing(nx - 2);
      const i0 = Math.floor((nx - w) / 2);
      return { grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || (i >= i0 && i < i0 + w)), rects: [main, rect(i0, 0, i0 + w, ridge, 'z')] };
    }
    case 'U': {
      const w = Math.min(wing(Math.floor((nx - 1) / 2)), Math.floor((nx - 1) / 2));
      return {
        grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || i < w || i >= nx - w),
        rects: [main, rect(0, 0, w, ridge, 'z'), rect(nx - w, 0, nx, ridge, 'z')],
      };
    }
    case 'court': {
      const t = Math.max(1, Math.min(Math.floor((Math.min(nx, nz) - 1) / 2), Math.round(Math.min(nx, nz) * 0.3)));
      return {
        grid: makeGrid(nx, nz, W, D, (i, j) => i < t || j < t || i >= nx - t || j >= nz - t),
        rects: [rect(0, nz - t, nx, nz, 'x'), rect(0, 0, nx, t, 'x'), rect(0, t / 2, t, nz - t / 2, 'z'), rect(nx - t, t / 2, nx, nz - t / 2, 'z')],
      };
    }
    default:
      return { grid: makeGrid(nx, nz, W, D, () => true), rects: [rect(0, 0, nx, nz, W >= D ? 'x' : 'z')] };
  }
}

function fits(shape: Shape, nx: number, nz: number, W: number, D: number) {
  if (shape === 'rect') return true;
  if (shape === 'round') return W >= 8 && D >= 8;
  if (shape === 'L') return nx >= 3 && nz >= 3;
  if (shape === 'T') return nx >= 4 && nz >= 3;
  if (shape === 'U') return nx >= 5 && nz >= 3;
  return nx >= 5 && nz >= 5;
}

const tint = (c: RGB, r: Rng): RGB => [c[0] * r.range(0.95, 1.05), c[1] * r.range(0.95, 1.05), c[2] * r.range(0.95, 1.05)];
const CURTAINS = ['#E9E1CF', '#D8CDB5', '#B8A58A', '#8E4A3E', '#6F7F8C', '#EDE8DD', '#A88F6A'];

export function generateBuilding(b: Builder, p: BuildingParams): BuildingInfo {
  const st = p.style;
  const r = rng(p.seed);
  const pick = (arr: string[]) => tint(color(r.pick(arr)), r);
  const bay = r.range(...st.bay);
  const nx = Math.max(2, Math.round(p.width / bay));
  const nz = Math.max(2, Math.round(p.depth / bay));

  let shape: Shape = p.shape && p.shape !== 'auto' ? p.shape : r.weighted(st.massing.shapes);
  if (!fits(shape, nx, nz, p.width, p.depth)) shape = 'rect';
  const floors = p.floors ?? Math.max(1, Math.round(r.int(...st.floors) * (p.heightScale ?? 1)));
  let roofType: RoofType = p.roof && p.roof !== 'auto' ? p.roof : r.weighted(st.roof.types);
  if (shape === 'round' && ['gable', 'hip', 'mansard'].includes(roofType)) roofType = 'cone';
  if (shape !== 'round' && roofType === 'cone') roofType = 'hip';
  const flatTop = FLAT_TOPS.includes(roofType);

  const wall = pick(st.palette.wall);
  const c: Ctx = {
    b, r, st, d: p.detail, floors, bay,
    groundH: st.groundH * r.range(0.95, 1.08),
    floorH: st.floorH * r.range(0.96, 1.04),
    winW: r.range(...st.win.w),
    winH: r.range(...st.win.h),
    arch: r.chance(st.win.arch),
    shutters: r.chance(st.win.shutters),
    shops: r.chance(st.shops),
    lit: r.range(0.2, 0.55),
    curtains: st.facade === 'curtain' ? 0 : r.range(0.2, 0.7),
    curtain: color(r.pick(CURTAINS)),
    doorW: st.door?.[0] ?? r.range(1.2, 1.7),
    doorH: st.door?.[1] ?? r.range(2.3, 2.8),
    doorPlaced: false,
    fireDone: false,
    solar: r.chance(st.solar),
    balconyRows: new Set(),
    open: new Set(p.open === 'left' ? [-1] : p.open === 'right' ? [1] : p.open === 'both' ? [-1, 1] : []),
    reserve: p.reserve ?? [],
    wall,
    baseWall: st.palette.base ? pick(st.palette.base) : wall,
    trim: pick(st.palette.trim),
    roof: r.chance(st.greenRoof) ? color(r.pick(['#8A9A68', '#7E9160', '#94A372'])) : pick(st.palette.roof),
    glass: pick(st.palette.glass),
    accent: pick(st.palette.accent),
    spandrel: st.palette.spandrel ? pick(st.palette.spandrel) : wall,
  };
  if (st.balcony.mode === 'row' && floors >= 4) {
    c.balconyRows.add(2);
    c.balconyRows.add(floors - 1);
  }

  let corner = p.corner ?? 'auto';
  if (corner === 'auto') corner = r.chance(flatTop ? st.corner : st.turret) ? r.pick(['left', 'right', 'both'] as const) : 'none';
  const cornerIds = corner === 'left' ? [0] : corner === 'right' ? [1] : corner === 'both' ? [0, 1] : [];
  const rounded = flatTop && shape === 'rect' && st.corner > 0 ? cornerIds : [];
  const turrets = !flatTop && shape !== 'round' && st.turret > 0 ? cornerIds : [];

  const tiers: Tier[] = [];
  if (shape === 'rect' || shape === 'round') {
    const podium = floors >= 6 && r.chance(st.massing.podium);
    const maxInset = Math.floor((Math.min(nx, nz) - 2) / 2);
    const count = Math.min(r.int(...st.massing.tiers), maxInset + 1, Math.max(1, Math.floor(floors / 3)));
    let f = 0, inset = 0;
    const W = p.width, D = p.depth;
    for (let t = 0; t < count && f < floors; t++) {
      const left = floors - f;
      const n = t === count - 1 ? left : Math.max(1, t === 0 && podium ? Math.min(left - 1, r.int(2, 4)) : Math.round(left * r.range(0.45, 0.65)));
      const k = inset;
      const round = shape === 'round' ? { x: 0, z: 0, a: W / 2 - (k * W) / nx, b: D / 2 - (k * D) / nz } : undefined;
      const inside = (i: number, j: number) => {
        if (!round) return i >= k && j >= k && i < nx - k && j < nz - k;
        const x = -W / 2 + ((i + 0.5) * W) / nx, z = -D / 2 + ((j + 0.5) * D) / nz;
        return (x / round.a) ** 2 + (z / round.b) ** 2 <= 1;
      };
      tiers.push({
        grid: makeGrid(nx, nz, W, D, inside),
        rects: [{ x0: -W / 2 + (k * W) / nx, x1: W / 2 - (k * W) / nx, z0: -D / 2 + (k * D) / nz, z1: D / 2 - (k * D) / nz, axis: nx >= nz ? 'x' : 'z' }],
        f0: f, f1: f + n, round, fans: [],
      });
      f += n;
      inset = Math.min(maxInset, inset + (t === 0 && podium ? Math.max(1, Math.floor(maxInset / 2)) : 1));
    }
  } else {
    const fp = footprint(shape, nx, nz, p.width, p.depth, r);
    tiers.push({ grid: fp.grid, rects: fp.rects, f0: 0, f1: floors, fans: [] });
  }

  const top = tiers[tiers.length - 1];
  for (const tier of tiers) {
    const isTop = tier === top;
    const flat = !isTop || flatTop;
    let segs = tier.round ? ellipseSegs(tier.round, bay) : outline(tier.grid);
    for (const id of tier.round ? [] : rounded) segs = segs.concat(roundCorner(c, tier, segs, id));
    let front: Seg | undefined;
    if (tier.f0 === 0) {
      front = tier.round
        ? segs.reduce((a, s) => (s.nz > a.nz ? s : a))
        : segs.filter((s) => s.nz > 0.99).reduce((a, s) => (s.z0 > a.z0 + 1e-6 || (Math.abs(s.z0 - a.z0) < 1e-6 && s.len > a.len) ? s : a));
      for (const s of segs) {
        if ((tier.round && s.nz > 0.4) || (!tier.round && s.nz > 0.99 && Math.abs(s.z0 - front.z0) < 1e-6)) s.street = true;
        if (!s.rc && Math.abs(s.nx) > 0.99 && c.open.has(s.nx) && Math.abs(Math.abs(s.x0) - p.width / 2) < 1e-6) s.street = true;
      }
    }
    for (const s of segs) facade(c, s, tier, flat, s === front);
    if (flat) flatRoof(c, tier, isTop ? roofType : 'flat');
    else if (tier.round) roundRoof(c, tier, roofType);
    else for (const rr of tier.rects) pitchedRoof(c, tier, rr, roofType);
  }
  for (const id of turrets) turret(c, id, p.width, p.depth, top);
  if (!flatTop && shape !== 'round' && r.chance(st.roof.chimneys)) chimneys(c, top, roofType);

  return { style: st.id, shape, roof: roofType, floors, height: base(c, floors) };
}

export const base = (c: Ctx, f: number) => (f === 0 ? 0 : c.groundH + (f - 1) * c.floorH);
const height = (c: Ctx, f: number) => (f === 0 ? c.groundH : c.floorH);
const jetty = (c: Ctx, tier: Tier, f: number) => (tier.f0 === 0 && f >= 1 ? c.st.jetty : 0);

type Kind = 'wall' | 'window' | 'door' | 'shop' | 'balcony';

function facade(c: Ctx, s: Seg, tier: Tier, flatTop: boolean, front: boolean) {
  const { b, r, st, d } = c;
  const fp = (u: number, v: number, w: number): V3 => [s.x0 + s.tx * u + s.nx * w, v, s.z0 + s.tz * u + s.nz * w];
  const out: V3 = [s.nx, 0, s.nz];
  const quad: Quad = (part, u0, v0, u1, v1, w, col, emit = 0) => b.face(part, [fp(u0, v0, w), fp(u1, v0, w), fp(u1, v1, w), fp(u0, v1, w)], col, out, emit);
  const box: Box = (part, u0, u1, v0, v1, w0, w1, col, emit = 0) => {
    const pts: V3[] = [];
    for (let k = 0; k < 8; k++) pts.push(fp(k & 1 ? u1 : u0, k & 2 ? v1 : v0, k & 4 ? w1 : w0));
    b.hexa(part, pts, col, emit);
  };
  const F: Face = { s, out, fp, quad, box };
  const ext = (cv: boolean, w: number) => (cv ? w : 0);
  if (s.rc) b.smooth = { cx: s.rc[0], cy: 0, cz: s.rc[1], rx: s.rc[2], ry: 0, rz: s.rc[3], ref: out };

  const nb = Math.max(1, Math.round(s.len / c.bay));
  const bw = s.len / nb;
  const side = Math.abs(s.nx) > 0.5 && !s.rc;
  const partyWall = st.attached && side && !s.street && r.chance(0.85);
  const half = Math.ceil(nb / 2);
  const winCol: boolean[] = [];
  const stackCol: boolean[] = [];
  for (let i = 0; i < half; i++) {
    winCol[i] = winCol[nb - 1 - i] = !partyWall && !r.chance(s.street ? st.blankCol * 0.4 : st.blankCol);
    stackCol[i] = stackCol[nb - 1 - i] = st.balcony.mode === 'stack' && r.chance(st.balcony.chance);
  }
  const doorBay = front && !c.doorPlaced ? Math.floor(nb / 2) : -1;
  if (doorBay >= 0) c.doorPlaced = true;
  const top = base(c, tier.f1);
  const curtain = st.facade === 'curtain';

  const units: { i0: number; i1: number; brand: Brand }[] = [];
  const unitOf: (Brand | undefined)[] = [];
  if (tier.f0 === 0 && s.street && c.shops && !curtain) {
    for (let i = 0; i < nb; ) {
      if (i === doorBay) { i++; continue; }
      const want = r.int(1, nb >= 6 ? 3 : 2);
      let j = i;
      while (j < nb && j - i < want && j !== doorBay) j++;
      const brand = shopBrand(c);
      units.push({ i0: i, i1: j, brand });
      for (let k = i; k < j; k++) unitOf[k] = brand;
      i = j;
    }
  }

  for (let f = tier.f0; f < tier.f1; f++) {
    const v0 = base(c, f), fh = height(c, f), v1 = v0 + fh;
    const w0 = jetty(c, tier, f);
    const col = f === 0 ? shade(c.baseWall, 0.94) : c.wall;
    const e0 = s.cv0 ? w0 : 0, e1 = s.cv1 ? w0 : 0;
    if (e0 > 0) quad(b.solid, -e0, v0, 0, v1, w0, col);
    if (e1 > 0) quad(b.solid, s.len, v0, s.len + e1, v1, w0, col);
    if (w0 > 0 && f === tier.f0 + 1) {
      b.face(b.solid, [fp(-e0, v0, 0), fp(s.len + e1, v0, 0), fp(s.len + e1, v0, w0), fp(-e0, v0, w0)], col, DOWN);
      if (d >= 1) box(b.solid, -e0, s.len + e1, v0 - 0.22, v0, w0 - 0.05, w0 + 0.05, c.trim);
    }

    if (curtain && f > 0) {
      const sp = fh * (1 - c.winH);
      quad(b.solid, 0, v0, s.len, v0 + sp, w0, c.spandrel);
      for (let i = 0; i < nb; i++) quad(b.glass, i * bw, v0 + sp, (i + 1) * bw, v1, w0, shade(c.glass, r.range(0.9, 1.1)), r.chance(c.lit) ? r.range(0.5, 1) : 0);
      continue;
    }

    const row = c.balconyRows.has(f) && !partyWall && nb >= 2;
    if (row) balcony(c, F, 0.15, s.len - 0.15, v0, w0, true);
    for (let i = 0; i < nb; i++) {
      const u0 = i * bw, u1 = u0 + bw;
      let kind: Kind;
      if (curtain) kind = i === doorBay ? 'door' : 'shop';
      else if (f === 0 && i === doorBay) kind = 'door';
      else if (f === 0 && unitOf[i]) kind = 'shop';
      else if (!winCol[i]) kind = 'wall';
      else if (f > 0 && (row || stackCol[i] || (st.balcony.mode === 'cell' && r.chance(st.balcony.chance)))) kind = 'balcony';
      else kind = 'window';
      cell(c, F, u0, u1, v0, v1, w0, kind, col, f, unitOf[i]);
      if (kind === 'balcony' && !row) balcony(c, F, u0 + 0.2, u1 - 0.2, v0, w0, false);
    }
    if (f === 0) for (const u of units) shopUnit(c, F, u.i0 * bw, u.i1 * bw, v0, v1, w0, u.brand);

    if (st.timber && f > 0 && d >= 1) {
      box(b.solid, -e0, s.len + e1, v0, v0 + 0.2, w0, w0 + 0.05, c.trim);
      box(b.solid, -e0, s.len + e1, v1 - 0.16, v1, w0, w0 + 0.05, c.trim);
      for (let i = 0; i <= nb; i++) box(b.solid, Math.max(-e0, i * bw - 0.09), Math.min(s.len + e1, i * bw + 0.09), v0, v1, w0, w0 + 0.05, c.trim);
    }
    if (st.bands && f > tier.f0 && d >= 1) {
      const [bh, bd, bc] = st.bands === 2 ? [0.25, 0.28, shade(c.wall, 0.92)] : st.bands === 3 ? [0.035, 0.02, shade(c.wall, 0.7)] : [0.11, 0.1, c.trim];
      box(b.solid, -ext(s.cv0, bd), s.len + ext(s.cv1, bd), v0 - bh, v0 + bh, w0, w0 + bd, bc);
    }
  }

  if (d >= 1 && st.plinth && tier.f0 === 0) box(b.solid, -ext(s.cv0, 0.07), s.len + ext(s.cv1, 0.07), 0, 0.55, 0, 0.07, shade(c.baseWall, 0.8));

  if (curtain && d >= 1) {
    const v0 = base(c, Math.max(1, tier.f0));
    for (let i = 0; i <= nb; i++) {
      const u = i * bw;
      if ((i === 0 && !s.cv0) || (i === nb && !s.cv1)) continue;
      box(b.solid, Math.max(0, u - 0.06), Math.min(s.len, u + 0.06), v0, top, 0, 0.14, c.trim);
    }
    if (tier.f0 === 0) box(b.solid, -ext(s.cv0, 0.5), s.len + ext(s.cv1, 0.5), c.groundH - 0.05, c.groundH + 0.35, 0, 0.5, c.trim);
  }

  if (st.pilasters && d >= 1) {
    const pw = Math.min(st.pilasters, bw * 0.3), pd = pw * 0.7;
    const v0 = c.shops && tier.f0 === 0 ? c.groundH : base(c, tier.f0);
    const vt = top + (flatTop && st.id === 'artdeco' ? st.roof.parapet + 1.2 : 0);
    for (let i = 0; i <= nb; i++) {
      if ((i === 0 && !s.cv0) || (i === nb && !s.cv1)) continue;
      const u0 = i === 0 ? 0 : i === nb ? s.len - pw : i * bw - pw / 2;
      box(b.solid, u0, u0 + pw, v0, vt, 0, pd, i === 0 || i === nb ? c.wall : shade(c.wall, 1.04));
    }
  }

  const upper = tier.f1 - Math.max(tier.f0, 1);
  if (front && d >= 1 && !curtain && upper >= 1 && nb >= 2 && r.chance(st.oriel)) {
    const cols = nb >= 5 ? [1, nb - 2] : [Math.floor(nb / 2)];
    for (const i of cols) oriel(c, F, i * bw, (i + 1) * bw, base(c, Math.max(tier.f0, 1)), top - 0.25, jetty(c, tier, tier.f1 - 1));
  }
  if (d >= 2 && !c.fireDone && !curtain && (front || (side && !partyWall)) && nb >= 3 && tier.f1 - tier.f0 >= 3 && r.chance(st.fireEscape)) {
    c.fireDone = true;
    const i = front ? (doorBay === 0 ? 1 : 0) : Math.floor(nb / 2) - 1;
    const levels = Array.from({ length: tier.f1 - Math.max(1, tier.f0) }, (_, k) => base(c, Math.max(1, tier.f0) + k));
    fireEscape(c, F, i * bw + 0.15, Math.min(s.len, (i + 2) * bw) - 0.15, levels);
  }
  if (d >= 1 && s.cv1 && !curtain && !s.rc && st.id !== 'artdeco' && s.len > 4 && tier.f0 === 0) drainpipe(c, F, s.len - 0.25, top);

  const wt = jetty(c, tier, tier.f1 - 1);
  if (st.cornice && d >= 1) {
    const cd = st.cornice;
    box(b.solid, -ext(s.cv0, cd + wt), s.len + ext(s.cv1, cd + wt), top - 0.32, top, wt, wt + cd, c.trim);
    if (d >= 2) box(b.solid, -ext(s.cv0, cd * 0.5 + wt), s.len + ext(s.cv1, cd * 0.5 + wt), top - 0.5, top - 0.32, wt, wt + cd * 0.5, c.trim);
  }
  if (flatTop) {
    const ph = st.roof.parapet || 0.5;
    box(b.solid, 0, s.len, top, top + ph, -0.3, 0, c.wall);
    if (d >= 1) box(b.solid, -ext(s.cv0, 0.06), s.len + ext(s.cv1, 0.06), top + ph, top + ph + 0.08, -0.34, 0.06, c.trim);
  }
  b.smooth = null;
}

function balcony(c: Ctx, F: Face, u0: number, u1: number, v0: number, w0: number, row: boolean) {
  const { b, st, d } = c;
  const { box, quad } = F;
  const dep = st.balcony.depth;
  const slab = st.balcony.solid ? shade(c.wall, 0.95) : c.trim;
  box(b.solid, u0, u1, v0 - 0.16, v0 + 0.02, w0, w0 + dep, slab);
  if (d < 1) return;
  if (st.balcony.solid) {
    box(b.solid, u0, u1, v0, v0 + 1.0, w0 + dep - 0.08, w0 + dep, slab);
    box(b.solid, u0, u0 + 0.08, v0, v0 + 1.0, w0, w0 + dep, slab);
    box(b.solid, u1 - 0.08, u1, v0, v0 + 1.0, w0, w0 + dep, slab);
  } else {
    box(b.solid, u0, u1, v0 + 0.95, v0 + 1.0, w0 + dep - 0.05, w0 + dep, c.accent);
    box(b.solid, u0, u1, v0 + 0.05, v0 + 0.1, w0 + dep - 0.04, w0 + dep - 0.01, c.accent);
    const step = d >= 2 ? 0.14 : 0.45;
    for (let u = u0 + step / 2; u < u1; u += step) quad(b.solid, u - 0.012, v0, u + 0.012, v0 + 0.97, w0 + dep - 0.03, c.accent);
  }
  if (d >= 2 && !row) balconyLife(c, F, u0, u1, v0, w0, dep);
}

function cell(c: Ctx, F: Face, u0: number, u1: number, v0: number, v1: number, w0: number, kind: Kind, col: RGB, f: number, brand?: Brand) {
  const { b, r, st, d } = c;
  const { s, fp, quad, box } = F;
  const fh = v1 - v0, cw = u1 - u0, mid = (u0 + u1) / 2;
  if (st.bands === 3 || st.id === 'brutalist') col = shade(col, r.range(0.95, 1.05));
  if (kind === 'wall') {
    quad(b.solid, u0, v0, u1, v1, w0, col);
    if (st.timber && f > 0 && d >= 1) brace(c, F, u0 + 0.09, u1 - 0.09, v0 + 0.2, v1 - 0.16, w0 + 0.03);
    return;
  }

  let ou0: number, ou1: number, ov0: number, ov1: number, ins: number;
  const wh = fh * c.winH, ww = cw * c.winW;
  const sillV = v0 + (fh - wh) * 0.6;
  if (kind === 'door') {
    const dw = Math.min(cw * 0.75, c.doorW);
    ou0 = mid - dw / 2; ou1 = mid + dw / 2; ov0 = v0; ov1 = v0 + Math.min(fh - 0.45, c.doorH); ins = 0.3;
  } else if (kind === 'shop') {
    ou0 = u0 + 0.22; ou1 = u1 - 0.22; ov0 = v0 + 0.4; ov1 = v1 - 0.85; ins = 0.15;
  } else {
    ou0 = mid - ww / 2; ou1 = mid + ww / 2; ov0 = kind === 'balcony' ? v0 + 0.02 : sillV; ov1 = sillV + wh; ins = st.win.inset;
  }
  if (st.facade === 'curtain' && kind !== 'door') {
    ou0 = u0 + 0.18; ou1 = u1 - 0.18; ov0 = v0; ov1 = v1 - 0.55; ins = 0.5;
  }

  const solidDoor = kind === 'door' && st.facade !== 'curtain';
  const closed = brand?.closed ?? false;
  const fill = solidDoor ? c.accent : closed ? color('#8C8E8F') : shade(c.glass, r.range(0.86, 1.12));
  const lit = !solidDoor && !closed && r.chance(c.lit) ? r.range(0.45, 1) : 0;
  const emit = closed ? 0 : kind === 'shop' || (st.facade === 'curtain' && f === 0) ? 1 : lit;
  const fillPart = solidDoor || closed ? b.solid : b.glass;

  if (d === 0) {
    quad(b.solid, u0, v0, u1, v1, w0, col);
    quad(fillPart, ou0, ov0, ou1, ov1, w0 + 0.03, fill, emit);
    return;
  }

  const spand = st.palette.spandrel && kind === 'window' ? c.spandrel : col;
  quad(b.solid, u0, v0, ou0, v1, w0, col);
  quad(b.solid, ou1, v0, u1, v1, w0, col);
  quad(b.solid, ou0, v0, ou1, ov0, w0, spand);
  quad(b.solid, ou0, ov1, ou1, v1, w0, spand);
  const wi = w0 - ins, dark = shade(col, 0.78);
  const T: V3 = [s.tx, 0, s.tz], NT: V3 = [-s.tx, 0, -s.tz];
  b.face(b.solid, [fp(ou0, ov0, w0), fp(ou0, ov0, wi), fp(ou0, ov1, wi), fp(ou0, ov1, w0)], dark, T);
  b.face(b.solid, [fp(ou1, ov0, w0), fp(ou1, ov0, wi), fp(ou1, ov1, wi), fp(ou1, ov1, w0)], dark, NT);
  b.face(b.solid, [fp(ou0, ov0, w0), fp(ou1, ov0, w0), fp(ou1, ov0, wi), fp(ou0, ov0, wi)], st.win.sill ? c.trim : col, UP);
  b.face(b.solid, [fp(ou0, ov1, w0), fp(ou1, ov1, w0), fp(ou1, ov1, wi), fp(ou0, ov1, wi)], shade(col, 0.6), DOWN);
  quad(fillPart, ou0, ov0, ou1, ov1, wi, fill, emit);
  if (closed && d >= 2) for (let v = ov0 + 0.25; v < ov1; v += 0.25) quad(b.solid, ou0, v - 0.02, ou1, v + 0.02, wi + 0.01, shade(fill, 0.75));

  const wa = kind === 'window' || kind === 'balcony';
  const arch = c.arch && wa && ov1 - ov0 > ou1 - ou0;
  if (arch) {
    const R = (ou1 - ou0) / 2, cv = ov1 - R, n = d >= 2 ? 6 : 3;
    const arc = (t: number): V3 => fp(mid + R * Math.cos(t), cv + R * Math.sin(t), w0 + 0.002);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * (Math.PI / 2), a1 = ((k + 1) / n) * (Math.PI / 2);
      b.face(b.solid, [fp(ou1, ov1, w0 + 0.002), arc(a0), arc(a1)], col, F.out);
      b.face(b.solid, [fp(ou0, ov1, w0 + 0.002), arc(Math.PI - a0), arc(Math.PI - a1)], col, F.out);
    }
    if (d >= 2) box(b.solid, mid - 0.12, mid + 0.12, ov1 - 0.3, ov1 + 0.05, w0, w0 + 0.06, c.trim);
  }
  if (wa && r.chance(c.curtains)) curtains(c, F, ou0, ou1, ov0, arch ? ov1 - (ou1 - ou0) / 2 : ov1, wi, lit);
  if (kind === 'window' && st.win.sill) box(b.solid, ou0 - 0.08, ou1 + 0.08, ov0 - 0.07, ov0, w0, w0 + 0.1, c.trim);
  if (wa && st.win.lintel && !arch) box(b.solid, ou0 - 0.1, ou1 + 0.1, ov1, ov1 + 0.17, w0, w0 + 0.05, c.trim);
  if (wa && c.shutters) {
    const sw = Math.min(ww / 2, ou0 - u0 - 0.03);
    if (sw > 0.2) {
      box(b.solid, ou0 - sw, ou0, ov0, ov1, w0, w0 + 0.04, c.accent);
      box(b.solid, ou1, ou1 + sw, ov0, ov1, w0, w0 + 0.04, c.accent);
    }
  }
  if (kind === 'window' && f > 0) {
    if (r.chance(st.flowers)) flowerBox(c, F, ou0, ou1, ov0, w0);
    else if (r.chance(st.ac)) acUnit(c, F, mid, ov0, w0);
    if (d >= 2 && r.chance(st.dish)) dish(c, F, Math.min(u1 - 0.4, ou1 + 0.4), ov1 - 0.2, w0);
  }
  if (d >= 2 && (wa || kind === 'shop') && !closed) {
    const m = kind === 'shop' ? 'vertical' : st.win.mullion;
    const fw0 = wi, fw1 = wi + 0.05, t = 0.035;
    const vbar = (u: number) => box(b.solid, u - t, u + t, ov0, ov1, fw0, fw1, c.trim);
    const hbar = (v: number) => box(b.solid, ou0, ou1, v - t, v + t, fw0, fw1, c.trim);
    if (m === 'vertical' || m === 'cross') vbar(mid);
    if (m === 'cross') hbar(ov0 + (ov1 - ov0) * 0.58);
    if (m === 'grid') {
      vbar(ou0 + (ou1 - ou0) / 3); vbar(ou0 + (2 * (ou1 - ou0)) / 3);
      hbar(ov0 + (ov1 - ov0) / 3); hbar(ov0 + (2 * (ov1 - ov0)) / 3);
    }
  }
  if (kind === 'door') {
    box(b.solid, ou0 - 0.35, ou1 + 0.35, ov1 + 0.2, ov1 + 0.32, w0, w0 + 0.9, st.facade === 'curtain' ? c.spandrel : c.trim);
    if (st.plinth) box(b.solid, ou0 - 0.25, ou1 + 0.25, 0, 0.16, w0, w0 + 0.55, shade(c.baseWall, 0.85));
    if (d >= 2 && solidDoor) box(b.solid, mid - 0.025, mid + 0.025, ov0, ov1, wi, wi + 0.04, shade(c.accent, 0.6));
    if (d >= 1) box(b.solid, ou0 + 0.1, ou1 - 0.1, ov1 + 0.05, ov1 + 0.18, wi, wi + 0.02, c.glass, 0.8);
  }
  if (st.timber && f > 0 && wa && ov0 - v0 > 0.5) {
    brace(c, F, u0 + 0.09, ou0, v0 + 0.2, ov0, w0 + 0.03);
    brace(c, F, ou1, u1 - 0.09, v0 + 0.2, ov0, w0 + 0.03);
  }
}

function brace(c: Ctx, F: Face, u0: number, u1: number, v0: number, v1: number, w: number) {
  if (u1 - u0 < 0.3 || v1 - v0 < 0.3) return;
  const { fp, out } = F, t = 0.08;
  c.b.face(c.b.solid, [fp(u0, v0, w), fp(u0 + t * 2, v0, w), fp(u1, v1, w), fp(u1 - t * 2, v1, w)], c.trim, out);
  c.b.face(c.b.solid, [fp(u1, v0, w + 0.005), fp(u1 - t * 2, v0, w + 0.005), fp(u0, v1, w + 0.005), fp(u0 + t * 2, v1, w + 0.005)], c.trim, out);
}

/** Corner turret: a cylinder engaged at a front corner, with windows, bands and a cone or dome cap. */
function turret(c: Ctx, corner: number, W: number, D: number, top: Tier) {
  const { b, r, st, d } = c;
  const sx = corner === 0 ? -1 : 1;
  const px = (sx * W) / 2, pz = D / 2;
  const rad = Math.min(Math.max(Math.min(W, D) * 0.13, 1.5), 2.6);
  const k = (rad * 0.35) / Math.SQRT2;
  const cx = px + sx * k, cz = pz + k;
  const seg = d >= 1 ? 14 : 8;
  const startF = st.id === 'haussmann' || r.chance(0.4) ? 1 : 0;
  const y0 = base(c, startF), yt = base(c, top.f1) + c.floorH * 0.6;
  b.smooth = { cx, cy: 0, cz, rx: rad, ry: 0, rz: rad };
  b.prism(b.solid, cx, y0, cz, rad, yt - y0, seg, c.wall);
  if (startF > 0) b.prism(b.solid, cx, y0 - 1.1, cz, rad * 0.25, 1.1, seg, c.trim, rad);
  const dir: V3 = [sx / Math.SQRT2, 0, 1 / Math.SQRT2];
  const levels = Array.from({ length: c.floors - startF }, (_, i) => startF + i);
  for (const f of levels) {
    const fh = height(c, f), wh = fh * c.winH * 0.9, v0 = base(c, f) + (fh - wh) * 0.6;
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      const n: V3 = [Math.cos(a), 0, -Math.sin(a)];
      if (n[0] * dir[0] + n[2] * dir[2] < -0.05 || (d === 0 && i % 2)) continue;
      const a0 = a - (Math.PI / seg) * 0.5, a1 = a + (Math.PI / seg) * 0.5, R = rad * Math.cos(Math.PI / seg) + 0.02;
      const P = (t: number, v: number): V3 => [cx + (Math.cos(t) * R) / Math.cos(t - a), v, cz - (Math.sin(t) * R) / Math.cos(t - a)];
      b.face(b.glass, [P(a0, v0), P(a1, v0), P(a1, v0 + wh), P(a0, v0 + wh)], shade(c.glass, r.range(0.9, 1.1)), n, r.chance(c.lit) ? 0.8 : 0);
    }
    if (d >= 1 && f > startF) b.prism(b.solid, cx, base(c, f) - 0.1, cz, rad + 0.07, 0.2, seg, c.trim);
  }
  b.smooth = null;
  b.prism(b.solid, cx, yt - 0.35, cz, rad + 0.25, 0.35, seg, c.trim);
  if (st.id === 'haussmann') dome(b, b.solid, cx, yt, cz, rad + 0.1, rad + 0.1, rad * 1.5, c.roof, seg, ONION);
  else b.prism(b.solid, cx, yt, cz, rad + 0.3, rad * 2.6, seg, c.roof, 0);
  b.prism(b.solid, cx, yt + (st.id === 'haussmann' ? rad * 1.45 : rad * 2.5), cz, 0.06, 1.2, 4, c.trim, 0.01);
}

function flatRoof(c: Ctx, tier: Tier, type: RoofType) {
  const { b, r, st, d } = c;
  const g = tier.grid;
  const y = base(c, tier.f1);
  const X = (i: number) => -g.W / 2 + i * g.cx, Z = (j: number) => -g.D / 2 + j * g.cz;
  if (tier.round) {
    const segs = ellipseSegs(tier.round, c.bay);
    for (const s of segs) b.face(b.solid, [[tier.round.x, y, tier.round.z], [s.x0, y, s.z0], [s.x0 + s.tx * s.len, y, s.z0 + s.tz * s.len]], c.roof, UP);
  } else {
    for (let j = 0; j < g.nz; j++) {
      let i = 0;
      while (i < g.nx) {
        if (!g.cells[i + j * g.nx]) { i++; continue; }
        const s = i;
        while (i < g.nx && g.cells[i + j * g.nx]) i++;
        b.face(b.solid, [[X(s), y, Z(j)], [X(i), y, Z(j)], [X(i), y, Z(j + 1)], [X(s), y, Z(j + 1)]], c.roof, UP);
      }
    }
    for (const [ctr, ...arc] of tier.fans)
      for (let k = 0; k < arc.length - 1; k++) b.face(b.solid, [[ctr[0], y, ctr[1]], [arc[k][0], y, arc[k][1]], [arc[k + 1][0], y, arc[k + 1][1]]], c.roof, UP);
  }
  const rr = tier.rects[0];
  const cx = (rr.x0 + rr.x1) / 2, cz = (rr.z0 + rr.z1) / 2;
  const span = Math.min(rr.x1 - rr.x0, rr.z1 - rr.z0);
  const used: [number, number, number][] = [...c.reserve];
  if (type === 'spire') {
    let w = span * 0.42, yy = y;
    for (let k = 0; k < 3; k++) {
      const h = 3.2 - k * 0.6;
      b.box(b.solid, cx - w / 2, yy, cz - w / 2, cx + w / 2, yy + h, cz + w / 2, k % 2 ? c.trim : c.wall);
      if (d >= 1 && k < 2) b.box(b.glass, cx - w / 2 - 0.02, yy + h * 0.35, cz - w * 0.12, cx + w / 2 + 0.02, yy + h * 0.75, cz + w * 0.12, c.glass, 0.9);
      yy += h;
      w *= 0.68;
    }
    b.prism(b.solid, cx, yy, cz, w * 0.75, w * 1.6, 4, c.trim, 0);
    b.prism(b.solid, cx, yy + w * 1.2, cz, 0.12, span * 0.35, 6, c.trim, 0.02);
    used.push([cx, cz, span * 0.3]);
  }
  if (type === 'dome' || type === 'onion') {
    const rad = span * 0.3, seg = d >= 1 ? 20 : 12, dh = rad * 0.6;
    b.smooth = { cx, cy: 0, cz, rx: rad, ry: 0, rz: rad };
    b.prism(b.solid, cx, y, cz, rad, dh, seg, c.wall);
    b.smooth = null;
    b.prism(b.solid, cx, y + dh, cz, rad + 0.25, 0.35, seg, c.trim);
    dome(b, b.solid, cx, y + dh + 0.35, cz, rad, rad, rad * (type === 'onion' ? 1.5 : 0.9), c.roof, seg, type === 'onion' ? ONION : undefined);
    const ly = y + dh + 0.35 + rad * (type === 'onion' ? 1.45 : 0.88);
    b.prism(b.solid, cx, ly, cz, rad * 0.12, rad * 0.3, 8, c.trim);
    b.prism(b.solid, cx, ly + rad * 0.3, cz, rad * 0.15, rad * 0.25, 8, c.roof, 0);
    used.push([cx, cz, rad + 0.5]);
  }
  if (d < 1 || tier.f1 !== c.floors) return;
  const free = (x: number, z: number, rad: number) =>
    filled(g, x - rad, z - rad) && filled(g, x + rad, z + rad) && filled(g, x - rad, z + rad) && filled(g, x + rad, z - rad) &&
    used.every(([ux, uz, ur]) => Math.hypot(ux - x, uz - z) > ur + rad + 0.4);
  const place = (rad: number) => {
    for (let k = 0; k < 12; k++) {
      const x = r.range(rr.x0 + rad + 0.6, rr.x1 - rad - 0.6), z = r.range(rr.z0 + rad + 0.6, rr.z1 - rad - 0.6);
      if (free(x, z, rad + 0.5)) { used.push([x, z, rad]); return [x, z] as const; }
    }
    return null;
  };
  const grey = color('#B9B7B1');
  if (c.floors >= 6 && type === 'flat') {
    const p = place(1.6);
    if (p) b.box(b.solid, p[0] - 1.4, y, p[1] - 1.4, p[0] + 1.4, y + 3, p[1] + 1.4, shade(c.wall, 0.95));
  }
  if (['industrial', 'victorian', 'soviet'].includes(st.id) && r.chance(0.5)) {
    const p = place(1.7);
    if (p) {
      const wood = color('#6B5442');
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(b.solid, p[0] + dx * 1.1 - 0.08, y, p[1] + dz * 1.1 - 0.08, p[0] + dx * 1.1 + 0.08, y + 2, p[1] + dz * 1.1 + 0.08, color('#3A3A3A'));
      b.prism(b.solid, p[0], y + 2, p[1], 1.5, 2.6, d >= 2 ? 12 : 8, wood);
      b.prism(b.solid, p[0], y + 4.6, p[1], 1.6, 1.0, d >= 2 ? 12 : 8, shade(wood, 0.7), 0);
    }
  }
  const n = Math.min(10, Math.round(((rr.x1 - rr.x0) * (rr.z1 - rr.z0) * st.props) / 90 * r.range(0.5, 1.4)));
  for (let k = 0; k < n; k++) {
    const p = place(0.8);
    if (!p) break;
    if (r.chance(0.65)) {
      b.box(b.solid, p[0] - 0.7, y, p[1] - 0.5, p[0] + 0.7, y + 0.95, p[1] + 0.5, grey);
      if (d >= 2) b.prism(b.solid, p[0], y + 0.95, p[1], 0.35, 0.05, 10, shade(grey, 0.6));
    } else if (r.chance(0.5)) b.prism(b.solid, p[0], y, p[1], 0.22, 1.1, 8, grey);
    else b.box(b.glass, p[0] - 0.7, y, p[1] - 0.7, p[0] + 0.7, y + 0.35, p[1] + 0.7, c.glass, 0.4);
  }
  roofLife(c, place, y);
}

function roundRoof(c: Ctx, tier: Tier, type: RoofType) {
  const { b, st, d } = c;
  const e = tier.round!;
  const y = base(c, tier.f1);
  const seg = Math.max(12, ellipseSegs(e, c.bay).length);
  if (type === 'cone') {
    const o = st.roof.overhang + 0.2;
    const pitch = ((st.roof.pitch[1] || 40) * Math.PI) / 180;
    const rise = Math.max(e.a, e.b) * Math.tan(Math.min(pitch, 1.05));
    const ring = Array.from({ length: seg }, (_, i) => {
      const t = (i / seg) * Math.PI * 2;
      return [e.x + (e.a + o) * Math.cos(t), y - o * 0.3, e.z - (e.b + o) * Math.sin(t)] as V3;
    });
    for (let i = 0; i < seg; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % seg];
      b.face(b.solid, [p0, p1, [e.x, y + rise, e.z]], c.roof, [p0[0] - e.x, 1, p0[2] - e.z]);
      b.face(b.solid, [p0, p1, [e.x, y, e.z]], shade(c.wall, 0.7), DOWN);
    }
    b.prism(b.solid, e.x, y + rise - 0.1, e.z, 0.06, 1.4, 4, c.trim, 0.01);
    return;
  }
  b.prism(b.solid, e.x, y, e.z, Math.max(e.a, e.b) + 0.3, 0.4, seg, c.trim);
  const onion = type === 'onion';
  const h = Math.max(e.a, e.b) * (onion ? 1.5 : 0.85);
  dome(b, b.solid, e.x, y + 0.4, e.z, e.a, e.b, h, c.roof, Math.min(seg, d >= 1 ? 28 : 14), onion ? ONION : undefined);
  const ly = y + 0.4 + h * 0.97, lr = Math.min(e.a, e.b) * 0.13;
  b.prism(b.solid, e.x, ly, e.z, lr, lr * 2.2, 8, c.trim);
  b.prism(b.solid, e.x, ly + lr * 2.2, e.z, lr * 1.2, lr * 2, 8, c.roof, 0);
}

function roofMapper(rr: RoofRect) {
  const ax = rr.axis === 'x';
  return {
    A0: ax ? rr.x0 : rr.z0, A1: ax ? rr.x1 : rr.z1, B0: ax ? rr.z0 : rr.x0, B1: ax ? rr.z1 : rr.x1,
    p: (a: number, bb: number, y: number): V3 => (ax ? [a, y, bb] : [bb, y, a]),
    dirA: (ax ? [1, 0, 0] : [0, 0, 1]) as V3,
    dirB: (ax ? [0, 0, 1] : [1, 0, 0]) as V3,
  };
}
export type RoofMap = ReturnType<typeof roofMapper>;

function hip(c: Ctx, rr: RoofRect, y: number, pitch: number, o: number, gable: boolean) {
  const { b } = c;
  const m = roofMapper(rr);
  const tan = Math.tan(pitch);
  const half = (m.B1 - m.B0) / 2, bc = (m.B0 + m.B1) / 2;
  const ey = y - o * tan, ry = y + half * tan;
  const A0 = m.A0 - (gable ? o * 0.6 : o), A1 = m.A1 + (gable ? o * 0.6 : o), B0 = m.B0 - o, B1 = m.B1 + o;
  let ra0 = gable ? A0 : m.A0 + half, ra1 = gable ? A1 : m.A1 - half;
  if (ra0 > ra1) ra0 = ra1 = (m.A0 + m.A1) / 2;
  const up = (v: V3): V3 => [v[0], 1, v[2]];
  const neg = (v: V3): V3 => [-v[0], 0, -v[2]];
  b.face(b.solid, [m.p(A0, B1, ey), m.p(A1, B1, ey), m.p(ra1, bc, ry), m.p(ra0, bc, ry)], c.roof, up(m.dirB));
  b.face(b.solid, [m.p(A0, B0, ey), m.p(A1, B0, ey), m.p(ra1, bc, ry), m.p(ra0, bc, ry)], c.roof, up(neg(m.dirB)));
  if (gable) {
    b.face(b.solid, [m.p(m.A0, m.B0, y), m.p(m.A0, m.B1, y), m.p(m.A0, bc, ry)], c.wall, neg(m.dirA));
    b.face(b.solid, [m.p(m.A1, m.B0, y), m.p(m.A1, m.B1, y), m.p(m.A1, bc, ry)], c.wall, m.dirA);
    if (c.d >= 1) {
      const t = 0.12;
      for (const a of [A0, A1])
        for (const bb of [B0, B1]) {
          const s = a === A0 ? 1 : -1;
          b.face(b.solid, [m.p(a, bb, ey), m.p(a, bc, ry), m.p(a, bc, ry - t * 2), m.p(a, bb, ey - t * 2)], c.trim, [m.dirA[0] * -s, 0, m.dirA[2] * -s]);
        }
    }
  } else {
    b.face(b.solid, [m.p(A0, B0, ey), m.p(A0, B1, ey), m.p(ra0, bc, ry)], c.roof, up(neg(m.dirA)));
    b.face(b.solid, [m.p(A1, B0, ey), m.p(A1, B1, ey), m.p(ra1, bc, ry)], c.roof, up(m.dirA));
  }
}

function pitchedRoof(c: Ctx, tier: Tier, rr: RoofRect, type: RoofType) {
  const { b, r, st, d } = c;
  const y = base(c, tier.f1);
  const j = st.jetty;
  const er: RoofRect = { ...rr, x0: rr.x0 - j, z0: rr.z0 - j, x1: rr.x1 + j, z1: rr.z1 + j };
  const pitch = (r.range(...st.roof.pitch) * Math.PI) / 180;
  const o = st.roof.overhang;
  const m = roofMapper(er);
  let hm = 0, k = 0;
  if (type === 'mansard') {
    hm = c.floorH * 0.95;
    k = hm / Math.tan(pitch);
    const ey = y - o * Math.tan(pitch);
    const A0 = m.A0 - o, A1 = m.A1 + o, B0 = m.B0 - o, B1 = m.B1 + o;
    const a0 = m.A0 + k, a1 = m.A1 - k, b0 = m.B0 + k, b1 = m.B1 - k, yt = y + hm;
    const up = (v: V3, s: number): V3 => [v[0] * s, 1, v[2] * s];
    b.face(b.solid, [m.p(A0, B1, ey), m.p(A1, B1, ey), m.p(a1, b1, yt), m.p(a0, b1, yt)], c.roof, up(m.dirB, 1));
    b.face(b.solid, [m.p(A0, B0, ey), m.p(A1, B0, ey), m.p(a1, b0, yt), m.p(a0, b0, yt)], c.roof, up(m.dirB, -1));
    b.face(b.solid, [m.p(A0, B0, ey), m.p(A0, B1, ey), m.p(a0, b1, yt), m.p(a0, b0, yt)], c.roof, up(m.dirA, -1));
    b.face(b.solid, [m.p(A1, B0, ey), m.p(A1, B1, ey), m.p(a1, b1, yt), m.p(a1, b0, yt)], c.roof, up(m.dirA, 1));
    const inner: RoofRect = rr.axis === 'x' ? { x0: a0, x1: a1, z0: b0, z1: b1, axis: 'x' } : { x0: b0, x1: b1, z0: a0, z1: a1, axis: 'z' };
    hip({ ...c, roof: shade(c.roof, 0.9) }, inner, yt, (14 * Math.PI) / 180, 0.05, false);
    if (d >= 1)
      for (const bb of [B0, B1])
        b.face(b.solid, [m.p(A0, bb, ey), m.p(A1, bb, ey), m.p(A1, bb, ey - 0.15), m.p(A0, bb, ey - 0.15)], c.trim, bb === B0 ? [-m.dirB[0], 0, -m.dirB[2]] : m.dirB);
  } else {
    hip(c, er, y, pitch, o, type === 'gable');
    if (d >= 1 && c.solar) {
      c.solar = false;
      solarSlope(c, m, y, pitch, type === 'gable');
    }
  }
  if (d >= 1 && r.chance(st.roof.dormers)) dormers(c, tier, er, y, type === 'mansard' ? Math.atan(hm / k) : pitch, type === 'mansard' ? hm : 1.7);
}

function dormers(c: Ctx, tier: Tier, rr: RoofRect, y: number, pitch: number, hMax: number) {
  const { b, r } = c;
  const m = roofMapper(rr);
  const tan = Math.tan(pitch);
  const span = Math.max(1, Math.round((m.A1 - m.A0) / c.bay));
  const step = (m.A1 - m.A0) / span;
  const every = pitch > 1 ? 1 : 2;
  const dw = Math.min(1.2, step * 0.5);
  const dh = Math.min(hMax * 0.75, 1.5);
  const e = pitch > 1 ? 0.12 : 0.35;
  for (const side of [1, -1]) {
    const edge = side > 0 ? m.B1 : m.B0;
    const out: V3 = [m.dirB[0] * side, 0, m.dirB[2] * side];
    for (let i = 0; i < span; i += every) {
      const a = m.A0 + (i + 0.5) * step;
      if (a - dw < m.A0 + 1 || a + dw > m.A1 - 1) continue;
      const probe = m.p(a, edge + side * 0.6, 0), inner = m.p(a, edge - side * 0.6, 0);
      if (filled(tier.grid, probe[0], probe[2]) || !filled(tier.grid, inner[0], inner[2])) continue;
      const yb = y + e * tan + 0.05, yt = yb + dh;
      const q0 = edge - side * e, q1 = edge - side * ((yt - y) / tan + 0.3);
      const P = (aa: number, q: number, yy: number) => m.p(aa, q, yy);
      const pts: V3[] = [];
      for (let k = 0; k < 8; k++) pts.push(P(k & 1 ? a + dw / 2 : a - dw / 2, k & 4 ? q1 : q0, k & 2 ? yt : yb));
      b.hexa(b.solid, pts, c.trim);
      b.face(b.glass, [P(a - dw * 0.32, q0 + side * 0.01, yb + 0.15), P(a + dw * 0.32, q0 + side * 0.01, yb + 0.15), P(a + dw * 0.32, q0 + side * 0.01, yt - 0.15), P(a - dw * 0.32, q0 + side * 0.01, yt - 0.15)], c.glass, out, r.chance(c.lit) ? 0.8 : 0);
      const ry = yt + dw * 0.45;
      b.face(b.solid, [P(a - dw / 2 - 0.08, q0 + side * 0.05, yt), P(a, q0 + side * 0.05, ry), P(a, q1, ry), P(a - dw / 2 - 0.08, q1, yt)], c.roof, [-m.dirA[0], 1, -m.dirA[2]]);
      b.face(b.solid, [P(a + dw / 2 + 0.08, q0 + side * 0.05, yt), P(a, q0 + side * 0.05, ry), P(a, q1, ry), P(a + dw / 2 + 0.08, q1, yt)], c.roof, [m.dirA[0], 1, m.dirA[2]]);
      b.face(b.solid, [P(a - dw / 2, q0, yt), P(a + dw / 2, q0, yt), P(a, q0, ry)], c.trim, out);
    }
  }
}

function chimneys(c: Ctx, tier: Tier, type: RoofType) {
  const { b, r, st } = c;
  const y = base(c, tier.f1);
  const n = r.int(1, Math.min(3, tier.rects.length + 1));
  const brick = st.palette.base ? c.baseWall : st.id === 'victorian' ? c.wall : color('#8A5A48');
  for (let k = 0; k < n; k++) {
    const rr = r.pick(tier.rects);
    const m = roofMapper(rr);
    const half = (m.B1 - m.B0) / 2;
    const a = r.range(m.A0 + 0.8, m.A1 - 0.8);
    const q = (m.B0 + m.B1) / 2 + r.range(-0.3, 0.3) * half;
    const rise = type === 'mansard' ? c.floorH * 1.3 : half * Math.tan((st.roof.pitch[1] * Math.PI) / 180);
    const p = m.p(a, q, 0);
    const h = rise + 1.2;
    b.box(b.solid, p[0] - 0.35, y, p[2] - 0.35, p[0] + 0.35, y + h, p[2] + 0.35, brick);
    if (c.d >= 1) {
      b.box(b.solid, p[0] - 0.42, y + h, p[2] - 0.42, p[0] + 0.42, y + h + 0.12, p[2] + 0.42, c.trim);
      if (c.d >= 2) b.prism(b.solid, p[0], y + h + 0.12, p[2], 0.12, 0.35, 6, color('#9A5B43'));
    }
  }
}
