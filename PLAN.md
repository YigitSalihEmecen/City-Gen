# Plinth — procedural building / block / city generator

```
npm install
npm run dev        # http://localhost:5173
npm test           # engine checks (node --test)
npm run typecheck
```

Shortcuts: `R` new seed · `N` day/night · `1/2/3` modes.

## Research summary

| Topic | What the literature / practice says | What we take |
|---|---|---|
| Buildings | CGA shape grammars (Müller, Wonka et al. 2006): mass model → facade split → floors → tiles → assets. Context-sensitive rules (doors at street level, no windows into neighbours). | A fixed split pipeline driven by **style data**, not a user-facing grammar language. |
| Facade rhythm | Facades are regular: bay width, solid/void ratio, symmetry, tripartition (base / shaft / cap). | Window pattern decided **per column, mirrored** → symmetric, regular facades. Ground floor, middle floors, attic/cornice treated separately. |
| Footprints | Real footprints are mostly orthogonal unions of rectangles (L, T, U, courtyard). | Footprint = **cell grid** (cell = one bay). Outline = merged boundary edges, so facades always contain an integer number of bays and courtyards work for free. |
| Roofs | Hip roofs on arbitrary polygons need a straight skeleton (fragile; no maintained three.js lib). | Roofs are built per **roof rectangle**; wings are extended to the main ridge so roofs interpenetrate into proper cross-gables. No skeleton needed for orthogonal footprints. |
| Lots | Parish & Müller / Vanegas: recursive OBB splits of blocks; every lot needs street access. | Rect blocks → **perimeter strips** subdivided into lots (guaranteed frontage), interior becomes courtyard / garden. |
| Roads | L-systems (Parish & Müller 2001) or tensor fields (Chen 2008) for organic networks. | v1: **recursive rectangle subdivision** with road hierarchy (ring + arterial + local). Gives clean T/X junctions and a road graph a driving game can use directly. Tensor fields are the upgrade path. |
| Game perf | Merge static geometry per building/block, shared materials, vertex colours instead of textures, LODs. | Engine writes straight into **2 merged buffers** (solid, glass) with vertex colours + an emissive channel (lit windows / lamps at night). Detail levels 0–2 act as LODs. |

Sources: Müller et al., *Procedural Modeling of Buildings* (SIGGRAPH 2006); Parish & Müller, *Procedural Modeling of Cities* (2001); Chen et al., *Interactive Procedural Street Modeling* (2008); Vanegas et al., *Procedural Generation of Parcels in Urban Modeling* (2012); three.js forum threads on straight skeleton roofs.

## Architecture

```
src/engine/   (three-free, deterministic, reusable by the driving game)
  rng.ts       seeded PRNG + fork(key) so every lot/building has a stable seed
  mesh.ts      Builder: quads/boxes/prisms → merged solid + glass buffers (pos/nor/col/emit/index)
  styles.ts    style profiles as data (10 styles) + district mixes
  building.ts  footprint cells → tiers/setbacks → facades (bays × floors → modules) → roof → props
  block.ts     block → perimeter lots → buildings, sidewalks, courtyards, trees, lamps
  city.ts      recursive road subdivision → zoning → blocks; exports road graph
src/viewer.ts  three.js scene, lights, day/night, grow animations, GLB export
src/main.ts    UI (mode tabs, generated control panels)
```

Pipeline per building: `lot → footprint (rect/L/T/U/courtyard) → tiers (podium + setbacks) → floors → facade segments → bay grid → module (window/door/shop/balcony/wall/curtain) → trims (bands, cornice, pilasters, quoins, timber) → roof (flat+parapet, gable, hip, mansard, spire) → props (AC, water tank, chimneys, dormers)`.

Determinism: same `(style, seed, params)` → identical geometry. City layout JSON (roads, blocks, lots + seeds) can be exported and regenerated in-game.

## Roadmap

1. ✅ Engine core: rng, builder, styles, building pipeline.
2. ✅ Block + city generation, road graph export.
3. ✅ Web UI: three modes, day/night, GLB + JSON export.
4. Next: Web Worker generation + chunk streaming for the game, tensor-field roads, terrain, non-orthogonal blocks, texture atlas option.
