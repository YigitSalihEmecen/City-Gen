/** The engine's public API — what `lib/citygen.js` bundles for games (no three.js, no DOM). */
export { Builder, Part, color, shade, mix, type RGB, type V3 } from './mesh.ts';
export { rng, hash, type Rng } from './rng.ts';
export { STYLES, STYLE, DISTRICTS, type Style, type Shape, type RoofType } from './styles.ts';
export { generateBuilding, type BuildingParams, type BuildingInfo } from './building.ts';
export { generateBlock, generateLot, tree, CURB, SIDEWALK, type BlockParams, type Lot } from './block.ts';
export { layoutCity, buildRoads, type CityParams, type CityLayout, type BlockJob, type Road } from './city.ts';
export { generateLandmark, LANDMARKS, LANDMARK, type LandmarkParams } from './landmarks.ts';
