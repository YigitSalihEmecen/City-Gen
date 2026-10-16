export interface Rng {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  fork(key: string | number): Rng;
}

export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x9e3779b9, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const r = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
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
