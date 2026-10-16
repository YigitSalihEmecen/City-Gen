import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Builder, Part } from './engine/mesh.ts';

const DAY = { sky: new THREE.Color('#E6E2DA'), ground: new THREE.Color('#DCD6CB'), sun: 2.0, hemi: 0.75, env: 0.35 };
const NIGHT = { sky: new THREE.Color('#12151C'), ground: new THREE.Color('#1A1D24'), sun: 0.12, hemi: 0.28, env: 0.08 };
const ease = (t: number) => 1 - (1 - t) ** 3;

interface Anim {
  mesh: THREE.Object3D;
  t0: number;
  dur: number;
  out?: boolean;
}

export class Viewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.5, 6000);
  controls: OrbitControls;
  content = new THREE.Group();
  night = { value: 0 };
  private nightTarget = 0;
  private sun = new THREE.DirectionalLight('#FFF1DE', DAY.sun);
  private hemi = new THREE.HemisphereLight('#F4EEE4', '#B9AE9C', DAY.hemi);
  private ground: THREE.Mesh;
  private stage: THREE.Mesh;
  private anims: Anim[] = [];
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number; dur: number } | null = null;
  private shadowSize = 60;
  private solid: THREE.MeshStandardMaterial;
  private glass: THREE.MeshStandardMaterial;

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = DAY.env;
    this.scene.background = DAY.sky.clone();
    this.scene.fog = new THREE.Fog(DAY.sky.clone(), 400, 2400);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.content);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(5000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: DAY.ground, roughness: 1 }));
    this.ground.position.y = -0.02;
    this.ground.receiveShadow = true;
    this.stage = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#D6CFC1', roughness: 0.95 }));
    this.stage.position.y = -0.01;
    this.stage.receiveShadow = true;
    this.scene.add(this.ground, this.stage);

    this.solid = this.material({ roughness: 0.88, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
    this.glass = this.material({ roughness: 0.12, metalness: 0.55, envMapIntensity: 1.4 });
    this.glass.polygonOffset = true;
    this.glass.polygonOffsetFactor = -1;

    this.camera.position.set(48, 30, 56);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 2600;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      this.camTween = null;
    });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  /** Vertex-coloured standard material plus a per-vertex warm emission that fades in at night. */
  private material(opts: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this.night;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (vEmit > 1.5 ? diffuseColor.rgb * 3.0 : vec3(1.0, 0.72, 0.42)) * min(vEmit, 1.0) * uNight * 2.2;');
    };
    return m;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (w > 760) this.camera.setViewOffset(w, h, -178, 0, w, h);
    else this.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    this.camera.updateProjectionMatrix();
  }

  private geometry(p: Part) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
    g.setAttribute('emit', new THREE.Float32BufferAttribute(p.emit, 1));
    g.setIndex(p.idx);
    g.computeBoundingSphere();
    return g;
  }

  /** Adds a builder's merged buffers as (at most) two meshes that grow out of the ground. */
  add(b: Builder, delay = 0, dur = 900) {
    const group = new THREE.Group();
    for (const [part, mat] of [[b.solid, this.solid], [b.glass, this.glass]] as const) {
      if (!part.idx.length) continue;
      const mesh = new THREE.Mesh(this.geometry(part), mat);
      mesh.castShadow = mat === this.solid;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.scale.y = 0.0001;
    this.content.add(group);
    this.anims.push({ mesh: group, t0: performance.now() + delay, dur });
    return group;
  }

  clear() {
    const now = performance.now();
    this.anims = this.anims.filter((a) => !a.out);
    for (const child of [...this.content.children]) {
      this.anims = this.anims.filter((a) => a.mesh !== child);
      this.anims.push({ mesh: child, t0: now, dur: 280, out: true });
    }
  }

  /** Smoothly moves the camera to frame a scene of the given radius. */
  frame(radius: number, opts: { height?: number; target?: THREE.Vector3; instant?: boolean } = {}) {
    const h = opts.height ?? 0;
    const target = opts.target ?? new THREE.Vector3(0, h * 0.46, 0);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.25) dir.y = 0.35;
    dir.normalize();
    const dist = Math.max(Math.hypot(radius, h / 2) * (h > radius * 2 ? 4.1 : 3.5), 30) * Math.max(1, 1.2 / this.camera.aspect) ** 0.75;
    const to = target.clone().add(dir.multiplyScalar(dist));
    this.shadowSize = Math.min(Math.max(radius * 1.4, 40), 520);
    this.stage.scale.setScalar(radius + 6);
    if (opts.instant) {
      this.camera.position.copy(to);
      this.controls.target.copy(target);
      return;
    }
    this.camTween = { from: this.camera.position.clone(), to, tFrom: this.controls.target.clone(), tTo: target, t0: performance.now(), dur: 1100 };
  }

  showStage(on: boolean) {
    this.stage.visible = on;
  }

  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
  }

  stats() {
    let verts = 0, tris = 0;
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.anims.some((a) => a.out && a.mesh === o.parent)) {
        verts += o.geometry.attributes.position.count;
        tris += (o.geometry.index?.count ?? 0) / 3;
      }
    });
    return { verts, tris, calls: this.renderer.info.render.calls };
  }

  async exportGLB(): Promise<Blob> {
    const live = new THREE.Group();
    for (const g of this.content.children) if (!this.anims.some((a) => a.out && a.mesh === g)) live.add(g.clone());
    const data = await new GLTFExporter().parseAsync(live, { binary: true });
    return new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' });
  }

  private tick(now: number) {
    this.anims = this.anims.filter((a) => {
      const t = Math.min(1, Math.max(0, (now - a.t0) / a.dur));
      if (a.out) {
        a.mesh.scale.y = Math.max(0.0001, 1 - ease(t));
        if (t >= 1) {
          this.content.remove(a.mesh);
          a.mesh.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
          return false;
        }
        return true;
      }
      a.mesh.scale.y = Math.max(0.0001, ease(t));
      return t < 1;
    });

    if (this.camTween) {
      const tw = this.camTween;
      const t = ease(Math.min(1, (now - tw.t0) / tw.dur));
      this.camera.position.lerpVectors(tw.from, tw.to, t);
      this.controls.target.lerpVectors(tw.tFrom, tw.tTo, t);
      if (t >= 1) this.camTween = null;
    }

    const k = this.night.value + (this.nightTarget - this.night.value) * 0.06;
    this.night.value = Math.abs(k - this.nightTarget) < 0.001 ? this.nightTarget : k;
    const n = this.night.value;
    (this.scene.background as THREE.Color).lerpColors(DAY.sky, NIGHT.sky, n);
    this.scene.fog!.color.copy(this.scene.background as THREE.Color);
    (this.ground.material as THREE.MeshStandardMaterial).color.lerpColors(DAY.ground, NIGHT.ground, n);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sun, NIGHT.sun, n);
    this.sun.color.set(n > 0.5 ? '#9DB2D9' : '#FFF1DE');
    this.hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, n);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(DAY.env, NIGHT.env, n);

    const tgt = this.controls.target;
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).add(new THREE.Vector3(0.55, 0.85, 0.4).multiplyScalar(this.shadowSize * 2));
    const cam = this.sun.shadow.camera;
    const s = this.shadowSize;
    if (cam.right !== s) {
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
      cam.near = 1; cam.far = s * 5;
      cam.updateProjectionMatrix();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
