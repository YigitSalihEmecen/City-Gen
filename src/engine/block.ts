import { generateBuilding, type Corner } from './building.ts';
import { generateLandmark } from './landmarks.ts';
import { Builder, color, shade, type RGB } from './mesh.ts';
import { hash, rng, type Rng } from './rng.ts';
import { DISTRICTS, STYLE } from './styles.ts';

export interface BlockParams {
  width: number;
  depth: number;
  seed: number;
  detail: number;
  district?: string;
  style?: string;
  heightScale?: number;
  park?: boolean;
  landmark?: string;
}

export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  angle: number;
  style: string;
  seed: number;
  floors: number;
  corner?: 'left' | 'right' | 'both';
  /** ground height under the lot; blocks are flat (0), a game drops lots onto terrain */
  y?: number;
}

export const CURB = 0.15;
export const SIDEWALK = 3;
const PAVING = color('#CFCAC0');
const GRASS = [color('#9DAA7C'), color('#8FA06F'), color('#A5B083')];
const LEAVES = ['#6E8452', '#7C8F57', '#5F7748', '#8A9A5E', '#9C8F4E'].map(color);

/** Builds one block centred at (ox, oz). Buildings face outward onto the surrounding streets. */
export function generateBlock(b: Builder, p: BlockParams, ox = 0, oz = 0): Lot[] {
  const r = rng(p.seed);
  b.setFrame(ox, oz);
  b.box(b.solid, -p.width / 2, 0, -p.depth / 2, p.width / 2, CURB, p.depth / 2, PAVING);
  const Wi = p.width - SIDEWALK * 2, Di = p.depth - SIDEWALK * 2;
  if (p.detail >= 1) lamps(b, p.width, p.depth, ox, oz);
  if (p.landmark && Wi > 20 && Di > 20) return [landmarkLot(b, r, p, Wi, Di, ox, oz)];
  if (p.park || Wi < 8 || Di < 8) {
    park(b, r, Wi, Di, ox, oz, p.detail);
    return [];
  }

  const mix: [string, number][] = p.style ? [[p.style, 1]] : DISTRICTS[p.district ?? 'oldtown'].mix;
  let total = 0, avg = 0;
  for (const [id, w] of mix) {
    const s = STYLE[id];
    avg += w * ((s.lot.depth[0] + s.lot.depth[1]) / 2 + s.lot.front + (s.attached ? 0 : 5));
    total += w;
  }
  const ld = Math.min(Math.max(avg / total, 10), 42);

  const lots: Lot[] = [];
  const strip = (len: number, depth: number, cx: number, cz: number, angle: number, corners: boolean) => {
    let pos = 0;
    const c = Math.cos(angle), s = Math.sin(angle);
    while (len - pos > 2) {
      const st = STYLE[r.weighted(mix)];
      let w = r.range(...st.lot.width);
      if (len - pos - w < st.lot.width[0] * 0.6) w = len - pos;
      const lx = -len / 2 + pos + w / 2;
      const first = pos === 0, last = pos + w >= len - 1e-6;
      const corner = corners && (first || last) ? (first && last ? 'both' : first ? 'left' : 'right') : undefined;
      lots.push({ x: cx + lx * c, z: cz - lx * s, w, d: depth, angle, style: st.id, seed: hash(p.seed, lots.length), floors: 0, corner });
      pos += w;
    }
  };

  const half = Di / 2;
  if (Di < ld * 1.4) strip(Wi, Di, 0, 0, 0, true);
  else {
    const fd = Math.min(ld, half);
    strip(Wi, fd, 0, half - fd / 2, 0, true);
    strip(Wi, fd, 0, -half + fd / 2, Math.PI, true);
    const sideLen = Di - fd * 2, sd = Math.min(ld, Wi / 2);
    if (sideLen > 8 && Wi > sd * 2 + 6) {
      strip(sideLen, sd, -Wi / 2 + sd / 2, 0, -Math.PI / 2, false);
      strip(sideLen, sd, Wi / 2 - sd / 2, 0, Math.PI / 2, false);
      courtyard(b, r, Wi - sd * 2, sideLen, ox, oz, p.detail);
    } else if (sideLen > 4) courtyard(b, r, Wi, sideLen, ox, oz, p.detail);
  }

  for (const lot of lots) generateLot(b, lot, p, ox, oz);
  return lots;
}

/** One lot's building, yard and garden trees. The lot's front (+z after `angle`) faces the street. */
export function generateLot(b: Builder, lot: Lot, p: Pick<BlockParams, 'detail' | 'heightScale'>, ox = 0, oz = 0) {
  const st = STYLE[lot.style];
  const r = rng(lot.seed);
  const y = lot.y ?? 0;
  const c = Math.cos(lot.angle), s = Math.sin(lot.angle);
  const toWorld = (lx: number, lz: number): [number, number] => [ox + lot.x + lx * c + lz * s, oz + lot.z - lx * s + lz * c];
  const side = st.lot.side;
  const bw = lot.w - side * 2;
  const front = Math.min(st.lot.front, lot.d * 0.3);
  const bd = Math.min(lot.d - front - (st.attached ? 0 : 3), r.range(...st.lot.depth));
  if (bw < 4 || bd < 4) return;
  if (!st.attached) {
    b.setFrame(...toWorld(0, 0), lot.angle, y + CURB + 0.03);
    b.face(b.solid, [[-lot.w / 2 + 0.4, 0, -lot.d / 2 + 0.4], [lot.w / 2 - 0.4, 0, -lot.d / 2 + 0.4], [lot.w / 2 - 0.4, 0, lot.d / 2 - 0.4], [-lot.w / 2 + 0.4, 0, lot.d / 2 - 0.4]], r.pick(GRASS), [0, 1, 0]);
    if (p.detail >= 1 && st.id === 'suburban') {
      for (let k = 0; k < r.int(1, 3); k++) {
        const tx = r.range(-lot.w / 2 + 1.5, lot.w / 2 - 1.5), tz = r.range(-lot.d / 2 + 1.5, -lot.d / 2 + Math.max(2, lot.d - bd - front - 1));
        tree(b, r, tx, tz, p.detail);
      }
    }
  }
  b.setFrame(...toWorld(0, lot.d / 2 - front - bd / 2), lot.angle, y + CURB);
  const corner: Corner = lot.corner ? (r.chance(0.6) ? lot.corner : 'none') : st.attached ? 'none' : 'auto';
  const info = generateBuilding(b, { style: st, seed: lot.seed, width: bw, depth: bd, detail: p.detail, heightScale: p.heightScale, corner, open: lot.corner });
  lot.floors = info.floors;
}

const MARGIN: Record<string, number> = { church: 5, civic: 4, hospital: 2, stadium: 1 };

function landmarkLot(b: Builder, r: Rng, p: BlockParams, Wi: number, Di: number, ox: number, oz: number): Lot {
  const kind = p.landmark!;
  const angle = r.chance(0.5) ? 0 : Math.PI;
  b.setFrame(ox, oz, angle, CURB + 0.02);
  const quad = (x0: number, z0: number, x1: number, z1: number, col: RGB) => b.face(b.solid, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], col, [0, 1, 0]);
  if (kind === 'church' || kind === 'civic') quad(-Wi / 2, -Di / 2, Wi / 2, Di / 2, r.pick(GRASS));
  else quad(-Wi / 2, -Di / 2, Wi / 2, Di / 2, shade(PAVING, kind === 'stadium' ? 1.04 : 0.97));
  if (kind === 'civic') quad(-4, 0, 4, Di / 2, shade(PAVING, 1.06));
  if (kind === 'hospital') {
    b.setFrame(ox, oz, angle, CURB + 0.04);
    const x0 = -Wi / 2 + 1, x1 = -Wi * 0.12, z0 = Di * 0.18 + 2, z1 = Di / 2 - 1;
    if (x1 - x0 > 8 && z1 - z0 > 8) {
      quad(x0, z0, x1, z1, color('#55575A'));
      b.setFrame(ox, oz, angle, CURB + 0.06);
      for (let x = x0 + 1; x + 0.12 < x1; x += 2.6) {
        quad(x, z0 + 0.5, x + 0.12, z0 + 5.5, color('#E9E6DE'));
        quad(x, z1 - 5.5, x + 0.12, z1 - 0.5, color('#E9E6DE'));
      }
    }
  }
  const m = MARGIN[kind] ?? 3;
  b.setFrame(ox, oz, angle, CURB);
  if (p.detail >= 1 && (kind === 'church' || kind === 'civic'))
    for (let x = -Wi / 2 + 2; x < Wi / 2 - 1; x += r.range(6, 9)) {
      tree(b, r, x, -Di / 2 + 1.8, p.detail);
      if (kind === 'church') tree(b, r, x, Di / 2 - 1.8, p.detail);
    }
  generateLandmark(b, { kind, seed: p.seed, width: Wi - m * 2, depth: Di - m * 2, detail: p.detail });
  return { x: 0, z: 0, w: Wi, d: Di, angle, style: kind, seed: p.seed, floors: 0 };
}

function courtyard(b: Builder, r: Rng, w: number, d: number, ox: number, oz: number, detail: number) {
  b.setFrame(ox, oz, 0, CURB + 0.02);
  b.face(b.solid, [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], r.pick(GRASS), [0, 1, 0]);
  if (detail < 1) return;
  const n = Math.min(12, Math.floor((w * d) / 120));
  for (let k = 0; k < n; k++) tree(b, r, r.range(-w / 2 + 2, w / 2 - 2), r.range(-d / 2 + 2, d / 2 - 2), detail);
}

function park(b: Builder, r: Rng, w: number, d: number, ox: number, oz: number, detail: number) {
  b.setFrame(ox, oz, 0, CURB + 0.02);
  const g = r.pick(GRASS);
  b.face(b.solid, [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], g, [0, 1, 0]);
  b.setFrame(ox, oz, 0, CURB + 0.04);
  const path = shade(PAVING, 1.05);
  b.face(b.solid, [[-1.5, 0, -d / 2], [1.5, 0, -d / 2], [1.5, 0, d / 2], [-1.5, 0, d / 2]], path, [0, 1, 0]);
  b.face(b.solid, [[-w / 2, 0, -1.5], [w / 2, 0, -1.5], [w / 2, 0, 1.5], [-w / 2, 0, 1.5]], path, [0, 1, 0]);
  b.setFrame(ox, oz, 0, CURB);
  const n = Math.min(detail >= 1 ? 40 : 14, Math.floor((w * d) / 70));
  for (let k = 0; k < n; k++) {
    const x = r.range(-w / 2 + 2, w / 2 - 2), z = r.range(-d / 2 + 2, d / 2 - 2);
    if (Math.abs(x) < 3.5 || Math.abs(z) < 3.5) continue;
    tree(b, r, x, z, detail);
  }
}

export function tree(b: Builder, r: Rng, x: number, z: number, detail: number) {
  const s = r.range(0.75, 1.3);
  const leaf: RGB = r.pick(LEAVES);
  const seg = detail >= 2 ? 8 : 5;
  b.prism(b.solid, x, 0, z, 0.18 * s, 2.2 * s, 5, color('#5A4636'));
  if (r.chance(0.35)) {
    b.prism(b.solid, x, 1.4 * s, z, 1.8 * s, 2.6 * s, seg, leaf, 0.9 * s);
    b.prism(b.solid, x, 4 * s, z, 0.9 * s, 2.2 * s, seg, shade(leaf, 1.1), 0);
  } else {
    b.prism(b.solid, x, 1.6 * s, z, 1.4 * s, 1.1 * s, seg, leaf, 2.0 * s);
    b.prism(b.solid, x, 2.7 * s, z, 2.0 * s, 1.6 * s, seg, shade(leaf, 1.08), 0.3 * s);
  }
}

function lamps(b: Builder, w: number, d: number, ox: number, oz: number) {
  const pole = color('#3B3D3F');
  const head = color('#F6E7C8');
  const inset = 0.6;
  const along = (len: number, place: (t: number) => [number, number]) => {
    const n = Math.max(1, Math.round(len / 26));
    for (let k = 0; k < n; k++) {
      const [x, z] = place(-len / 2 + (k + 0.5) * (len / n));
      b.setFrame(ox, oz, 0, CURB);
      b.prism(b.solid, x, 0, z, 0.08, 5.2, 5, pole);
      b.box(b.glass, x - 0.22, 5.2, z - 0.22, x + 0.22, 5.45, z + 0.22, head, 1);
    }
  };
  along(w - 4, (t) => [t, d / 2 - inset]);
  along(w - 4, (t) => [t, -d / 2 + inset]);
  along(d - 4, (t) => [w / 2 - inset, t]);
  along(d - 4, (t) => [-w / 2 + inset, t]);
}
