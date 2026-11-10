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
  type WeaponId,
  WEAPONS,
} from '../games/cluedo/engine';
import { DECOR, FLOOR, WALL, type DecorItem } from '../games/cluedo/board3d/decor';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeFigure, type Figure } from './figure';
import { makeWeapon } from './weapons3d';
import { Dice3D } from './dice3d';
import { buildFurniture } from './furniture3d';

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

function weaponSlot(room: RoomId, weapon: WeaponId) {
  const r = ROOM_RECTS[room];
  const i = WEAPONS.findIndex((w) => w.id === weapon);
  return { x: r.x + 0.55 + i * ((r.w - 1.1) / 5), y: r.y + r.h - 0.55 };
}

function gridOf(p: Position, s: SuspectId) {
  return p.type === 'cell' ? { x: p.x + 0.5, y: p.y + 0.5 } : roomSlot(p.room, s);
}

type CamMode = 'auto' | 'free';

interface Door {
  pivot: THREE.Group;
  open: number; // angle quand la porte est ouverte
  target: number;
  /** Case de la pièce juste derrière la porte. */
  inside: { x: number; y: number };
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
  private weapons = new Map<WeaponId, THREE.Group>();
  private doors = new Map<string, Door>();
  private envMap: THREE.Texture | null = null;
  private pathGroup = new THREE.Group();
  private hoverKey: string | null = null;
  private pending = new Map<SuspectId, Position>();
  private dice!: Dice3D;
  /** Se résout quand les personnages 3D sont chargés. */
  ready: Promise<void>;
  private furnitureReady: Promise<void> = Promise.resolve();
  private walking = new Set<SuspectId>();
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

    // Reflets pour les armes en métal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.buildLights();
    this.buildBoard();
    this.scene.add(this.highlight, this.pathGroup);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.scene.add(this.ring);

    for (const s of SUSPECTS) {
      const f = makeFigure(parseInt(s.color.slice(1), 16));
      this.scene.add(f.root);
      this.figures.set(s.id, f);
    }
    for (const w of WEAPONS) {
      const m = makeWeapon(w.id as WeaponId, this.envMap);
      m.visible = false;
      this.scene.add(m);
      this.weapons.set(w.id as WeaponId, m);
    }
    this.ready = this.furnitureReady;

    const c = CENTER_RECT;
    this.dice = new Dice3D(this.scene, {
      center: world(c.x + c.w / 2, c.y + c.h / 2),
      halfX: (c.w - 0.5) / 2,
      halfZ: (c.h - 0.5) / 2,
      y: 0.3,
    });

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
    // Décor : on garde les tapis, la cheminée et le billard ; le reste vient du Furniture Kit
    for (const [room, items] of Object.entries(DECOR) as [RoomId, DecorItem[]][]) {
      for (const it of items) {
        if (it.kind === 'rug' || it.kind === 'fire') this.buildDecor(it);
        else if (room === 'salon' && it.kind === 'box' && it.h === 28) this.buildDecor(it); // cheminée
        else if (room === 'bibliotheque' && it.kind === 'box' && it.stripes) this.buildDecor(it); // étagères pleines de livres
        else if (room === 'billard' && it.x < 23) this.buildDecor({ ...it, y: it.y - 0.3 }); // table de billard
      }
    }
    this.furnitureReady = buildFurniture(this.scene, (x, y, h = 0) => world(x, y, h));

    // Centre : l'enveloppe
    const c = CENTER_RECT;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(c.w - 0.4, 0.3, c.h - 0.4), this.mat(0x24242c, 0.5));
    plinth.position.copy(world(c.x + c.w / 2, c.y + c.h / 2, 0.15));
    plinth.castShadow = plinth.receiveShadow = true;
    this.scene.add(plinth);
    const env = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.95), this.mat(0xe9dcc0));
    env.position.copy(world(c.x + c.w / 2 + 1.2, c.y + 1.1, 0.33));
    env.rotation.y = 0.25;
    env.castShadow = true;
    this.scene.add(env);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), this.mat(0x8c1d1d, 0.4));
    seal.position.copy(env.position).add(new THREE.Vector3(0, 0.035, 0));
    this.scene.add(seal);
    const q = this.label('?', 96, '#c9a24a');
    q.position.copy(world(c.x + c.w / 2 + 1.2, c.y + 1.1, 1.1));
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
    const wallMat = this.wallMat;
    const add = (x: number, y: number, w: number, d: number, h = WALL_H, y0 = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      const c = world(x, y, 0);
      mesh.position.set(c.x, y0 + h / 2, c.z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    // Murs (toujours visibles), avec une ouverture à chaque porte
    for (let i = 0; i < r.w; i++) {
      const x = r.x + i + 0.5;
      if (!gaps.n.has(r.x + i)) add(x, r.y + T / 2, 1, T);
      if (!gaps.s.has(r.x + i)) add(x, r.y + r.h - T / 2, 1, T);
    }
    for (let j = 0; j < r.h; j++) {
      const y = r.y + j + 0.5;
      if (!gaps.w.has(r.y + j)) add(r.x + T / 2, y, T, 1);
      if (!gaps.e.has(r.y + j)) add(r.x + r.w - T / 2, y, T, 1);
    }
    // Portes
    for (const d of DOORS.filter((dd) => dd.room === room)) this.buildDoor(d.x, d.y, room, add);
  }

  private wallMat = new THREE.MeshStandardMaterial({ color: WALL.color, roughness: 0.9 });
  private doorMat = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.6 });
  private frameMat = new THREE.MeshStandardMaterial({ color: 0x4e2f18, roughness: 0.6 });
  private brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a942, roughness: 0.3, metalness: 0.9 });

  /** Porte en bois avec encadrement ; elle s'ouvre vers l'intérieur quand quelqu'un passe. */
  private buildDoor(dx: number, dy: number, room: RoomId, addWall: (x: number, y: number, w: number, d: number, h?: number, y0?: number) => void) {
    const r = ROOM_RECTS[room];
    const T = 0.12;
    const DOOR_H = 1.12;
    const LEAF = 0.86;
    const horizontal = dy === r.y - 1 || dy === r.y + r.h; // mur nord ou sud
    let hinge: THREE.Vector3;
    let open: number;
    let inside: { x: number; y: number };
    if (dy === r.y - 1) {
      hinge = world(dx + 0.07, r.y + T / 2);
      open = -Math.PI / 2;
      inside = { x: dx, y: r.y };
      addWall(dx + 0.5, r.y + T / 2, 1, T, WALL_H - DOOR_H, DOOR_H);
    } else if (dy === r.y + r.h) {
      hinge = world(dx + 0.07, r.y + r.h - T / 2);
      open = Math.PI / 2;
      inside = { x: dx, y: r.y + r.h - 1 };
      addWall(dx + 0.5, r.y + r.h - T / 2, 1, T, WALL_H - DOOR_H, DOOR_H);
    } else if (dx === r.x - 1) {
      hinge = world(r.x + T / 2, dy + 0.07);
      open = Math.PI / 2;
      inside = { x: r.x, y: dy };
      addWall(r.x + T / 2, dy + 0.5, T, 1, WALL_H - DOOR_H, DOOR_H);
    } else {
      hinge = world(r.x + r.w - T / 2, dy + 0.07);
      open = -Math.PI / 2;
      inside = { x: r.x + r.w - 1, y: dy };
      addWall(r.x + r.w - T / 2, dy + 0.5, T, 1, WALL_H - DOOR_H, DOOR_H);
    }
    // Encadrement
    const frame = (fx: number, fy: number) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 0.07 : 0.16, DOOR_H, horizontal ? 0.16 : 0.07), this.frameMat);
      const c = world(fx, fy);
      post.position.set(c.x, DOOR_H / 2, c.z);
      post.castShadow = true;
      this.scene.add(post);
    };
    if (horizontal) {
      const fy = dy === r.y - 1 ? r.y + T / 2 : r.y + r.h - T / 2;
      frame(dx + 0.035, fy);
      frame(dx + 0.965, fy);
    } else {
      const fx = dx === r.x - 1 ? r.x + T / 2 : r.x + r.w - T / 2;
      frame(fx, dy + 0.035);
      frame(fx, dy + 0.965);
    }
    // Battant
    const pivot = new THREE.Group();
    pivot.position.set(hinge.x, 0, hinge.z);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? LEAF : 0.05, DOOR_H - 0.04, horizontal ? 0.05 : LEAF),
      this.doorMat,
    );
    leaf.position.set(horizontal ? LEAF / 2 : 0, (DOOR_H - 0.04) / 2, horizontal ? 0 : LEAF / 2);
    leaf.castShadow = leaf.receiveShadow = true;
    // Panneaux décoratifs + poignée
    const panel = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? LEAF * 0.7 : 0.06, 0.35, horizontal ? 0.06 : LEAF * 0.7), this.frameMat);
    panel.position.set(leaf.position.x, 0.75, leaf.position.z);
    const panel2 = panel.clone();
    panel2.position.y = 0.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), this.brassMat);
    knob.position.set(horizontal ? LEAF - 0.1 : 0, 0.55, horizontal ? 0 : LEAF - 0.1);
    knob.scale.set(horizontal ? 1 : 2.4, 1, horizontal ? 2.4 : 1);
    pivot.add(leaf, panel, panel2, knob);
    this.scene.add(pivot);
    this.doors.set(`${dx},${dy}`, { pivot, open, target: 0, inside });
  }

  private openDoor(key: string, open: boolean) {
    const d = this.doors.get(key);
    if (d) d.target = open ? d.open : 0;
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
    const f = this.figures.get(s);
    if (!f) {
      this.pending.set(s, p);
      return;
    }
    const g = gridOf(p, s);
    f.root.position.copy(world(g.x, g.y));
    f.root.rotation.y = 0;
  }

  emote(s: SuspectId) {
    this.figures.get(s)?.emote();
  }

  placeWeapon(w: WeaponId, room: RoomId) {
    const m = this.weapons.get(w)!;
    const g = weaponSlot(room, w);
    m.position.copy(world(g.x, g.y));
    m.rotation.y = (WEAPONS.findIndex((x) => x.id === w) * 1.3) % (Math.PI * 2);
    m.visible = true;
  }

  /** Lance les dés 3D sur la table centrale. */
  async rollDice(values: number[]) {
    const c = CENTER_RECT;
    const center = world(c.x + c.w / 2, c.y + c.h / 2);
    if (this.mode === 'auto') {
      this.follow = null;
      this.camGoal.pos.copy(center).add(new THREE.Vector3(0, 5.2, 5.4));
      this.camGoal.look.copy(center);
      this.camGoal.speed = 3;
    }
    await this.dice.roll(values, (p) => {
      if (this.mode === 'auto') this.camGoal.look.lerp(p, 0.08);
    });
  }

  /** Fait marcher un personnage le long d'un chemin, case par case. */
  walk(s: SuspectId, path: Position[]): Promise<void> {
    const f = this.figures.get(s)!;
    // Points de passage : on ajoute la case juste derrière la porte pour ne pas traverser les murs,
    // et on ouvre la porte au bon moment.
    const points: { p: THREE.Vector3; door?: string }[] = [];
    const opened: string[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.type === 'cell' && b.type === 'room') {
        const key = `${a.x},${a.y}`;
        const door = this.doors.get(key);
        if (door) points.push({ p: world(door.inside.x + 0.5, door.inside.y + 0.5), door: key });
        opened.push(key);
      } else if (a.type === 'room' && b.type === 'cell') {
        const key = `${b.x},${b.y}`;
        const door = this.doors.get(key);
        if (door) points.push({ p: world(door.inside.x + 0.5, door.inside.y + 0.5), door: key });
        opened.push(key);
        const g = gridOf(b, s);
        points.push({ p: world(g.x, g.y) });
        continue;
      }
      const g = gridOf(b, s);
      points.push({ p: world(g.x, g.y) });
    }
    this.walking.add(s);
    if (this.mode === 'auto' && this.followEnabled) this.follow = s;
    const SPEED = 2.6; // cases par seconde
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= points.length) {
          this.walking.delete(s);
          this.follow = null;
          setTimeout(() => opened.forEach((k) => this.openDoor(k, false)), 500);
          return resolve();
        }
        const from = f.root.position.clone();
        const pt = points[i++];
        if (pt.door) this.openDoor(pt.door, true);
        const to = pt.p;
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
  private hlCell = new THREE.MeshStandardMaterial({ color: 0x35d06a, emissive: 0x1aa34a, emissiveIntensity: 0.8, roughness: 0.4, transparent: true, opacity: 0.92 });
  private hlHover = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa800, emissiveIntensity: 0.9, roughness: 0.4 });
  private hlRoom = new THREE.MeshBasicMaterial({ color: 0x35d06a, transparent: true, opacity: 0.25, depthWrite: false });
  private hlEdge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  private arrows: THREE.Object3D[] = [];
  private hlTiles = new Map<string, THREE.Mesh>();

  setCurrent(s: SuspectId | null) {
    this.ring.visible = !!s;
    this.current = s;
  }
  private current: SuspectId | null = null;

  /**
   * Affiche les cases accessibles : dalles vertes lumineuses avec un contour blanc,
   * les pièces accessibles en vert avec une grosse flèche qui rebondit.
   * Au survol (ou au premier toucher sur téléphone), le chemin s'affiche et la case devient jaune.
   */
  setReach(dests: Destination[], onPick: (d: Destination) => void) {
    this.onPick = onPick;
    this.reach.clear();
    this.highlight.clear();
    this.hlTiles.clear();
    this.arrows = [];
    this.showPath(null);
    const tileGeo = new THREE.BoxGeometry(0.84, 0.06, 0.84);
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.88, 0.065, 0.88));
    for (const d of dests) {
      if (d.to.type === 'cell') {
        const key = `${d.to.x},${d.to.y}`;
        this.reach.set(key, d);
        const tile = new THREE.Mesh(tileGeo, this.hlCell);
        tile.position.copy(world(d.to.x + 0.5, d.to.y + 0.5, 0.05));
        const edge = new THREE.LineSegments(edgeGeo, this.hlEdge);
        edge.position.copy(tile.position);
        this.highlight.add(tile, edge);
        this.hlTiles.set(key, tile);
      } else {
        const key = `room:${d.to.room}`;
        this.reach.set(key, d);
        const r = ROOM_RECTS[d.to.room];
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.3, r.h - 0.3), this.hlRoom);
        floor.rotation.x = -Math.PI / 2;
        floor.position.copy(world(r.x + r.w / 2, r.y + r.h / 2, 0.06));
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(r.w - 0.3, r.h - 0.3)), this.hlEdge);
        outline.rotation.x = -Math.PI / 2;
        outline.position.copy(floor.position);
        // Flèche qui rebondit au-dessus de la pièce
        const arrow = new THREE.Group();
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 20), this.hlCell);
        head.rotation.x = Math.PI;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 14), this.hlCell);
        stem.position.y = 0.48;
        arrow.add(head, stem);
        arrow.position.copy(world(r.x + r.w / 2, r.y + r.h / 2, 2.4));
        this.highlight.add(floor, outline, arrow);
        this.arrows.push(arrow);
      }
    }
  }

  /** Affiche le chemin jusqu'à une destination (petites billes blanches). */
  private showPath(key: string | null) {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.pathGroup.clear();
    for (const [k, t] of this.hlTiles) t.material = k === key ? this.hlHover : this.hlCell;
    if (!key) return;
    const d = this.reach.get(key);
    if (!d || !this.current) return;
    const dot = new THREE.SphereGeometry(0.08, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const p of d.path.slice(1, -1)) {
      if (p.type !== 'cell') continue;
      const m = new THREE.Mesh(dot, mat);
      m.position.copy(world(p.x + 0.5, p.y + 0.5, 0.15));
      this.pathGroup.add(m);
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

  /**
   * Caméra derrière le personnage, tournée vers ses destinations possibles
   * (assez haut pour bien voir les cases vertes).
   */
  behind(s: SuspectId, toward: THREE.Vector3) {
    this.followEnabled = true;
    const f = this.figures.get(s)!.root;
    const yaw = Math.atan2(toward.x - f.position.x, toward.z - f.position.z);
    // le personnage se tourne vers là où il peut aller
    let t = 0;
    const start = f.rotation.y;
    let d = yaw - start;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = (dt: number) => {
      t = Math.min(1, t + dt * 2.5);
      f.rotation.y = start + d * t;
      if (t >= 1) this.tickers.delete(turn);
    };
    this.tickers.add(turn);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.camGoal.pos.copy(f.position).addScaledVector(dir, -4.2).add(new THREE.Vector3(0, 4.6, 0));
    this.camGoal.look.copy(f.position).addScaledVector(dir, 2.6);
    this.camGoal.speed = 2.4;
  }

  /** Point au sol d'une destination (pour orienter la caméra). */
  destPoint(d: Destination, s: SuspectId) {
    const g = gridOf(d.to, s);
    return world(g.x, g.y);
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

  private updateDoors(dt: number) {
    for (const d of this.doors.values()) {
      d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * Math.min(1, dt * 7);
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
    const now = performance.now();
    this.hlCell.emissiveIntensity = 0.55 + Math.sin(now / 260) * 0.35;
    this.hlRoom.opacity = 0.22 + Math.sin(now / 260) * 0.08;
    for (const a of this.arrows) {
      a.position.y = 2.2 + Math.abs(Math.sin(now / 280)) * 0.45;
      a.rotation.y += dt * 1.5;
    }
    this.updateCamera(dt);
    this.updateDoors(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private setupPicking() {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let down: { x: number; y: number } | null = null;
    const el = this.renderer.domElement;
    const keyAt = (e: PointerEvent): string | null => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const gx = Math.floor(hit.x - OX);
      const gy = Math.floor(hit.z - OZ);
      if (gx < 0 || gy < 0 || gx >= BOARD_WIDTH || gy >= BOARD_HEIGHT) return null;
      if (this.reach.has(`${gx},${gy}`)) return `${gx},${gy}`;
      if (CELLS[gy][gx] === 'room' && this.reach.has(`room:${CELL_ROOM[gy][gx]}`)) return `room:${CELL_ROOM[gy][gx]}`;
      return null;
    };
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.reach.size) {
        const k = keyAt(e);
        this.showPath(k);
        el.style.cursor = k ? 'pointer' : '';
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      down = null;
      const k = keyAt(e);
      if (!k) return;
      // Sur écran tactile : 1er toucher = aperçu du chemin, 2e toucher = on y va
      if (e.pointerType !== 'mouse' && this.hoverKey !== k) {
        this.showPath(k);
        this.host.dispatchEvent(new CustomEvent('preview'));
        return;
      }
      const d = this.reach.get(k);
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
