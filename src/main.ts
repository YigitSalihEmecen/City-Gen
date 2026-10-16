import './style.css';
import { CURB, generateBlock, type Lot } from './engine/block.ts';
import { generateBuilding } from './engine/building.ts';
import { buildRoads, layoutCity, type CityLayout } from './engine/city.ts';
import { generateLandmark, LANDMARK, LANDMARKS } from './engine/landmarks.ts';
import { Builder } from './engine/mesh.ts';
import { DISTRICTS, STYLE, STYLES } from './engine/styles.ts';
import { Viewer } from './viewer.ts';

type Mode = 'building' | 'block' | 'city';
type Opt = [string, string];
type Control = (
  | { kind: 'styles'; key: string }
  | { kind: 'seg'; key: string; label: string; options: Opt[] }
  | { kind: 'range'; key: string; label: string; min: number; max: number; step: number; unit?: string; auto?: string }
  | { kind: 'select'; key: string; label: string; options: Opt[] }
  | { kind: 'seed'; key: string }
  | { kind: 'hint'; text: string }
) & { when?: (s: Record<string, any>) => boolean };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const newSeed = () => Math.floor(Math.random() * 1e6);

const state = {
  mode: 'building' as Mode,
  night: matchMedia('(prefers-color-scheme: dark)').matches,
  building: { style: 'haussmann', seed: 1874, width: 22, depth: 16, floors: 0, shape: 'auto', roof: 'auto', corner: 'auto', scale: 1, detail: '2' } as Record<string, any>,
  block: { district: 'oldtown', style: '', landmark: '', seed: 411, width: 120, depth: 90, detail: '1' } as Record<string, any>,
  city: { district: 'auto', landmarks: 'on', seed: 2026, size: 700, blockMax: 120, parks: 0.12, density: 1.4, detail: '0' } as Record<string, any>,
};

const DETAIL: Opt[] = [['0', 'Low'], ['1', 'Medium'], ['2', 'High']];
const isLandmark = (s: Record<string, any>) => s.style in LANDMARK;
const notLandmark = (s: Record<string, any>) => !isLandmark(s);
const districtOpts: Opt[] = Object.entries(DISTRICTS).map(([k, v]) => [k, v.name]);

const COPY: Record<Mode, [string, string]> = {
  building: ['Building', 'One lot, one facade grammar. Pick a style and tune its massing.'],
  block: ['Block', 'Perimeter lots with street frontage, courtyards and gardens behind.'],
  city: ['City', 'Recursive road network, zoned districts and a skyline that peaks downtown.'],
};

const SCHEMA: Record<Mode, Control[]> = {
  building: [
    { kind: 'styles', key: 'style' },
    { kind: 'seed', key: 'seed' },
    { kind: 'range', key: 'scale', label: 'Scale', min: 0.7, max: 1.4, step: 0.05, unit: '×', when: isLandmark },
    { kind: 'range', key: 'width', label: 'Frontage', min: 6, max: 48, step: 1, unit: 'm', when: notLandmark },
    { kind: 'range', key: 'depth', label: 'Depth', min: 6, max: 40, step: 1, unit: 'm', when: notLandmark },
    { kind: 'range', key: 'floors', label: 'Floors', min: 0, max: 36, step: 1, auto: 'Style default', when: notLandmark },
    { kind: 'seg', key: 'shape', label: 'Footprint', options: [['auto', 'Auto'], ['rect', 'Box'], ['L', 'L'], ['T', 'T'], ['U', 'U'], ['court', 'Court'], ['round', 'Round']], when: notLandmark },
    { kind: 'seg', key: 'roof', label: 'Roof', options: [['auto', 'Auto'], ['flat', 'Flat'], ['gable', 'Gable'], ['hip', 'Hip'], ['mansard', 'Mansard'], ['dome', 'Dome'], ['spire', 'Crown']], when: notLandmark },
    { kind: 'seg', key: 'corner', label: 'Street corner', options: [['auto', 'Auto'], ['none', 'Square'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']], when: notLandmark },
    { kind: 'hint', text: 'Corners round off on flat roofs and grow a turret on pitched ones — when the style allows it.', when: notLandmark },
    { kind: 'seg', key: 'detail', label: 'Detail', options: DETAIL },
  ],
  block: [
    { kind: 'seg', key: 'district', label: 'District', options: districtOpts },
    { kind: 'select', key: 'style', label: 'Uniform style', options: [['', 'Mixed — follow district'], ...STYLES.map((s) => [s.id, s.name] as Opt)] },
    { kind: 'select', key: 'landmark', label: 'Landmark', options: [['', 'None — regular lots'], ...LANDMARKS.map((l) => [l.id, l.name] as Opt)] },
    { kind: 'seed', key: 'seed' },
    { kind: 'range', key: 'width', label: 'Block width', min: 40, max: 220, step: 5, unit: 'm' },
    { kind: 'range', key: 'depth', label: 'Block depth', min: 30, max: 160, step: 5, unit: 'm' },
    { kind: 'seg', key: 'detail', label: 'Detail', options: DETAIL },
    { kind: 'hint', text: 'A district draws each lot from a weighted style mix; a uniform style overrides it for the whole block.' },
  ],
  city: [
    { kind: 'seg', key: 'district', label: 'Zoning', options: [['auto', 'Zoned'], ...districtOpts] },
    { kind: 'seg', key: 'landmarks', label: 'Landmarks', options: [['on', 'Civic, church, hospital, stadium'], ['off', 'None']] },
    { kind: 'seed', key: 'seed' },
    { kind: 'range', key: 'size', label: 'City size', min: 300, max: 1400, step: 50, unit: 'm' },
    { kind: 'range', key: 'blockMax', label: 'Block size', min: 70, max: 200, step: 5, unit: 'm' },
    { kind: 'range', key: 'density', label: 'Downtown height', min: 0, max: 3, step: 0.1, unit: '×' },
    { kind: 'range', key: 'parks', label: 'Parks', min: 0, max: 0.4, step: 0.02, unit: '%' },
    { kind: 'seg', key: 'detail', label: 'Detail', options: DETAIL },
    { kind: 'hint', text: 'Low detail is the game-ready LOD. Export the layout JSON to get the road graph.' },
  ],
};

const viewer = new Viewer($('#viewport'));
let lastExport: unknown = null;
let genToken = 0;
let framedFor = '';

/* ---------- panel ---------- */

function renderPanel() {
  const mode = state.mode;
  const s = state[mode];
  $('#title').textContent = COPY[mode][0];
  $('#subtitle').textContent = COPY[mode][1];
  const root = $('#controls');
  root.replaceChildren();
  SCHEMA[mode].filter((c) => !c.when || c.when(s)).forEach((c, i) => {
    const el = document.createElement('div');
    el.className = c.kind === 'hint' ? 'hint' : 'field';
    el.style.setProperty('--i', String(i));
    root.append(el);
    if (c.kind === 'hint') el.textContent = c.text;
    if (c.kind === 'styles') {
      el.innerHTML = `<div class="label">Style</div><div class="styles"></div><div class="label group">Landmarks</div><div class="styles"></div>`;
      const [grid, lmGrid] = el.querySelectorAll('.styles');
      const cards = [
        ...STYLES.map((st) => ({ id: st.id, name: st.name, blurb: st.blurb, sw: [st.palette.wall[0], st.palette.trim[0], st.palette.roof[0], st.palette.glass[0]], host: grid })),
        ...LANDMARKS.map((l) => ({ id: l.id, name: l.name, blurb: l.blurb, sw: [...l.swatch], host: lmGrid })),
      ];
      for (const card of cards) {
        const btn = document.createElement('button');
        btn.className = 'style';
        btn.setAttribute('aria-pressed', String(s.style === card.id));
        btn.innerHTML = `<div class="swatch">${card.sw.map((h) => `<i style="background:${h}"></i>`).join('')}</div><b>${card.name}</b><span>${card.blurb}</span>`;
        btn.onclick = () => {
          const changed = isLandmark(s) !== card.id in LANDMARK;
          s.style = card.id;
          el.querySelectorAll('.style').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          if (changed) {
            const scroll = root.scrollTop;
            renderPanel();
            root.scrollTop = scroll;
          }
          generate();
        };
        card.host.append(btn);
      }
    }
    if (c.kind === 'seg') {
      el.innerHTML = `<div class="label">${c.label}</div><div class="seg" role="group" aria-label="${c.label}"></div>`;
      const seg = el.querySelector('.seg')!;
      for (const [value, label] of c.options) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.setAttribute('aria-pressed', String(String(s[c.key]) === value));
        btn.onclick = () => {
          s[c.key] = value;
          seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          generate();
        };
        seg.append(btn);
      }
    }
    if (c.kind === 'select') {
      el.innerHTML = `<label class="label" for="sel-${c.key}">${c.label}</label><div class="select"><select id="sel-${c.key}">${c.options
        .map(([v, l]) => `<option value="${v}"${String(s[c.key]) === v ? ' selected' : ''}>${l}</option>`)
        .join('')}</select><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>`;
      el.querySelector('select')!.onchange = (e) => {
        s[c.key] = (e.target as HTMLSelectElement).value;
        generate();
      };
    }
    if (c.kind === 'range') {
      const fmt = (v: number) => (c.auto && v === 0 ? c.auto : c.unit === '%' ? `${Math.round(v * 100)}%` : `${+v.toFixed(2)}${c.unit ? ` ${c.unit}` : ''}`);
      el.innerHTML = `<label class="label"><span>${c.label}</span><output></output></label><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${s[c.key]}" aria-label="${c.label}">`;
      const input = el.querySelector('input')!, out = el.querySelector('output')!;
      const sync = () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        input.style.setProperty('--p', `${((v - c.min) / (c.max - c.min)) * 100}%`);
      };
      sync();
      input.oninput = () => {
        s[c.key] = Number(input.value);
        sync();
        generate(mode === 'city' ? 260 : mode === 'block' ? 90 : 0);
      };
    }
    if (c.kind === 'seed') {
      el.innerHTML = `<label class="label" for="seed">Seed</label><div class="seed"><input id="seed" inputmode="numeric" value="${s.seed}" aria-label="Seed"><button aria-label="Random seed" title="Random seed"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg></button></div>`;
      const input = el.querySelector('input')!;
      input.onchange = () => {
        s.seed = Math.abs(parseInt(input.value, 10) || 0);
        input.value = String(s.seed);
        generate();
      };
      el.querySelector('button')!.onclick = shuffle;
    }
  });
}

function setMode(mode: Mode) {
  state.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  moveThumb();
  renderPanel();
  generate();
}

function moveThumb() {
  const active = $<HTMLButtonElement>(`.tabs button[data-mode="${state.mode}"]`);
  const thumb = $('.tabs .thumb');
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function shuffle() {
  const s = state[state.mode];
  s.seed = newSeed();
  const input = document.querySelector<HTMLInputElement>('#seed');
  if (input) input.value = String(s.seed);
  const dice = $('.dice');
  dice.classList.remove('spin');
  void dice.getBoundingClientRect();
  dice.classList.add('spin');
  generate();
}

/* ---------- generation ---------- */

let debounce = 0;
function generate(delay = 0) {
  clearTimeout(debounce);
  debounce = window.setTimeout(run, delay);
}

async function run() {
  const token = ++genToken;
  const t0 = performance.now();
  const mode = state.mode;
  const s = state[mode];
  const detail = Number(s.detail);
  progress(0.15);
  viewer.clear();
  viewer.showStage(mode === 'building');
  let count = 0;

  if (mode === 'building' && isLandmark(s)) {
    const b = new Builder();
    const lm = LANDMARK[s.style];
    const [w, d] = [lm.size[0] * s.scale, lm.size[1] * s.scale];
    const info = generateLandmark(b, { kind: s.style, seed: s.seed, width: w, depth: d, detail });
    viewer.add(b, 120, 1100);
    count = 1;
    const key = `l${s.style}:${s.scale}`;
    if (framedFor !== key) viewer.frame(Math.hypot(w, d) / 2, { height: Math.min(info.height, 40) });
    framedFor = key;
    lastExport = { kind: 'landmark', params: { ...s }, info };
    setInfo([lm.name, `${w.toFixed(0)} × ${d.toFixed(0)} m`, `${info.height.toFixed(1)} m tall`]);
  } else if (mode === 'building') {
    const b = new Builder();
    const info = generateBuilding(b, {
      style: STYLE[s.style], seed: s.seed, width: s.width, depth: s.depth, detail,
      floors: s.floors || undefined, shape: s.shape, roof: s.roof, corner: s.corner,
    });
    viewer.add(b, 120, 1000);
    count = 1;
    const radius = Math.hypot(s.width, s.depth) / 2;
    const key = `b${Math.round(radius / 4)}:${Math.round(info.height / 8)}`;
    if (framedFor !== key) viewer.frame(radius, { height: info.height });
    framedFor = key;
    lastExport = { kind: 'building', params: { ...s }, info };
    setInfo([STYLE[s.style].name, shapeName(info.shape), `${info.floors} floors`, `${info.roof} roof`, `${info.height.toFixed(1)} m`]);
  }

  if (mode === 'block') {
    const W = s.width, D = s.depth;
    const roads = new Builder();
    const rw = 12;
    buildRoads(roads, {
      size: Math.max(W, D) + 60,
      blocks: [],
      roads: [
        { x0: -W / 2 - rw, z0: D / 2 + rw / 2, x1: W / 2 + rw, z1: D / 2 + rw / 2, width: rw, kind: 'local' },
        { x0: -W / 2 - rw, z0: -D / 2 - rw / 2, x1: W / 2 + rw, z1: -D / 2 - rw / 2, width: rw, kind: 'local' },
        { x0: -W / 2 - rw / 2, z0: -D / 2 - rw, x1: -W / 2 - rw / 2, z1: D / 2 + rw, width: rw, kind: 'local' },
        { x0: W / 2 + rw / 2, z0: -D / 2 - rw, x1: W / 2 + rw / 2, z1: D / 2 + rw, width: rw, kind: 'local' },
      ],
    }, detail);
    viewer.add(roads, 0, 500);
    const b = new Builder();
    const lots = generateBlock(b, { width: W, depth: D, seed: s.seed, detail, district: s.district, style: s.style || undefined, landmark: s.landmark || undefined });
    viewer.add(b, 150, 1100);
    count = lots.length;
    const key = `k${W}:${D}`;
    if (framedFor !== key) viewer.frame(Math.hypot(W, D) / 2, { height: 20 });
    framedFor = key;
    lastExport = { kind: 'block', params: { ...s }, curb: CURB, lots };
    setInfo([s.landmark ? LANDMARK[s.landmark].name : s.style ? STYLE[s.style].name : DISTRICTS[s.district].name, `${lots.length} lots`, `${W} × ${D} m`]);
  }

  if (mode === 'city') {
    const layout: CityLayout = layoutCity({ size: s.size, seed: s.seed, blockMin: Math.min(55, s.blockMax * 0.55), blockMax: s.blockMax, parks: s.parks, density: s.density, district: s.district, landmarks: s.landmarks === 'on' });
    const key = `c${s.size}`;
    if (framedFor !== key) viewer.frame(s.size * 0.42, { height: 40 });
    framedFor = key;
    const roads = new Builder();
    buildRoads(roads, layout, detail);
    viewer.add(roads, 0, 500);
    const order = [...layout.blocks].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const allLots: (Lot & { block: number })[] = [];
    let slice = performance.now();
    for (let i = 0; i < order.length; i++) {
      const bl = order[i];
      const b = new Builder();
      const lots = generateBlock(b, { width: bl.w, depth: bl.d, seed: bl.seed, detail, district: bl.district, heightScale: bl.heightScale, park: bl.park, landmark: bl.landmark }, bl.x, bl.z);
      lots.forEach((l) => allLots.push({ ...l, x: l.x + bl.x, z: l.z + bl.z, block: layout.blocks.indexOf(bl) }));
      count += lots.length;
      viewer.add(b, 0, 900);
      if (performance.now() - slice > 14) {
        progress(0.15 + (0.85 * i) / order.length);
        updateStats(count, performance.now() - t0);
        await new Promise(requestAnimationFrame);
        if (token !== genToken) return;
        slice = performance.now();
      }
    }
    lastExport = { kind: 'city', params: { ...s }, roads: layout.roads, blocks: layout.blocks, lots: allLots };
    const districts = new Set(layout.blocks.map((b) => DISTRICTS[b.district].name));
    const marks = layout.blocks.filter((b) => b.landmark).length;
    setInfo([`${layout.blocks.length} blocks`, `${count} buildings`, `${marks} landmarks`, `${layout.roads.length} roads`, [...districts].join(' · ')]);
  }

  if (token !== genToken) return;
  progress(1);
  const ms = performance.now() - t0;
  requestAnimationFrame(() => updateStats(count, ms));
}

const shapeName = (s: string) => ({ rect: 'Box', L: 'L-shape', T: 'T-shape', U: 'U-shape', court: 'Courtyard' })[s] ?? s;

/* ---------- chrome ---------- */

function setInfo(parts: string[]) {
  $('#info').innerHTML = parts.map((p, i) => (i === 0 ? `<b>${p}</b>` : `<i class="dot"></i><span>${p}</span>`)).join('');
}

const fmtNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
function updateStats(buildings: number, ms: number) {
  const st = viewer.stats();
  const rows: [string, string][] = [['Buildings', String(buildings)], ['Vertices', fmtNum(st.verts)], ['Triangles', fmtNum(st.tris)], ['Draw calls', String(st.calls)], ['Time', `${Math.round(ms)} ms`]];
  $('#stats').innerHTML = rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
}

let progressTimer = 0;
function progress(p: number) {
  const bar = $('.progress');
  bar.classList.add('on');
  bar.querySelector('i')!.style.transform = `scaleX(${p})`;
  clearTimeout(progressTimer);
  if (p >= 1)
    progressTimer = window.setTimeout(() => {
      bar.classList.remove('on');
      setTimeout(() => (bar.querySelector('i')!.style.transform = 'scaleX(0)'), 500);
    }, 300);
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function setNight(on: boolean) {
  state.night = on;
  document.documentElement.dataset.theme = on ? 'dark' : 'light';
  viewer.setNight(on);
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode as Mode)));
$('#night').onclick = () => setNight(!state.night);
$('#shuffle').onclick = shuffle;
$('.handle').onclick = () => $('.panel').classList.toggle('collapsed');

const menu = $('.menu');
$('#export').onclick = (e) => {
  e.stopPropagation();
  menu.classList.toggle('open');
  $('#export').setAttribute('aria-expanded', String(menu.classList.contains('open')));
};
document.addEventListener('click', () => menu.classList.remove('open'));
document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(
  (b) =>
    (b.onclick = async () => {
      menu.classList.remove('open');
      const name = `plinth-${state.mode}-${state[state.mode].seed}`;
      if (b.dataset.export === 'glb') {
        toast('Exporting model…');
        download(await viewer.exportGLB(), `${name}.glb`);
        toast('GLB exported');
      } else {
        download(new Blob([JSON.stringify(lastExport, null, 1)], { type: 'application/json' }), `${name}.json`);
        toast('Layout exported');
      }
    }),
);

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
  if (e.key === 'r') shuffle();
  if (e.key === 'n') setNight(!state.night);
  const modes: Mode[] = ['building', 'block', 'city'];
  if (['1', '2', '3'].includes(e.key)) setMode(modes[Number(e.key) - 1]);
});
addEventListener('resize', moveThumb);
document.fonts.ready.then(moveThumb);

setNight(state.night);
viewer.controls.autoRotate = true;
setMode('building');
if (import.meta.env.DEV) Object.assign(window, { viewer });
