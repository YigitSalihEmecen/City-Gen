/** Major buildings composed from generateBuilding parts (custom styles) plus bespoke geometry. */
import { generateBuilding, type BuildingParams } from './building.ts';
import { Builder, color, disc, shade, type RGB, type V3 } from './mesh.ts';
import { rng, type Rng } from './rng.ts';
import { STYLE, type Style } from './styles.ts';

export const LANDMARKS = [
  { id: 'church', name: 'Church', blurb: 'Nave, transept, apse and spire', size: [30, 54], swatch: ['#D6C3A0', '#5B5F66', '#3D4F6E', '#7B8F84'] },
  { id: 'civic', name: 'Civic Hall', blurb: 'Portico, pediment and dome', size: [74, 50], swatch: ['#E4DCCB', '#F2EDE3', '#7E8A86', '#46555E'] },
  { id: 'hospital', name: 'Hospital', blurb: 'Ward wings, lobby, helipad', size: [66, 58], swatch: ['#EEF0EC', '#7FA8B5', '#C8323C', '#557F8F'] },
  { id: 'stadium', name: 'Stadium', blurb: 'Rounded bowl, roof ring, floodlights', size: [150, 118], swatch: ['#E9E8E3', '#C15F3C', '#3E5C76', '#6E9B4F'] },
] as const;

export const LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

export interface LandmarkParams {
  kind: string;
  seed: number;
  width: number;
  depth: number;
  detail: number;
}

export interface LandmarkInfo {
  kind: string;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const style = (o: Partial<Style> & { id: string; palette: Style['palette'] }): Style => ({
  ...STYLE.haussmann,
  shops: 0,
  balcony: { mode: 'none', chance: 0, solid: false, depth: 0.8 },
  turret: 0,
  flowers: 0,
  ac: 0,
  dish: 0,
  oriel: 0,
  fireEscape: 0,
  laundry: 0,
  solar: 0,
  greenRoof: 0,
  attached: false,
  props: 0.2,
  massing: { shapes: [['rect', 1]], tiers: [1, 1], podium: 0 },
  ...o,
});

type Build = (dx: number, dz: number, st: Style, w: number, d: number, extra?: Partial<BuildingParams>, dy?: number) => { height: number };

export function generateLandmark(b: Builder, p: LandmarkParams): LandmarkInfo {
  const r = rng(p.seed);
  const root = b.getFrame();
  const reset = () => b.setFrame(root.ox, root.oz, root.angle, root.oy);
  const build: Build = (dx, dz, st, w, d, extra = {}, dy = 0) => {
    b.sub(root, dx, dz, 0, dy);
    const info = generateBuilding(b, { style: st, seed: r.int(0, 1e9), width: w, depth: d, detail: p.detail, ...extra });
    reset();
    return info;
  };
  const gen = { church, civic, hospital, stadium }[p.kind as 'church'] ?? church;
  const height = gen(b, r, build, p.width, p.depth, p.detail);
  reset();
  return { kind: p.kind, height };
}

const STAINED = ['#3D4F6E', '#5A3F5E', '#3F5B55', '#6A4B3A'];

function church(b: Builder, r: Rng, build: Build, W: number, D: number, d: number) {
  const stone = r.pick(['#D9CDB4', '#C9BFAE', '#BDB3A2', '#D6C3A0', '#B9A58A', '#A9443A']);
  const roof = r.pick(['#5B5F66', '#4E5359', '#7B8F84', '#9E5A3C']);
  const palette = { wall: [stone], trim: [r.pick(['#E6DECD', '#D2C6AE'])], roof: [roof], glass: STAINED, accent: ['#4A3426', '#3B2C22'] };
  const naveW = clamp(W * 0.36, 9, 15), naveH = clamp(naveW * 1.05, 9, 15);
  const towers = r.weighted([[1, 5], [2, 2], [0, 1]] as const);
  const tw = clamp(naveW * (towers === 2 ? 0.5 : 0.62), 5, 9);
  const zf = D / 2 - 1 - (towers === 1 ? tw * 0.75 : 0);
  const naveL = Math.max(12, Math.min(D * 0.62, zf + D / 2 - naveW * 0.5 - 1));
  const zc = zf - naveL / 2;
  const win = { w: [0.34, 0.4] as [number, number], h: [0.6, 0.68] as [number, number], inset: 0.35, arch: 1, mullion: 'vertical' as const, sill: true, lintel: false, shutters: 0 };
  const nave = style({
    id: 'church', palette, floors: [1, 1], groundH: naveH, floorH: naveH, bay: [3.8, 4.4], win, pilasters: 0.7, cornice: 0.2, bands: 0, plinth: true,
    door: [2.2, Math.min(4.2, naveH * 0.4)],
    roof: { types: [['gable', 1]], pitch: [52, 56], overhang: 0.3, parapet: 0, dormers: 0, chimneys: 0 },
  });
  build(0, zc, nave, naveW, naveL, { floors: 1, roof: 'gable', shape: 'rect', corner: 'none' });
  if (r.chance(0.7) && W > naveW + 6) {
    const aw = Math.min(naveW * 0.38, (W - naveW) / 2 - 0.5);
    const aisle = style({ ...nave, id: 'church', groundH: naveH * 0.55, floorH: naveH * 0.55, roof: { ...nave.roof, types: [['hip', 1]], pitch: [20, 24] }, palette });
    for (const sx of [-1, 1]) build(sx * (naveW / 2 + aw / 2 - 0.05), zc - naveL * 0.03, aisle, aw, naveL * 0.86, { floors: 1, roof: 'hip', shape: 'rect', corner: 'none' });
  }
  if (r.chance(0.65)) build(0, zf - naveL * 0.72, nave, Math.min(W - 1, naveW * 2.2), naveW * 0.9, { floors: 1, roof: 'gable', shape: 'rect', corner: 'none' });
  const apse = style({ ...nave, id: 'church', groundH: naveH * 0.82, roof: { ...nave.roof, types: [['cone', 1]], pitch: [45, 45] }, palette });
  const ad = Math.max(8, naveW * 0.86);
  build(0, zf - naveL, apse, ad, ad, { floors: 1, shape: 'round', roof: 'cone' });

  const cap = r.weighted([['hip', 5], ['onion', 1], ['dome', 1]] as const);
  const tower = style({
    id: 'church', palette, floors: [3, 5], groundH: 6, floorH: 5, bay: [2.2, 2.8],
    win: { ...win, w: [0.3, 0.36], h: [0.45, 0.55] }, bands: 1, cornice: 0.3, plinth: true, pilasters: 0, door: [1.6, 3.2],
    roof: { types: [[cap, 1]], pitch: [78, 78], overhang: 0.2, parapet: 0.6, dormers: 0, chimneys: 0 },
  });
  const tf = r.int(3, 5);
  const spots: [number, number][] =
    towers === 1 ? [[0, D / 2 - tw / 2 - 0.5]] :
    towers === 2 ? [[-(naveW / 2 + tw / 2 - 1.2), zf - tw / 2 + 0.6], [naveW / 2 + tw / 2 - 1.2, zf - tw / 2 + 0.6]] :
    [[Math.min(W / 2 - tw / 2, naveW / 2 + tw / 2 + 1), zf - naveL * 0.35]];
  let height = naveH;
  for (const [x, z] of spots) {
    const info = build(x, z, tower, tw, tw, { floors: tf, roof: cap, shape: 'rect', corner: 'none' });
    height = Math.max(height, info.height);
    if (cap === 'hip') {
      const apex = info.height + (tw / 2) * Math.tan((78 * Math.PI) / 180);
      const gold = color('#C9A46A');
      b.box(b.solid, x - 0.07, apex - 0.3, z - 0.07, x + 0.07, apex + 1.8, z + 0.07, gold);
      b.box(b.solid, x - 0.5, apex + 1.0, z - 0.07, x + 0.5, apex + 1.16, z + 0.07, gold);
      height = Math.max(height, apex + 1.8);
    }
  }
  if (towers !== 1) {
    const R = naveW * 0.17, y = naveH * 0.66;
    disc(b, b.solid, [0, y, zf + 0.04], [1, 0, 0], [0, 1, 0], R + 0.35, 20, color(palette.trim[0]));
    disc(b, b.glass, [0, y, zf + 0.07], [1, 0, 0], [0, 1, 0], R, 20, color(r.pick(STAINED)), r.chance(0.6) ? 0.9 : 0);
    if (d >= 2)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI;
        const dx = Math.cos(a) * R, dy = Math.sin(a) * R, nx = -Math.sin(a) * 0.05, ny = Math.cos(a) * 0.05;
        b.face(b.solid, [[-dx - nx, y - dy - ny, zf + 0.09], [dx - nx, y + dy - ny, zf + 0.09], [dx + nx, y + dy + ny, zf + 0.09], [-dx + nx, y - dy + ny, zf + 0.09]], color(palette.trim[0]), [0, 0, 1]);
      }
  }
  return height;
}

function civic(b: Builder, r: Rng, build: Build, W: number, D: number, d: number) {
  const stone = r.pick(['#E4DCCB', '#DDD3C0', '#E9E4D8', '#D5CBB6']);
  const white = color('#F2EDE3');
  const palette = { wall: [stone], trim: ['#F2EDE3'], roof: [r.pick(['#7E8A86', '#6E757B', '#8E9A90'])], glass: ['#46555E', '#3E4B53'], accent: ['#2B2A27'] };
  const main = style({
    id: 'civic', palette, floors: [2, 3], groundH: 5.5, floorH: 5, bay: [3.6, 4.2],
    win: { w: [0.42, 0.48], h: [0.6, 0.68], inset: 0.3, arch: 0.4, mullion: 'cross', sill: true, lintel: true, shutters: 0 },
    pilasters: 0.55, cornice: 0.6, bands: 1, plinth: true, door: [2.4, 3.6],
    roof: { types: [['flat', 1]], pitch: [15, 15], overhang: 0, parapet: 1.1, dormers: 0, chimneys: 0 },
  });
  const mw = W * 0.88, md = Math.min(D * 0.5, 36), mz = -D * 0.08;
  const domed = r.chance(0.6);
  const domeR = clamp(md * 0.3, 6, 11);
  const info = build(0, mz, main, mw, md, { floors: r.int(2, 3), shape: r.chance(0.5) ? 'U' : 'rect', roof: 'flat', corner: 'none', reserve: [[0, 0, domed ? domeR + 1 : 5]] });
  const H = info.height;
  const front = mz + md / 2;

  const pw = clamp(mw * 0.36, 12, 28), pd = 5.5, n = pw > 20 ? 8 : 6;
  const colR = clamp((pw / n) * 0.17, 0.4, 0.6), seg = d >= 2 ? 14 : d >= 1 ? 10 : 6;
  const step = shade(color(stone), 0.9);
  for (let k = 0; k < 3; k++) b.box(b.solid, -pw / 2 - 1.2 + k * 0.3, k * 0.4, front, pw / 2 + 1.2 - k * 0.3, (k + 1) * 0.4, front + pd + 1.8 - k * 0.6, step);
  const colTop = H - 1.6;
  for (let i = 0; i < n; i++) {
    const x = -pw / 2 + 0.9 + (i * (pw - 1.8)) / (n - 1), z = front + pd - 0.9;
    b.smooth = { cx: x, cy: 0, cz: z, rx: colR, ry: 0, rz: colR };
    b.prism(b.solid, x, 1.2, z, colR, colTop - 1.2, seg, white);
    b.smooth = null;
    if (d >= 1) {
      b.box(b.solid, x - colR - 0.12, 1.2, z - colR - 0.12, x + colR + 0.12, 1.45, z + colR + 0.12, white);
      b.box(b.solid, x - colR - 0.15, colTop - 0.3, z - colR - 0.15, x + colR + 0.15, colTop, z + colR + 0.15, white);
    }
  }
  b.box(b.solid, -pw / 2, colTop, front - 0.1, pw / 2, H, front + pd, white);
  const apex = H + pw * 0.15, zF = front + pd;
  b.face(b.solid, [[-pw / 2, H, zF], [pw / 2, H, zF], [0, apex, zF]], white, [0, 0, 1]);
  b.face(b.solid, [[-pw / 2 - 0.3, H - 0.05, zF + 0.3], [0, apex + 0.1, zF + 0.3], [0, apex + 0.1, front], [-pw / 2 - 0.3, H - 0.05, front]], color(palette.roof[0]), [-1, 2, 0]);
  b.face(b.solid, [[pw / 2 + 0.3, H - 0.05, zF + 0.3], [0, apex + 0.1, zF + 0.3], [0, apex + 0.1, front], [pw / 2 + 0.3, H - 0.05, front]], color(palette.roof[0]), [1, 2, 0]);
  if (d >= 1) b.box(b.solid, -pw / 2 - 0.2, H - 0.25, zF - 0.1, pw / 2 + 0.2, H, zF + 0.25, white);

  let height = apex;
  if (domed) {
    const drum = style({ ...main, id: 'civic', groundH: 5, bay: [2.6, 3], palette, cornice: 0.4, pilasters: 0.35 });
    const di = build(0, mz, drum, domeR * 2, domeR * 2, { floors: 1, shape: 'round', roof: 'dome' }, H);
    height = H + di.height + domeR * 1.2;
  } else {
    const tower = style({ ...main, id: 'civic', groundH: 4.5, floorH: 4, bay: [2.2, 2.6], pilasters: 0, roof: { ...main.roof, types: [['hip', 1]], pitch: [55, 60] }, palette });
    const tz = mz - md * 0.12;
    const ti = build(0, tz, tower, 7, 7, { floors: 3, roof: 'hip', shape: 'rect', corner: 'none' }, H);
    const cy = H + ti.height - 2.3;
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ctr: V3 = [nx * 3.57, cy, tz + nz * 3.57];
      const v: V3 = [0, 1, 0];
      const uu: V3 = nz === 0 ? [0, 0, -nx] : [nz, 0, 0];
      disc(b, b.solid, ctr, uu, v, 1.3, 16, color('#F6F1E4'), 1);
      const o: V3 = [ctr[0] + nx * 0.03, cy, ctr[2] + nz * 0.03];
      b.face(b.solid, [[o[0] - uu[0] * 0.05, cy, o[2] - uu[2] * 0.05], [o[0] + uu[0] * 0.05, cy, o[2] + uu[2] * 0.05], [o[0] + uu[0] * 0.05, cy + 0.95, o[2] + uu[2] * 0.05], [o[0] - uu[0] * 0.05, cy + 0.95, o[2] - uu[2] * 0.05]], color('#1F2427'), [nx, 0, nz]);
      b.face(b.solid, [[o[0], cy - 0.05, o[2]], [o[0] + uu[0] * 0.7, cy - 0.05, o[2] + uu[2] * 0.7], [o[0] + uu[0] * 0.7, cy + 0.05, o[2] + uu[2] * 0.7], [o[0], cy + 0.05, o[2]]], color('#1F2427'), [nx, 0, nz]);
    }
    height = H + ti.height + 3.5 * Math.tan(1.0);
  }

  const fz = zF + 5;
  if (fz < D / 2 - 1) {
    const flags = [r.pick(['#3E5C76', '#7A2E2A', '#2F4A3A']), '#E9E4D8', r.pick(['#D9B44A', '#C15F3C', '#3E5C76'])];
    [-6, 0, 6].forEach((x, i) => {
      b.prism(b.solid, x, 0, fz, 0.07, 11, 6, color('#D8D6D0'));
      b.face(b.solid, [[x, 9.6, fz], [x + 2.2, 9.6, fz], [x + 2.2, 10.9, fz], [x, 10.9, fz]], color(flags[i]), [0, 0, 1]);
    });
  }
  const fountainZ = (fz + 2 + D / 2) / 2;
  if (d >= 1 && D / 2 - fz > 10) {
    b.prism(b.solid, 0, 0, fountainZ, 3.2, 0.55, 20, step);
    disc(b, b.glass, [0, 0.5, fountainZ], [1, 0, 0], [0, 0, -1], 2.9, 20, color('#6E92A8'), 0.3);
    b.prism(b.solid, 0, 0.5, fountainZ, 0.25, 1.4, 8, white);
  }
  return height;
}

function hospital(b: Builder, r: Rng, build: Build, W: number, D: number, d: number) {
  const palette = {
    wall: ['#EEF0EC', '#E8ECE9', '#F1EFE9'], trim: ['#7FA8B5', '#6D9AA8', '#9DBFC9'], roof: ['#A9ABA6'],
    glass: ['#557F8F', '#4C7180', '#5F8A98'], accent: ['#2F5E6E'], spandrel: ['#D2DEDF'],
  };
  const ward = style({
    id: 'hospital', palette, floors: [5, 8], groundH: 4.6, floorH: 3.7, bay: [3.3, 3.7],
    win: { w: [0.62, 0.7], h: [0.5, 0.55], inset: 0.14, arch: 0, mullion: 'vertical', sill: false, lintel: false, shutters: 0 },
    bands: 3, cornice: 0, plinth: false, pilasters: 0, props: 0.9,
    roof: { types: [['flat', 1]], pitch: [0, 0], overhang: 0, parapet: 1.0, dormers: 0, chimneys: 0 },
  });
  const mw = W * 0.9, md = D * 0.6, mz = -D * 0.12;
  const hr = clamp(Math.min(mw, md) * 0.16, 5, 8);
  const hz = md * 0.27;
  const info = build(0, mz, ward, mw, md, { floors: r.int(5, 8), shape: r.chance(0.6) ? 'T' : 'L', roof: 'flat', corner: 'none', reserve: [[0, hz, hr + 1]] });
  const H = info.height, front = mz + md / 2;
  const lobby = style({ ...STYLE.modern, id: 'hospital', palette: { ...STYLE.modern.palette, glass: palette.glass, spandrel: ['#7FA8B5'] }, groundH: 4.6, floorH: 4, shops: 0, solar: 0, greenRoof: 0.6 });
  build(0, front + 4.5, lobby, mw * 0.42, 9, { floors: 2, shape: 'rect', roof: 'flat', corner: r.chance(0.5) ? 'both' : 'none' });

  const red = color('#C8323C'), white = color('#F4F4F1');
  const cy = H - 2.6, cz = front + 0.06;
  b.box(b.solid, -1.6, cy - 0.5, cz, 1.6, cy + 0.5, cz + 0.25, red, 2);
  b.box(b.solid, -0.5, cy - 1.6, cz, 0.5, cy + 1.6, cz + 0.25, red, 2);

  const ex0 = Math.min(mw * 0.25, W / 2 - 10), ex1 = ex0 + 9;
  b.box(b.solid, ex0, 3.8, front, ex1, 4.1, front + 7, white);
  b.box(b.solid, ex0, 3.35, front + 6.85, ex1, 3.8, front + 7, red);
  for (const [x, z] of [[ex0 + 0.3, front + 6.6], [ex1 - 0.3, front + 6.6]]) b.prism(b.solid, x, 0, z, 0.15, 3.8, 8, white);
  if (d >= 1) for (let k = 0, x = ex0 + 2.2; k < 9; k++, x += 0.52) b.face(b.solid, [[x, 3.47, front + 7.01], [x + 0.38, 3.47, front + 7.01], [x + 0.38, 3.7, front + 7.01], [x, 3.7, front + 7.01]], white, [0, 0, 1], 2);

  const pz = mz + hz, seg = d >= 1 ? 24 : 12;
  b.prism(b.solid, 0, H, pz, hr, 0.3, seg, color('#3E4346'));
  if (d >= 1) {
    const ring = (rad: number, a: number): V3 => [Math.cos(a) * rad, H + 0.31, pz - Math.sin(a) * rad];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      b.face(b.solid, [ring(hr - 0.65, a0), ring(hr - 0.35, a0), ring(hr - 0.35, a1), ring(hr - 0.65, a1)], white, [0, 1, 0]);
      if (k % 3 === 0) b.box(b.solid, Math.cos(a0) * (hr - 0.15) - 0.1, H + 0.3, pz - Math.sin(a0) * (hr - 0.15) - 0.1, Math.cos(a0) * (hr - 0.15) + 0.1, H + 0.45, pz - Math.sin(a0) * (hr - 0.15) + 0.1, color('#7CFF9A'), 2);
    }
  }
  const hh = hr * 0.42, hw = hr * 0.26, t = 0.35;
  b.box(b.solid, -hw - t, H + 0.3, pz - hh, -hw + t, H + 0.34, pz + hh, white);
  b.box(b.solid, hw - t, H + 0.3, pz - hh, hw + t, H + 0.34, pz + hh, white);
  b.box(b.solid, -hw, H + 0.3, pz - t, hw, H + 0.34, pz + t, white);
  return H + 1.5;
}

function stadium(b: Builder, r: Rng, _build: Build, W: number, D: number, d: number) {
  const long = W >= D;
  const A = W / 2 - 2, B = D / 2 - 2;
  const n = r.range(2.8, 4.2);
  const sp = (t: number, a: number, bb: number): [number, number] => {
    const c = Math.cos(t), s = Math.sin(t);
    return [a * Math.sign(c) * Math.abs(c) ** (2 / n), -bb * Math.sign(s) * Math.abs(s) ** (2 / n)];
  };
  const fa = A * 0.6, fb = B * 0.52;
  const N = d >= 1 ? 72 : 44;
  const at = (t: number, th: number, y: number): V3 => {
    const p = sp(th, fa, fb), q = sp(th, A, B);
    return [p[0] + (q[0] - p[0]) * t, y, p[1] + (q[1] - p[1]) * t];
  };
  const c1 = color(r.pick(['#C15F3C', '#3E5C76', '#2F4A3A', '#7A2E2A', '#D9B44A', '#5B4A8A'])), c2 = color(r.pick(['#E9E4D8', '#B9B7B1', '#2F3B45']));
  const concrete = color('#B9B6AE'), facade = color(r.pick(['#E9E8E3', '#D8D4CA', '#C9C6BF']));
  const tiers: [number, number, number, number][] = [[0.02, 0.44, 0.6, 11], [0.5, 0.95, 12.6, 25]];
  const sub = d >= 1 ? 3 : 1;
  for (const [t0, t1, y0, y1] of tiers) {
    for (let k = 0; k < sub; k++) {
      const ta = t0 + ((t1 - t0) * k) / sub, tb = t0 + ((t1 - t0) * (k + 1)) / sub;
      const ya = y0 + ((y1 - y0) * k) / sub, yb = y0 + ((y1 - y0) * (k + 1)) / sub;
      for (let i = 0; i < N; i++) {
        const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
        const sector = Math.floor((i / N) * 12);
        const col = shade(sector % 3 === 0 ? c2 : c1, k % 2 ? 0.92 : 1);
        const p = at(ta, th0, ya);
        b.face(b.solid, [p, at(ta, th1, ya), at(tb, th1, yb), at(tb, th0, yb)], col, [-p[0] * 0.01, 1, -p[2] * 0.01]);
        if (k === 0) b.face(b.solid, [at(ta, th0, ya - 1.2), at(ta, th1, ya - 1.2), at(ta, th1, ya), at(ta, th0, ya)], concrete, [-p[0], 0, -p[2]]);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
    const p0 = at(1, th0, 0), p1 = at(1, th1, 0), out: V3 = [p0[0], 0, p0[2]];
    b.face(b.solid, [at(0.44, th0, 11.6), at(0.44, th1, 11.6), at(0.5, th1, 11.6), at(0.5, th0, 11.6)], concrete, [0, 1, 0]);
    b.face(b.solid, [p0, p1, at(1, th1, 27), at(1, th0, 27)], facade, out);
    if (d >= 1) {
      b.face(b.glass, [at(1.003, th0, 12.5), at(1.003, th1, 12.5), at(1.003, th1, 15.5), at(1.003, th0, 15.5)], color('#46555E'), out, 0.6);
      if (i % 3 === 0) {
        const q0 = at(1, th0, 0), q1 = at(1.02, th0, 0);
        const tl = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) || 1;
        const ux = ((p1[0] - p0[0]) / tl) * 0.25, uz = ((p1[2] - p0[2]) / tl) * 0.25;
        const fin = Array.from({ length: 8 }, (_, m) => {
          const q = m & 4 ? q1 : q0, sd = m & 1 ? 1 : -1;
          return [q[0] + ux * sd, m & 2 ? 27.4 : 0, q[2] + uz * sd] as V3;
        });
        b.hexa(b.solid, fin, shade(facade, 0.93));
      }
      if (i % (N / 4) === 0) b.face(b.solid, [at(1.004, th0, 0), at(1.004, th1, 0), at(1.004, th1, 4.2), at(1.004, th0, 4.2)], color('#2F3438'), out);
    }
    b.face(b.solid, [at(1.02, th0, 28.6), at(1.02, th1, 28.6), at(0.74, th1, 30.2), at(0.74, th0, 30.2)], color('#ECEBE6'), [0, 1, 0]);
    if (i % 6 === 0) {
      const q = at(1.0, th0, 0);
      b.prism(b.solid, q[0], 27, q[2], 0.35, 1.7, 6, concrete);
    }
  }

  const grass = color('#6E9B4F'), grass2 = color('#5F8C44'), line = color('#F2F2EC');
  for (let i = 0; i < N; i++) {
    const p0 = sp((i / N) * Math.PI * 2, fa, fb), p1 = sp(((i + 1) / N) * Math.PI * 2, fa, fb);
    b.face(b.solid, [[0, 0.05, 0], [p0[0], 0.05, p0[1]], [p1[0], 0.05, p1[1]]], grass, [0, 1, 0]);
  }
  const pa = Math.min(fa * 0.9, fb * 0.9 * 1.55) * (long ? 1 : 0.64), pb = long ? pa / 1.55 : Math.min(fb * 0.9, fa * 0.9 * 1.55);
  const L = long ? pa : pb, S = long ? pb : pa;
  const rect = (x0: number, z0: number, x1: number, z1: number, y: number, col: RGB) =>
    long ? b.face(b.solid, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], col, [0, 1, 0]) : b.face(b.solid, [[z0, y, x0], [z1, y, x0], [z1, y, x1], [z0, y, x1]], col, [0, 1, 0]);
  const stripes = 14;
  for (let k = 1; k < stripes; k += 2) rect(-L + (2 * L * k) / stripes, -S, -L + (2 * L * (k + 1)) / stripes, S, 0.07, grass2);
  const lw = 0.12, ly = 0.09;
  rect(-L, -S, L, -S + lw, ly, line);
  rect(-L, S - lw, L, S, ly, line);
  rect(-L, -S, -L + lw, S, ly, line);
  rect(L - lw, -S, L, S, ly, line);
  rect(-lw / 2, -S, lw / 2, S, ly, line);
  for (const sx of [-1, 1]) {
    const bx = sx * (L - L * 0.16), by = S * 0.6;
    rect(Math.min(sx * L, bx), -by, Math.max(sx * L, bx), -by + lw, ly, line);
    rect(Math.min(sx * L, bx), by - lw, Math.max(sx * L, bx), by, ly, line);
    rect(bx - lw / 2, -by, bx + lw / 2, by, ly, line);
    if (d >= 1) {
      const gw = S * 0.11, gx = sx * L;
      for (const gz of [-gw, gw]) rect(gx - 0.06, gz - 0.06, gx + 0.06, gz + 0.06, ly, line);
      const P = (x: number, z: number, y: number): V3 => (long ? [x, y, z] : [z, y, x]);
      const post = (z: number) => { const p = P(gx, z, 0); b.box(b.solid, p[0] - 0.06, 0, p[2] - 0.06, p[0] + 0.06, 2.4, p[2] + 0.06, line); };
      post(-gw); post(gw);
      const a = P(gx, -gw, 0), c = P(gx, gw, 0);
      b.box(b.solid, Math.min(a[0], c[0]) - 0.06, 2.34, Math.min(a[2], c[2]) - 0.06, Math.max(a[0], c[0]) + 0.06, 2.46, Math.max(a[2], c[2]) + 0.06, line);
    }
  }
  const cr = S * 0.27, cs = 24;
  for (let k = 0; k < cs; k++) {
    const a0 = (k / cs) * Math.PI * 2, a1 = ((k + 1) / cs) * Math.PI * 2;
    b.face(b.solid, [[Math.cos(a0) * (cr - lw), ly, Math.sin(a0) * (cr - lw)], [Math.cos(a0) * cr, ly, Math.sin(a0) * cr], [Math.cos(a1) * cr, ly, Math.sin(a1) * cr], [Math.cos(a1) * (cr - lw), ly, Math.sin(a1) * (cr - lw)]], line, [0, 1, 0]);
  }

  const lamp = color('#FFF3D6');
  for (let k = 0; k < 4; k++) {
    const p = at(1.08, Math.PI / 4 + (k * Math.PI) / 2, 0);
    b.prism(b.solid, p[0], 0, p[2], 0.45, 44, 6, color('#9A9893'));
    b.box(b.solid, p[0] - 2.4, 44, p[2] - 2.4, p[0] + 2.4, 46.5, p[2] + 2.4, lamp, 2);
  }
  if (d >= 1) {
    const s0 = at(0.95, Math.PI / 2, 26), w = Math.min(10, A * 0.2);
    b.box(b.solid, s0[0] - w / 2, 30.6, s0[2] - 0.3, s0[0] + w / 2, 35, s0[2] + 0.3, color('#22262A'));
    b.face(b.solid, [[s0[0] - w / 2 + 0.3, 31, s0[2] + 0.31], [s0[0] + w / 2 - 0.3, 31, s0[2] + 0.31], [s0[0] + w / 2 - 0.3, 34.6, s0[2] + 0.31], [s0[0] - w / 2 + 0.3, 34.6, s0[2] + 0.31]], color('#3E5C76'), [0, 0, 1], 1);
  }
  return 46.5;
}
