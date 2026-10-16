var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/engine/mesh.ts
var toLinear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function color(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear((n >> 16 & 255) / 255), toLinear((n >> 8 & 255) / 255), toLinear((n & 255) / 255)];
}
var shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var Part = class {
  constructor() {
    __publicField(this, "pos", []);
    __publicField(this, "nor", []);
    __publicField(this, "col", []);
    __publicField(this, "emit", []);
    __publicField(this, "idx", []);
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
};
var Builder = class {
  constructor() {
    __publicField(this, "solid", new Part());
    __publicField(this, "glass", new Part());
    __publicField(this, "smooth", null);
    __publicField(this, "ox", 0);
    __publicField(this, "oy", 0);
    __publicField(this, "oz", 0);
    __publicField(this, "c", 1);
    __publicField(this, "s", 0);
  }
  setFrame(ox, oz, angle = 0, oy = 0) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.c = Math.cos(angle);
    this.s = Math.sin(angle);
  }
  getFrame() {
    return { ox: this.ox, oz: this.oz, oy: this.oy, angle: Math.atan2(this.s, this.c) };
  }
  /** Frame offset by (dx, dz) and dAngle in the local space of `f`. */
  sub(f, dx, dz, dAngle = 0, dy = 0) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    this.setFrame(f.ox + dx * c + dz * s, f.oz - dx * s + dz * c, f.angle + dAngle, f.oy + dy);
  }
  normalAt(p, nx, ny, nz) {
    const sm = this.smooth;
    if (sm.ry > 0) {
      const v = [(p[0] - sm.cx) / sm.rx ** 2, (p[1] - sm.cy) / sm.ry ** 2, (p[2] - sm.cz) / sm.rz ** 2];
      const l2 = Math.hypot(...v) || 1;
      return [v[0] / l2, v[1] / l2, v[2] / l2];
    }
    if (sm.ref ? nx * sm.ref[0] + nz * sm.ref[2] < 0.8 : Math.abs(ny) > 0.3) return null;
    const vx = (p[0] - sm.cx) / sm.rx ** 2, vz = (p[2] - sm.cz) / sm.rz ** 2;
    const l = Math.hypot(vx, vz) || 1;
    return [vx / l, ny, vz / l];
  }
  push(part, pts, col, emit) {
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    const base3 = part.vertexCount;
    for (const p of pts) {
      const n = this.smooth ? this.normalAt(p, nx, ny, nz) : null;
      const px = n ? n[0] : nx, py = n ? n[1] : ny, pz = n ? n[2] : nz;
      part.pos.push(this.ox + p[0] * this.c + p[2] * this.s, this.oy + p[1], this.oz - p[0] * this.s + p[2] * this.c);
      part.nor.push(px * this.c + pz * this.s, py, -px * this.s + pz * this.c);
      part.col.push(col[0], col[1], col[2]);
      part.emit.push(emit);
    }
    for (let i = 1; i < pts.length - 1; i++) part.idx.push(base3, base3 + i, base3 + i + 1);
  }
  /** Counter-clockwise when seen from the front. */
  quad(part, a, b, c, d, col, emit = 0) {
    this.push(part, [a, b, c, d], col, emit);
  }
  tri(part, a, b, c, col, emit = 0) {
    this.push(part, [a, b, c], col, emit);
  }
  /** Convex polygon, flipped if needed so its normal points along `facing`. */
  face(part, pts, col, facing, emit = 0) {
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    this.push(part, n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0 ? pts.slice().reverse() : pts, col, emit);
  }
  /** Corners indexed x | y<<1 | z<<2; faces are oriented outward automatically. */
  hexa(part, p, col, emit = 0, skipBottom = false) {
    const faces = [
      [1, 3, 7, 5],
      [4, 6, 2, 0],
      [2, 6, 7, 3],
      [0, 1, 5, 4],
      [4, 5, 7, 6],
      [0, 2, 3, 1]
    ];
    let cx = 0, cy = 0, cz = 0;
    for (const q of p) {
      cx += q[0] / 8;
      cy += q[1] / 8;
      cz += q[2] / 8;
    }
    faces.forEach((f, i) => {
      if (skipBottom && i === 3) return;
      const [a, b, c, d] = f.map((k) => p[k]);
      const n = cross(sub(b, a), sub(c, a));
      const m = [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) this.push(part, [d, c, b, a], col, emit);
      else this.push(part, [a, b, c, d], col, emit);
    });
  }
  box(part, x0, y0, z0, x1, y1, z1, col, emit = 0) {
    const p = [];
    for (let i = 0; i < 8; i++) p.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    this.hexa(part, p, col, emit, y0 <= 1e-3);
  }
  prism(part, cx, y0, cz, r, h, seg2, col, rTop = r, emit = 0) {
    const y1 = y0 + h;
    const ring = (rad, y) => Array.from({ length: seg2 }, (_, i) => {
      const a = i / seg2 * Math.PI * 2;
      return [cx + Math.cos(a) * rad, y, cz - Math.sin(a) * rad];
    });
    const lo = ring(r, y0), hi = ring(rTop, y1);
    for (let i = 0; i < seg2; i++) {
      const j = (i + 1) % seg2;
      if (rTop > 1e-3) this.quad(part, lo[i], lo[j], hi[j], hi[i], col, emit);
      else this.tri(part, lo[i], lo[j], [cx, y1, cz], col, emit);
    }
    if (rTop > 1e-3) this.push(part, hi, col, emit);
  }
};
function dome(b, part, cx, y, cz, rx, rz, h, col, seg2, profile = DOME) {
  const prev = b.smooth;
  b.smooth = { cx, cy: y, cz, rx, ry: h, rz };
  const ring = ([f, t]) => Array.from({ length: seg2 }, (_, i) => {
    const a = i / seg2 * Math.PI * 2;
    return [cx + Math.cos(a) * rx * f, y + t * h, cz - Math.sin(a) * rz * f];
  });
  for (let k = 0; k < profile.length - 1; k++) {
    const lo = ring(profile[k]), hi = ring(profile[k + 1]);
    for (let i = 0; i < seg2; i++) {
      const j = (i + 1) % seg2;
      if (profile[k + 1][0] < 1e-3) b.face(part, [lo[i], lo[j], hi[i]], col, [lo[i][0] - cx, 0.5, lo[i][2] - cz]);
      else b.face(part, [lo[i], lo[j], hi[j], hi[i]], col, [lo[i][0] - cx, 0.3, lo[i][2] - cz]);
    }
  }
  b.smooth = prev;
}
var DOME = [[1, 0], [0.97, 0.25], [0.87, 0.5], [0.7, 0.72], [0.45, 0.9], [0, 1]];
var ONION = [[0.8, 0], [1.05, 0.18], [1.08, 0.35], [0.85, 0.55], [0.45, 0.75], [0.15, 0.9], [0, 1]];
function disc(b, part, c, u, v, r, seg2, col, emit = 0) {
  const pts = Array.from({ length: seg2 }, (_, i) => {
    const a = i / seg2 * Math.PI * 2;
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
  });
  b.face(part, pts, col, cross(u, v), emit);
}
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// src/engine/rng.ts
function hash(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 2654435769, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  const r = (() => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  });
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.chance = (p) => r() < p;
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.weighted = (items) => {
    let total = 0;
    for (const [, w] of items) total += w;
    let x = r() * total;
    for (const [v, w] of items) if ((x -= w) <= 0) return v;
    return items[items.length - 1][0];
  };
  r.fork = (key) => rng(hash(seed, key));
  return r;
}

// src/engine/styles.ts
var base = {
  groundH: 3.6,
  floorH: 3.1,
  blankCol: 0,
  attached: true,
  shops: 0,
  balcony: { mode: "none", chance: 0, solid: false, depth: 0.9 },
  bands: 0,
  cornice: 0,
  plinth: false,
  pilasters: 0,
  quoins: false,
  timber: false,
  jetty: 0,
  corner: 0,
  turret: 0,
  flowers: 0,
  ac: 0,
  dish: 0,
  oriel: 0,
  fireEscape: 0,
  laundry: 0,
  solar: 0,
  greenRoof: 0,
  props: 0.4
};
var STYLES = [
  {
    ...base,
    id: "modern",
    corner: 0.3,
    solar: 0.2,
    greenRoof: 0.25,
    name: "Glass Office",
    blurb: "Curtain wall towers on a podium",
    floors: [7, 20],
    groundH: 4.8,
    floorH: 3.7,
    bay: [2.8, 3.4],
    facade: "curtain",
    win: { w: [0.9, 0.9], h: [0.8, 0.8], inset: 0.05, arch: 0, mullion: "vertical", sill: false, lintel: false, shutters: 0 },
    roof: { types: [["flat", 1]], pitch: [0, 0], overhang: 0, parapet: 0.9, dormers: 0, chimneys: 0 },
    massing: { shapes: [["rect", 6], ["L", 1], ["round", 1.5]], tiers: [1, 3], podium: 0.6 },
    palette: {
      wall: ["#C9C7C1", "#B8B6B0", "#D4D2CC", "#9EA3A6"],
      trim: ["#8C9196", "#6F757A", "#B5B7B8"],
      roof: ["#8E8D88", "#7D7C78"],
      glass: ["#5D7385", "#4F6577", "#6E8899", "#47606E", "#7790A0"],
      accent: ["#2F3B45"],
      spandrel: ["#3E4C57", "#55626C", "#2E3A43"]
    },
    lot: { width: [24, 40], depth: [22, 34], front: 2, side: 0 },
    props: 0.8
  },
  {
    ...base,
    id: "haussmann",
    turret: 0.35,
    flowers: 0.2,
    ac: 0.03,
    name: "Parisian",
    blurb: "Stone, iron balconies, zinc mansard",
    floors: [5, 7],
    groundH: 4.2,
    floorH: 3.1,
    bay: [2.6, 3],
    facade: "punched",
    win: { w: [0.48, 0.55], h: [0.62, 0.7], inset: 0.25, arch: 0.15, mullion: "vertical", sill: true, lintel: true, shutters: 0 },
    shops: 0.85,
    balcony: { mode: "row", chance: 1, solid: false, depth: 0.7 },
    bands: 1,
    cornice: 0.45,
    plinth: true,
    roof: { types: [["mansard", 1]], pitch: [70, 75], overhang: 0.15, parapet: 0, dormers: 0.9, chimneys: 0.6 },
    massing: { shapes: [["rect", 4], ["L", 2], ["U", 1], ["court", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#E8DCC4", "#E2D3B5", "#DCCDB0", "#EDE3CF"],
      trim: ["#F1E9D8", "#E9DFC9"],
      roof: ["#6E757B", "#7C848A", "#5F666C"],
      glass: ["#55636B", "#4D5A61"],
      accent: ["#1F2427", "#2A3236", "#3B4A3F"]
    },
    lot: { width: [12, 22], depth: [14, 22], front: 0, side: 0 }
  },
  {
    ...base,
    id: "brutalist",
    corner: 0.2,
    ac: 0.1,
    dish: 0.04,
    greenRoof: 0.15,
    shops: 0.2,
    name: "Brutalist",
    blurb: "Raw concrete, deep recessed windows",
    floors: [4, 12],
    groundH: 4.2,
    floorH: 3.4,
    bay: [3, 3.8],
    facade: "punched",
    win: { w: [0.42, 0.55], h: [0.42, 0.52], inset: 0.6, arch: 0, mullion: "none", sill: false, lintel: false, shutters: 0 },
    blankCol: 0.15,
    bands: 2,
    pilasters: 0.45,
    roof: { types: [["flat", 1]], pitch: [0, 0], overhang: 0, parapet: 1.1, dormers: 0, chimneys: 0 },
    massing: { shapes: [["rect", 3], ["L", 2], ["T", 1]], tiers: [1, 2], podium: 0.3 },
    palette: {
      wall: ["#A9A59D", "#9D998F", "#B3AFA6", "#948F86"],
      trim: ["#8C887F", "#A19C93"],
      roof: ["#86827A"],
      glass: ["#3F4A50", "#47545B"],
      accent: ["#5C5850"]
    },
    lot: { width: [22, 40], depth: [18, 30], front: 3, side: 0 },
    props: 0.6
  },
  {
    ...base,
    id: "victorian",
    corner: 0.4,
    turret: 0.4,
    flowers: 0.25,
    ac: 0.05,
    oriel: 0.45,
    fireEscape: 0.35,
    shops: 0.35,
    name: "Brick Rowhouse",
    blurb: "Red brick, sash windows, chimneys",
    floors: [2, 4],
    groundH: 3.4,
    floorH: 3,
    bay: [2.3, 2.7],
    facade: "punched",
    win: { w: [0.42, 0.5], h: [0.58, 0.66], inset: 0.18, arch: 0.25, mullion: "cross", sill: true, lintel: true, shutters: 0.15 },
    bands: 1,
    cornice: 0.25,
    plinth: true,
    roof: { types: [["gable", 3], ["mansard", 1], ["flat", 1]], pitch: [35, 45], overhang: 0.25, parapet: 0.6, dormers: 0.4, chimneys: 0.9 },
    massing: { shapes: [["rect", 5], ["L", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#9C4A36", "#8E3F2E", "#A85A3F", "#7F3C2C", "#B0694C"],
      base: ["#6B5E55", "#5F544C"],
      trim: ["#EDE8DE", "#E6DFD0", "#D9D2C2"],
      roof: ["#4E4A4C", "#5A5352", "#3F3D40"],
      glass: ["#3E4950", "#48545C"],
      accent: ["#1F3A33", "#2A2E3A", "#5B1F1D", "#1E2B3B"]
    },
    lot: { width: [6, 9], depth: [11, 15], front: 1.5, side: 0 }
  },
  {
    ...base,
    id: "tudor",
    flowers: 0.45,
    oriel: 0.25,
    shops: 0.35,
    name: "Timber Frame",
    blurb: "Jettied upper floors, oak beams",
    floors: [2, 3],
    groundH: 3,
    floorH: 2.8,
    bay: [2.2, 2.6],
    facade: "punched",
    win: { w: [0.36, 0.44], h: [0.42, 0.5], inset: 0.12, arch: 0, mullion: "grid", sill: true, lintel: false, shutters: 0 },
    blankCol: 0.25,
    timber: true,
    jetty: 0.4,
    roof: { types: [["gable", 3], ["hip", 1]], pitch: [48, 58], overhang: 0.45, parapet: 0, dormers: 0.3, chimneys: 0.95 },
    massing: { shapes: [["rect", 3], ["L", 2], ["T", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#EDE4D0", "#E6DCC3", "#F0E8D6", "#E9DDC1"],
      base: ["#8D8478", "#9A8F80", "#7E766C"],
      trim: ["#3B2C22", "#33261E", "#46352A"],
      roof: ["#5A4A42", "#6B5444", "#4D423C"],
      glass: ["#3B454A"],
      accent: ["#3B2C22", "#4A3628"]
    },
    lot: { width: [8, 13], depth: [10, 15], front: 0.5, side: 0 }
  },
  {
    ...base,
    id: "artdeco",
    corner: 0.5,
    name: "Art Deco",
    blurb: "Setback tiers, piers and a crown",
    floors: [12, 30],
    groundH: 5.2,
    floorH: 3.5,
    bay: [2.4, 2.9],
    facade: "punched",
    win: { w: [0.52, 0.6], h: [0.62, 0.7], inset: 0.2, arch: 0, mullion: "cross", sill: false, lintel: false, shutters: 0 },
    shops: 0.6,
    bands: 0,
    cornice: 0.3,
    plinth: true,
    pilasters: 0.38,
    roof: { types: [["spire", 3], ["flat", 1]], pitch: [0, 0], overhang: 0, parapet: 0.8, dormers: 0, chimneys: 0 },
    massing: { shapes: [["rect", 1]], tiers: [2, 4], podium: 0.4 },
    palette: {
      wall: ["#D8CDB8", "#CDBF9F", "#C5B597", "#DDD3C0"],
      trim: ["#B8935A", "#A88550", "#C9A46A"],
      roof: ["#8F8A80"],
      glass: ["#46555E", "#3E4B53"],
      accent: ["#2B2A27", "#B8935A"],
      spandrel: ["#6E6A5F", "#5B584F", "#7A6E5A"]
    },
    lot: { width: [26, 40], depth: [26, 40], front: 1, side: 0 },
    props: 0.3
  },
  {
    ...base,
    id: "industrial",
    corner: 0.2,
    ac: 0.06,
    fireEscape: 0.45,
    solar: 0.3,
    shops: 0.1,
    name: "Warehouse",
    blurb: "Brick piers, big steel-framed windows",
    floors: [2, 5],
    groundH: 5,
    floorH: 4.2,
    bay: [3.8, 4.6],
    facade: "punched",
    win: { w: [0.62, 0.72], h: [0.6, 0.68], inset: 0.22, arch: 0.5, mullion: "grid", sill: true, lintel: false, shutters: 0 },
    attached: false,
    bands: 1,
    cornice: 0.2,
    pilasters: 0.42,
    roof: { types: [["flat", 3], ["gable", 2]], pitch: [14, 20], overhang: 0.2, parapet: 0.9, dormers: 0, chimneys: 0.2 },
    massing: { shapes: [["rect", 5], ["L", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#8A4B37", "#7A4433", "#955A42", "#6E4A3B"],
      trim: ["#5E3A2D", "#C9BFAE"],
      roof: ["#5F5B57", "#6A6662"],
      glass: ["#3C484E", "#4B5960"],
      accent: ["#2E3B33", "#3A3A3A"]
    },
    lot: { width: [24, 44], depth: [22, 36], front: 2, side: 2 },
    props: 0.7
  },
  {
    ...base,
    id: "suburban",
    turret: 0.12,
    flowers: 0.15,
    oriel: 0.2,
    solar: 0.35,
    name: "Suburban House",
    blurb: "Detached homes with hip roofs",
    floors: [1, 2],
    groundH: 3,
    floorH: 2.9,
    bay: [3, 3.6],
    facade: "punched",
    win: { w: [0.42, 0.52], h: [0.5, 0.58], inset: 0.1, arch: 0, mullion: "cross", sill: true, lintel: false, shutters: 0.55 },
    attached: false,
    blankCol: 0.2,
    plinth: true,
    roof: { types: [["hip", 3], ["gable", 2]], pitch: [24, 36], overhang: 0.55, parapet: 0, dormers: 0.15, chimneys: 0.4 },
    massing: { shapes: [["rect", 3], ["L", 3], ["T", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#D9D3C3", "#B9C4C9", "#C8B8A0", "#E3E0D6", "#A9B5A2", "#D7C6B0"],
      base: ["#8F8A82"],
      trim: ["#F2F0EA", "#E8E4DA"],
      roof: ["#4F4B49", "#5E5650", "#6A5D52", "#45474B"],
      glass: ["#3E4950"],
      accent: ["#33465A", "#4F3B2F", "#2F4A3A", "#6E2E2A"]
    },
    lot: { width: [16, 24], depth: [10, 14], front: 6, side: 2.5 },
    props: 0
  },
  {
    ...base,
    id: "mediterranean",
    corner: 0.35,
    turret: 0.2,
    flowers: 0.4,
    ac: 0.12,
    dish: 0.06,
    name: "Mediterranean",
    blurb: "Whitewashed stucco, terracotta, shutters",
    floors: [2, 5],
    groundH: 3.4,
    floorH: 3,
    bay: [2.6, 3.2],
    facade: "punched",
    win: { w: [0.38, 0.46], h: [0.5, 0.62], inset: 0.2, arch: 0.3, mullion: "vertical", sill: true, lintel: false, shutters: 0.85 },
    blankCol: 0.15,
    shops: 0.45,
    balcony: { mode: "cell", chance: 0.3, solid: false, depth: 0.6 },
    bands: 0,
    cornice: 0.15,
    roof: { types: [["hip", 3], ["flat", 1], ["gable", 1]], pitch: [18, 26], overhang: 0.35, parapet: 0.7, dormers: 0, chimneys: 0.3 },
    massing: { shapes: [["rect", 3], ["L", 2], ["U", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#F2EEE6", "#EFE6D6", "#F4E9D8", "#EADBC4", "#F0DDC5"],
      trim: ["#E2D6C2", "#D8CBB4"],
      roof: ["#B5603E", "#A9563A", "#C06F4A", "#9F5236"],
      glass: ["#3E4950"],
      accent: ["#3E6E8E", "#5B7F5C", "#2F5D73", "#7A5A3A"]
    },
    lot: { width: [9, 16], depth: [12, 18], front: 0.5, side: 0 }
  },
  {
    ...base,
    id: "soviet",
    corner: 0.1,
    ac: 0.15,
    dish: 0.1,
    laundry: 0.3,
    shops: 0.3,
    name: "Panel Block",
    blurb: "Prefab slabs with stacked balconies",
    floors: [5, 12],
    groundH: 3,
    floorH: 2.8,
    bay: [3, 3.6],
    facade: "punched",
    win: { w: [0.45, 0.52], h: [0.5, 0.55], inset: 0.12, arch: 0, mullion: "cross", sill: true, lintel: false, shutters: 0 },
    attached: false,
    balcony: { mode: "stack", chance: 0.45, solid: true, depth: 1.1 },
    bands: 3,
    roof: { types: [["flat", 1]], pitch: [0, 0], overhang: 0, parapet: 0.5, dormers: 0, chimneys: 0 },
    massing: { shapes: [["rect", 5], ["L", 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ["#C2BFB6", "#B8B3A6", "#CFC9BB", "#BFC3C2", "#D3C6B4"],
      trim: ["#9E9A90", "#A8A398"],
      roof: ["#7E7A72"],
      glass: ["#3E4950", "#4A565D"],
      accent: ["#8A7F6E", "#6D7F86", "#9C6B54"]
    },
    lot: { width: [34, 70], depth: [13, 16], front: 6, side: 6 },
    props: 0.5
  }
];
var STYLE = Object.fromEntries(STYLES.map((s) => [s.id, s]));
var DISTRICTS = {
  downtown: { name: "Downtown", mix: [["modern", 5], ["artdeco", 3], ["brutalist", 1.5], ["haussmann", 1]] },
  oldtown: { name: "Old Town", mix: [["haussmann", 3], ["victorian", 2], ["tudor", 1], ["mediterranean", 1.5]] },
  residential: { name: "Residential", mix: [["suburban", 6], ["mediterranean", 1], ["victorian", 1]] },
  industrial: { name: "Industrial", mix: [["industrial", 4], ["soviet", 2], ["brutalist", 1]] }
};

// src/engine/details.ts
var SIGNS = ["#2F3B45", "#7A2E2A", "#2F4A3A", "#B8935A", "#1F2427", "#C15F3C", "#3E5C76", "#6B3E5E", "#D9B44A", "#E9E4D8"].map(color);
var INKS = ["#F6EBD2", "#FFFFFF", "#F2C14E"].map(color);
var NEON = ["#FF5E7E", "#5EE6FF", "#FFD25E", "#9DFF7A"].map(color);
var CREAM = color("#F1EADB");
var IRON = color("#2E3133");
var GREY = color("#C4C3BE");
var FOLIAGE = ["#5E7A45", "#6C8A4E", "#4F6B3C"].map(color);
var FLOWERS = ["#C8455A", "#E07A9A", "#E8C547", "#B24A3A", "#F2EDE4", "#8E5BA8"].map(color);
var LAUNDRY = ["#E9E6DE", "#7FA3C8", "#D9675B", "#E8C547", "#9BB48A", "#F2F2F2"].map(color);
function shopBrand(c) {
  const { r } = c;
  const col = r.pick(SIGNS);
  const light = col[0] + col[1] + col[2] > 1.2;
  return {
    col,
    ink: light ? color("#1F2427") : r.chance(0.3) ? r.pick(NEON) : r.pick(INKS),
    awning: r.weighted([["none", 3], ["plain", 2], ["striped", 3]]),
    closed: r.chance(0.08),
    cafe: r.chance(0.2),
    blade: r.chance(0.4)
  };
}
function shopUnit(c, F, u0, u1, v0, v1, w0, br) {
  const { b, r, d } = c;
  const { box, fp, s } = F;
  const top = v1 - 0.22, bot = v1 - 0.74;
  box(b.solid, u0 + 0.05, u1 - 0.05, bot, top, w0, w0 + 0.09, br.col);
  if (d >= 1) letters(c, F, u0 + 0.35, u1 - 0.35, (bot + top) / 2, w0 + 0.095, br.ink, br.closed ? 0 : 2);
  if (br.awning !== "none" && !br.closed) {
    const vt = bot - 0.04, vb = v1 - 1.4, wf = w0 + 1.25;
    const ua0 = u0 + 0.12, ua1 = u1 - 0.12;
    const n = br.awning === "striped" && d >= 1 ? Math.max(2, Math.round((ua1 - ua0) / 0.4)) : 1;
    for (let i = 0; i < n; i++) {
      const ua = ua0 + (ua1 - ua0) * i / n, ub = ua0 + (ua1 - ua0) * (i + 1) / n;
      const col = br.awning === "striped" && i % 2 ? CREAM : br.col;
      b.face(b.solid, [fp(ua, vt, w0 + 0.02), fp(ub, vt, w0 + 0.02), fp(ub, vb, wf), fp(ua, vb, wf)], col, [s.nx, 1, s.nz]);
      if (d >= 1) b.face(b.solid, [fp(ua, vb, wf), fp(ub, vb, wf), fp(ub, vb - 0.22, wf), fp(ua, vb - 0.22, wf)], col, F.out);
    }
    for (const [u, dir] of [[ua0, -1], [ua1, 1]])
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
      const p = fp(u0 + (k + 0.5) * (u1 - u0) / n, 0, w0 + 2);
      b.prism(b.solid, p[0], 0, p[2], 0.04, 0.72, 4, IRON);
      b.prism(b.solid, p[0], 0.72, p[2], 0.38, 0.04, 8, CREAM);
      if (d >= 2)
        for (const dir of [-1, 1]) b.prism(b.solid, p[0] + s.tx * dir * 0.62, 0, p[2] + s.tz * dir * 0.62, 0.17, 0.45, 6, IRON);
      if (r.chance(0.65)) {
        b.prism(b.solid, p[0], 0.76, p[2], 0.03, 1.5, 4, CREAM);
        b.prism(b.solid, p[0], 2, p[2], 1.15, 0.42, 8, br.awning === "none" ? br.col : CREAM, 0);
      }
    }
  }
  if (r.chance(0.35)) {
    const p = fp(u1 - 0.45, 0, w0 + 0.4);
    b.box(b.solid, p[0] - 0.25, 0, p[2] - 0.25, p[0] + 0.25, 0.45, p[2] + 0.25, shade(GREY, 0.8));
    b.prism(b.solid, p[0], 0.45, p[2], 0.3, 0.6, 6, r.pick(FOLIAGE), 0.08);
  }
}
function letters(c, F, uL, uR, vc, w, ink, emit) {
  const { r } = c;
  const glyphs = [];
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
function curtains(c, F, ou0, ou1, ov0, ov1, wi, lit) {
  if (c.d < 1) return;
  const { b, r } = c;
  const col = r.chance(0.2) ? color(r.pick(["#E9E1CF", "#8E4A3E", "#6F7F8C", "#D8CDB5"])) : c.curtain;
  const w = wi + 0.012, emit = lit * 0.6;
  if (r.chance(0.6)) {
    const cw = (ou1 - ou0) * r.range(0.16, 0.3);
    F.quad(b.solid, ou0, ov0, ou0 + cw, ov1, w, col, emit);
    F.quad(b.solid, ou1 - cw, ov0, ou1, ov1, w, col, emit);
  } else F.quad(b.solid, ou0, ov1 - (ov1 - ov0) * r.range(0.2, 0.6), ou1, ov1, w, shade(col, 1.05), emit);
}
function flowerBox(c, F, ou0, ou1, ov0, w0) {
  if (c.d < 1) return;
  const { b, r, d } = c;
  F.box(b.solid, ou0, ou1, ov0 - 0.02, ov0 + 0.17, w0 + 0.02, w0 + 0.26, color(r.pick(["#9C5B3E", "#6B4E37", "#5E6B4A"])));
  F.box(b.solid, ou0 + 0.03, ou1 - 0.03, ov0 + 0.17, ov0 + 0.3, w0 + 0.05, w0 + 0.23, r.pick(FOLIAGE));
  const n = d >= 2 ? Math.max(2, Math.round((ou1 - ou0) / 0.22)) : 1;
  const bloom = r.pick(FLOWERS);
  for (let k = 0; k < n; k++) {
    const ua = ou0 + 0.05 + (ou1 - ou0 - 0.1) * k / n, ub = ua + (ou1 - ou0 - 0.1) / n * (d >= 2 ? 0.6 : 1);
    F.box(b.solid, ua, ub, ov0 + 0.28, ov0 + 0.38, w0 + 0.08, w0 + 0.22, d >= 2 && r.chance(0.3) ? r.pick(FLOWERS) : bloom);
  }
}
function acUnit(c, F, mid, ov0, w0) {
  if (c.d < 1) return;
  F.box(c.b.solid, mid - 0.4, mid + 0.4, ov0 - 0.62, ov0 - 0.14, w0, w0 + 0.42, GREY);
  if (c.d >= 2) F.quad(c.b.solid, mid - 0.3, ov0 - 0.55, mid + 0.18, ov0 - 0.2, w0 + 0.425, shade(GREY, 0.55));
}
function dish(c, F, u, v, w0) {
  const { b } = c;
  const { s } = F;
  const n = norm([s.nx * 0.8 + s.tx * 0.3, 0.45, s.nz * 0.8 + s.tz * 0.3]);
  const ua = norm(cross([0, 1, 0], n)), va = cross(n, ua);
  F.box(b.solid, u - 0.03, u + 0.03, v - 0.03, v + 0.03, w0, w0 + 0.3, IRON);
  disc(b, b.solid, F.fp(u, v, w0 + 0.32), ua, va, 0.34, 8, GREY);
}
function oriel(c, F, u0, u1, v0, v1, w0) {
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
    for (const [u, dir] of [[ua - 0.01, -1], [ub + 0.01, 1]])
      b.face(b.glass, [fp(u, g0, w0 + 0.15), fp(u, g0, w0 + dep - 0.12), fp(u, g1, w0 + dep - 0.12), fp(u, g1, w0 + 0.15)], glass, [s.tx * dir, 0, s.tz * dir], emit);
    if (lv > v0) box(b.solid, ua - 0.03, ub + 0.03, lv - 0.06, lv + 0.06, w0, w0 + dep + 0.03, c.trim);
  }
}
function fireEscape(c, F, u0, u1, levels) {
  const { b } = c;
  const { box, quad, fp } = F;
  const dep = 1.2;
  levels.forEach((v, k) => {
    box(b.solid, u0, u1, v - 0.06, v, 0, dep, IRON);
    box(b.solid, u0, u1, v + 0.95, v + 1, dep - 0.04, dep, IRON);
    box(b.solid, u0, u0 + 0.04, v + 0.95, v + 1, 0, dep, IRON);
    box(b.solid, u1 - 0.04, u1, v + 0.95, v + 1, 0, dep, IRON);
    for (let u = u0 + 0.25; u < u1; u += 0.5) quad(b.solid, u - 0.015, v, u + 0.015, v + 0.97, dep - 0.02, IRON);
    const next = levels[k + 1];
    if (next !== void 0) {
      const [ua, ub] = k % 2 ? [u0 + 0.3, u1 - 0.9] : [u1 - 0.3, u0 + 0.9];
      b.face(b.solid, [fp(ua, v, 0.3), fp(ua, v, 0.9), fp(ub, next, 0.9), fp(ub, next, 0.3)], IRON, [0, 1, 0]);
    }
  });
  const v0 = levels[0];
  for (const u of [u0 + 0.3, u0 + 0.75]) box(b.solid, u - 0.02, u + 0.02, v0 - 2.4, v0, 0.55, 0.59, IRON);
}
function drainpipe(c, F, u, top) {
  const p = F.fp(u, 0, 0.1);
  c.b.prism(c.b.solid, p[0], 0, p[2], 0.06, top, 4, color("#5A5D5F"));
}
function balconyLife(c, F, u0, u1, v0, w0, dep) {
  const { b, r, st } = c;
  if (r.chance(0.5)) {
    const p = F.fp(u0 + 0.3, v0, w0 + dep - 0.3);
    b.prism(b.solid, p[0], v0, p[2], 0.17, 0.3, 6, color("#9C5B3E"));
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
function roofLife(c, place, y) {
  const { b, r, st, d } = c;
  if (c.solar) {
    c.solar = false;
    const panel = color("#22324A");
    for (let k = 0; k < 8; k++) {
      const p = place(1);
      if (!p) break;
      const [x, z] = p;
      b.face(b.glass, [[x - 0.8, y + 0.25, z + 0.5], [x + 0.8, y + 0.25, z + 0.5], [x + 0.8, y + 0.85, z - 0.5], [x - 0.8, y + 0.85, z - 0.5]], panel, [0, 1, 0.5]);
    }
  }
  if (d >= 2 && ["victorian", "haussmann", "soviet", "brutalist", "mediterranean", "industrial"].includes(st.id) && r.chance(0.6)) {
    for (let k = r.int(1, 3); k > 0; k--) {
      const p = place(0.4);
      if (!p) break;
      b.prism(b.solid, p[0], y, p[1], 0.03, 2.4, 4, IRON);
      for (const [h, l] of [[1.7, 0.9], [2, 0.7], [2.3, 0.5]]) b.box(b.solid, p[0] - l / 2, y + h, p[1] - 0.015, p[0] + l / 2, y + h + 0.03, p[1] + 0.015, IRON);
    }
  }
  if (r.chance(st.dish * 4)) {
    const p = place(0.6);
    if (p) {
      b.prism(b.solid, p[0], y, p[1], 0.04, 0.7, 4, IRON);
      disc(b, b.solid, [p[0], y + 0.8, p[1]], [1, 0, 0], norm([0, 0.6, -0.8]), 0.45, 8, GREY);
    }
  }
  if (d >= 2 && (st.id === "modern" || st.id === "mediterranean") && r.chance(0.35)) {
    const p = place(2.4);
    if (p) {
      const [x, z] = p;
      b.face(b.solid, [[x - 2, y + 0.06, z - 2], [x + 2, y + 0.06, z - 2], [x + 2, y + 0.06, z + 2], [x - 2, y + 0.06, z + 2]], color("#9B7A58"), [0, 1, 0]);
      for (const dx of [-0.9, 0.9]) {
        b.prism(b.solid, x + dx, y, z, 0.03, 2.1, 4, CREAM);
        b.prism(b.solid, x + dx, y + 1.9, z, 1, 0.35, 8, color(r.pick(["#E9E4D8", "#C15F3C", "#3E5C76"])), 0);
      }
      b.prism(b.solid, x - 1.7, y, z + 1.7, 0.3, 0.5, 6, shade(GREY, 0.8));
      b.prism(b.solid, x - 1.7, y + 0.5, z + 1.7, 0.4, 0.7, 6, r.pick(FOLIAGE), 0.1);
    }
  }
}
function solarSlope(c, m, y, pitch, gable) {
  const tan = Math.tan(pitch);
  const half = (m.B1 - m.B0) / 2;
  const inset = gable ? 0.6 : half + 0.3;
  const a0 = m.A0 + inset, a1 = m.A1 - inset, q0 = 0.6, q1 = half - 0.5;
  const cols = Math.min(8, Math.floor((a1 - a0) / 1.05)), rows = Math.min(3, Math.floor((q1 - q0) / 1.75));
  if (cols < 1 || rows < 1) return;
  const sa = (a0 + a1) / 2 - cols * 1.05 / 2, sq = q0;
  const at = (a, q) => m.p(a, m.B1 - q, y + q * tan + 0.06);
  const panel = color("#22324A");
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const a = sa + i * 1.05, q = sq + j * 1.75;
      c.b.face(c.b.glass, [at(a, q), at(a + 1, q), at(a + 1, q + 1.7), at(a, q + 1.7)], panel, [m.dirB[0], 1, m.dirB[2]]);
    }
}
function norm(v) {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// src/engine/building.ts
var UP = [0, 1, 0];
var DOWN = [0, -1, 0];
var FLAT_TOPS = ["flat", "spire", "dome", "onion"];
function filled(g, x, z) {
  const i = Math.floor((x + g.W / 2) / g.cx);
  const j = Math.floor((z + g.D / 2) / g.cz);
  return i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.cells[i + j * g.nx] === 1;
}
function seg(ax, az, bx, bz, extra = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / len, tz = (bz - az) / len;
  return { x0: ax, z0: az, tx, tz, nx: -tz, nz: tx, len, cv0: true, cv1: true, ...extra };
}
function outline(g) {
  const at = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.cells[i + j * g.nx] === 1;
  const runs = /* @__PURE__ */ new Map();
  const add = (key, k) => (runs.get(key) ?? runs.set(key, []).get(key)).push(k);
  for (let j = 0; j < g.nz; j++)
    for (let i = 0; i < g.nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add(`0,-1,${j}`, i);
      if (!at(i, j + 1)) add(`0,1,${j + 1}`, i);
      if (!at(i - 1, j)) add(`-1,0,${i}`, j);
      if (!at(i + 1, j)) add(`1,0,${i + 1}`, j);
    }
  const segs = [];
  const X = (i) => -g.W / 2 + i * g.cx;
  const Z = (j) => -g.D / 2 + j * g.cz;
  const e = 1e-4;
  for (const [key, ks] of runs) {
    const [nx, nz, line] = key.split(",").map(Number);
    ks.sort((a, b) => a - b);
    let start = ks[0];
    for (let k = 1; k <= ks.length; k++) {
      if (k < ks.length && ks[k] === ks[k - 1] + 1) continue;
      const end = ks[k - 1] + 1;
      const tx = nz, tz = -nx;
      let a, len;
      if (nx === 0) {
        len = (end - start) * g.cx;
        a = [tx > 0 ? X(start) : X(end), Z(line)];
      } else {
        len = (end - start) * g.cz;
        a = [X(line), tz > 0 ? Z(start) : Z(end)];
      }
      const bx = a[0] + tx * len, bz = a[1] + tz * len;
      segs.push({
        x0: a[0],
        z0: a[1],
        tx,
        tz,
        nx,
        nz,
        len,
        cv0: !filled(g, a[0] - tx * e - nx * e, a[1] - tz * e - nz * e),
        cv1: !filled(g, bx + tx * e - nx * e, bz + tz * e - nz * e)
      });
      if (k < ks.length) start = ks[k];
    }
  }
  return segs;
}
function ellipseSegs(e, bay) {
  const { a, b } = e;
  const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const n = Math.max(10, Math.round(perim / bay));
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n * Math.PI * 2;
    return [e.x + a * Math.cos(t), e.z - b * Math.sin(t)];
  });
  return pts.slice(0, n).map((p, i) => seg(p[0], p[1], pts[i + 1][0], pts[i + 1][1], { rc: [e.x, e.z, a, b] }));
}
function roundCorner(c, tier, segs, corner) {
  const g = tier.grid, rr = tier.rects[0];
  const [px, pz] = [[rr.x0, rr.z1], [rr.x1, rr.z1], [rr.x1, rr.z0], [rr.x0, rr.z0]][corner];
  const near = (a, b) => Math.abs(a - b) < 1e-6;
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
  const n = Math.max(2, Math.round(Math.PI / 2 * ((rA + rB) / 2) / (c.bay * 0.85)));
  const arc = Array.from({ length: n + 1 }, (_, i) => {
    const phi = i / n * (Math.PI / 2);
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
function makeGrid(nx, nz, W, D, keep) {
  const cells = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) cells[i + j * nx] = keep(i, j) ? 1 : 0;
  return { nx, nz, cx: W / nx, cz: D / nz, W, D, cells };
}
function footprint(shape, nx, nz, W, D, r) {
  const rect = (i0, j0, i1, j1, axis) => ({
    x0: -W / 2 + i0 * W / nx,
    x1: -W / 2 + i1 * W / nx,
    z0: -D / 2 + j0 * D / nz,
    z1: -D / 2 + j1 * D / nz,
    axis
  });
  const fb = Math.min(nz - 1, Math.max(2, Math.round(nz * r.range(0.45, 0.6))));
  const back = nz - fb;
  const wingCap = Math.max(1, Math.floor(fb * D / nz / (W / nx)));
  const wing = (max) => Math.max(1, Math.min(wingCap, max, Math.round(nx * r.range(0.28, 0.42))));
  const main = rect(0, back, nx, nz, nx >= fb ? "x" : "z");
  const ridge = nz - fb / 2;
  switch (shape) {
    case "L": {
      const w = wing(nx - 1);
      const i0 = r.chance(0.5) ? 0 : nx - w;
      return { grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || i >= i0 && i < i0 + w), rects: [main, rect(i0, 0, i0 + w, ridge, "z")] };
    }
    case "T": {
      const w = wing(nx - 2);
      const i0 = Math.floor((nx - w) / 2);
      return { grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || i >= i0 && i < i0 + w), rects: [main, rect(i0, 0, i0 + w, ridge, "z")] };
    }
    case "U": {
      const w = Math.min(wing(Math.floor((nx - 1) / 2)), Math.floor((nx - 1) / 2));
      return {
        grid: makeGrid(nx, nz, W, D, (i, j) => j >= back || i < w || i >= nx - w),
        rects: [main, rect(0, 0, w, ridge, "z"), rect(nx - w, 0, nx, ridge, "z")]
      };
    }
    case "court": {
      const t = Math.max(1, Math.min(Math.floor((Math.min(nx, nz) - 1) / 2), Math.round(Math.min(nx, nz) * 0.3)));
      return {
        grid: makeGrid(nx, nz, W, D, (i, j) => i < t || j < t || i >= nx - t || j >= nz - t),
        rects: [rect(0, nz - t, nx, nz, "x"), rect(0, 0, nx, t, "x"), rect(0, t / 2, t, nz - t / 2, "z"), rect(nx - t, t / 2, nx, nz - t / 2, "z")]
      };
    }
    default:
      return { grid: makeGrid(nx, nz, W, D, () => true), rects: [rect(0, 0, nx, nz, W >= D ? "x" : "z")] };
  }
}
function fits(shape, nx, nz, W, D) {
  if (shape === "rect") return true;
  if (shape === "round") return W >= 8 && D >= 8;
  if (shape === "L") return nx >= 3 && nz >= 3;
  if (shape === "T") return nx >= 4 && nz >= 3;
  if (shape === "U") return nx >= 5 && nz >= 3;
  return nx >= 5 && nz >= 5;
}
var tint = (c, r) => [c[0] * r.range(0.95, 1.05), c[1] * r.range(0.95, 1.05), c[2] * r.range(0.95, 1.05)];
var CURTAINS = ["#E9E1CF", "#D8CDB5", "#B8A58A", "#8E4A3E", "#6F7F8C", "#EDE8DD", "#A88F6A"];
function generateBuilding(b, p) {
  const st = p.style;
  const r = rng(p.seed);
  const pick = (arr) => tint(color(r.pick(arr)), r);
  const bay = r.range(...st.bay);
  const nx = Math.max(2, Math.round(p.width / bay));
  const nz = Math.max(2, Math.round(p.depth / bay));
  let shape = p.shape && p.shape !== "auto" ? p.shape : r.weighted(st.massing.shapes);
  if (!fits(shape, nx, nz, p.width, p.depth)) shape = "rect";
  const floors = p.floors ?? Math.max(1, Math.round(r.int(...st.floors) * (p.heightScale ?? 1)));
  let roofType = p.roof && p.roof !== "auto" ? p.roof : r.weighted(st.roof.types);
  if (shape === "round" && ["gable", "hip", "mansard"].includes(roofType)) roofType = "cone";
  if (shape !== "round" && roofType === "cone") roofType = "hip";
  const flatTop = FLAT_TOPS.includes(roofType);
  const wall = pick(st.palette.wall);
  const c = {
    b,
    r,
    st,
    d: p.detail,
    floors,
    bay,
    groundH: st.groundH * r.range(0.95, 1.08),
    floorH: st.floorH * r.range(0.96, 1.04),
    winW: r.range(...st.win.w),
    winH: r.range(...st.win.h),
    arch: r.chance(st.win.arch),
    shutters: r.chance(st.win.shutters),
    shops: r.chance(st.shops),
    lit: r.range(0.2, 0.55),
    curtains: st.facade === "curtain" ? 0 : r.range(0.2, 0.7),
    curtain: color(r.pick(CURTAINS)),
    doorW: st.door?.[0] ?? r.range(1.2, 1.7),
    doorH: st.door?.[1] ?? r.range(2.3, 2.8),
    doorPlaced: false,
    fireDone: false,
    solar: r.chance(st.solar),
    balconyRows: /* @__PURE__ */ new Set(),
    open: new Set(p.open === "left" ? [-1] : p.open === "right" ? [1] : p.open === "both" ? [-1, 1] : []),
    reserve: p.reserve ?? [],
    wall,
    baseWall: st.palette.base ? pick(st.palette.base) : wall,
    trim: pick(st.palette.trim),
    roof: r.chance(st.greenRoof) ? color(r.pick(["#8A9A68", "#7E9160", "#94A372"])) : pick(st.palette.roof),
    glass: pick(st.palette.glass),
    accent: pick(st.palette.accent),
    spandrel: st.palette.spandrel ? pick(st.palette.spandrel) : wall
  };
  if (st.balcony.mode === "row" && floors >= 4) {
    c.balconyRows.add(2);
    c.balconyRows.add(floors - 1);
  }
  let corner = p.corner ?? "auto";
  if (corner === "auto") corner = r.chance(flatTop ? st.corner : st.turret) ? r.pick(["left", "right", "both"]) : "none";
  const cornerIds = corner === "left" ? [0] : corner === "right" ? [1] : corner === "both" ? [0, 1] : [];
  const rounded = flatTop && shape === "rect" && st.corner > 0 ? cornerIds : [];
  const turrets = !flatTop && shape !== "round" && st.turret > 0 ? cornerIds : [];
  const tiers = [];
  if (shape === "rect" || shape === "round") {
    const podium = floors >= 6 && r.chance(st.massing.podium);
    const maxInset = Math.floor((Math.min(nx, nz) - 2) / 2);
    const count = Math.min(r.int(...st.massing.tiers), maxInset + 1, Math.max(1, Math.floor(floors / 3)));
    let f = 0, inset = 0;
    const W = p.width, D = p.depth;
    for (let t = 0; t < count && f < floors; t++) {
      const left = floors - f;
      const n = t === count - 1 ? left : Math.max(1, t === 0 && podium ? Math.min(left - 1, r.int(2, 4)) : Math.round(left * r.range(0.45, 0.65)));
      const k = inset;
      const round = shape === "round" ? { x: 0, z: 0, a: W / 2 - k * W / nx, b: D / 2 - k * D / nz } : void 0;
      const inside = (i, j) => {
        if (!round) return i >= k && j >= k && i < nx - k && j < nz - k;
        const x = -W / 2 + (i + 0.5) * W / nx, z = -D / 2 + (j + 0.5) * D / nz;
        return (x / round.a) ** 2 + (z / round.b) ** 2 <= 1;
      };
      tiers.push({
        grid: makeGrid(nx, nz, W, D, inside),
        rects: [{ x0: -W / 2 + k * W / nx, x1: W / 2 - k * W / nx, z0: -D / 2 + k * D / nz, z1: D / 2 - k * D / nz, axis: nx >= nz ? "x" : "z" }],
        f0: f,
        f1: f + n,
        round,
        fans: []
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
    let front;
    if (tier.f0 === 0) {
      front = tier.round ? segs.reduce((a, s) => s.nz > a.nz ? s : a) : segs.filter((s) => s.nz > 0.99).reduce((a, s) => s.z0 > a.z0 + 1e-6 || Math.abs(s.z0 - a.z0) < 1e-6 && s.len > a.len ? s : a);
      for (const s of segs) {
        if (tier.round && s.nz > 0.4 || !tier.round && s.nz > 0.99 && Math.abs(s.z0 - front.z0) < 1e-6) s.street = true;
        if (!s.rc && Math.abs(s.nx) > 0.99 && c.open.has(s.nx) && Math.abs(Math.abs(s.x0) - p.width / 2) < 1e-6) s.street = true;
      }
    }
    for (const s of segs) facade(c, s, tier, flat, s === front);
    if (flat) flatRoof(c, tier, isTop ? roofType : "flat");
    else if (tier.round) roundRoof(c, tier, roofType);
    else for (const rr of tier.rects) pitchedRoof(c, tier, rr, roofType);
  }
  for (const id of turrets) turret(c, id, p.width, p.depth, top);
  if (!flatTop && shape !== "round" && r.chance(st.roof.chimneys)) chimneys(c, top, roofType);
  return { style: st.id, shape, roof: roofType, floors, height: base2(c, floors) };
}
var base2 = (c, f) => f === 0 ? 0 : c.groundH + (f - 1) * c.floorH;
var height = (c, f) => f === 0 ? c.groundH : c.floorH;
var jetty = (c, tier, f) => tier.f0 === 0 && f >= 1 ? c.st.jetty : 0;
function facade(c, s, tier, flatTop, front) {
  const { b, r, st, d } = c;
  const fp = (u, v, w) => [s.x0 + s.tx * u + s.nx * w, v, s.z0 + s.tz * u + s.nz * w];
  const out = [s.nx, 0, s.nz];
  const quad = (part, u0, v0, u1, v1, w, col, emit = 0) => b.face(part, [fp(u0, v0, w), fp(u1, v0, w), fp(u1, v1, w), fp(u0, v1, w)], col, out, emit);
  const box = (part, u0, u1, v0, v1, w0, w1, col, emit = 0) => {
    const pts = [];
    for (let k = 0; k < 8; k++) pts.push(fp(k & 1 ? u1 : u0, k & 2 ? v1 : v0, k & 4 ? w1 : w0));
    b.hexa(part, pts, col, emit);
  };
  const F = { s, out, fp, quad, box };
  const ext = (cv, w) => cv ? w : 0;
  if (s.rc) b.smooth = { cx: s.rc[0], cy: 0, cz: s.rc[1], rx: s.rc[2], ry: 0, rz: s.rc[3], ref: out };
  const nb = Math.max(1, Math.round(s.len / c.bay));
  const bw = s.len / nb;
  const side = Math.abs(s.nx) > 0.5 && !s.rc;
  const partyWall = st.attached && side && !s.street && r.chance(0.85);
  const half = Math.ceil(nb / 2);
  const winCol = [];
  const stackCol = [];
  for (let i = 0; i < half; i++) {
    winCol[i] = winCol[nb - 1 - i] = !partyWall && !r.chance(s.street ? st.blankCol * 0.4 : st.blankCol);
    stackCol[i] = stackCol[nb - 1 - i] = st.balcony.mode === "stack" && r.chance(st.balcony.chance);
  }
  const doorBay = front && !c.doorPlaced ? Math.floor(nb / 2) : -1;
  if (doorBay >= 0) c.doorPlaced = true;
  const top = base2(c, tier.f1);
  const curtain = st.facade === "curtain";
  const units = [];
  const unitOf = [];
  if (tier.f0 === 0 && s.street && c.shops && !curtain) {
    for (let i = 0; i < nb; ) {
      if (i === doorBay) {
        i++;
        continue;
      }
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
    const v0 = base2(c, f), fh = height(c, f), v1 = v0 + fh;
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
      let kind;
      if (curtain) kind = i === doorBay ? "door" : "shop";
      else if (f === 0 && i === doorBay) kind = "door";
      else if (f === 0 && unitOf[i]) kind = "shop";
      else if (!winCol[i]) kind = "wall";
      else if (f > 0 && (row || stackCol[i] || st.balcony.mode === "cell" && r.chance(st.balcony.chance))) kind = "balcony";
      else kind = "window";
      cell(c, F, u0, u1, v0, v1, w0, kind, col, f, unitOf[i]);
      if (kind === "balcony" && !row) balcony(c, F, u0 + 0.2, u1 - 0.2, v0, w0, false);
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
    const v0 = base2(c, Math.max(1, tier.f0));
    for (let i = 0; i <= nb; i++) {
      const u = i * bw;
      if (i === 0 && !s.cv0 || i === nb && !s.cv1) continue;
      box(b.solid, Math.max(0, u - 0.06), Math.min(s.len, u + 0.06), v0, top, 0, 0.14, c.trim);
    }
    if (tier.f0 === 0) box(b.solid, -ext(s.cv0, 0.5), s.len + ext(s.cv1, 0.5), c.groundH - 0.05, c.groundH + 0.35, 0, 0.5, c.trim);
  }
  if (st.pilasters && d >= 1) {
    const pw = Math.min(st.pilasters, bw * 0.3), pd = pw * 0.7;
    const v0 = c.shops && tier.f0 === 0 ? c.groundH : base2(c, tier.f0);
    const vt = top + (flatTop && st.id === "artdeco" ? st.roof.parapet + 1.2 : 0);
    for (let i = 0; i <= nb; i++) {
      if (i === 0 && !s.cv0 || i === nb && !s.cv1) continue;
      const u0 = i === 0 ? 0 : i === nb ? s.len - pw : i * bw - pw / 2;
      box(b.solid, u0, u0 + pw, v0, vt, 0, pd, i === 0 || i === nb ? c.wall : shade(c.wall, 1.04));
    }
  }
  const upper = tier.f1 - Math.max(tier.f0, 1);
  if (front && d >= 1 && !curtain && upper >= 1 && nb >= 2 && r.chance(st.oriel)) {
    const cols = nb >= 5 ? [1, nb - 2] : [Math.floor(nb / 2)];
    for (const i of cols) oriel(c, F, i * bw, (i + 1) * bw, base2(c, Math.max(tier.f0, 1)), top - 0.25, jetty(c, tier, tier.f1 - 1));
  }
  if (d >= 2 && !c.fireDone && !curtain && (front || side && !partyWall) && nb >= 3 && tier.f1 - tier.f0 >= 3 && r.chance(st.fireEscape)) {
    c.fireDone = true;
    const i = front ? doorBay === 0 ? 1 : 0 : Math.floor(nb / 2) - 1;
    const levels = Array.from({ length: tier.f1 - Math.max(1, tier.f0) }, (_, k) => base2(c, Math.max(1, tier.f0) + k));
    fireEscape(c, F, i * bw + 0.15, Math.min(s.len, (i + 2) * bw) - 0.15, levels);
  }
  if (d >= 1 && s.cv1 && !curtain && !s.rc && st.id !== "artdeco" && s.len > 4 && tier.f0 === 0) drainpipe(c, F, s.len - 0.25, top);
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
function balcony(c, F, u0, u1, v0, w0, row) {
  const { b, st, d } = c;
  const { box, quad } = F;
  const dep = st.balcony.depth;
  const slab = st.balcony.solid ? shade(c.wall, 0.95) : c.trim;
  box(b.solid, u0, u1, v0 - 0.16, v0 + 0.02, w0, w0 + dep, slab);
  if (d < 1) return;
  if (st.balcony.solid) {
    box(b.solid, u0, u1, v0, v0 + 1, w0 + dep - 0.08, w0 + dep, slab);
    box(b.solid, u0, u0 + 0.08, v0, v0 + 1, w0, w0 + dep, slab);
    box(b.solid, u1 - 0.08, u1, v0, v0 + 1, w0, w0 + dep, slab);
  } else {
    box(b.solid, u0, u1, v0 + 0.95, v0 + 1, w0 + dep - 0.05, w0 + dep, c.accent);
    box(b.solid, u0, u1, v0 + 0.05, v0 + 0.1, w0 + dep - 0.04, w0 + dep - 0.01, c.accent);
    const step = d >= 2 ? 0.14 : 0.45;
    for (let u = u0 + step / 2; u < u1; u += step) quad(b.solid, u - 0.012, v0, u + 0.012, v0 + 0.97, w0 + dep - 0.03, c.accent);
  }
  if (d >= 2 && !row) balconyLife(c, F, u0, u1, v0, w0, dep);
}
function cell(c, F, u0, u1, v0, v1, w0, kind, col, f, brand) {
  const { b, r, st, d } = c;
  const { s, fp, quad, box } = F;
  const fh = v1 - v0, cw = u1 - u0, mid = (u0 + u1) / 2;
  if (st.bands === 3 || st.id === "brutalist") col = shade(col, r.range(0.95, 1.05));
  if (kind === "wall") {
    quad(b.solid, u0, v0, u1, v1, w0, col);
    if (st.timber && f > 0 && d >= 1) brace(c, F, u0 + 0.09, u1 - 0.09, v0 + 0.2, v1 - 0.16, w0 + 0.03);
    return;
  }
  let ou0, ou1, ov0, ov1, ins;
  const wh = fh * c.winH, ww = cw * c.winW;
  const sillV = v0 + (fh - wh) * 0.6;
  if (kind === "door") {
    const dw = Math.min(cw * 0.75, c.doorW);
    ou0 = mid - dw / 2;
    ou1 = mid + dw / 2;
    ov0 = v0;
    ov1 = v0 + Math.min(fh - 0.45, c.doorH);
    ins = 0.3;
  } else if (kind === "shop") {
    ou0 = u0 + 0.22;
    ou1 = u1 - 0.22;
    ov0 = v0 + 0.4;
    ov1 = v1 - 0.85;
    ins = 0.15;
  } else {
    ou0 = mid - ww / 2;
    ou1 = mid + ww / 2;
    ov0 = kind === "balcony" ? v0 + 0.02 : sillV;
    ov1 = sillV + wh;
    ins = st.win.inset;
  }
  if (st.facade === "curtain" && kind !== "door") {
    ou0 = u0 + 0.18;
    ou1 = u1 - 0.18;
    ov0 = v0;
    ov1 = v1 - 0.55;
    ins = 0.5;
  }
  const solidDoor = kind === "door" && st.facade !== "curtain";
  const closed = brand?.closed ?? false;
  const fill = solidDoor ? c.accent : closed ? color("#8C8E8F") : shade(c.glass, r.range(0.86, 1.12));
  const lit = !solidDoor && !closed && r.chance(c.lit) ? r.range(0.45, 1) : 0;
  const emit = closed ? 0 : kind === "shop" || st.facade === "curtain" && f === 0 ? 1 : lit;
  const fillPart = solidDoor || closed ? b.solid : b.glass;
  if (d === 0) {
    quad(b.solid, u0, v0, u1, v1, w0, col);
    quad(fillPart, ou0, ov0, ou1, ov1, w0 + 0.03, fill, emit);
    return;
  }
  const spand = st.palette.spandrel && kind === "window" ? c.spandrel : col;
  quad(b.solid, u0, v0, ou0, v1, w0, col);
  quad(b.solid, ou1, v0, u1, v1, w0, col);
  quad(b.solid, ou0, v0, ou1, ov0, w0, spand);
  quad(b.solid, ou0, ov1, ou1, v1, w0, spand);
  const wi = w0 - ins, dark = shade(col, 0.78);
  const T = [s.tx, 0, s.tz], NT = [-s.tx, 0, -s.tz];
  b.face(b.solid, [fp(ou0, ov0, w0), fp(ou0, ov0, wi), fp(ou0, ov1, wi), fp(ou0, ov1, w0)], dark, T);
  b.face(b.solid, [fp(ou1, ov0, w0), fp(ou1, ov0, wi), fp(ou1, ov1, wi), fp(ou1, ov1, w0)], dark, NT);
  b.face(b.solid, [fp(ou0, ov0, w0), fp(ou1, ov0, w0), fp(ou1, ov0, wi), fp(ou0, ov0, wi)], st.win.sill ? c.trim : col, UP);
  b.face(b.solid, [fp(ou0, ov1, w0), fp(ou1, ov1, w0), fp(ou1, ov1, wi), fp(ou0, ov1, wi)], shade(col, 0.6), DOWN);
  quad(fillPart, ou0, ov0, ou1, ov1, wi, fill, emit);
  if (closed && d >= 2) for (let v = ov0 + 0.25; v < ov1; v += 0.25) quad(b.solid, ou0, v - 0.02, ou1, v + 0.02, wi + 0.01, shade(fill, 0.75));
  const wa = kind === "window" || kind === "balcony";
  const arch = c.arch && wa && ov1 - ov0 > ou1 - ou0;
  if (arch) {
    const R = (ou1 - ou0) / 2, cv = ov1 - R, n = d >= 2 ? 6 : 3;
    const arc = (t) => fp(mid + R * Math.cos(t), cv + R * Math.sin(t), w0 + 2e-3);
    for (let k = 0; k < n; k++) {
      const a0 = k / n * (Math.PI / 2), a1 = (k + 1) / n * (Math.PI / 2);
      b.face(b.solid, [fp(ou1, ov1, w0 + 2e-3), arc(a0), arc(a1)], col, F.out);
      b.face(b.solid, [fp(ou0, ov1, w0 + 2e-3), arc(Math.PI - a0), arc(Math.PI - a1)], col, F.out);
    }
    if (d >= 2) box(b.solid, mid - 0.12, mid + 0.12, ov1 - 0.3, ov1 + 0.05, w0, w0 + 0.06, c.trim);
  }
  if (wa && r.chance(c.curtains)) curtains(c, F, ou0, ou1, ov0, arch ? ov1 - (ou1 - ou0) / 2 : ov1, wi, lit);
  if (kind === "window" && st.win.sill) box(b.solid, ou0 - 0.08, ou1 + 0.08, ov0 - 0.07, ov0, w0, w0 + 0.1, c.trim);
  if (wa && st.win.lintel && !arch) box(b.solid, ou0 - 0.1, ou1 + 0.1, ov1, ov1 + 0.17, w0, w0 + 0.05, c.trim);
  if (wa && c.shutters) {
    const sw = Math.min(ww / 2, ou0 - u0 - 0.03);
    if (sw > 0.2) {
      box(b.solid, ou0 - sw, ou0, ov0, ov1, w0, w0 + 0.04, c.accent);
      box(b.solid, ou1, ou1 + sw, ov0, ov1, w0, w0 + 0.04, c.accent);
    }
  }
  if (kind === "window" && f > 0) {
    if (r.chance(st.flowers)) flowerBox(c, F, ou0, ou1, ov0, w0);
    else if (r.chance(st.ac)) acUnit(c, F, mid, ov0, w0);
    if (d >= 2 && r.chance(st.dish)) dish(c, F, Math.min(u1 - 0.4, ou1 + 0.4), ov1 - 0.2, w0);
  }
  if (d >= 2 && (wa || kind === "shop") && !closed) {
    const m = kind === "shop" ? "vertical" : st.win.mullion;
    const fw0 = wi, fw1 = wi + 0.05, t = 0.035;
    const vbar = (u) => box(b.solid, u - t, u + t, ov0, ov1, fw0, fw1, c.trim);
    const hbar = (v) => box(b.solid, ou0, ou1, v - t, v + t, fw0, fw1, c.trim);
    if (m === "vertical" || m === "cross") vbar(mid);
    if (m === "cross") hbar(ov0 + (ov1 - ov0) * 0.58);
    if (m === "grid") {
      vbar(ou0 + (ou1 - ou0) / 3);
      vbar(ou0 + 2 * (ou1 - ou0) / 3);
      hbar(ov0 + (ov1 - ov0) / 3);
      hbar(ov0 + 2 * (ov1 - ov0) / 3);
    }
  }
  if (kind === "door") {
    box(b.solid, ou0 - 0.35, ou1 + 0.35, ov1 + 0.2, ov1 + 0.32, w0, w0 + 0.9, st.facade === "curtain" ? c.spandrel : c.trim);
    if (st.plinth) box(b.solid, ou0 - 0.25, ou1 + 0.25, 0, 0.16, w0, w0 + 0.55, shade(c.baseWall, 0.85));
    if (d >= 2 && solidDoor) box(b.solid, mid - 0.025, mid + 0.025, ov0, ov1, wi, wi + 0.04, shade(c.accent, 0.6));
    if (d >= 1) box(b.solid, ou0 + 0.1, ou1 - 0.1, ov1 + 0.05, ov1 + 0.18, wi, wi + 0.02, c.glass, 0.8);
  }
  if (st.timber && f > 0 && wa && ov0 - v0 > 0.5) {
    brace(c, F, u0 + 0.09, ou0, v0 + 0.2, ov0, w0 + 0.03);
    brace(c, F, ou1, u1 - 0.09, v0 + 0.2, ov0, w0 + 0.03);
  }
}
function brace(c, F, u0, u1, v0, v1, w) {
  if (u1 - u0 < 0.3 || v1 - v0 < 0.3) return;
  const { fp, out } = F, t = 0.08;
  c.b.face(c.b.solid, [fp(u0, v0, w), fp(u0 + t * 2, v0, w), fp(u1, v1, w), fp(u1 - t * 2, v1, w)], c.trim, out);
  c.b.face(c.b.solid, [fp(u1, v0, w + 5e-3), fp(u1 - t * 2, v0, w + 5e-3), fp(u0, v1, w + 5e-3), fp(u0 + t * 2, v1, w + 5e-3)], c.trim, out);
}
function turret(c, corner, W, D, top) {
  const { b, r, st, d } = c;
  const sx = corner === 0 ? -1 : 1;
  const px = sx * W / 2, pz = D / 2;
  const rad = Math.min(Math.max(Math.min(W, D) * 0.13, 1.5), 2.6);
  const k = rad * 0.35 / Math.SQRT2;
  const cx = px + sx * k, cz = pz + k;
  const seg2 = d >= 1 ? 14 : 8;
  const startF = st.id === "haussmann" || r.chance(0.4) ? 1 : 0;
  const y0 = base2(c, startF), yt = base2(c, top.f1) + c.floorH * 0.6;
  b.smooth = { cx, cy: 0, cz, rx: rad, ry: 0, rz: rad };
  b.prism(b.solid, cx, y0, cz, rad, yt - y0, seg2, c.wall);
  if (startF > 0) b.prism(b.solid, cx, y0 - 1.1, cz, rad * 0.25, 1.1, seg2, c.trim, rad);
  const dir = [sx / Math.SQRT2, 0, 1 / Math.SQRT2];
  const levels = Array.from({ length: c.floors - startF }, (_, i) => startF + i);
  for (const f of levels) {
    const fh = height(c, f), wh = fh * c.winH * 0.9, v0 = base2(c, f) + (fh - wh) * 0.6;
    for (let i = 0; i < seg2; i++) {
      const a = (i + 0.5) / seg2 * Math.PI * 2;
      const n = [Math.cos(a), 0, -Math.sin(a)];
      if (n[0] * dir[0] + n[2] * dir[2] < -0.05 || d === 0 && i % 2) continue;
      const a0 = a - Math.PI / seg2 * 0.5, a1 = a + Math.PI / seg2 * 0.5, R = rad * Math.cos(Math.PI / seg2) + 0.02;
      const P = (t, v) => [cx + Math.cos(t) * R / Math.cos(t - a), v, cz - Math.sin(t) * R / Math.cos(t - a)];
      b.face(b.glass, [P(a0, v0), P(a1, v0), P(a1, v0 + wh), P(a0, v0 + wh)], shade(c.glass, r.range(0.9, 1.1)), n, r.chance(c.lit) ? 0.8 : 0);
    }
    if (d >= 1 && f > startF) b.prism(b.solid, cx, base2(c, f) - 0.1, cz, rad + 0.07, 0.2, seg2, c.trim);
  }
  b.smooth = null;
  b.prism(b.solid, cx, yt - 0.35, cz, rad + 0.25, 0.35, seg2, c.trim);
  if (st.id === "haussmann") dome(b, b.solid, cx, yt, cz, rad + 0.1, rad + 0.1, rad * 1.5, c.roof, seg2, ONION);
  else b.prism(b.solid, cx, yt, cz, rad + 0.3, rad * 2.6, seg2, c.roof, 0);
  b.prism(b.solid, cx, yt + (st.id === "haussmann" ? rad * 1.45 : rad * 2.5), cz, 0.06, 1.2, 4, c.trim, 0.01);
}
function flatRoof(c, tier, type) {
  const { b, r, st, d } = c;
  const g = tier.grid;
  const y = base2(c, tier.f1);
  const X = (i) => -g.W / 2 + i * g.cx, Z = (j) => -g.D / 2 + j * g.cz;
  if (tier.round) {
    const segs = ellipseSegs(tier.round, c.bay);
    for (const s of segs) b.face(b.solid, [[tier.round.x, y, tier.round.z], [s.x0, y, s.z0], [s.x0 + s.tx * s.len, y, s.z0 + s.tz * s.len]], c.roof, UP);
  } else {
    for (let j = 0; j < g.nz; j++) {
      let i = 0;
      while (i < g.nx) {
        if (!g.cells[i + j * g.nx]) {
          i++;
          continue;
        }
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
  const used = [...c.reserve];
  if (type === "spire") {
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
  if (type === "dome" || type === "onion") {
    const rad = span * 0.3, seg2 = d >= 1 ? 20 : 12, dh = rad * 0.6;
    b.smooth = { cx, cy: 0, cz, rx: rad, ry: 0, rz: rad };
    b.prism(b.solid, cx, y, cz, rad, dh, seg2, c.wall);
    b.smooth = null;
    b.prism(b.solid, cx, y + dh, cz, rad + 0.25, 0.35, seg2, c.trim);
    dome(b, b.solid, cx, y + dh + 0.35, cz, rad, rad, rad * (type === "onion" ? 1.5 : 0.9), c.roof, seg2, type === "onion" ? ONION : void 0);
    const ly = y + dh + 0.35 + rad * (type === "onion" ? 1.45 : 0.88);
    b.prism(b.solid, cx, ly, cz, rad * 0.12, rad * 0.3, 8, c.trim);
    b.prism(b.solid, cx, ly + rad * 0.3, cz, rad * 0.15, rad * 0.25, 8, c.roof, 0);
    used.push([cx, cz, rad + 0.5]);
  }
  if (d < 1 || tier.f1 !== c.floors) return;
  const free = (x, z, rad) => filled(g, x - rad, z - rad) && filled(g, x + rad, z + rad) && filled(g, x - rad, z + rad) && filled(g, x + rad, z - rad) && used.every(([ux, uz, ur]) => Math.hypot(ux - x, uz - z) > ur + rad + 0.4);
  const place = (rad) => {
    for (let k = 0; k < 12; k++) {
      const x = r.range(rr.x0 + rad + 0.6, rr.x1 - rad - 0.6), z = r.range(rr.z0 + rad + 0.6, rr.z1 - rad - 0.6);
      if (free(x, z, rad + 0.5)) {
        used.push([x, z, rad]);
        return [x, z];
      }
    }
    return null;
  };
  const grey = color("#B9B7B1");
  if (c.floors >= 6 && type === "flat") {
    const p = place(1.6);
    if (p) b.box(b.solid, p[0] - 1.4, y, p[1] - 1.4, p[0] + 1.4, y + 3, p[1] + 1.4, shade(c.wall, 0.95));
  }
  if (["industrial", "victorian", "soviet"].includes(st.id) && r.chance(0.5)) {
    const p = place(1.7);
    if (p) {
      const wood = color("#6B5442");
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(b.solid, p[0] + dx * 1.1 - 0.08, y, p[1] + dz * 1.1 - 0.08, p[0] + dx * 1.1 + 0.08, y + 2, p[1] + dz * 1.1 + 0.08, color("#3A3A3A"));
      b.prism(b.solid, p[0], y + 2, p[1], 1.5, 2.6, d >= 2 ? 12 : 8, wood);
      b.prism(b.solid, p[0], y + 4.6, p[1], 1.6, 1, d >= 2 ? 12 : 8, shade(wood, 0.7), 0);
    }
  }
  const n = Math.min(10, Math.round((rr.x1 - rr.x0) * (rr.z1 - rr.z0) * st.props / 90 * r.range(0.5, 1.4)));
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
function roundRoof(c, tier, type) {
  const { b, st, d } = c;
  const e = tier.round;
  const y = base2(c, tier.f1);
  const seg2 = Math.max(12, ellipseSegs(e, c.bay).length);
  if (type === "cone") {
    const o = st.roof.overhang + 0.2;
    const pitch = (st.roof.pitch[1] || 40) * Math.PI / 180;
    const rise = Math.max(e.a, e.b) * Math.tan(Math.min(pitch, 1.05));
    const ring = Array.from({ length: seg2 }, (_, i) => {
      const t = i / seg2 * Math.PI * 2;
      return [e.x + (e.a + o) * Math.cos(t), y - o * 0.3, e.z - (e.b + o) * Math.sin(t)];
    });
    for (let i = 0; i < seg2; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % seg2];
      b.face(b.solid, [p0, p1, [e.x, y + rise, e.z]], c.roof, [p0[0] - e.x, 1, p0[2] - e.z]);
      b.face(b.solid, [p0, p1, [e.x, y, e.z]], shade(c.wall, 0.7), DOWN);
    }
    b.prism(b.solid, e.x, y + rise - 0.1, e.z, 0.06, 1.4, 4, c.trim, 0.01);
    return;
  }
  b.prism(b.solid, e.x, y, e.z, Math.max(e.a, e.b) + 0.3, 0.4, seg2, c.trim);
  const onion = type === "onion";
  const h = Math.max(e.a, e.b) * (onion ? 1.5 : 0.85);
  dome(b, b.solid, e.x, y + 0.4, e.z, e.a, e.b, h, c.roof, Math.min(seg2, d >= 1 ? 28 : 14), onion ? ONION : void 0);
  const ly = y + 0.4 + h * 0.97, lr = Math.min(e.a, e.b) * 0.13;
  b.prism(b.solid, e.x, ly, e.z, lr, lr * 2.2, 8, c.trim);
  b.prism(b.solid, e.x, ly + lr * 2.2, e.z, lr * 1.2, lr * 2, 8, c.roof, 0);
}
function roofMapper(rr) {
  const ax = rr.axis === "x";
  return {
    A0: ax ? rr.x0 : rr.z0,
    A1: ax ? rr.x1 : rr.z1,
    B0: ax ? rr.z0 : rr.x0,
    B1: ax ? rr.z1 : rr.x1,
    p: (a, bb, y) => ax ? [a, y, bb] : [bb, y, a],
    dirA: ax ? [1, 0, 0] : [0, 0, 1],
    dirB: ax ? [0, 0, 1] : [1, 0, 0]
  };
}
function hip(c, rr, y, pitch, o, gable) {
  const { b } = c;
  const m = roofMapper(rr);
  const tan = Math.tan(pitch);
  const half = (m.B1 - m.B0) / 2, bc = (m.B0 + m.B1) / 2;
  const ey = y - o * tan, ry = y + half * tan;
  const A0 = m.A0 - (gable ? o * 0.6 : o), A1 = m.A1 + (gable ? o * 0.6 : o), B0 = m.B0 - o, B1 = m.B1 + o;
  let ra0 = gable ? A0 : m.A0 + half, ra1 = gable ? A1 : m.A1 - half;
  if (ra0 > ra1) ra0 = ra1 = (m.A0 + m.A1) / 2;
  const up = (v) => [v[0], 1, v[2]];
  const neg = (v) => [-v[0], 0, -v[2]];
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
function pitchedRoof(c, tier, rr, type) {
  const { b, r, st, d } = c;
  const y = base2(c, tier.f1);
  const j = st.jetty;
  const er = { ...rr, x0: rr.x0 - j, z0: rr.z0 - j, x1: rr.x1 + j, z1: rr.z1 + j };
  const pitch = r.range(...st.roof.pitch) * Math.PI / 180;
  const o = st.roof.overhang;
  const m = roofMapper(er);
  let hm = 0, k = 0;
  if (type === "mansard") {
    hm = c.floorH * 0.95;
    k = hm / Math.tan(pitch);
    const ey = y - o * Math.tan(pitch);
    const A0 = m.A0 - o, A1 = m.A1 + o, B0 = m.B0 - o, B1 = m.B1 + o;
    const a0 = m.A0 + k, a1 = m.A1 - k, b0 = m.B0 + k, b1 = m.B1 - k, yt = y + hm;
    const up = (v, s) => [v[0] * s, 1, v[2] * s];
    b.face(b.solid, [m.p(A0, B1, ey), m.p(A1, B1, ey), m.p(a1, b1, yt), m.p(a0, b1, yt)], c.roof, up(m.dirB, 1));
    b.face(b.solid, [m.p(A0, B0, ey), m.p(A1, B0, ey), m.p(a1, b0, yt), m.p(a0, b0, yt)], c.roof, up(m.dirB, -1));
    b.face(b.solid, [m.p(A0, B0, ey), m.p(A0, B1, ey), m.p(a0, b1, yt), m.p(a0, b0, yt)], c.roof, up(m.dirA, -1));
    b.face(b.solid, [m.p(A1, B0, ey), m.p(A1, B1, ey), m.p(a1, b1, yt), m.p(a1, b0, yt)], c.roof, up(m.dirA, 1));
    const inner = rr.axis === "x" ? { x0: a0, x1: a1, z0: b0, z1: b1, axis: "x" } : { x0: b0, x1: b1, z0: a0, z1: a1, axis: "z" };
    hip({ ...c, roof: shade(c.roof, 0.9) }, inner, yt, 14 * Math.PI / 180, 0.05, false);
    if (d >= 1)
      for (const bb of [B0, B1])
        b.face(b.solid, [m.p(A0, bb, ey), m.p(A1, bb, ey), m.p(A1, bb, ey - 0.15), m.p(A0, bb, ey - 0.15)], c.trim, bb === B0 ? [-m.dirB[0], 0, -m.dirB[2]] : m.dirB);
  } else {
    hip(c, er, y, pitch, o, type === "gable");
    if (d >= 1 && c.solar) {
      c.solar = false;
      solarSlope(c, m, y, pitch, type === "gable");
    }
  }
  if (d >= 1 && r.chance(st.roof.dormers)) dormers(c, tier, er, y, type === "mansard" ? Math.atan(hm / k) : pitch, type === "mansard" ? hm : 1.7);
}
function dormers(c, tier, rr, y, pitch, hMax) {
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
    const out = [m.dirB[0] * side, 0, m.dirB[2] * side];
    for (let i = 0; i < span; i += every) {
      const a = m.A0 + (i + 0.5) * step;
      if (a - dw < m.A0 + 1 || a + dw > m.A1 - 1) continue;
      const probe = m.p(a, edge + side * 0.6, 0), inner = m.p(a, edge - side * 0.6, 0);
      if (filled(tier.grid, probe[0], probe[2]) || !filled(tier.grid, inner[0], inner[2])) continue;
      const yb = y + e * tan + 0.05, yt = yb + dh;
      const q0 = edge - side * e, q1 = edge - side * ((yt - y) / tan + 0.3);
      const P = (aa, q, yy) => m.p(aa, q, yy);
      const pts = [];
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
function chimneys(c, tier, type) {
  const { b, r, st } = c;
  const y = base2(c, tier.f1);
  const n = r.int(1, Math.min(3, tier.rects.length + 1));
  const brick = st.palette.base ? c.baseWall : st.id === "victorian" ? c.wall : color("#8A5A48");
  for (let k = 0; k < n; k++) {
    const rr = r.pick(tier.rects);
    const m = roofMapper(rr);
    const half = (m.B1 - m.B0) / 2;
    const a = r.range(m.A0 + 0.8, m.A1 - 0.8);
    const q = (m.B0 + m.B1) / 2 + r.range(-0.3, 0.3) * half;
    const rise = type === "mansard" ? c.floorH * 1.3 : half * Math.tan(st.roof.pitch[1] * Math.PI / 180);
    const p = m.p(a, q, 0);
    const h = rise + 1.2;
    b.box(b.solid, p[0] - 0.35, y, p[2] - 0.35, p[0] + 0.35, y + h, p[2] + 0.35, brick);
    if (c.d >= 1) {
      b.box(b.solid, p[0] - 0.42, y + h, p[2] - 0.42, p[0] + 0.42, y + h + 0.12, p[2] + 0.42, c.trim);
      if (c.d >= 2) b.prism(b.solid, p[0], y + h + 0.12, p[2], 0.12, 0.35, 6, color("#9A5B43"));
    }
  }
}

// src/engine/landmarks.ts
var LANDMARKS = [
  { id: "church", name: "Church", blurb: "Nave, transept, apse and spire", size: [30, 54], swatch: ["#D6C3A0", "#5B5F66", "#3D4F6E", "#7B8F84"] },
  { id: "civic", name: "Civic Hall", blurb: "Portico, pediment and dome", size: [74, 50], swatch: ["#E4DCCB", "#F2EDE3", "#7E8A86", "#46555E"] },
  { id: "hospital", name: "Hospital", blurb: "Ward wings, lobby, helipad", size: [66, 58], swatch: ["#EEF0EC", "#7FA8B5", "#C8323C", "#557F8F"] },
  { id: "stadium", name: "Stadium", blurb: "Rounded bowl, roof ring, floodlights", size: [150, 118], swatch: ["#E9E8E3", "#C15F3C", "#3E5C76", "#6E9B4F"] }
];
var LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
var clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
var style = (o) => ({
  ...STYLE.haussmann,
  shops: 0,
  balcony: { mode: "none", chance: 0, solid: false, depth: 0.8 },
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
  massing: { shapes: [["rect", 1]], tiers: [1, 1], podium: 0 },
  ...o
});
function generateLandmark(b, p) {
  const r = rng(p.seed);
  const root = b.getFrame();
  const reset = () => b.setFrame(root.ox, root.oz, root.angle, root.oy);
  const build = (dx, dz, st, w, d, extra = {}, dy = 0) => {
    b.sub(root, dx, dz, 0, dy);
    const info = generateBuilding(b, { style: st, seed: r.int(0, 1e9), width: w, depth: d, detail: p.detail, ...extra });
    reset();
    return info;
  };
  const gen = { church, civic, hospital, stadium }[p.kind] ?? church;
  const height2 = gen(b, r, build, p.width, p.depth, p.detail);
  reset();
  return { kind: p.kind, height: height2 };
}
var STAINED = ["#3D4F6E", "#5A3F5E", "#3F5B55", "#6A4B3A"];
function church(b, r, build, W, D, d) {
  const stone = r.pick(["#D9CDB4", "#C9BFAE", "#BDB3A2", "#D6C3A0", "#B9A58A", "#A9443A"]);
  const roof = r.pick(["#5B5F66", "#4E5359", "#7B8F84", "#9E5A3C"]);
  const palette = { wall: [stone], trim: [r.pick(["#E6DECD", "#D2C6AE"])], roof: [roof], glass: STAINED, accent: ["#4A3426", "#3B2C22"] };
  const naveW = clamp(W * 0.36, 9, 15), naveH = clamp(naveW * 1.05, 9, 15);
  const towers = r.weighted([[1, 5], [2, 2], [0, 1]]);
  const tw = clamp(naveW * (towers === 2 ? 0.5 : 0.62), 5, 9);
  const zf = D / 2 - 1 - (towers === 1 ? tw * 0.75 : 0);
  const naveL = Math.max(12, Math.min(D * 0.62, zf + D / 2 - naveW * 0.5 - 1));
  const zc = zf - naveL / 2;
  const win = { w: [0.34, 0.4], h: [0.6, 0.68], inset: 0.35, arch: 1, mullion: "vertical", sill: true, lintel: false, shutters: 0 };
  const nave = style({
    id: "church",
    palette,
    floors: [1, 1],
    groundH: naveH,
    floorH: naveH,
    bay: [3.8, 4.4],
    win,
    pilasters: 0.7,
    cornice: 0.2,
    bands: 0,
    plinth: true,
    door: [2.2, Math.min(4.2, naveH * 0.4)],
    roof: { types: [["gable", 1]], pitch: [52, 56], overhang: 0.3, parapet: 0, dormers: 0, chimneys: 0 }
  });
  build(0, zc, nave, naveW, naveL, { floors: 1, roof: "gable", shape: "rect", corner: "none" });
  if (r.chance(0.7) && W > naveW + 6) {
    const aw = Math.min(naveW * 0.38, (W - naveW) / 2 - 0.5);
    const aisle = style({ ...nave, id: "church", groundH: naveH * 0.55, floorH: naveH * 0.55, roof: { ...nave.roof, types: [["hip", 1]], pitch: [20, 24] }, palette });
    for (const sx of [-1, 1]) build(sx * (naveW / 2 + aw / 2 - 0.05), zc - naveL * 0.03, aisle, aw, naveL * 0.86, { floors: 1, roof: "hip", shape: "rect", corner: "none" });
  }
  if (r.chance(0.65)) build(0, zf - naveL * 0.72, nave, Math.min(W - 1, naveW * 2.2), naveW * 0.9, { floors: 1, roof: "gable", shape: "rect", corner: "none" });
  const apse = style({ ...nave, id: "church", groundH: naveH * 0.82, roof: { ...nave.roof, types: [["cone", 1]], pitch: [45, 45] }, palette });
  const ad = Math.max(8, naveW * 0.86);
  build(0, zf - naveL, apse, ad, ad, { floors: 1, shape: "round", roof: "cone" });
  const cap = r.weighted([["hip", 5], ["onion", 1], ["dome", 1]]);
  const tower = style({
    id: "church",
    palette,
    floors: [3, 5],
    groundH: 6,
    floorH: 5,
    bay: [2.2, 2.8],
    win: { ...win, w: [0.3, 0.36], h: [0.45, 0.55] },
    bands: 1,
    cornice: 0.3,
    plinth: true,
    pilasters: 0,
    door: [1.6, 3.2],
    roof: { types: [[cap, 1]], pitch: [78, 78], overhang: 0.2, parapet: 0.6, dormers: 0, chimneys: 0 }
  });
  const tf = r.int(3, 5);
  const spots = towers === 1 ? [[0, D / 2 - tw / 2 - 0.5]] : towers === 2 ? [[-(naveW / 2 + tw / 2 - 1.2), zf - tw / 2 + 0.6], [naveW / 2 + tw / 2 - 1.2, zf - tw / 2 + 0.6]] : [[Math.min(W / 2 - tw / 2, naveW / 2 + tw / 2 + 1), zf - naveL * 0.35]];
  let height2 = naveH;
  for (const [x, z] of spots) {
    const info = build(x, z, tower, tw, tw, { floors: tf, roof: cap, shape: "rect", corner: "none" });
    height2 = Math.max(height2, info.height);
    if (cap === "hip") {
      const apex = info.height + tw / 2 * Math.tan(78 * Math.PI / 180);
      const gold = color("#C9A46A");
      b.box(b.solid, x - 0.07, apex - 0.3, z - 0.07, x + 0.07, apex + 1.8, z + 0.07, gold);
      b.box(b.solid, x - 0.5, apex + 1, z - 0.07, x + 0.5, apex + 1.16, z + 0.07, gold);
      height2 = Math.max(height2, apex + 1.8);
    }
  }
  if (towers !== 1) {
    const R = naveW * 0.17, y = naveH * 0.66;
    disc(b, b.solid, [0, y, zf + 0.04], [1, 0, 0], [0, 1, 0], R + 0.35, 20, color(palette.trim[0]));
    disc(b, b.glass, [0, y, zf + 0.07], [1, 0, 0], [0, 1, 0], R, 20, color(r.pick(STAINED)), r.chance(0.6) ? 0.9 : 0);
    if (d >= 2)
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI;
        const dx = Math.cos(a) * R, dy = Math.sin(a) * R, nx = -Math.sin(a) * 0.05, ny = Math.cos(a) * 0.05;
        b.face(b.solid, [[-dx - nx, y - dy - ny, zf + 0.09], [dx - nx, y + dy - ny, zf + 0.09], [dx + nx, y + dy + ny, zf + 0.09], [-dx + nx, y - dy + ny, zf + 0.09]], color(palette.trim[0]), [0, 0, 1]);
      }
  }
  return height2;
}
function civic(b, r, build, W, D, d) {
  const stone = r.pick(["#E4DCCB", "#DDD3C0", "#E9E4D8", "#D5CBB6"]);
  const white = color("#F2EDE3");
  const palette = { wall: [stone], trim: ["#F2EDE3"], roof: [r.pick(["#7E8A86", "#6E757B", "#8E9A90"])], glass: ["#46555E", "#3E4B53"], accent: ["#2B2A27"] };
  const main = style({
    id: "civic",
    palette,
    floors: [2, 3],
    groundH: 5.5,
    floorH: 5,
    bay: [3.6, 4.2],
    win: { w: [0.42, 0.48], h: [0.6, 0.68], inset: 0.3, arch: 0.4, mullion: "cross", sill: true, lintel: true, shutters: 0 },
    pilasters: 0.55,
    cornice: 0.6,
    bands: 1,
    plinth: true,
    door: [2.4, 3.6],
    roof: { types: [["flat", 1]], pitch: [15, 15], overhang: 0, parapet: 1.1, dormers: 0, chimneys: 0 }
  });
  const mw = W * 0.88, md = Math.min(D * 0.5, 36), mz = -D * 0.08;
  const domed = r.chance(0.6);
  const domeR = clamp(md * 0.3, 6, 11);
  const info = build(0, mz, main, mw, md, { floors: r.int(2, 3), shape: r.chance(0.5) ? "U" : "rect", roof: "flat", corner: "none", reserve: [[0, 0, domed ? domeR + 1 : 5]] });
  const H = info.height;
  const front = mz + md / 2;
  const pw = clamp(mw * 0.36, 12, 28), pd = 5.5, n = pw > 20 ? 8 : 6;
  const colR = clamp(pw / n * 0.17, 0.4, 0.6), seg2 = d >= 2 ? 14 : d >= 1 ? 10 : 6;
  const step = shade(color(stone), 0.9);
  for (let k = 0; k < 3; k++) b.box(b.solid, -pw / 2 - 1.2 + k * 0.3, k * 0.4, front, pw / 2 + 1.2 - k * 0.3, (k + 1) * 0.4, front + pd + 1.8 - k * 0.6, step);
  const colTop = H - 1.6;
  for (let i = 0; i < n; i++) {
    const x = -pw / 2 + 0.9 + i * (pw - 1.8) / (n - 1), z = front + pd - 0.9;
    b.smooth = { cx: x, cy: 0, cz: z, rx: colR, ry: 0, rz: colR };
    b.prism(b.solid, x, 1.2, z, colR, colTop - 1.2, seg2, white);
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
  let height2 = apex;
  if (domed) {
    const drum = style({ ...main, id: "civic", groundH: 5, bay: [2.6, 3], palette, cornice: 0.4, pilasters: 0.35 });
    const di = build(0, mz, drum, domeR * 2, domeR * 2, { floors: 1, shape: "round", roof: "dome" }, H);
    height2 = H + di.height + domeR * 1.2;
  } else {
    const tower = style({ ...main, id: "civic", groundH: 4.5, floorH: 4, bay: [2.2, 2.6], pilasters: 0, roof: { ...main.roof, types: [["hip", 1]], pitch: [55, 60] }, palette });
    const tz = mz - md * 0.12;
    const ti = build(0, tz, tower, 7, 7, { floors: 3, roof: "hip", shape: "rect", corner: "none" }, H);
    const cy = H + ti.height - 2.3;
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ctr = [nx * 3.57, cy, tz + nz * 3.57];
      const v = [0, 1, 0];
      const uu = nz === 0 ? [0, 0, -nx] : [nz, 0, 0];
      disc(b, b.solid, ctr, uu, v, 1.3, 16, color("#F6F1E4"), 1);
      const o = [ctr[0] + nx * 0.03, cy, ctr[2] + nz * 0.03];
      b.face(b.solid, [[o[0] - uu[0] * 0.05, cy, o[2] - uu[2] * 0.05], [o[0] + uu[0] * 0.05, cy, o[2] + uu[2] * 0.05], [o[0] + uu[0] * 0.05, cy + 0.95, o[2] + uu[2] * 0.05], [o[0] - uu[0] * 0.05, cy + 0.95, o[2] - uu[2] * 0.05]], color("#1F2427"), [nx, 0, nz]);
      b.face(b.solid, [[o[0], cy - 0.05, o[2]], [o[0] + uu[0] * 0.7, cy - 0.05, o[2] + uu[2] * 0.7], [o[0] + uu[0] * 0.7, cy + 0.05, o[2] + uu[2] * 0.7], [o[0], cy + 0.05, o[2]]], color("#1F2427"), [nx, 0, nz]);
    }
    height2 = H + ti.height + 3.5 * Math.tan(1);
  }
  const fz = zF + 5;
  if (fz < D / 2 - 1) {
    const flags = [r.pick(["#3E5C76", "#7A2E2A", "#2F4A3A"]), "#E9E4D8", r.pick(["#D9B44A", "#C15F3C", "#3E5C76"])];
    [-6, 0, 6].forEach((x, i) => {
      b.prism(b.solid, x, 0, fz, 0.07, 11, 6, color("#D8D6D0"));
      b.face(b.solid, [[x, 9.6, fz], [x + 2.2, 9.6, fz], [x + 2.2, 10.9, fz], [x, 10.9, fz]], color(flags[i]), [0, 0, 1]);
    });
  }
  const fountainZ = (fz + 2 + D / 2) / 2;
  if (d >= 1 && D / 2 - fz > 10) {
    b.prism(b.solid, 0, 0, fountainZ, 3.2, 0.55, 20, step);
    disc(b, b.glass, [0, 0.5, fountainZ], [1, 0, 0], [0, 0, -1], 2.9, 20, color("#6E92A8"), 0.3);
    b.prism(b.solid, 0, 0.5, fountainZ, 0.25, 1.4, 8, white);
  }
  return height2;
}
function hospital(b, r, build, W, D, d) {
  const palette = {
    wall: ["#EEF0EC", "#E8ECE9", "#F1EFE9"],
    trim: ["#7FA8B5", "#6D9AA8", "#9DBFC9"],
    roof: ["#A9ABA6"],
    glass: ["#557F8F", "#4C7180", "#5F8A98"],
    accent: ["#2F5E6E"],
    spandrel: ["#D2DEDF"]
  };
  const ward = style({
    id: "hospital",
    palette,
    floors: [5, 8],
    groundH: 4.6,
    floorH: 3.7,
    bay: [3.3, 3.7],
    win: { w: [0.62, 0.7], h: [0.5, 0.55], inset: 0.14, arch: 0, mullion: "vertical", sill: false, lintel: false, shutters: 0 },
    bands: 3,
    cornice: 0,
    plinth: false,
    pilasters: 0,
    props: 0.9,
    roof: { types: [["flat", 1]], pitch: [0, 0], overhang: 0, parapet: 1, dormers: 0, chimneys: 0 }
  });
  const mw = W * 0.9, md = D * 0.6, mz = -D * 0.12;
  const hr = clamp(Math.min(mw, md) * 0.16, 5, 8);
  const hz = md * 0.27;
  const info = build(0, mz, ward, mw, md, { floors: r.int(5, 8), shape: r.chance(0.6) ? "T" : "L", roof: "flat", corner: "none", reserve: [[0, hz, hr + 1]] });
  const H = info.height, front = mz + md / 2;
  const lobby = style({ ...STYLE.modern, id: "hospital", palette: { ...STYLE.modern.palette, glass: palette.glass, spandrel: ["#7FA8B5"] }, groundH: 4.6, floorH: 4, shops: 0, solar: 0, greenRoof: 0.6 });
  build(0, front + 4.5, lobby, mw * 0.42, 9, { floors: 2, shape: "rect", roof: "flat", corner: r.chance(0.5) ? "both" : "none" });
  const red = color("#C8323C"), white = color("#F4F4F1");
  const cy = H - 2.6, cz = front + 0.06;
  b.box(b.solid, -1.6, cy - 0.5, cz, 1.6, cy + 0.5, cz + 0.25, red, 2);
  b.box(b.solid, -0.5, cy - 1.6, cz, 0.5, cy + 1.6, cz + 0.25, red, 2);
  const ex0 = Math.min(mw * 0.25, W / 2 - 10), ex1 = ex0 + 9;
  b.box(b.solid, ex0, 3.8, front, ex1, 4.1, front + 7, white);
  b.box(b.solid, ex0, 3.35, front + 6.85, ex1, 3.8, front + 7, red);
  for (const [x, z] of [[ex0 + 0.3, front + 6.6], [ex1 - 0.3, front + 6.6]]) b.prism(b.solid, x, 0, z, 0.15, 3.8, 8, white);
  if (d >= 1) for (let k = 0, x = ex0 + 2.2; k < 9; k++, x += 0.52) b.face(b.solid, [[x, 3.47, front + 7.01], [x + 0.38, 3.47, front + 7.01], [x + 0.38, 3.7, front + 7.01], [x, 3.7, front + 7.01]], white, [0, 0, 1], 2);
  const pz = mz + hz, seg2 = d >= 1 ? 24 : 12;
  b.prism(b.solid, 0, H, pz, hr, 0.3, seg2, color("#3E4346"));
  if (d >= 1) {
    const ring = (rad, a) => [Math.cos(a) * rad, H + 0.31, pz - Math.sin(a) * rad];
    for (let k = 0; k < seg2; k++) {
      const a0 = k / seg2 * Math.PI * 2, a1 = (k + 1) / seg2 * Math.PI * 2;
      b.face(b.solid, [ring(hr - 0.65, a0), ring(hr - 0.35, a0), ring(hr - 0.35, a1), ring(hr - 0.65, a1)], white, [0, 1, 0]);
      if (k % 3 === 0) b.box(b.solid, Math.cos(a0) * (hr - 0.15) - 0.1, H + 0.3, pz - Math.sin(a0) * (hr - 0.15) - 0.1, Math.cos(a0) * (hr - 0.15) + 0.1, H + 0.45, pz - Math.sin(a0) * (hr - 0.15) + 0.1, color("#7CFF9A"), 2);
    }
  }
  const hh = hr * 0.42, hw = hr * 0.26, t = 0.35;
  b.box(b.solid, -hw - t, H + 0.3, pz - hh, -hw + t, H + 0.34, pz + hh, white);
  b.box(b.solid, hw - t, H + 0.3, pz - hh, hw + t, H + 0.34, pz + hh, white);
  b.box(b.solid, -hw, H + 0.3, pz - t, hw, H + 0.34, pz + t, white);
  return H + 1.5;
}
function stadium(b, r, _build, W, D, d) {
  const long = W >= D;
  const A = W / 2 - 2, B = D / 2 - 2;
  const n = r.range(2.8, 4.2);
  const sp = (t, a, bb) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [a * Math.sign(c) * Math.abs(c) ** (2 / n), -bb * Math.sign(s) * Math.abs(s) ** (2 / n)];
  };
  const fa = A * 0.6, fb = B * 0.52;
  const N = d >= 1 ? 72 : 44;
  const at = (t, th, y) => {
    const p = sp(th, fa, fb), q = sp(th, A, B);
    return [p[0] + (q[0] - p[0]) * t, y, p[1] + (q[1] - p[1]) * t];
  };
  const c1 = color(r.pick(["#C15F3C", "#3E5C76", "#2F4A3A", "#7A2E2A", "#D9B44A", "#5B4A8A"])), c2 = color(r.pick(["#E9E4D8", "#B9B7B1", "#2F3B45"]));
  const concrete = color("#B9B6AE"), facade2 = color(r.pick(["#E9E8E3", "#D8D4CA", "#C9C6BF"]));
  const tiers = [[0.02, 0.44, 0.6, 11], [0.5, 0.95, 12.6, 25]];
  const sub2 = d >= 1 ? 3 : 1;
  for (const [t0, t1, y0, y1] of tiers) {
    for (let k = 0; k < sub2; k++) {
      const ta = t0 + (t1 - t0) * k / sub2, tb = t0 + (t1 - t0) * (k + 1) / sub2;
      const ya = y0 + (y1 - y0) * k / sub2, yb = y0 + (y1 - y0) * (k + 1) / sub2;
      for (let i = 0; i < N; i++) {
        const th0 = i / N * Math.PI * 2, th1 = (i + 1) / N * Math.PI * 2;
        const sector = Math.floor(i / N * 12);
        const col = shade(sector % 3 === 0 ? c2 : c1, k % 2 ? 0.92 : 1);
        const p = at(ta, th0, ya);
        b.face(b.solid, [p, at(ta, th1, ya), at(tb, th1, yb), at(tb, th0, yb)], col, [-p[0] * 0.01, 1, -p[2] * 0.01]);
        if (k === 0) b.face(b.solid, [at(ta, th0, ya - 1.2), at(ta, th1, ya - 1.2), at(ta, th1, ya), at(ta, th0, ya)], concrete, [-p[0], 0, -p[2]]);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const th0 = i / N * Math.PI * 2, th1 = (i + 1) / N * Math.PI * 2;
    const p0 = at(1, th0, 0), p1 = at(1, th1, 0), out = [p0[0], 0, p0[2]];
    b.face(b.solid, [at(0.44, th0, 11.6), at(0.44, th1, 11.6), at(0.5, th1, 11.6), at(0.5, th0, 11.6)], concrete, [0, 1, 0]);
    b.face(b.solid, [p0, p1, at(1, th1, 27), at(1, th0, 27)], facade2, out);
    if (d >= 1) {
      b.face(b.glass, [at(1.003, th0, 12.5), at(1.003, th1, 12.5), at(1.003, th1, 15.5), at(1.003, th0, 15.5)], color("#46555E"), out, 0.6);
      if (i % 3 === 0) {
        const q0 = at(1, th0, 0), q1 = at(1.02, th0, 0);
        const tl = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) || 1;
        const ux = (p1[0] - p0[0]) / tl * 0.25, uz = (p1[2] - p0[2]) / tl * 0.25;
        const fin = Array.from({ length: 8 }, (_, m) => {
          const q = m & 4 ? q1 : q0, sd = m & 1 ? 1 : -1;
          return [q[0] + ux * sd, m & 2 ? 27.4 : 0, q[2] + uz * sd];
        });
        b.hexa(b.solid, fin, shade(facade2, 0.93));
      }
      if (i % (N / 4) === 0) b.face(b.solid, [at(1.004, th0, 0), at(1.004, th1, 0), at(1.004, th1, 4.2), at(1.004, th0, 4.2)], color("#2F3438"), out);
    }
    b.face(b.solid, [at(1.02, th0, 28.6), at(1.02, th1, 28.6), at(0.74, th1, 30.2), at(0.74, th0, 30.2)], color("#ECEBE6"), [0, 1, 0]);
    if (i % 6 === 0) {
      const q = at(1, th0, 0);
      b.prism(b.solid, q[0], 27, q[2], 0.35, 1.7, 6, concrete);
    }
  }
  const grass = color("#6E9B4F"), grass2 = color("#5F8C44"), line = color("#F2F2EC");
  for (let i = 0; i < N; i++) {
    const p0 = sp(i / N * Math.PI * 2, fa, fb), p1 = sp((i + 1) / N * Math.PI * 2, fa, fb);
    b.face(b.solid, [[0, 0.05, 0], [p0[0], 0.05, p0[1]], [p1[0], 0.05, p1[1]]], grass, [0, 1, 0]);
  }
  const pa = Math.min(fa * 0.9, fb * 0.9 * 1.55) * (long ? 1 : 0.64), pb = long ? pa / 1.55 : Math.min(fb * 0.9, fa * 0.9 * 1.55);
  const L = long ? pa : pb, S = long ? pb : pa;
  const rect = (x0, z0, x1, z1, y, col) => long ? b.face(b.solid, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], col, [0, 1, 0]) : b.face(b.solid, [[z0, y, x0], [z1, y, x0], [z1, y, x1], [z0, y, x1]], col, [0, 1, 0]);
  const stripes = 14;
  for (let k = 1; k < stripes; k += 2) rect(-L + 2 * L * k / stripes, -S, -L + 2 * L * (k + 1) / stripes, S, 0.07, grass2);
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
      const P = (x, z, y) => long ? [x, y, z] : [z, y, x];
      const post = (z) => {
        const p = P(gx, z, 0);
        b.box(b.solid, p[0] - 0.06, 0, p[2] - 0.06, p[0] + 0.06, 2.4, p[2] + 0.06, line);
      };
      post(-gw);
      post(gw);
      const a = P(gx, -gw, 0), c = P(gx, gw, 0);
      b.box(b.solid, Math.min(a[0], c[0]) - 0.06, 2.34, Math.min(a[2], c[2]) - 0.06, Math.max(a[0], c[0]) + 0.06, 2.46, Math.max(a[2], c[2]) + 0.06, line);
    }
  }
  const cr = S * 0.27, cs = 24;
  for (let k = 0; k < cs; k++) {
    const a0 = k / cs * Math.PI * 2, a1 = (k + 1) / cs * Math.PI * 2;
    b.face(b.solid, [[Math.cos(a0) * (cr - lw), ly, Math.sin(a0) * (cr - lw)], [Math.cos(a0) * cr, ly, Math.sin(a0) * cr], [Math.cos(a1) * cr, ly, Math.sin(a1) * cr], [Math.cos(a1) * (cr - lw), ly, Math.sin(a1) * (cr - lw)]], line, [0, 1, 0]);
  }
  const lamp = color("#FFF3D6");
  for (let k = 0; k < 4; k++) {
    const p = at(1.08, Math.PI / 4 + k * Math.PI / 2, 0);
    b.prism(b.solid, p[0], 0, p[2], 0.45, 44, 6, color("#9A9893"));
    b.box(b.solid, p[0] - 2.4, 44, p[2] - 2.4, p[0] + 2.4, 46.5, p[2] + 2.4, lamp, 2);
  }
  if (d >= 1) {
    const s0 = at(0.95, Math.PI / 2, 26), w = Math.min(10, A * 0.2);
    b.box(b.solid, s0[0] - w / 2, 30.6, s0[2] - 0.3, s0[0] + w / 2, 35, s0[2] + 0.3, color("#22262A"));
    b.face(b.solid, [[s0[0] - w / 2 + 0.3, 31, s0[2] + 0.31], [s0[0] + w / 2 - 0.3, 31, s0[2] + 0.31], [s0[0] + w / 2 - 0.3, 34.6, s0[2] + 0.31], [s0[0] - w / 2 + 0.3, 34.6, s0[2] + 0.31]], color("#3E5C76"), [0, 0, 1], 1);
  }
  return 46.5;
}

// src/engine/block.ts
var CURB = 0.15;
var SIDEWALK = 3;
var PAVING = color("#CFCAC0");
var GRASS = [color("#9DAA7C"), color("#8FA06F"), color("#A5B083")];
var LEAVES = ["#6E8452", "#7C8F57", "#5F7748", "#8A9A5E", "#9C8F4E"].map(color);
function generateBlock(b, p, ox = 0, oz = 0) {
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
  const mix2 = p.style ? [[p.style, 1]] : DISTRICTS[p.district ?? "oldtown"].mix;
  let total = 0, avg = 0;
  for (const [id, w] of mix2) {
    const s = STYLE[id];
    avg += w * ((s.lot.depth[0] + s.lot.depth[1]) / 2 + s.lot.front + (s.attached ? 0 : 5));
    total += w;
  }
  const ld = Math.min(Math.max(avg / total, 10), 42);
  const lots = [];
  const strip = (len, depth, cx, cz, angle, corners) => {
    let pos = 0;
    const c = Math.cos(angle), s = Math.sin(angle);
    while (len - pos > 2) {
      const st = STYLE[r.weighted(mix2)];
      let w = r.range(...st.lot.width);
      if (len - pos - w < st.lot.width[0] * 0.6) w = len - pos;
      const lx = -len / 2 + pos + w / 2;
      const first = pos === 0, last = pos + w >= len - 1e-6;
      const corner = corners && (first || last) ? first && last ? "both" : first ? "left" : "right" : void 0;
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
function generateLot(b, lot, p, ox = 0, oz = 0) {
  const st = STYLE[lot.style];
  const r = rng(lot.seed);
  const y = lot.y ?? 0;
  const c = Math.cos(lot.angle), s = Math.sin(lot.angle);
  const toWorld = (lx, lz) => [ox + lot.x + lx * c + lz * s, oz + lot.z - lx * s + lz * c];
  const side = st.lot.side;
  const bw = lot.w - side * 2;
  const front = Math.min(st.lot.front, lot.d * 0.3);
  const bd = Math.min(lot.d - front - (st.attached ? 0 : 3), r.range(...st.lot.depth));
  if (bw < 4 || bd < 4) return;
  if (!st.attached) {
    b.setFrame(...toWorld(0, 0), lot.angle, y + CURB + 0.03);
    b.face(b.solid, [[-lot.w / 2 + 0.4, 0, -lot.d / 2 + 0.4], [lot.w / 2 - 0.4, 0, -lot.d / 2 + 0.4], [lot.w / 2 - 0.4, 0, lot.d / 2 - 0.4], [-lot.w / 2 + 0.4, 0, lot.d / 2 - 0.4]], r.pick(GRASS), [0, 1, 0]);
    if (p.detail >= 1 && st.id === "suburban") {
      for (let k = 0; k < r.int(1, 3); k++) {
        const tx = r.range(-lot.w / 2 + 1.5, lot.w / 2 - 1.5), tz = r.range(-lot.d / 2 + 1.5, -lot.d / 2 + Math.max(2, lot.d - bd - front - 1));
        tree(b, r, tx, tz, p.detail);
      }
    }
  }
  b.setFrame(...toWorld(0, lot.d / 2 - front - bd / 2), lot.angle, y + CURB);
  const corner = lot.corner ? r.chance(0.6) ? lot.corner : "none" : st.attached ? "none" : "auto";
  const info = generateBuilding(b, { style: st, seed: lot.seed, width: bw, depth: bd, detail: p.detail, heightScale: p.heightScale, corner, open: lot.corner });
  lot.floors = info.floors;
}
var MARGIN = { church: 5, civic: 4, hospital: 2, stadium: 1 };
function landmarkLot(b, r, p, Wi, Di, ox, oz) {
  const kind = p.landmark;
  const angle = r.chance(0.5) ? 0 : Math.PI;
  b.setFrame(ox, oz, angle, CURB + 0.02);
  const quad = (x0, z0, x1, z1, col) => b.face(b.solid, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], col, [0, 1, 0]);
  if (kind === "church" || kind === "civic") quad(-Wi / 2, -Di / 2, Wi / 2, Di / 2, r.pick(GRASS));
  else quad(-Wi / 2, -Di / 2, Wi / 2, Di / 2, shade(PAVING, kind === "stadium" ? 1.04 : 0.97));
  if (kind === "civic") quad(-4, 0, 4, Di / 2, shade(PAVING, 1.06));
  if (kind === "hospital") {
    b.setFrame(ox, oz, angle, CURB + 0.04);
    const x0 = -Wi / 2 + 1, x1 = -Wi * 0.12, z0 = Di * 0.18 + 2, z1 = Di / 2 - 1;
    if (x1 - x0 > 8 && z1 - z0 > 8) {
      quad(x0, z0, x1, z1, color("#55575A"));
      b.setFrame(ox, oz, angle, CURB + 0.06);
      for (let x = x0 + 1; x + 0.12 < x1; x += 2.6) {
        quad(x, z0 + 0.5, x + 0.12, z0 + 5.5, color("#E9E6DE"));
        quad(x, z1 - 5.5, x + 0.12, z1 - 0.5, color("#E9E6DE"));
      }
    }
  }
  const m = MARGIN[kind] ?? 3;
  b.setFrame(ox, oz, angle, CURB);
  if (p.detail >= 1 && (kind === "church" || kind === "civic"))
    for (let x = -Wi / 2 + 2; x < Wi / 2 - 1; x += r.range(6, 9)) {
      tree(b, r, x, -Di / 2 + 1.8, p.detail);
      if (kind === "church") tree(b, r, x, Di / 2 - 1.8, p.detail);
    }
  generateLandmark(b, { kind, seed: p.seed, width: Wi - m * 2, depth: Di - m * 2, detail: p.detail });
  return { x: 0, z: 0, w: Wi, d: Di, angle, style: kind, seed: p.seed, floors: 0 };
}
function courtyard(b, r, w, d, ox, oz, detail) {
  b.setFrame(ox, oz, 0, CURB + 0.02);
  b.face(b.solid, [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], r.pick(GRASS), [0, 1, 0]);
  if (detail < 1) return;
  const n = Math.min(12, Math.floor(w * d / 120));
  for (let k = 0; k < n; k++) tree(b, r, r.range(-w / 2 + 2, w / 2 - 2), r.range(-d / 2 + 2, d / 2 - 2), detail);
}
function park(b, r, w, d, ox, oz, detail) {
  b.setFrame(ox, oz, 0, CURB + 0.02);
  const g = r.pick(GRASS);
  b.face(b.solid, [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], g, [0, 1, 0]);
  b.setFrame(ox, oz, 0, CURB + 0.04);
  const path = shade(PAVING, 1.05);
  b.face(b.solid, [[-1.5, 0, -d / 2], [1.5, 0, -d / 2], [1.5, 0, d / 2], [-1.5, 0, d / 2]], path, [0, 1, 0]);
  b.face(b.solid, [[-w / 2, 0, -1.5], [w / 2, 0, -1.5], [w / 2, 0, 1.5], [-w / 2, 0, 1.5]], path, [0, 1, 0]);
  b.setFrame(ox, oz, 0, CURB);
  const n = Math.min(detail >= 1 ? 40 : 14, Math.floor(w * d / 70));
  for (let k = 0; k < n; k++) {
    const x = r.range(-w / 2 + 2, w / 2 - 2), z = r.range(-d / 2 + 2, d / 2 - 2);
    if (Math.abs(x) < 3.5 || Math.abs(z) < 3.5) continue;
    tree(b, r, x, z, detail);
  }
}
function tree(b, r, x, z, detail) {
  const s = r.range(0.75, 1.3);
  const leaf = r.pick(LEAVES);
  const seg2 = detail >= 2 ? 8 : 5;
  b.prism(b.solid, x, 0, z, 0.18 * s, 2.2 * s, 5, color("#5A4636"));
  if (r.chance(0.35)) {
    b.prism(b.solid, x, 1.4 * s, z, 1.8 * s, 2.6 * s, seg2, leaf, 0.9 * s);
    b.prism(b.solid, x, 4 * s, z, 0.9 * s, 2.2 * s, seg2, shade(leaf, 1.1), 0);
  } else {
    b.prism(b.solid, x, 1.6 * s, z, 1.4 * s, 1.1 * s, seg2, leaf, 2 * s);
    b.prism(b.solid, x, 2.7 * s, z, 2 * s, 1.6 * s, seg2, shade(leaf, 1.08), 0.3 * s);
  }
}
function lamps(b, w, d, ox, oz) {
  const pole = color("#3B3D3F");
  const head = color("#F6E7C8");
  const inset = 0.6;
  const along = (len, place) => {
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

// src/engine/city.ts
var WIDTH = { ring: 16, arterial: 14, local: 10 };
function layoutCity(p) {
  const r = rng(p.seed);
  const S = p.size / 2;
  const rw = WIDTH.ring;
  const roads = [
    { x0: -S - rw / 2, z0: -S, x1: S + rw / 2, z1: -S, width: rw, kind: "ring" },
    { x0: -S - rw / 2, z0: S, x1: S + rw / 2, z1: S, width: rw, kind: "ring" },
    { x0: -S, z0: -S, x1: -S, z1: S, width: rw, kind: "ring" },
    { x0: S, z0: -S, x1: S, z1: S, width: rw, kind: "ring" }
  ];
  const blocks = [];
  const cx = r.range(-0.15, 0.15) * p.size, cz = r.range(-0.15, 0.15) * p.size;
  const industryAngle = r.range(-Math.PI, Math.PI);
  const zone = (x, z) => {
    const dn = Math.hypot(x - cx, z - cz) / S;
    const ang = Math.atan2(z - cz, x - cx);
    const da = Math.abs((ang - industryAngle + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    const jitter = r.range(-0.08, 0.08);
    let district = dn + jitter < 0.32 ? "downtown" : dn + jitter < 0.62 ? "oldtown" : "residential";
    if (dn > 0.5 && da < 0.55) district = "industrial";
    if (p.district !== "auto") district = p.district;
    const heightScale = 1 + p.density * Math.max(0, 1 - dn / 0.5) ** 1.6 * (district === "downtown" ? 1 : 0.35);
    return { district, heightScale };
  };
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0, d = z1 - z0;
    const target = r.range(p.blockMin, p.blockMax);
    const vertical = w >= d;
    const long = Math.max(w, d);
    const kind = depth < 2 ? "arterial" : "local";
    const width = WIDTH[kind];
    if (long <= target || long - width < p.blockMin * 1.2) {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const { district, heightScale } = zone(mx, mz);
      const park2 = r.chance(district === "downtown" ? p.parks * 0.4 : p.parks);
      blocks.push({ x: mx, z: mz, w, d, district, heightScale, park: park2, seed: hash(p.seed, "block", blocks.length) });
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
function placeLandmarks(blocks, cx, cz, S, r) {
  const dn = (b) => Math.hypot(b.x - cx, b.z - cz) / S;
  const short = (b) => Math.min(b.w, b.d);
  const free = (b) => !b.landmark;
  const assign = (b, kind) => {
    if (!b) return;
    b.landmark = kind;
    b.park = false;
  };
  assign([...blocks].filter((b) => free(b) && short(b) >= 50).sort((a, b) => dn(a) - dn(b))[0], "civic");
  if (S >= 280)
    assign(blocks.filter((b) => free(b) && dn(b) > 0.45 && short(b) >= 80).sort((a, b) => b.w * b.d - a.w * a.d)[0], "stadium");
  const ring = blocks.filter((b) => free(b) && dn(b) > 0.2 && dn(b) < 0.65 && short(b) >= 55);
  assign(ring.length ? r.pick(ring) : void 0, "hospital");
  const churchy = blocks.filter((b) => free(b) && (b.district === "oldtown" || b.district === "residential") && short(b) >= 42);
  for (let k = Math.max(1, Math.round(blocks.length / 24)); k > 0 && churchy.length; k--) {
    const b = churchy.splice(r.int(0, churchy.length - 1), 1)[0];
    assign(b, "church");
  }
}
function buildRoads(b, city, detail) {
  b.setFrame(0, 0);
  const S = city.size / 2 + WIDTH.ring;
  const asphalt = color("#4A4B4D");
  b.face(b.solid, [[-S, 0, -S], [S, 0, -S], [S, 0, S], [-S, 0, S]], asphalt, [0, 1, 0]);
  const white = color("#E9E6DE"), yellow = color("#D9B44A");
  const y = 0.02;
  for (const road of city.roads) {
    const vertical = road.x0 === road.x1;
    const a0 = vertical ? road.z0 : road.x0, a1 = vertical ? road.z1 : road.x1;
    const line = vertical ? road.x0 : road.z0;
    const cuts = [];
    for (const o of city.roads) {
      if (o === road || o.x0 === o.x1 === vertical) continue;
      const oline = vertical ? o.z0 : o.x0;
      const o0 = vertical ? o.x0 : o.z0, o1 = vertical ? o.x1 : o.z1;
      if (oline < a0 - 1 || oline > a1 + 1 || line < o0 - 1 || line > o1 + 1) continue;
      cuts.push([oline - o.width / 2, oline + o.width / 2]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    const quad = (s0, s1, t0, t1, col) => vertical ? b.face(b.solid, [[line + t0, y, s0], [line + t1, y, s0], [line + t1, y, s1], [line + t0, y, s1]], col, [0, 1, 0]) : b.face(b.solid, [[s0, y, line + t0], [s1, y, line + t0], [s1, y, line + t1], [s0, y, line + t1]], col, [0, 1, 0]);
    let pos = a0;
    const free = [];
    for (const [c0, c1] of cuts) {
      if (c0 > pos) free.push([pos, c0]);
      pos = Math.max(pos, c1);
    }
    if (pos < a1) free.push([pos, a1]);
    const hw = road.width / 2;
    for (const [f0, f1] of free) {
      if (road.kind === "local") {
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
export {
  Builder,
  CURB,
  DISTRICTS,
  LANDMARK,
  LANDMARKS,
  Part,
  SIDEWALK,
  STYLE,
  STYLES,
  buildRoads,
  color,
  generateBlock,
  generateBuilding,
  generateLandmark,
  generateLot,
  hash,
  layoutCity,
  mix,
  rng,
  shade,
  tree
};
