// Prototype de plateau en vraie 3D (Three.js).
// Reprend le même plateau (pièces, portes, décor) que la version isométrique,
// avec lumières, ombres, personnages animés et une caméra qui change d'angle.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELLS,
  CELL_ROOM,
  CENTER_RECT,
  DOORS,
  ROOMS,
  ROOM_RECTS,
  SUSPECTS,
  type Destination,
  type Position,
  type RoomId,
  type SuspectId,
} from '../games/cluedo/engine';
import { DECOR, FLOOR, WALL, type DecorItem } from '../games/cluedo/board3d/decor';
import { makeFigure, type Figure } from './figure';

const Z = 1.45 / WALL.height; // conversion hauteur « pixels » du décor -> unités 3D
const WALL_H = 1.45;
const OX = -BOARD_WIDTH / 2;
const OZ = -BOARD_HEIGHT / 2;

/** Case (x, y) de la grille -> point 3D (centre de la case). */
function world(gx: number, gy: number, h = 0) {
  return new THREE.Vector3(gx + OX, h, gy + OZ);
}

function roomSlot(room: RoomId, suspect: SuspectId) {
  const r = ROOM_RECTS[room];
  const i = SUSPECTS.findIndex((s) => s.id === suspect);
  return { x: r.x + r.w / 2 + ((i % 3) - 1) * 0.85, y: r.y + r.h / 2 + Math.floor(i / 3) * 0.85 - 0.1 };
}

function gridOf(p: Position, s: SuspectId) {
  return p.type === 'cell' ? { x: p.x + 0.5, y: p.y + 0.5 } : roomSlot(p.room, s);
}

type CamMode = 'auto' | 'free';

interface WallSeg {
  mesh: THREE.Mesh;
  normal: THREE.Vector3; // vers l'extérieur de la pièce
  center: THREE.Vector3;
}

export class Board3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;

  private figures = new Map<SuspectId, Figure>();
  private walking = new Set<SuspectId>();
  private walls: WallSeg[] = [];
  private highlight = new THREE.Group();
  private ring: THREE.Mesh;
  private fireLight: THREE.PointLight | null = null;
  private reach = new Map<string, Destination>();
  private onPick: ((d: Destination) => void) | null = null;

  // Caméra automatique : position et cible visées, vers lesquelles on glisse en douceur
  mode: CamMode = 'auto';
  private camGoal = { pos: new THREE.Vector3(0, 20, 18), look: new THREE.Vector3(0, 0, 0), speed: 2.5 };
  private camLook = new THREE.Vector3();
  private follow: SuspectId | null = null;
  private followEnabled = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x14151b);
    this.scene.fog = new THREE.Fog(0x14151b, 55, 110);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 22, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 45;
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => {
      // Dès que le joueur touche la caméra, on passe en vue libre
      if (this.mode === 'auto') this.setMode('free');
    });

    this.buildLights();
    this.buildBoard();
    this.scene.add(this.highlight);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.scene.add(this.ring);

    for (const s of SUSPECTS) {
      const f = makeFigure(parseInt(s.color.slice(1), 16));
      f.root.scale.setScalar(0.9);
      this.scene.add(f.root);
      this.figures.set(s.id, f);
    }

    this.setupPicking();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.overview(0);
    this.loop();
  }

  // ------------------------------------------------------------------ Construction

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(-10, 22, -6);
    sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const c = sun.shadow.camera;
    c.left = -18; c.right = 18; c.top = 18; c.bottom = -18; c.near = 1; c.far = 60;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Une lampe chaude dans chaque pièce
    for (const r of ROOMS) {
      const rect = ROOM_RECTS[r.id as RoomId];
      const l = new THREE.PointLight(0xffc98a, 6, 7, 1.6);
      l.position.copy(world(rect.x + rect.w / 2, rect.y + rect.h / 2, 2.2));
      this.scene.add(l);
    }
  }

  private mat(color: number, rough = 0.8) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough });
  }

  private buildBoard() {
    // Socle
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + 0.6, 0.5, BOARD_HEIGHT + 0.6), this.mat(0x3b2416));
    slab.position.set(0, -0.26, 0);
    slab.receiveShadow = true;
    this.scene.add(slab);

    // Sol : une tuile par case (instanciée = rapide)
    const tiles: { x: number; y: number; color: number }[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const t = CELLS[y][x];
        const odd = (x + y) % 2 === 1;
        if (t === 'corridor') tiles.push({ x, y, color: odd ? 0xd8c9a3 : 0xcdbd94 });
        else if (t === 'room') {
          const f = FLOOR[CELL_ROOM[y][x]!];
          tiles.push({ x, y, color: odd ? f.b : f.a });
        } else if (t === 'center') tiles.push({ x, y, color: 0x24242b });
        else tiles.push({ x, y, color: 0x4a2f1c });
      }
    const tileGeo = new THREE.BoxGeometry(0.98, 0.04, 0.98);
    const tileMesh = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), tiles.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    tiles.forEach((t, i) => {
      m.setPosition(world(t.x + 0.5, t.y + 0.5, 0));
      tileMesh.setMatrixAt(i, m);
      tileMesh.setColorAt(i, col.setHex(t.color));
    });
    tileMesh.receiveShadow = true;
    this.scene.add(tileMesh);

    // Paillassons
    for (const d of DOORS) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.7), this.mat(0x9b7442));
      mat.position.copy(world(d.x + 0.5, d.y + 0.5, 0.01));
      mat.receiveShadow = true;
      this.scene.add(mat);
    }

    for (const r of ROOMS) this.buildWalls(r.id as RoomId);
    for (const items of Object.values(DECOR)) for (const it of items) this.buildDecor(it);

    // Centre : l'enveloppe
    const c = CENTER_RECT;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(c.w - 0.4, 0.3, c.h - 0.4), this.mat(0x24242c, 0.5));
    plinth.position.copy(world(c.x + c.w / 2, c.y + c.h / 2, 0.15));
    plinth.castShadow = plinth.receiveShadow = true;
    this.scene.add(plinth);
    const env = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.95), this.mat(0xe9dcc0));
    env.position.copy(world(c.x + c.w / 2, c.y + c.h / 2, 0.33));
    env.rotation.y = 0.25;
    env.castShadow = true;
    this.scene.add(env);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), this.mat(0x8c1d1d, 0.4));
    seal.position.copy(env.position).add(new THREE.Vector3(0, 0.035, 0));
    this.scene.add(seal);
    const q = this.label('?', 96, '#c9a24a');
    q.position.copy(world(c.x + c.w / 2, c.y + c.h / 2, 1.1));
    q.scale.set(0.9, 0.9, 1);
    this.scene.add(q);

    // Noms des pièces
    for (const r of ROOMS) {
      const rect = ROOM_RECTS[r.id as RoomId];
      const s = this.label(r.name.toUpperCase(), 44, '#fff7e0');
      s.position.copy(world(rect.x + rect.w / 2, rect.y + rect.h - 0.3, 0.35));
      this.scene.add(s);
    }
  }

  /** Texte toujours face à la caméra. */
  private label(text: string, px: number, color: string) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${px}px system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + px;
    canvas.width = w;
    canvas.height = Math.ceil(px * 1.5);
    ctx.font = `bold ${px}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = px / 6;
    ctx.strokeStyle = '#1a1208';
    ctx.strokeText(text, w / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const scale = 0.011;
    sprite.scale.set(canvas.width * scale * 0.6, canvas.height * scale * 0.6, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private buildWalls(room: RoomId) {
    const r = ROOM_RECTS[room];
    const gaps = { n: new Set<number>(), s: new Set<number>(), w: new Set<number>(), e: new Set<number>() };
    for (const d of DOORS.filter((dd) => dd.room === room)) {
      if (d.y === r.y - 1) gaps.n.add(d.x);
      else if (d.y === r.y + r.h) gaps.s.add(d.x);
      else if (d.x === r.x - 1) gaps.w.add(d.y);
      else if (d.x === r.x + r.w) gaps.e.add(d.y);
    }
    const T = 0.12;
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL.color, roughness: 0.9 });
    const geoX = new THREE.BoxGeometry(1, 1, T);
    const geoZ = new THREE.BoxGeometry(T, 1, 1);
    const add = (geo: THREE.BoxGeometry, x: number, y: number, normal: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.scale.y = WALL_H;
      const center = world(x, y, 0);
      mesh.position.set(center.x, WALL_H / 2, center.z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.walls.push({ mesh, normal, center });
    };
    for (let i = 0; i < r.w; i++) {
      const x = r.x + i + 0.5;
      if (!gaps.n.has(r.x + i)) add(geoX, x, r.y + T / 2, new THREE.Vector3(0, 0, -1));
      if (!gaps.s.has(r.x + i)) add(geoX, x, r.y + r.h - T / 2, new THREE.Vector3(0, 0, 1));
    }
    for (let j = 0; j < r.h; j++) {
      const y = r.y + j + 0.5;
      if (!gaps.w.has(r.y + j)) add(geoZ, r.x + T / 2, y, new THREE.Vector3(-1, 0, 0));
      if (!gaps.e.has(r.y + j)) add(geoZ, r.x + r.w - T / 2, y, new THREE.Vector3(1, 0, 0));
    }
  }

  private buildDecor(it: DecorItem) {
    const add = (mesh: THREE.Object3D) => {
      mesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.scene.add(mesh);
    };
    switch (it.kind) {
      case 'box': {
        const h = it.h * Z;
        const side = this.mat(it.color);
        const top = this.mat(it.top ?? it.color);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(it.w, h, it.d), [side, side, top, side, side, side]);
        mesh.position.copy(world(it.x + it.w / 2, it.y + it.d / 2, h / 2));
        add(mesh);
        if (it.stripes) {
          // Livres sur la face avant
          const g = new THREE.Group();
          const shelves = 3;
          let k = 0;
          for (let s = 0; s < shelves; s++) {
            const y0 = 0.06 + (s * (h - 0.1)) / shelves;
            for (let bx = it.x + 0.06; bx < it.x + it.w - 0.1; bx += 0.12) {
              const bh = (h - 0.1) / shelves - 0.05 - ((k * 13) % 4) * 0.015;
              const book = new THREE.Mesh(new THREE.BoxGeometry(0.09, bh, 0.06), this.mat(it.stripes[(k++ * 7 + s * 3) % it.stripes.length]));
              book.position.copy(world(bx + 0.045, it.y + it.d + 0.02, y0 + bh / 2));
              g.add(book);
            }
          }
          add(g);
        }
        break;
      }
      case 'cyl': {
        const h = it.h * Z;
        const side = this.mat(it.color);
        const top = this.mat(it.top ?? it.color);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(it.r, it.r, h, 20), [side, top, side]);
        mesh.position.copy(world(it.x, it.y, h / 2));
        add(mesh);
        break;
      }
      case 'plant': {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(it.r * 0.55, it.r * 0.42, 0.45, 14), this.mat(0xa0522d));
        pot.position.y = 0.22;
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(it.r * 0.9, 0), this.mat(0x2f7a35, 0.9));
        leaves.position.y = 0.45 + it.r * 0.7;
        const leaves2 = new THREE.Mesh(new THREE.IcosahedronGeometry(it.r * 0.6, 0), this.mat(0x47a34d, 0.9));
        leaves2.position.set(it.r * 0.3, 0.45 + it.r * 1.3, -it.r * 0.2);
        g.add(pot, leaves, leaves2);
        g.position.copy(world(it.x, it.y));
        add(g);
        break;
      }
      case 'rug': {
        const rug = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.02, it.d), this.mat(it.color, 1));
        rug.position.copy(world(it.x + it.w / 2, it.y + it.d / 2, 0.03));
        rug.receiveShadow = true;
        this.scene.add(rug);
        if (it.border) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(it.w - 0.4, 0.022, it.d - 0.4), this.mat(it.border, 1));
          b.position.copy(rug.position).add(new THREE.Vector3(0, 0.002, 0));
          const inner = new THREE.Mesh(new THREE.BoxGeometry(it.w - 0.5, 0.024, it.d - 0.5), this.mat(it.color, 1));
          inner.position.copy(rug.position).add(new THREE.Vector3(0, 0.004, 0));
          b.receiveShadow = inner.receiveShadow = true;
          this.scene.add(b, inner);
        }
        break;
      }
      case 'fire': {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
        flame.position.copy(world(it.x, it.y, 0.25));
        this.scene.add(flame);
        const l = new THREE.PointLight(0xff7a1a, 8, 6, 1.5);
        l.position.copy(world(it.x, it.y + 0.4, 0.6));
        this.scene.add(l);
        this.fireLight = l;
        break;
      }
      case 'stairs': {
        const sd = it.d / it.steps;
        for (let i = 0; i < it.steps; i++) {
          const h = (it.steps - i) * 6 * Z;
          const step = new THREE.Mesh(new THREE.BoxGeometry(it.w, h, sd), this.mat(i % 2 ? it.color : 0xc9bfaa));
          step.position.copy(world(it.x + it.w / 2, it.y + i * sd + sd / 2, h / 2));
          add(step);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ Pions

  place(s: SuspectId, p: Position) {
    const g = gridOf(p, s);
    const f = this.figures.get(s)!;
    f.root.position.copy(world(g.x, g.y));
  }

  /** Fait marcher un personnage le long d'un chemin, case par case. */
  walk(s: SuspectId, path: Position[]): Promise<void> {
    const f = this.figures.get(s)!;
    const points = path.slice(1).map((p) => {
      const g = gridOf(p, s);
      return world(g.x, g.y);
    });
    this.walking.add(s);
    if (this.mode === 'auto' && this.followEnabled) this.follow = s;
    const SPEED = 2.6; // cases par seconde
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= points.length) {
          this.walking.delete(s);
          this.follow = null;
          return resolve();
        }
        const from = f.root.position.clone();
        const to = points[i++];
        const dist = from.distanceTo(to);
        const dur = Math.max(0.12, dist / SPEED);
        const targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
        let t = 0;
        const tick = (dt: number) => {
          t += dt / dur;
          const k = Math.min(1, t);
          f.root.position.lerpVectors(from, to, k);
          // tourner doucement dans la direction de la marche
          let d = targetYaw - f.root.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          f.root.rotation.y += d * Math.min(1, dt * 12);
          if (k >= 1) {
            this.tickers.delete(tick);
            step();
          }
        };
        this.tickers.add(tick);
      };
      step();
    });
  }

  private tickers = new Set<(dt: number) => void>();
  private hlCell = new THREE.MeshBasicMaterial({ color: 0x5fd35f, transparent: true, opacity: 0.55, depthWrite: false });
  private hlRoom = new THREE.MeshBasicMaterial({ color: 0x5fd35f, transparent: true, opacity: 0.22, depthWrite: false });

  setCurrent(s: SuspectId | null) {
    this.ring.visible = !!s;
    this.current = s;
  }
  private current: SuspectId | null = null;

  setReach(dests: Destination[], onPick: (d: Destination) => void) {
    this.onPick = onPick;
    this.reach.clear();
    this.highlight.clear();
    const mat = this.hlCell;
    const roomMat = this.hlRoom;
    for (const d of dests) {
      if (d.to.type === 'cell') {
        this.reach.set(`${d.to.x},${d.to.y}`, d);
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), mat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.copy(world(d.to.x + 0.5, d.to.y + 0.5, 0.035));
        this.highlight.add(tile);
      } else {
        this.reach.set(`room:${d.to.room}`, d);
        const r = ROOM_RECTS[d.to.room];
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.2, r.h - 0.2), roomMat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.copy(world(r.x + r.w / 2, r.y + r.h / 2, 0.05));
        this.highlight.add(tile);
      }
    }
  }

  // ------------------------------------------------------------------ Caméra

  setMode(mode: CamMode) {
    this.mode = mode;
    this.controls.enabled = mode === 'free';
    if (mode === 'free') this.controls.target.copy(this.camLook);
    this.host.dispatchEvent(new CustomEvent('cammode', { detail: mode }));
  }

  /** Intro : la caméra fait le tour du plateau en descendant, pour montrer le relief. */
  intro(duration = 6): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      const tick = (dt: number) => {
        t += dt / duration;
        const k = Math.min(1, t);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const angle = Math.PI * 1.25 + ease * Math.PI * 2;
        const radius = 22 - ease * 6;
        const height = 16 - ease * 9;
        this.camGoal.pos.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        this.camGoal.look.set(0, 0.5, 0);
        this.camGoal.speed = 8;
        if (k >= 1) {
          this.tickers.delete(tick);
          resolve();
        }
      };
      this.tickers.add(tick);
    });
  }

  /** Vue d'ensemble légèrement inclinée. */
  overview(speed = 2) {
    this.follow = null;
    this.followEnabled = false;
    const narrow = this.camera.aspect < 0.8;
    this.camGoal.pos.set(0, narrow ? 36 : 27, narrow ? 24 : 21);
    this.camGoal.look.set(0, 0, 1);
    this.camGoal.speed = speed || 100;
  }

  /** Cadre un personnage de trois quarts. */
  focusOn(s: SuspectId, speed = 2.2) {
    this.followEnabled = true;
    const p = this.figures.get(s)!.root.position;
    this.camGoal.look.copy(p).add(new THREE.Vector3(0, 0.4, 0));
    this.camGoal.pos.copy(p).add(new THREE.Vector3(-3.2, 6.5, 6.2));
    this.camGoal.speed = speed;
  }

  /** Plan « cinéma » sur une pièce : depuis l'entrée, à hauteur d'homme. */
  roomShot(room: RoomId, speed = 1.6) {
    if (!this.followEnabled) return;
    const r = ROOM_RECTS[room];
    const c = world(r.x + r.w / 2, r.y + r.h / 2);
    this.camGoal.look.copy(c).add(new THREE.Vector3(0, 0.5, -0.3));
    // On se place devant la pièce (côté sud-est), assez bas
    this.camGoal.pos.copy(c).add(new THREE.Vector3(r.w * 0.35, 2.6, r.h * 0.75 + 1.6));
    this.camGoal.speed = speed;
  }

  private updateCamera(dt: number) {
    if (this.mode === 'free') {
      this.controls.update();
      this.camLook.copy(this.controls.target);
      return;
    }
    if (this.follow) {
      // Caméra derrière le personnage qui marche, un peu au-dessus
      const f = this.figures.get(this.follow)!.root;
      const yaw = f.rotation.y;
      const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      this.camGoal.pos.copy(f.position).addScaledVector(back, 3.4).add(new THREE.Vector3(0, 2.6, 0));
      this.camGoal.look.copy(f.position).addScaledVector(back, -1.6).add(new THREE.Vector3(0, 0.5, 0));
      this.camGoal.speed = 3.2;
    }
    const k = 1 - Math.exp(-dt * this.camGoal.speed);
    this.camera.position.lerp(this.camGoal.pos, k);
    this.camLook.lerp(this.camGoal.look, k);
    this.camera.lookAt(this.camLook);
  }

  /** Les murs entre la caméra et l'intérieur des pièces s'abaissent (vue « maison de poupée »). */
  private updateWalls(dt: number) {
    const camPos = this.camera.position;
    for (const w of this.walls) {
      const toCam = new THREE.Vector3(camPos.x - w.center.x, 0, camPos.z - w.center.z).normalize();
      const facing = toCam.dot(w.normal) > 0.25;
      const target = facing ? 0.12 : WALL_H;
      const s = w.mesh.scale.y + (target - w.mesh.scale.y) * Math.min(1, dt * 6);
      w.mesh.scale.y = s;
      w.mesh.position.y = s / 2;
    }
  }

  // ------------------------------------------------------------------ Boucle, toucher, taille

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    for (const t of [...this.tickers]) t(dt);
    for (const [s, f] of this.figures) f.animate(dt, this.walking.has(s));
    if (this.current) {
      const p = this.figures.get(this.current)!.root.position;
      this.ring.position.set(p.x, 0.03, p.z);
      const pulse = 1 + Math.sin(performance.now() / 250) * 0.1;
      this.ring.scale.set(pulse, pulse, pulse);
    }
    if (this.fireLight) this.fireLight.intensity = 7 + Math.random() * 3;
    const pulse = 0.75 + Math.sin(performance.now() / 300) * 0.25;
    this.hlCell.opacity = 0.55 * pulse;
    this.hlRoom.opacity = 0.25 * pulse;
    this.updateCamera(dt);
    this.updateWalls(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private setupPicking() {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let down: { x: number; y: number } | null = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      down = null;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const gx = Math.floor(hit.x - OX);
      const gy = Math.floor(hit.z - OZ);
      if (gx < 0 || gy < 0 || gx >= BOARD_WIDTH || gy >= BOARD_HEIGHT) return;
      let d = this.reach.get(`${gx},${gy}`);
      if (!d && CELLS[gy][gx] === 'room') d = this.reach.get(`room:${CELL_ROOM[gy][gx]}`);
      if (d) this.onPick?.(d);
    });
  }

  private resize() {
    const w = Math.max(this.host.clientWidth, 100);
    const h = Math.max(this.host.clientHeight, 100);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Sur un écran étroit (téléphone en portrait), on élargit le champ de vision
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
