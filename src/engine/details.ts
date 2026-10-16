/** Small "lived-in" details. Each is a handful of quads/boxes and only runs at detail >= 1 or 2. */
import type { Ctx, Face, RoofMap } from './building.ts';
import { color, cross, disc, shade, type RGB, type V3 } from './mesh.ts';

export interface Brand {
  col: RGB;
  ink: RGB;
  awning: 'none' | 'plain' | 'striped';
  closed: boolean;
  cafe: boolean;
  blade: boolean;
}

const SIGNS = ['#2F3B45', '#7A2E2A', '#2F4A3A', '#B8935A', '#1F2427', '#C15F3C', '#3E5C76', '#6B3E5E', '#D9B44A', '#E9E4D8'].map(color);
const INKS = ['#F6EBD2', '#FFFFFF', '#F2C14E'].map(color);
const NEON = ['#FF5E7E', '#5EE6FF', '#FFD25E', '#9DFF7A'].map(color);
const CREAM = color('#F1EADB');
const IRON = color('#2E3133');
const GREY = color('#C4C3BE');
const FOLIAGE = ['#5E7A45', '#6C8A4E', '#4F6B3C'].map(color);
const FLOWERS = ['#C8455A', '#E07A9A', '#E8C547', '#B24A3A', '#F2EDE4', '#8E5BA8'].map(color);
const LAUNDRY = ['#E9E6DE', '#7FA3C8', '#D9675B', '#E8C547', '#9BB48A', '#F2F2F2'].map(color);

export function shopBrand(c: Ctx): Brand {
  const { r } = c;
  const col = r.pick(SIGNS);
  const light = col[0] + col[1] + col[2] > 1.2;
  return {
    col,
    ink: light ? color('#1F2427') : r.chance(0.3) ? r.pick(NEON) : r.pick(INKS),
    awning: r.weighted([['none', 3], ['plain', 2], ['striped', 3]] as const),
    closed: r.chance(0.08),
    cafe: r.chance(0.2),
    blade: r.chance(0.4),
  };
}

/** Fascia with pseudo-lettering, awning, projecting sign and café tables for one shop spanning u0..u1. */
export function shopUnit(c: Ctx, F: Face, u0: number, u1: number, v0: number, v1: number, w0: number, br: Brand) {
  const { b, r, d } = c;
  const { box, fp, s } = F;
  const top = v1 - 0.22, bot = v1 - 0.74;
  box(b.solid, u0 + 0.05, u1 - 0.05, bot, top, w0, w0 + 0.09, br.col);
  if (d >= 1) letters(c, F, u0 + 0.35, u1 - 0.35, (bot + top) / 2, w0 + 0.095, br.ink, br.closed ? 0 : 2);
  if (br.awning !== 'none' && !br.closed) {
    const vt = bot - 0.04, vb = v1 - 1.4, wf = w0 + 1.25;
    const ua0 = u0 + 0.12, ua1 = u1 - 0.12;
    const n = br.awning === 'striped' && d >= 1 ? Math.max(2, Math.round((ua1 - ua0) / 0.4)) : 1;
    for (let i = 0; i < n; i++) {
      const ua = ua0 + ((ua1 - ua0) * i) / n, ub = ua0 + ((ua1 - ua0) * (i + 1)) / n;
      const col = br.awning === 'striped' && i % 2 ? CREAM : br.col;
      b.face(b.solid, [fp(ua, vt, w0 + 0.02), fp(ub, vt, w0 + 0.02), fp(ub, vb, wf), fp(ua, vb, wf)], col, [s.nx, 1, s.nz]);
      if (d >= 1) b.face(b.solid, [fp(ua, vb, wf), fp(ub, vb, wf), fp(ub, vb - 0.22, wf), fp(ua, vb - 0.22, wf)], col, F.out);
    }
    for (const [u, dir] of [[ua0, -1], [ua1, 1]] as const)
      b.face(b.solid, [fp(u, vt, w0 + 0.02), fp(u, vb, wf), fp(u, vt, wf)], br.col, [s.tx * dir, 0, s.tz * dir]);
  }
  if (d < 1) return;
  if (br.blade) {
    const u = u0 + 0.25, va = v1 + 0.35, vb = v1 + 1.15;
    box(b.solid, u - 0.04, u + 0.04, va, vb, w0 + 0.15, w0 + 0.9, br.col);
    for (const dir of [-1, 1]) {
      const uu = u + dir * 0.045;
      b.face(b.solid, [fp(uu, va + 0.12, w0 + 0.27), fp(uu, va + 0.12, w0 + 0.78), fp(uu, vb - 0.12, w0 + 0.78), fp(uu, vb - 0.12, w0 + 0.27)], br.ink, [s.tx * dir, 0, s.tz * dir], br.closed ? 0 : 2);
    }
    box(b.solid, u - 0.02, u + 0.02, vb, vb + 0.05, w0, w0 + 0.95, IRON);
  }
  if (br.cafe && !br.closed) {
    const n = Math.max(1, Math.floor((u1 - u0) / 2.2));
    for (let k = 0; k < n; k++) {
      const p = fp(u0 + ((k + 0.5) * (u1 - u0)) / n, 0, w0 + 2.0);
      b.prism(b.solid, p[0], 0, p[2], 0.04, 0.72, 4, IRON);
      b.prism(b.solid, p[0], 0.72, p[2], 0.38, 0.04, 8, CREAM);
      if (d >= 2)
        for (const dir of [-1, 1]) b.prism(b.solid, p[0] + s.tx * dir * 0.62, 0, p[2] + s.tz * dir * 0.62, 0.17, 0.45, 6, IRON);
      if (r.chance(0.65)) {
        b.prism(b.solid, p[0], 0.76, p[2], 0.03, 1.5, 4, CREAM);
        b.prism(b.solid, p[0], 2.0, p[2], 1.15, 0.42, 8, br.awning === 'none' ? br.col : CREAM, 0);
      }
    }
  }
  if (r.chance(0.35)) {
    const p = fp(u1 - 0.45, 0, w0 + 0.4);
    b.box(b.solid, p[0] - 0.25, 0, p[2] - 0.25, p[0] + 0.25, 0.45, p[2] + 0.25, shade(GREY, 0.8));
    b.prism(b.solid, p[0], 0.45, p[2], 0.3, 0.6, 6, r.pick(FOLIAGE), 0.08);
  }
}

/** A row of small glowing rectangles that reads as lettering from street distance. */
function letters(c: Ctx, F: Face, uL: number, uR: number, vc: number, w: number, ink: RGB, emit: number) {
  const { r } = c;
  const glyphs: [number, number][] = [];
  let total = 0;
  while (total < (uR - uL) * r.range(0.55, 0.9)) {
    const gw = r.range(0.12, 0.22), gap = r.chance(0.15) ? 0.2 : 0.06;
    glyphs.push([gw, gap]);
    total += gw + gap;
  }
  if (!glyphs.length) return;
  let u = (uL + uR) / 2 - total / 2;
  const h = r.range(0.2, 0.28);
  for (const [gw, gap] of glyphs) {
    const gh = h * (r.chance(0.2) ? 1.15 : 1);
    F.quad(c.b.solid, u, vc - gh / 2, u + gw, vc + gh / 2, w, ink, emit);
    u += gw + gap;
  }
}

export function curtains(c: Ctx, F: Face, ou0: number, ou1: number, ov0: number, ov1: number, wi: number, lit: number) {
  if (c.d < 1) return;
  const { b, r } = c;
  const col = r.chance(0.2) ? color(r.pick(['#E9E1CF', '#8E4A3E', '#6F7F8C', '#D8CDB5'])) : c.curtain;
  const w = wi + 0.012, emit = lit * 0.6;
  if (r.chance(0.6)) {
    const cw = (ou1 - ou0) * r.range(0.16, 0.3);
    F.quad(b.solid, ou0, ov0, ou0 + cw, ov1, w, col, emit);
    F.quad(b.solid, ou1 - cw, ov0, ou1, ov1, w, col, emit);
  } else F.quad(b.solid, ou0, ov1 - (ov1 - ov0) * r.range(0.2, 0.6), ou1, ov1, w, shade(col, 1.05), emit);
}

export function flowerBox(c: Ctx, F: Face, ou0: number, ou1: number, ov0: number, w0: number) {
  if (c.d < 1) return;
  const { b, r, d } = c;
  F.box(b.solid, ou0, ou1, ov0 - 0.02, ov0 + 0.17, w0 + 0.02, w0 + 0.26, color(r.pick(['#9C5B3E', '#6B4E37', '#5E6B4A'])));
  F.box(b.solid, ou0 + 0.03, ou1 - 0.03, ov0 + 0.17, ov0 + 0.3, w0 + 0.05, w0 + 0.23, r.pick(FOLIAGE));
  const n = d >= 2 ? Math.max(2, Math.round((ou1 - ou0) / 0.22)) : 1;
  const bloom = r.pick(FLOWERS);
  for (let k = 0; k < n; k++) {
    const ua = ou0 + 0.05 + ((ou1 - ou0 - 0.1) * k) / n, ub = ua + ((ou1 - ou0 - 0.1) / n) * (d >= 2 ? 0.6 : 1);
    F.box(b.solid, ua, ub, ov0 + 0.28, ov0 + 0.38, w0 + 0.08, w0 + 0.22, d >= 2 && r.chance(0.3) ? r.pick(FLOWERS) : bloom);
  }
}

export function acUnit(c: Ctx, F: Face, mid: number, ov0: number, w0: number) {
  if (c.d < 1) return;
  F.box(c.b.solid, mid - 0.4, mid + 0.4, ov0 - 0.62, ov0 - 0.14, w0, w0 + 0.42, GREY);
  if (c.d >= 2) F.quad(c.b.solid, mid - 0.3, ov0 - 0.55, mid + 0.18, ov0 - 0.2, w0 + 0.425, shade(GREY, 0.55));
}

export function dish(c: Ctx, F: Face, u: number, v: number, w0: number) {
  const { b } = c;
  const { s } = F;
  const n: V3 = norm([s.nx * 0.8 + s.tx * 0.3, 0.45, s.nz * 0.8 + s.tz * 0.3]);
  const ua = norm(cross([0, 1, 0], n)), va = cross(n, ua);
  F.box(b.solid, u - 0.03, u + 0.03, v - 0.03, v + 0.03, w0, w0 + 0.3, IRON);
  disc(b, b.solid, F.fp(u, v, w0 + 0.32), ua, va, 0.34, 8, GREY);
}

/** Bay window: a projecting box over a column, glazed on three sides, with corbel and cap. */
export function oriel(c: Ctx, F: Face, u0: number, u1: number, v0: number, v1: number, w0: number) {
  const { b, r } = c;
  const { box, fp, s } = F;
  const ua = u0 + 0.15, ub = u1 - 0.15, dep = 0.7;
  box(b.solid, ua, ub, v0, v1, w0, w0 + dep, c.wall);
  box(b.solid, ua + 0.1, ub - 0.1, v0 - 0.35, v0, w0, w0 + dep * 0.7, c.trim);
  box(b.solid, ua - 0.08, ub + 0.08, v1, v1 + 0.18, w0, w0 + dep + 0.12, c.trim);
  for (let lv = v0; lv + 1.5 < v1; lv += c.floorH) {
    const g0 = lv + 0.6, g1 = Math.min(v1 - 0.2, lv + c.floorH - 0.5);
    const glass = shade(c.glass, r.range(0.9, 1.1)), emit = r.chance(c.lit) ? 0.8 : 0;
    F.quad(b.glass, ua + 0.22, g0, ub - 0.22, g1, w0 + dep + 0.01, glass, emit);
    for (const [u, dir] of [[ua - 0.01, -1], [ub + 0.01, 1]] as const)
      b.face(b.glass, [fp(u, g0, w0 + 0.15), fp(u, g0, w0 + dep - 0.12), fp(u, g1, w0 + dep - 0.12), fp(u, g1, w0 + 0.15)], glass, [s.tx * dir, 0, s.tz * dir], emit);
    if (lv > v0) box(b.solid, ua - 0.03, ub + 0.03, lv - 0.06, lv + 0.06, w0, w0 + dep + 0.03, c.trim);
  }
}

/** NYC-style fire escape: platforms per floor, railings and alternating stair flights. */
export function fireEscape(c: Ctx, F: Face, u0: number, u1: number, levels: number[]) {
  const { b } = c;
  const { box, quad, fp } = F;
  const dep = 1.2;
  levels.forEach((v, k) => {
    box(b.solid, u0, u1, v - 0.06, v, 0, dep, IRON);
    box(b.solid, u0, u1, v + 0.95, v + 1.0, dep - 0.04, dep, IRON);
    box(b.solid, u0, u0 + 0.04, v + 0.95, v + 1.0, 0, dep, IRON);
    box(b.solid, u1 - 0.04, u1, v + 0.95, v + 1.0, 0, dep, IRON);
    for (let u = u0 + 0.25; u < u1; u += 0.5) quad(b.solid, u - 0.015, v, u + 0.015, v + 0.97, dep - 0.02, IRON);
    const next = levels[k + 1];
    if (next !== undefined) {
      const [ua, ub] = k % 2 ? [u0 + 0.3, u1 - 0.9] : [u1 - 0.3, u0 + 0.9];
      b.face(b.solid, [fp(ua, v, 0.3), fp(ua, v, 0.9), fp(ub, next, 0.9), fp(ub, next, 0.3)], IRON, [0, 1, 0]);
    }
  });
  const v0 = levels[0];
  for (const u of [u0 + 0.3, u0 + 0.75]) box(b.solid, u - 0.02, u + 0.02, v0 - 2.4, v0, 0.55, 0.59, IRON);
}

export function drainpipe(c: Ctx, F: Face, u: number, top: number) {
  const p = F.fp(u, 0, 0.1);
  c.b.prism(c.b.solid, p[0], 0, p[2], 0.06, top, 4, color('#5A5D5F'));
}

export function balconyLife(c: Ctx, F: Face, u0: number, u1: number, v0: number, w0: number, dep: number) {
  const { b, r, st } = c;
  if (r.chance(0.5)) {
    const p = F.fp(u0 + 0.3, v0, w0 + dep - 0.3);
    b.prism(b.solid, p[0], v0, p[2], 0.17, 0.3, 6, color('#9C5B3E'));
    b.prism(b.solid, p[0], v0 + 0.3, p[2], 0.28, 0.55, 6, r.pick(FOLIAGE), 0.06);
  }
  if (r.chance(st.laundry)) {
    const w = w0 + dep - 0.2;
    F.box(b.solid, u0, u1, v0 + 1.9, v0 + 1.92, w - 0.01, w + 0.01, IRON);
    for (let u = u0 + 0.2; u < u1 - 0.4; u += r.range(0.45, 0.7)) {
      const cw = r.range(0.25, 0.45);
      F.quad(b.solid, u, v0 + r.range(1.25, 1.5), u + cw, v0 + 1.9, w, r.pick(LAUNDRY));
    }
  }
}

/** Antennas, dishes, solar rows and roof terraces on flat roofs. `place` finds a free roof spot. */
export function roofLife(c: Ctx, place: (rad: number) => readonly [number, number] | null, y: number) {
  const { b, r, st, d } = c;
  if (c.solar) {
    c.solar = false;
    const panel = color('#22324A');
    for (let k = 0; k < 8; k++) {
      const p = place(1.0);
      if (!p) break;
      const [x, z] = p;
      b.face(b.glass, [[x - 0.8, y + 0.25, z + 0.5], [x + 0.8, y + 0.25, z + 0.5], [x + 0.8, y + 0.85, z - 0.5], [x - 0.8, y + 0.85, z - 0.5]], panel, [0, 1, 0.5]);
    }
  }
  if (d >= 2 && ['victorian', 'haussmann', 'soviet', 'brutalist', 'mediterranean', 'industrial'].includes(st.id) && r.chance(0.6)) {
    for (let k = r.int(1, 3); k > 0; k--) {
      const p = place(0.4);
      if (!p) break;
      b.prism(b.solid, p[0], y, p[1], 0.03, 2.4, 4, IRON);
      for (const [h, l] of [[1.7, 0.9], [2.0, 0.7], [2.3, 0.5]]) b.box(b.solid, p[0] - l / 2, y + h, p[1] - 0.015, p[0] + l / 2, y + h + 0.03, p[1] + 0.015, IRON);
    }
  }
  if (r.chance(st.dish * 4)) {
    const p = place(0.6);
    if (p) {
      b.prism(b.solid, p[0], y, p[1], 0.04, 0.7, 4, IRON);
      disc(b, b.solid, [p[0], y + 0.8, p[1]], [1, 0, 0], norm([0, 0.6, -0.8]), 0.45, 8, GREY);
    }
  }
  if (d >= 2 && (st.id === 'modern' || st.id === 'mediterranean') && r.chance(0.35)) {
    const p = place(2.4);
    if (p) {
      const [x, z] = p;
      b.face(b.solid, [[x - 2, y + 0.06, z - 2], [x + 2, y + 0.06, z - 2], [x + 2, y + 0.06, z + 2], [x - 2, y + 0.06, z + 2]], color('#9B7A58'), [0, 1, 0]);
      for (const dx of [-0.9, 0.9]) {
        b.prism(b.solid, x + dx, y, z, 0.03, 2.1, 4, CREAM);
        b.prism(b.solid, x + dx, y + 1.9, z, 1.0, 0.35, 8, color(r.pick(['#E9E4D8', '#C15F3C', '#3E5C76'])), 0);
      }
      b.prism(b.solid, x - 1.7, y, z + 1.7, 0.3, 0.5, 6, shade(GREY, 0.8));
      b.prism(b.solid, x - 1.7, y + 0.5, z + 1.7, 0.4, 0.7, 6, r.pick(FOLIAGE), 0.1);
    }
  }
}

/** Grid of solar panels laid on the +B slope of a gable/hip roof. */
export function solarSlope(c: Ctx, m: RoofMap, y: number, pitch: number, gable: boolean) {
  const tan = Math.tan(pitch);
  const half = (m.B1 - m.B0) / 2;
  const inset = gable ? 0.6 : half + 0.3;
  const a0 = m.A0 + inset, a1 = m.A1 - inset, q0 = 0.6, q1 = half - 0.5;
  const cols = Math.min(8, Math.floor((a1 - a0) / 1.05)), rows = Math.min(3, Math.floor((q1 - q0) / 1.75));
  if (cols < 1 || rows < 1) return;
  const sa = (a0 + a1) / 2 - (cols * 1.05) / 2, sq = q0;
  const at = (a: number, q: number) => m.p(a, m.B1 - q, y + q * tan + 0.06);
  const panel = color('#22324A');
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const a = sa + i * 1.05, q = sq + j * 1.75;
      c.b.face(c.b.glass, [at(a, q), at(a + 1, q), at(a + 1, q + 1.7), at(a, q + 1.7)], panel, [m.dirB[0], 1, m.dirB[2]]);
    }
}

function norm(v: V3): V3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
