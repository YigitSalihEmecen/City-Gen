export type Shape = 'rect' | 'L' | 'T' | 'U' | 'court' | 'round';
export type RoofType = 'flat' | 'gable' | 'hip' | 'mansard' | 'spire' | 'dome' | 'onion' | 'cone';
type Range = [number, number];
type Weighted<T> = [T, number][];

export interface Style {
  id: string;
  name: string;
  blurb: string;
  floors: Range;
  groundH: number;
  floorH: number;
  bay: Range;
  facade: 'punched' | 'ribbon' | 'curtain';
  win: {
    w: Range;
    h: Range;
    inset: number;
    arch: number;
    mullion: 'none' | 'cross' | 'grid' | 'vertical';
    sill: boolean;
    lintel: boolean;
    shutters: number;
  };
  blankCol: number;
  attached: boolean;
  shops: number;
  balcony: { mode: 'none' | 'row' | 'stack' | 'cell'; chance: number; solid: boolean; depth: number };
  bands: number;
  cornice: number;
  plinth: boolean;
  pilasters: number;
  quoins: boolean;
  timber: boolean;
  jetty: number;
  /** chances: rounded corner (flat roofs), corner turret (pitched roofs) and lived-in details */
  corner: number;
  turret: number;
  flowers: number;
  ac: number;
  dish: number;
  oriel: number;
  fireEscape: number;
  laundry: number;
  solar: number;
  greenRoof: number;
  door?: [number, number];
  roof: { types: Weighted<RoofType>; pitch: Range; overhang: number; parapet: number; dormers: number; chimneys: number };
  massing: { shapes: Weighted<Shape>; tiers: Range; podium: number };
  palette: { wall: string[]; base?: string[]; trim: string[]; roof: string[]; glass: string[]; accent: string[]; spandrel?: string[] };
  /** depth = building depth; front/side = setbacks inside the lot */
  lot: { width: Range; depth: Range; front: number; side: number };
  props: number;
}

const base = {
  groundH: 3.6,
  floorH: 3.1,
  blankCol: 0,
  attached: true,
  shops: 0,
  balcony: { mode: 'none', chance: 0, solid: false, depth: 0.9 },
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
  props: 0.4,
} as const;

export const STYLES: Style[] = [
  {
    ...base,
    id: 'modern',
    corner: 0.3,
    solar: 0.2,
    greenRoof: 0.25,
    name: 'Glass Office',
    blurb: 'Curtain wall towers on a podium',
    floors: [7, 20],
    groundH: 4.8,
    floorH: 3.7,
    bay: [2.8, 3.4],
    facade: 'curtain',
    win: { w: [0.9, 0.9], h: [0.8, 0.8], inset: 0.05, arch: 0, mullion: 'vertical', sill: false, lintel: false, shutters: 0 },
    roof: { types: [['flat', 1]], pitch: [0, 0], overhang: 0, parapet: 0.9, dormers: 0, chimneys: 0 },
    massing: { shapes: [['rect', 6], ['L', 1], ['round', 1.5]], tiers: [1, 3], podium: 0.6 },
    palette: {
      wall: ['#C9C7C1', '#B8B6B0', '#D4D2CC', '#9EA3A6'],
      trim: ['#8C9196', '#6F757A', '#B5B7B8'],
      roof: ['#8E8D88', '#7D7C78'],
      glass: ['#5D7385', '#4F6577', '#6E8899', '#47606E', '#7790A0'],
      accent: ['#2F3B45'],
      spandrel: ['#3E4C57', '#55626C', '#2E3A43'],
    },
    lot: { width: [24, 40], depth: [22, 34], front: 2, side: 0 },
    props: 0.8,
  },
  {
    ...base,
    id: 'haussmann',
    turret: 0.35,
    flowers: 0.2,
    ac: 0.03,
    name: 'Parisian',
    blurb: 'Stone, iron balconies, zinc mansard',
    floors: [5, 7],
    groundH: 4.2,
    floorH: 3.1,
    bay: [2.6, 3.0],
    facade: 'punched',
    win: { w: [0.48, 0.55], h: [0.62, 0.7], inset: 0.25, arch: 0.15, mullion: 'vertical', sill: true, lintel: true, shutters: 0 },
    shops: 0.85,
    balcony: { mode: 'row', chance: 1, solid: false, depth: 0.7 },
    bands: 1,
    cornice: 0.45,
    plinth: true,
    roof: { types: [['mansard', 1]], pitch: [70, 75], overhang: 0.15, parapet: 0, dormers: 0.9, chimneys: 0.6 },
    massing: { shapes: [['rect', 4], ['L', 2], ['U', 1], ['court', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#E8DCC4', '#E2D3B5', '#DCCDB0', '#EDE3CF'],
      trim: ['#F1E9D8', '#E9DFC9'],
      roof: ['#6E757B', '#7C848A', '#5F666C'],
      glass: ['#55636B', '#4D5A61'],
      accent: ['#1F2427', '#2A3236', '#3B4A3F'],
    },
    lot: { width: [12, 22], depth: [14, 22], front: 0, side: 0 },
  },
  {
    ...base,
    id: 'brutalist',
    corner: 0.2,
    ac: 0.1,
    dish: 0.04,
    greenRoof: 0.15,
    shops: 0.2,
    name: 'Brutalist',
    blurb: 'Raw concrete, deep recessed windows',
    floors: [4, 12],
    groundH: 4.2,
    floorH: 3.4,
    bay: [3.0, 3.8],
    facade: 'punched',
    win: { w: [0.42, 0.55], h: [0.42, 0.52], inset: 0.6, arch: 0, mullion: 'none', sill: false, lintel: false, shutters: 0 },
    blankCol: 0.15,
    bands: 2,
    pilasters: 0.45,
    roof: { types: [['flat', 1]], pitch: [0, 0], overhang: 0, parapet: 1.1, dormers: 0, chimneys: 0 },
    massing: { shapes: [['rect', 3], ['L', 2], ['T', 1]], tiers: [1, 2], podium: 0.3 },
    palette: {
      wall: ['#A9A59D', '#9D998F', '#B3AFA6', '#948F86'],
      trim: ['#8C887F', '#A19C93'],
      roof: ['#86827A'],
      glass: ['#3F4A50', '#47545B'],
      accent: ['#5C5850'],
    },
    lot: { width: [22, 40], depth: [18, 30], front: 3, side: 0 },
    props: 0.6,
  },
  {
    ...base,
    id: 'victorian',
    corner: 0.4,
    turret: 0.4,
    flowers: 0.25,
    ac: 0.05,
    oriel: 0.45,
    fireEscape: 0.35,
    shops: 0.35,
    name: 'Brick Rowhouse',
    blurb: 'Red brick, sash windows, chimneys',
    floors: [2, 4],
    groundH: 3.4,
    floorH: 3.0,
    bay: [2.3, 2.7],
    facade: 'punched',
    win: { w: [0.42, 0.5], h: [0.58, 0.66], inset: 0.18, arch: 0.25, mullion: 'cross', sill: true, lintel: true, shutters: 0.15 },
    bands: 1,
    cornice: 0.25,
    plinth: true,
    roof: { types: [['gable', 3], ['mansard', 1], ['flat', 1]], pitch: [35, 45], overhang: 0.25, parapet: 0.6, dormers: 0.4, chimneys: 0.9 },
    massing: { shapes: [['rect', 5], ['L', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#9C4A36', '#8E3F2E', '#A85A3F', '#7F3C2C', '#B0694C'],
      base: ['#6B5E55', '#5F544C'],
      trim: ['#EDE8DE', '#E6DFD0', '#D9D2C2'],
      roof: ['#4E4A4C', '#5A5352', '#3F3D40'],
      glass: ['#3E4950', '#48545C'],
      accent: ['#1F3A33', '#2A2E3A', '#5B1F1D', '#1E2B3B'],
    },
    lot: { width: [6, 9], depth: [11, 15], front: 1.5, side: 0 },
  },
  {
    ...base,
    id: 'tudor',
    flowers: 0.45,
    oriel: 0.25,
    shops: 0.35,
    name: 'Timber Frame',
    blurb: 'Jettied upper floors, oak beams',
    floors: [2, 3],
    groundH: 3.0,
    floorH: 2.8,
    bay: [2.2, 2.6],
    facade: 'punched',
    win: { w: [0.36, 0.44], h: [0.42, 0.5], inset: 0.12, arch: 0, mullion: 'grid', sill: true, lintel: false, shutters: 0 },
    blankCol: 0.25,
    timber: true,
    jetty: 0.4,
    roof: { types: [['gable', 3], ['hip', 1]], pitch: [48, 58], overhang: 0.45, parapet: 0, dormers: 0.3, chimneys: 0.95 },
    massing: { shapes: [['rect', 3], ['L', 2], ['T', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#EDE4D0', '#E6DCC3', '#F0E8D6', '#E9DDC1'],
      base: ['#8D8478', '#9A8F80', '#7E766C'],
      trim: ['#3B2C22', '#33261E', '#46352A'],
      roof: ['#5A4A42', '#6B5444', '#4D423C'],
      glass: ['#3B454A'],
      accent: ['#3B2C22', '#4A3628'],
    },
    lot: { width: [8, 13], depth: [10, 15], front: 0.5, side: 0 },
  },
  {
    ...base,
    id: 'artdeco',
    corner: 0.5,
    name: 'Art Deco',
    blurb: 'Setback tiers, piers and a crown',
    floors: [12, 30],
    groundH: 5.2,
    floorH: 3.5,
    bay: [2.4, 2.9],
    facade: 'punched',
    win: { w: [0.52, 0.6], h: [0.62, 0.7], inset: 0.2, arch: 0, mullion: 'cross', sill: false, lintel: false, shutters: 0 },
    shops: 0.6,
    bands: 0,
    cornice: 0.3,
    plinth: true,
    pilasters: 0.38,
    roof: { types: [['spire', 3], ['flat', 1]], pitch: [0, 0], overhang: 0, parapet: 0.8, dormers: 0, chimneys: 0 },
    massing: { shapes: [['rect', 1]], tiers: [2, 4], podium: 0.4 },
    palette: {
      wall: ['#D8CDB8', '#CDBF9F', '#C5B597', '#DDD3C0'],
      trim: ['#B8935A', '#A88550', '#C9A46A'],
      roof: ['#8F8A80'],
      glass: ['#46555E', '#3E4B53'],
      accent: ['#2B2A27', '#B8935A'],
      spandrel: ['#6E6A5F', '#5B584F', '#7A6E5A'],
    },
    lot: { width: [26, 40], depth: [26, 40], front: 1, side: 0 },
    props: 0.3,
  },
  {
    ...base,
    id: 'industrial',
    corner: 0.2,
    ac: 0.06,
    fireEscape: 0.45,
    solar: 0.3,
    shops: 0.1,
    name: 'Warehouse',
    blurb: 'Brick piers, big steel-framed windows',
    floors: [2, 5],
    groundH: 5.0,
    floorH: 4.2,
    bay: [3.8, 4.6],
    facade: 'punched',
    win: { w: [0.62, 0.72], h: [0.6, 0.68], inset: 0.22, arch: 0.5, mullion: 'grid', sill: true, lintel: false, shutters: 0 },
    attached: false,
    bands: 1,
    cornice: 0.2,
    pilasters: 0.42,
    roof: { types: [['flat', 3], ['gable', 2]], pitch: [14, 20], overhang: 0.2, parapet: 0.9, dormers: 0, chimneys: 0.2 },
    massing: { shapes: [['rect', 5], ['L', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#8A4B37', '#7A4433', '#955A42', '#6E4A3B'],
      trim: ['#5E3A2D', '#C9BFAE'],
      roof: ['#5F5B57', '#6A6662'],
      glass: ['#3C484E', '#4B5960'],
      accent: ['#2E3B33', '#3A3A3A'],
    },
    lot: { width: [24, 44], depth: [22, 36], front: 2, side: 2 },
    props: 0.7,
  },
  {
    ...base,
    id: 'suburban',
    turret: 0.12,
    flowers: 0.15,
    oriel: 0.2,
    solar: 0.35,
    name: 'Suburban House',
    blurb: 'Detached homes with hip roofs',
    floors: [1, 2],
    groundH: 3.0,
    floorH: 2.9,
    bay: [3.0, 3.6],
    facade: 'punched',
    win: { w: [0.42, 0.52], h: [0.5, 0.58], inset: 0.1, arch: 0, mullion: 'cross', sill: true, lintel: false, shutters: 0.55 },
    attached: false,
    blankCol: 0.2,
    plinth: true,
    roof: { types: [['hip', 3], ['gable', 2]], pitch: [24, 36], overhang: 0.55, parapet: 0, dormers: 0.15, chimneys: 0.4 },
    massing: { shapes: [['rect', 3], ['L', 3], ['T', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#D9D3C3', '#B9C4C9', '#C8B8A0', '#E3E0D6', '#A9B5A2', '#D7C6B0'],
      base: ['#8F8A82'],
      trim: ['#F2F0EA', '#E8E4DA'],
      roof: ['#4F4B49', '#5E5650', '#6A5D52', '#45474B'],
      glass: ['#3E4950'],
      accent: ['#33465A', '#4F3B2F', '#2F4A3A', '#6E2E2A'],
    },
    lot: { width: [16, 24], depth: [10, 14], front: 6, side: 2.5 },
    props: 0,
  },
  {
    ...base,
    id: 'mediterranean',
    corner: 0.35,
    turret: 0.2,
    flowers: 0.4,
    ac: 0.12,
    dish: 0.06,
    name: 'Mediterranean',
    blurb: 'Whitewashed stucco, terracotta, shutters',
    floors: [2, 5],
    groundH: 3.4,
    floorH: 3.0,
    bay: [2.6, 3.2],
    facade: 'punched',
    win: { w: [0.38, 0.46], h: [0.5, 0.62], inset: 0.2, arch: 0.3, mullion: 'vertical', sill: true, lintel: false, shutters: 0.85 },
    blankCol: 0.15,
    shops: 0.45,
    balcony: { mode: 'cell', chance: 0.3, solid: false, depth: 0.6 },
    bands: 0,
    cornice: 0.15,
    roof: { types: [['hip', 3], ['flat', 1], ['gable', 1]], pitch: [18, 26], overhang: 0.35, parapet: 0.7, dormers: 0, chimneys: 0.3 },
    massing: { shapes: [['rect', 3], ['L', 2], ['U', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#F2EEE6', '#EFE6D6', '#F4E9D8', '#EADBC4', '#F0DDC5'],
      trim: ['#E2D6C2', '#D8CBB4'],
      roof: ['#B5603E', '#A9563A', '#C06F4A', '#9F5236'],
      glass: ['#3E4950'],
      accent: ['#3E6E8E', '#5B7F5C', '#2F5D73', '#7A5A3A'],
    },
    lot: { width: [9, 16], depth: [12, 18], front: 0.5, side: 0 },
  },
  {
    ...base,
    id: 'soviet',
    corner: 0.1,
    ac: 0.15,
    dish: 0.1,
    laundry: 0.3,
    shops: 0.3,
    name: 'Panel Block',
    blurb: 'Prefab slabs with stacked balconies',
    floors: [5, 12],
    groundH: 3.0,
    floorH: 2.8,
    bay: [3.0, 3.6],
    facade: 'punched',
    win: { w: [0.45, 0.52], h: [0.5, 0.55], inset: 0.12, arch: 0, mullion: 'cross', sill: true, lintel: false, shutters: 0 },
    attached: false,
    balcony: { mode: 'stack', chance: 0.45, solid: true, depth: 1.1 },
    bands: 3,
    roof: { types: [['flat', 1]], pitch: [0, 0], overhang: 0, parapet: 0.5, dormers: 0, chimneys: 0 },
    massing: { shapes: [['rect', 5], ['L', 1]], tiers: [1, 1], podium: 0 },
    palette: {
      wall: ['#C2BFB6', '#B8B3A6', '#CFC9BB', '#BFC3C2', '#D3C6B4'],
      trim: ['#9E9A90', '#A8A398'],
      roof: ['#7E7A72'],
      glass: ['#3E4950', '#4A565D'],
      accent: ['#8A7F6E', '#6D7F86', '#9C6B54'],
    },
    lot: { width: [34, 70], depth: [13, 16], front: 6, side: 6 },
    props: 0.5,
  },
];

export const STYLE = Object.fromEntries(STYLES.map((s) => [s.id, s])) as Record<string, Style>;

export const DISTRICTS: Record<string, { name: string; mix: Weighted<string> }> = {
  downtown: { name: 'Downtown', mix: [['modern', 5], ['artdeco', 3], ['brutalist', 1.5], ['haussmann', 1]] },
  oldtown: { name: 'Old Town', mix: [['haussmann', 3], ['victorian', 2], ['tudor', 1], ['mediterranean', 1.5]] },
  residential: { name: 'Residential', mix: [['suburban', 6], ['mediterranean', 1], ['victorian', 1]] },
  industrial: { name: 'Industrial', mix: [['industrial', 4], ['soviet', 2], ['brutalist', 1]] },
};
