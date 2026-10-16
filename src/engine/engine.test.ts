import assert from 'node:assert/strict';
import test from 'node:test';
import { generateBlock } from './block.ts';
import { ellipseSegs, generateBuilding, outline } from './building.ts';
import { layoutCity } from './city.ts';
import { generateLandmark, LANDMARKS } from './landmarks.ts';
import { Builder } from './mesh.ts';
import { STYLES } from './styles.ts';

test('outline of an L footprint has 6 segments, 5 convex corners and 1 concave', () => {
  const cells = new Uint8Array([1, 0, 0, 1, 1, 1]);
  const segs = outline({ nx: 3, nz: 2, cx: 1, cz: 1, W: 3, D: 2, cells });
  assert.equal(segs.length, 6);
  assert.equal(segs.reduce((s, g) => s + g.len, 0), 10);
  const concave = segs.flatMap((s) => [s.cv0, s.cv1]).filter((v) => !v).length;
  assert.equal(concave, 2);
});

test('courtyard footprint yields inner facades', () => {
  const cells = new Uint8Array(25).fill(1);
  cells[12] = 0;
  assert.equal(outline({ nx: 5, nz: 5, cx: 1, cz: 1, W: 5, D: 5, cells }).length, 8);
});

test('every style generates deterministic, finite geometry at every detail level', () => {
  for (const style of STYLES)
    for (let detail = 0; detail <= 2; detail++) {
      const run = () => {
        const b = new Builder();
        generateBuilding(b, { style, seed: 42, width: 20, depth: 16, detail });
        return b;
      };
      const a = run(), b = run();
      assert.ok(a.solid.vertexCount > 0, style.id);
      assert.deepEqual(a.solid.pos, b.solid.pos);
      assert.ok(a.solid.pos.every(Number.isFinite), `${style.id} d${detail} has NaN`);
      assert.ok(a.solid.idx.every((i) => i < a.solid.vertexCount));
    }
});

test('city blocks never overlap roads', () => {
  const city = layoutCity({ size: 600, seed: 7, blockMin: 50, blockMax: 110, parks: 0.1, density: 1, district: 'auto' });
  assert.ok(city.blocks.length > 8);
  for (const bl of city.blocks)
    for (const rd of city.roads) {
      const hw = rd.width / 2 - 0.01;
      const rx0 = Math.min(rd.x0, rd.x1) - (rd.x0 === rd.x1 ? hw : 0), rx1 = Math.max(rd.x0, rd.x1) + (rd.x0 === rd.x1 ? hw : 0);
      const rz0 = Math.min(rd.z0, rd.z1) - (rd.z0 === rd.z1 ? hw : 0), rz1 = Math.max(rd.z0, rd.z1) + (rd.z0 === rd.z1 ? hw : 0);
      const overlap = bl.x - bl.w / 2 < rx1 && bl.x + bl.w / 2 > rx0 && bl.z - bl.d / 2 < rz1 && bl.z + bl.d / 2 > rz0;
      assert.ok(!overlap, `block at ${bl.x},${bl.z} overlaps road`);
    }
});

test('block lots stay inside the block', () => {
  const lots = generateBlock(new Builder(), { width: 90, depth: 70, seed: 3, detail: 1, district: 'oldtown' });
  assert.ok(lots.length > 4);
  for (const l of lots) assert.ok(Math.abs(l.x) < 45 && Math.abs(l.z) < 35);
});

const finite = (b: Builder, label: string) => {
  for (const part of [b.solid, b.glass]) {
    assert.ok(part.pos.every(Number.isFinite) && part.nor.every(Number.isFinite), `${label} has NaN`);
    assert.ok(part.idx.every((i) => i < part.vertexCount), `${label} bad index`);
  }
  assert.ok(b.solid.vertexCount > 0, label);
};

test('landmarks generate deterministic, finite geometry', () => {
  for (const lm of LANDMARKS)
    for (let detail = 0; detail <= 2; detail++) {
      const run = () => {
        const b = new Builder();
        generateLandmark(b, { kind: lm.id, seed: 9, width: lm.size[0], depth: lm.size[1], detail });
        return b;
      };
      const a = run();
      finite(a, `${lm.id} d${detail}`);
      assert.deepEqual(a.solid.pos, run().solid.pos);
    }
});

test('round footprints, rounded corners and turrets stay finite', () => {
  for (const style of STYLES)
    for (const corner of ['left', 'both'] as const) {
      const b = new Builder();
      generateBuilding(b, { style, seed: 5, width: 24, depth: 20, detail: 2, corner, shape: 'rect' });
      finite(b, `${style.id} corner ${corner}`);
      const r = new Builder();
      generateBuilding(r, { style, seed: 5, width: 24, depth: 20, detail: 1, shape: 'round' });
      finite(r, `${style.id} round`);
    }
});

test('ellipse facets have outward normals', () => {
  for (const s of ellipseSegs({ x: 0, z: 0, a: 10, b: 6 }, 3)) {
    const mx = s.x0 + (s.tx * s.len) / 2, mz = s.z0 + (s.tz * s.len) / 2;
    assert.ok(mx * s.nx + mz * s.nz > 0);
  }
});

test('zoned city places a civic hall and churches', () => {
  const city = layoutCity({ size: 900, seed: 3, blockMin: 55, blockMax: 120, parks: 0.1, density: 1, district: 'auto' });
  const kinds = city.blocks.map((b) => b.landmark).filter(Boolean);
  assert.ok(kinds.includes('civic') && kinds.includes('church'), kinds.join());
});
