export type V3 = [number, number, number];
export type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function color(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Part {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  emit: number[] = [];
  idx: number[] = [];
  get vertexCount() {
    return this.pos.length / 3;
  }
}

export interface Frame {
  ox: number;
  oz: number;
  oy: number;
  angle: number;
}

/** Ellipsoid/cylinder used to override flat normals so faceted curves shade smoothly. ry = 0 means cylinder. */
export interface Smooth {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  ref?: V3;
}

export class Builder {
  solid = new Part();
  glass = new Part();
  smooth: Smooth | null = null;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private c = 1;
  private s = 0;

  setFrame(ox: number, oz: number, angle = 0, oy = 0) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.c = Math.cos(angle);
    this.s = Math.sin(angle);
  }

  getFrame(): Frame {
    return { ox: this.ox, oz: this.oz, oy: this.oy, angle: Math.atan2(this.s, this.c) };
  }

  /** Frame offset by (dx, dz) and dAngle in the local space of `f`. */
  sub(f: Frame, dx: number, dz: number, dAngle = 0, dy = 0) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    this.setFrame(f.ox + dx * c + dz * s, f.oz - dx * s + dz * c, f.angle + dAngle, f.oy + dy);
  }

  private normalAt(p: V3, nx: number, ny: number, nz: number): V3 | null {
    const sm = this.smooth!;
    if (sm.ry > 0) {
      const v: V3 = [(p[0] - sm.cx) / sm.rx ** 2, (p[1] - sm.cy) / sm.ry ** 2, (p[2] - sm.cz) / sm.rz ** 2];
      const l = Math.hypot(...v) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    if (sm.ref ? nx * sm.ref[0] + nz * sm.ref[2] < 0.8 : Math.abs(ny) > 0.3) return null;
    const vx = (p[0] - sm.cx) / sm.rx ** 2, vz = (p[2] - sm.cz) / sm.rz ** 2;
    const l = Math.hypot(vx, vz) || 1;
    return [vx / l, ny, vz / l];
  }

  private push(part: Part, pts: V3[], col: RGB, emit: number) {
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    const base = part.vertexCount;
    for (const p of pts) {
      const n = this.smooth ? this.normalAt(p, nx, ny, nz) : null;
      const px = n ? n[0] : nx, py = n ? n[1] : ny, pz = n ? n[2] : nz;
      part.pos.push(this.ox + p[0] * this.c + p[2] * this.s, this.oy + p[1], this.oz - p[0] * this.s + p[2] * this.c);
      part.nor.push(px * this.c + pz * this.s, py, -px * this.s + pz * this.c);
      part.col.push(col[0], col[1], col[2]);
      part.emit.push(emit);
    }
    for (let i = 1; i < pts.length - 1; i++) part.idx.push(base, base + i, base + i + 1);
  }

  /** Counter-clockwise when seen from the front. */
  quad(part: Part, a: V3, b: V3, c: V3, d: V3, col: RGB, emit = 0) {
    this.push(part, [a, b, c, d], col, emit);
  }

  tri(part: Part, a: V3, b: V3, c: V3, col: RGB, emit = 0) {
    this.push(part, [a, b, c], col, emit);
  }

  /** Convex polygon, flipped if needed so its normal points along `facing`. */
  face(part: Part, pts: V3[], col: RGB, facing: V3, emit = 0) {
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    this.push(part, n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0 ? pts.slice().reverse() : pts, col, emit);
  }

  /** Corners indexed x | y<<1 | z<<2; faces are oriented outward automatically. */
  hexa(part: Part, p: V3[], col: RGB, emit = 0, skipBottom = false) {
    const faces = [
      [1, 3, 7, 5], [4, 6, 2, 0], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1],
    ];
    let cx = 0, cy = 0, cz = 0;
    for (const q of p) { cx += q[0] / 8; cy += q[1] / 8; cz += q[2] / 8; }
    faces.forEach((f, i) => {
      if (skipBottom && i === 3) return;
      const [a, b, c, d] = f.map((k) => p[k]);
      const n = cross(sub(b, a), sub(c, a));
      const m = [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) this.push(part, [d, c, b, a], col, emit);
      else this.push(part, [a, b, c, d], col, emit);
    });
  }

  box(part: Part, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, emit = 0) {
    const p: V3[] = [];
    for (let i = 0; i < 8; i++) p.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    this.hexa(part, p, col, emit, y0 <= 0.001);
  }

  prism(part: Part, cx: number, y0: number, cz: number, r: number, h: number, seg: number, col: RGB, rTop = r, emit = 0) {
    const y1 = y0 + h;
    const ring = (rad: number, y: number): V3[] =>
      Array.from({ length: seg }, (_, i) => {
        const a = (i / seg) * Math.PI * 2;
        return [cx + Math.cos(a) * rad, y, cz - Math.sin(a) * rad] as V3;
      });
    const lo = ring(r, y0), hi = ring(rTop, y1);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (rTop > 0.001) this.quad(part, lo[i], lo[j], hi[j], hi[i], col, emit);
      else this.tri(part, lo[i], lo[j], [cx, y1, cz], col, emit);
    }
    if (rTop > 0.001) this.push(part, hi, col, emit);
  }
}

/** Surface of revolution through `profile` [radius factor, height factor] pairs, smooth-shaded. */
export function dome(b: Builder, part: Part, cx: number, y: number, cz: number, rx: number, rz: number, h: number, col: RGB, seg: number, profile: [number, number][] = DOME) {
  const prev = b.smooth;
  b.smooth = { cx, cy: y, cz, rx, ry: h, rz };
  const ring = ([f, t]: [number, number]): V3[] =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return [cx + Math.cos(a) * rx * f, y + t * h, cz - Math.sin(a) * rz * f] as V3;
    });
  for (let k = 0; k < profile.length - 1; k++) {
    const lo = ring(profile[k]), hi = ring(profile[k + 1]);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (profile[k + 1][0] < 0.001) b.face(part, [lo[i], lo[j], hi[i]], col, [lo[i][0] - cx, 0.5, lo[i][2] - cz]);
      else b.face(part, [lo[i], lo[j], hi[j], hi[i]], col, [lo[i][0] - cx, 0.3, lo[i][2] - cz]);
    }
  }
  b.smooth = prev;
}

export const DOME: [number, number][] = [[1, 0], [0.97, 0.25], [0.87, 0.5], [0.7, 0.72], [0.45, 0.9], [0, 1]];
export const ONION: [number, number][] = [[0.8, 0], [1.05, 0.18], [1.08, 0.35], [0.85, 0.55], [0.45, 0.75], [0.15, 0.9], [0, 1]];

/** Flat regular polygon (disc) centred at c, spanned by unit axes u and v. */
export function disc(b: Builder, part: Part, c: V3, u: V3, v: V3, r: number, seg: number, col: RGB, emit = 0) {
  const pts: V3[] = Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r] as V3;
  });
  b.face(part, pts, col, cross(u, v), emit);
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
