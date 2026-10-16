import { Builder, color } from './mesh.ts';
import { hash, rng } from './rng.ts';

export interface CityParams {
  size: number;
  seed: number;
  blockMin: number;
  blockMax: number;
  parks: number;
  density: number;
  district: string;
  landmarks?: boolean;
}

export interface Road {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  width: number;
  kind: 'ring' | 'arterial' | 'local';
}

export interface BlockJob {
  x: number;
  z: number;
  w: number;
  d: number;
  district: string;
  heightScale: number;
  park: boolean;
  seed: number;
  landmark?: string;
}

export interface CityLayout {
  size: number;
  roads: Road[];
  blocks: BlockJob[];
}

const WIDTH = { ring: 16, arterial: 14, local: 10 };

/** Recursive rectangle subdivision: each split lays a road, hierarchy by depth, leaves become blocks. */
export function layoutCity(p: CityParams): CityLayout {
  const r = rng(p.seed);
  const S = p.size / 2;
  const rw = WIDTH.ring;
  const roads: Road[] = [
    { x0: -S - rw / 2, z0: -S, x1: S + rw / 2, z1: -S, width: rw, kind: 'ring' },
    { x0: -S - rw / 2, z0: S, x1: S + rw / 2, z1: S, width: rw, kind: 'ring' },
    { x0: -S, z0: -S, x1: -S, z1: S, width: rw, kind: 'ring' },
    { x0: S, z0: -S, x1: S, z1: S, width: rw, kind: 'ring' },
  ];
  const blocks: BlockJob[] = [];
  const cx = r.range(-0.15, 0.15) * p.size, cz = r.range(-0.15, 0.15) * p.size;
  const industryAngle = r.range(-Math.PI, Math.PI);

  const zone = (x: number, z: number) => {
    const dn = Math.hypot(x - cx, z - cz) / S;
    const ang = Math.atan2(z - cz, x - cx);
    const da = Math.abs(((ang - industryAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const jitter = r.range(-0.08, 0.08);
    let district = dn + jitter < 0.32 ? 'downtown' : dn + jitter < 0.62 ? 'oldtown' : 'residential';
    if (dn > 0.5 && da < 0.55) district = 'industrial';
    if (p.district !== 'auto') district = p.district;
    const heightScale = 1 + p.density * Math.max(0, 1 - dn / 0.5) ** 1.6 * (district === 'downtown' ? 1 : 0.35);
    return { district, heightScale };
  };

  const split = (x0: number, z0: number, x1: number, z1: number, depth: number) => {
    const w = x1 - x0, d = z1 - z0;
    const target = r.range(p.blockMin, p.blockMax);
    const vertical = w >= d;
    const long = Math.max(w, d);
    const kind = depth < 2 ? 'arterial' : 'local';
    const width = WIDTH[kind];
    if (long <= target || long - width < p.blockMin * 1.2) {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const { district, heightScale } = zone(mx, mz);
      const park = r.chance(district === 'downtown' ? p.parks * 0.4 : p.parks);
      blocks.push({ x: mx, z: mz, w, d, district, heightScale, park, seed: hash(p.seed, 'block', blocks.length) });
      return;
    }
    const minPart = p.blockMin * 0.6;
    const t = r.range(0.36, 0.64);
    const at = Math.min(Math.max((vertical ? x0 : z0) + long * t, (vertical ? x0 : z0) + minPart + width / 2), (vertical ? x1 : z1) - minPart - width / 2);
    if (vertical) {
      roads.push({ x0: at, z0, x1: at, z1, width, kind });
      split(x0, z0, at - width / 2, z1, depth + 1);
      split(at + width / 2, z0, x1, z1, depth + 1);
    } else {
      roads.push({ x0, z0: at, x1, z1: at, width, kind });
      split(x0, z0, x1, at - width / 2, depth + 1);
      split(x0, at + width / 2, x1, z1, depth + 1);
    }
  };
  split(-S + rw / 2, -S + rw / 2, S - rw / 2, S - rw / 2, 0);
  if (p.landmarks !== false) placeLandmarks(blocks, cx, cz, S, r);
  return { size: p.size, roads, blocks };
}

/** One civic hall near the centre, a hospital in the inner ring, a stadium on the outskirts, churches in old/residential areas. */
function placeLandmarks(blocks: BlockJob[], cx: number, cz: number, S: number, r: ReturnType<typeof rng>) {
  const dn = (b: BlockJob) => Math.hypot(b.x - cx, b.z - cz) / S;
  const short = (b: BlockJob) => Math.min(b.w, b.d);
  const free = (b: BlockJob) => !b.landmark;
  const assign = (b: BlockJob | undefined, kind: string) => {
    if (!b) return;
    b.landmark = kind;
    b.park = false;
  };
  assign([...blocks].filter((b) => free(b) && short(b) >= 50).sort((a, b) => dn(a) - dn(b))[0], 'civic');
  if (S >= 280)
    assign(blocks.filter((b) => free(b) && dn(b) > 0.45 && short(b) >= 80).sort((a, b) => b.w * b.d - a.w * a.d)[0], 'stadium');
  const ring = blocks.filter((b) => free(b) && dn(b) > 0.2 && dn(b) < 0.65 && short(b) >= 55);
  assign(ring.length ? r.pick(ring) : undefined, 'hospital');
  const churchy = blocks.filter((b) => free(b) && (b.district === 'oldtown' || b.district === 'residential') && short(b) >= 42);
  for (let k = Math.max(1, Math.round(blocks.length / 24)); k > 0 && churchy.length; k--) {
    const b = churchy.splice(r.int(0, churchy.length - 1), 1)[0];
    assign(b, 'church');
  }
}

/** Asphalt, dashed centre lines and zebra crossings; markings are cut wherever another road crosses. */
export function buildRoads(b: Builder, city: CityLayout, detail: number) {
  b.setFrame(0, 0);
  const S = city.size / 2 + WIDTH.ring;
  const asphalt = color('#4A4B4D');
  b.face(b.solid, [[-S, 0, -S], [S, 0, -S], [S, 0, S], [-S, 0, S]], asphalt, [0, 1, 0]);
  const white = color('#E9E6DE'), yellow = color('#D9B44A');
  const y = 0.02;
  for (const road of city.roads) {
    const vertical = road.x0 === road.x1;
    const a0 = vertical ? road.z0 : road.x0, a1 = vertical ? road.z1 : road.x1;
    const line = vertical ? road.x0 : road.z0;
    const cuts: [number, number][] = [];
    for (const o of city.roads) {
      if (o === road || (o.x0 === o.x1) === vertical) continue;
      const oline = vertical ? o.z0 : o.x0;
      const o0 = vertical ? o.x0 : o.z0, o1 = vertical ? o.x1 : o.z1;
      if (oline < a0 - 1 || oline > a1 + 1 || line < o0 - 1 || line > o1 + 1) continue;
      cuts.push([oline - o.width / 2, oline + o.width / 2]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    const quad = (s0: number, s1: number, t0: number, t1: number, col: typeof white) =>
      vertical
        ? b.face(b.solid, [[line + t0, y, s0], [line + t1, y, s0], [line + t1, y, s1], [line + t0, y, s1]], col, [0, 1, 0])
        : b.face(b.solid, [[s0, y, line + t0], [s1, y, line + t0], [s1, y, line + t1], [s0, y, line + t1]], col, [0, 1, 0]);
    let pos = a0;
    const free: [number, number][] = [];
    for (const [c0, c1] of cuts) {
      if (c0 > pos) free.push([pos, c0]);
      pos = Math.max(pos, c1);
    }
    if (pos < a1) free.push([pos, a1]);
    const hw = road.width / 2;
    for (const [f0, f1] of free) {
      if (road.kind === 'local') {
        for (let s = f0 + 4; s + 3 < f1 - 4; s += 6) quad(s, s + 3, -0.08, 0.08, white);
      } else {
        if (f1 - f0 > 8) {
          quad(f0 + 4, f1 - 4, -0.22, -0.08, yellow);
          quad(f0 + 4, f1 - 4, 0.08, 0.22, yellow);
          for (let s = f0 + 4; s + 3 < f1 - 4; s += 7) {
            quad(s, s + 3, -hw / 2 - 0.07, -hw / 2 + 0.07, white);
            quad(s, s + 3, hw / 2 - 0.07, hw / 2 + 0.07, white);
          }
        }
      }
      if (detail >= 1 && f1 - f0 > 12) {
        for (const [z0, z1] of [[f0 + 0.6, f0 + 3.4], [f1 - 3.4, f1 - 0.6]])
          for (let t = -hw + 0.8; t < hw - 0.8; t += 1.1) quad(z0, z1, t, t + 0.55, white);
      }
    }
  }
}
