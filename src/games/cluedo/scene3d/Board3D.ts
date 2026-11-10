// Plateau en vraie 3D (Three.js) : la scène et ses « briques » d'animation.
// Ce fichier ne connaît pas les règles : il sait construire le plateau, déplacer les pions,
// lancer les dés, cadrer la caméra et jouer les mises en scène.
// C'est Board3DView qui décide quoi jouer à partir du journal de la partie.

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
} from '../engine';
import { DECOR, FLOOR, WALL, type DecorItem } from '../board3d/decor';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeFigure, type Figure } from './figure';
import { makeWeapon } from './weapons3d';
import { Dice3D } from './dice3d';
import { buildFurniture } from './furniture3d';
import { CHARTE } from '../../../theme/charte';

const P = CHARTE.plateau;

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
  private dice!: Dice3D;
  /** Se résout quand les meubles sont chargés. */
  ready: Promise<void>;
  private furnitureReady: Promise<void> = Promise.resolve();
  private walking = new Set<SuspectId>();
  private positions = new Map<SuspectId, Position>();
  private envelope!: { group: THREE.Group; flap: THREE.Group; light: THREE.PointLight; mark: THREE.Sprite };
  private cards = new THREE.Group();
  private highlight = new THREE.Group();
  private ring: THREE.Mesh;
  private fireLight: THREE.PointLight | null = null;
  private reach = new Map<string, Destination>();
  private onPick: ((d: Destination) => void) | null = null;

  // Caméra automatique : position et cible visées, vers lesquelles on glisse en douceur.
  // Orientation fixe : on regarde toujours le plateau depuis le sud, comme assis à la table.
  private camGoal = { pos: new THREE.Vector3(0, 27, 21), look: new THREE.Vector3(0, 0, 1), speed: 2.5 };
  private camLook = new THREE.Vector3(0, 0, 1);
  private follow: { s: SuspectId; back: boolean; far: boolean } | null = null;
  private orbit: { center: THREE.Vector3; angle: number; radius: number; height: number } | null = null;
  /** Vrai quand le joueur a pris la main sur la caméra (glisser, pincer). */
  userCamera = false;
  /** Accélération des animations (1 = normal ; plus grand = plus rapide). */
  timeScale = 1;
  /** Accélération ponctuelle quand on touche l'écran pendant une animation. */
  private boost = 1;
  /** Appelé quand le joueur reprend la main sur la caméra ou la rend. */
  onUserCamera: ((user: boolean) => void) | null = null;
  private tickers = new Set<(dt: number) => void>();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = P.exposition;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(P.fond);
    this.scene.fog = new THREE.Fog(P.fond, 55, 110);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 22, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 45;
    this.controls.enabled = true;
    // Dès que le joueur bouge vraiment la caméra (glisser, pincer, molette), on arrête de la piloter.
    // Un simple toucher (pour choisir une case) ne compte pas.
    let interacting = false;
    this.controls.addEventListener('start', () => (interacting = true));
    this.controls.addEventListener('end', () => (interacting = false));
    this.controls.addEventListener('change', () => {
      if (interacting && !this.userCamera) {
        this.userCamera = true;
        this.follow = null;
        this.orbit = null;
        this.onUserCamera?.(true);
      }
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

    this.dice = new Dice3D(this.scene, (fn) => this.tickers.add(fn), (fn) => this.tickers.delete(fn));
    this.buildEnvelope();
    this.scene.add(this.cards);

    this.setupPicking();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.tableView(0);
    this.camera.position.copy(this.camGoal.pos);
    this.loop();
  }

  // ------------------------------------------------------------------ Construction

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(P.ambiance.ciel, P.ambiance.sol, P.ambiance.force));
    const sun = new THREE.DirectionalLight(P.soleil.couleur, P.soleil.force);
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
      const l = new THREE.PointLight(P.lampes.couleur, P.lampes.force, P.lampes.portee, 1.6);
      l.position.copy(world(rect.x + rect.w / 2, rect.y + rect.h / 2, 2.2));
      this.scene.add(l);
    }
  }

  private mat(color: number, rough = 0.8) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough });
  }

  private buildBoard() {
    // Socle
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + 0.6, 0.5, BOARD_HEIGHT + 0.6), this.mat(P.socle));
    slab.position.set(0, -0.26, 0);
    slab.receiveShadow = true;
    this.scene.add(slab);

    // Sol : une tuile par case (instanciée = rapide)
    const tiles: { x: number; y: number; color: number }[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const t = CELLS[y][x];
        const odd = (x + y) % 2 === 1;
        // Couloirs : parquet en lames (une teinte par rangée, légèrement variée)
        if (t === 'corridor') tiles.push({ x, y, color: new THREE.Color(y % 2 ? P.couloirA : P.couloirB).multiplyScalar(0.94 + ((x * 7 + y * 13) % 5) * 0.03).getHex() });
        else if (t === 'room') {
          const f = FLOOR[CELL_ROOM[y][x]!];
          tiles.push({ x, y, color: odd ? f.b : f.a });
        } else if (t === 'center') tiles.push({ x, y, color: 0x24242b });
        else tiles.push({ x, y, color: P.socle });
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
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.7), this.mat(P.paillasson));
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

    // Noms des pièces
    for (const r of ROOMS) {
      const rect = ROOM_RECTS[r.id as RoomId];
      const s = this.label(r.name.toUpperCase(), 44, CHARTE.couleurs.laitonClair);
      s.position.copy(world(rect.x + rect.w / 2, rect.y + rect.h - 0.3, 0.35));
      this.scene.add(s);
    }
  }

  /** Texte toujours face à la caméra. */
  private label(text: string, px: number, color: string) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${px}px 'Playfair Display', Georgia, serif`;
    const w = Math.ceil(ctx.measureText(text).width) + px;
    canvas.width = w;
    canvas.height = Math.ceil(px * 1.5);
    ctx.font = `bold ${px}px 'Playfair Display', Georgia, serif`;
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
      if (y0 === 0) {
        this.wallBoxes.push({ center: mesh.position.clone(), size: new THREE.Vector3(w, h, d) });
        // Soubassement en bois (lambris) et corniche, style manoir
        const lam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.5, d + 0.04), this.lambrisMat);
        lam.position.set(c.x, 0.25, c.z);
        const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.07, d + 0.06), this.corniceMat);
        top.position.set(c.x, h - 0.035, c.z);
        lam.receiveShadow = top.receiveShadow = true;
        this.scene.add(lam, top);
      }
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

  /** Murs (pour que les dés rebondissent dessus au lieu de les traverser). */
  private wallBoxes: { center: THREE.Vector3; size: THREE.Vector3 }[] = [];
  private wallMat = new THREE.MeshStandardMaterial({ color: WALL.color, roughness: 0.9 });
  private doorMat = new THREE.MeshStandardMaterial({ color: P.porte, roughness: 0.55 });
  private frameMat = new THREE.MeshStandardMaterial({ color: P.encadrement, roughness: 0.55 });
  private brassMat = new THREE.MeshStandardMaterial({ color: P.poignee, roughness: 0.3, metalness: 0.9 });
  private lambrisMat = new THREE.MeshStandardMaterial({ color: P.lambris, roughness: 0.6 });
  private corniceMat = new THREE.MeshStandardMaterial({ color: P.murHaut, roughness: 0.6 });

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

  // ------------------------------------------------------------------ Temps et petites animations

  /** Attend `ms` millisecondes « de jeu » (plus court si les animations sont accélérées). */
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      const fn = (dt: number) => {
        t += dt * 1000;
        if (t >= ms) {
          this.tickers.delete(fn);
          resolve();
        }
      };
      this.tickers.add(fn);
    });
  }

  /** Anime `fn(k)` avec k allant de 0 à 1 en `ms` millisecondes. */
  private tween(ms: number, fn: (k: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      const tick = (dt: number) => {
        t += (dt * 1000) / ms;
        const k = Math.min(1, t);
        fn(k);
        if (k >= 1) {
          this.tickers.delete(tick);
          resolve();
        }
      };
      this.tickers.add(tick);
    });
  }

  /** Toucher l'écran pendant une animation l'accélère. */
  speedUp() {
    this.boost = 6;
  }

  private sparkle(at: THREE.Vector3, color = 0xfff2b0) {
    const geo = new THREE.SphereGeometry(0.035, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(at);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.scene.add(m);
      void this.tween(600, (k) => {
        m.position.copy(at).addScaledVector(dir, k * 0.7);
        mat.opacity = 1 - k;
        if (k >= 1) this.scene.remove(m);
      });
    }
  }

  // ------------------------------------------------------------------ Pions et armes

  place(s: SuspectId, p: Position) {
    const f = this.figures.get(s)!;
    const g = gridOf(p, s);
    f.root.position.copy(world(g.x, g.y));
    f.root.rotation.y = 0;
    f.root.visible = true;
    f.root.scale.setScalar(1);
    this.positions.set(s, p);
  }

  /** Point 3D d'une position du plateau (pour cadrer la caméra). */
  pointOf(p: Position, s: SuspectId): THREE.Vector3 {
    const g = gridOf(p, s);
    return world(g.x, g.y);
  }

  pawnPoint(s: SuspectId): THREE.Vector3 {
    return this.figures.get(s)!.root.position.clone();
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

  /** Lance les dés juste devant le pion du joueur. */
  async rollDice(values: number[], near: SuspectId) {
    const p = this.pawnPoint(near);
    // Zone de lancer devant le pion (côté caméra), gardée sur le plateau
    const cx = THREE.MathUtils.clamp(p.x, OX + 1.4, -OX - 1.4);
    const cz = THREE.MathUtils.clamp(p.z + 1.3, OZ + 1.4, -OZ - 1.4);
    const center = new THREE.Vector3(cx, 0, cz);
    if (!this.userCamera) {
      this.follow = null;
      this.orbit = null;
      this.lookFrom(center, 6.5, 2.6);
    }
    const walls = this.wallBoxes.filter((b) => Math.abs(b.center.x - cx) < 3 && Math.abs(b.center.z - cz) < 3);
    await this.dice.roll(values, { center, halfX: 1.1, halfZ: 1.0, y: 0.04, obstacles: walls }, (c) => {
      if (!this.userCamera) this.camGoal.look.lerp(c, 0.06);
    });
  }

  clearDice() {
    this.dice.clear();
  }

  /** Fait marcher un personnage le long d'un chemin, case par case, en ouvrant les portes. */
  walk(s: SuspectId, path: Position[], camera: 'none' | 'follow' | 'back' | 'far' = 'follow'): Promise<void> {
    const f = this.figures.get(s)!;
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
      }
      const g = gridOf(b, s);
      points.push({ p: world(g.x, g.y) });
    }
    this.walking.add(s);
    if (camera !== 'none' && !this.userCamera) {
      this.orbit = null;
      this.follow = { s, back: camera === 'back', far: camera === 'far' };
    }
    const SPEED = 2.8; // cases par seconde
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= points.length) {
          this.walking.delete(s);
          if (this.follow?.s === s) this.follow = null;
          void this.wait(450).then(() => opened.forEach((k) => this.openDoor(k, false)));
          this.positions.set(s, path[path.length - 1]);
          return resolve();
        }
        const pt = points[i++];
        if (pt.door) this.openDoor(pt.door, true);
        const from = f.root.position.clone();
        const to = pt.p;
        const dur = Math.max(0.1, from.distanceTo(to) / SPEED);
        const yaw = Math.atan2(to.x - from.x, to.z - from.z);
        let t = 0;
        const tick = (dt: number) => {
          t += dt / dur;
          const k = Math.min(1, t);
          f.root.position.lerpVectors(from, to, k);
          let d = yaw - f.root.rotation.y;
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

  /** Le pion disparaît dans un éclat de lumière et réapparaît ailleurs (hypothèse). */
  async teleport(s: SuspectId, to: Position) {
    const f = this.figures.get(s)!.root;
    const g = gridOf(to, s);
    const dest = world(g.x, g.y);
    if (f.position.distanceTo(dest) < 0.01) return;
    this.sparkle(f.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    await this.tween(300, (k) => f.scale.set(1 - k * 0.8, 1 + k * 0.8, 1 - k * 0.8));
    f.visible = false;
    f.position.copy(dest);
    f.rotation.y = 0;
    this.positions.set(s, to);
    await this.wait(150);
    f.visible = true;
    this.sparkle(dest.clone().add(new THREE.Vector3(0, 0.6, 0)));
    await this.tween(350, (k) => {
      const e = 1 + Math.sin(k * Math.PI) * 0.15;
      const v = 0.2 + k * 0.8;
      f.scale.set(v * e, (1.6 - k * 0.6) , v * e);
    });
    f.scale.setScalar(1);
  }

  /** L'arme tombe du ciel dans la pièce et rebondit. */
  async dropWeapon(w: WeaponId, room: RoomId) {
    const m = this.weapons.get(w)!;
    const g = weaponSlot(room, w);
    const dest = world(g.x, g.y);
    if (m.visible && m.position.distanceTo(dest) < 0.01) return;
    m.visible = true;
    m.position.copy(dest).add(new THREE.Vector3(0, 2.5, 0));
    await this.tween(700, (k) => {
      // chute + petit rebond
      const y = k < 0.7 ? 2.5 * (1 - (k / 0.7) ** 2) : Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.18;
      m.position.y = Math.max(0, y);
      m.rotation.y += 0.15;
    });
    m.position.copy(dest);
    this.sparkle(dest.clone().add(new THREE.Vector3(0, 0.1, 0)), 0xdfe6ee);
  }

  /** Passage secret : le pion descend par une trappe et remonte dans l'autre pièce. */
  async secretPassage(s: SuspectId, from: RoomId, to: RoomId) {
    const f = this.figures.get(s)!.root;
    const hole = (at: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(at).add(new THREE.Vector3(0, 0.07, 0));
      m.scale.setScalar(0.01);
      this.scene.add(m);
      return m;
    };
    const h1 = hole(f.position);
    await this.tween(300, (k) => h1.scale.setScalar(k));
    const start = f.position.clone();
    await this.tween(600, (k) => (f.position.y = start.y - k * 1.3));
    f.visible = false;
    await this.tween(250, (k) => h1.scale.setScalar(1 - k));
    this.scene.remove(h1);
    const dest = (() => {
      const g = roomSlot(to, s);
      return world(g.x, g.y);
    })();
    if (!this.userCamera) this.roomShot(to, 2.5);
    await this.wait(700);
    const h2 = hole(dest);
    await this.tween(300, (k) => h2.scale.setScalar(k));
    f.position.copy(dest).add(new THREE.Vector3(0, -1.3, 0));
    f.rotation.y = 0;
    f.visible = true;
    await this.tween(600, (k) => (f.position.y = dest.y - (1 - k) * 1.3));
    await this.tween(250, (k) => h2.scale.setScalar(1 - k));
    this.scene.remove(h2);
    this.positions.set(s, { type: 'room', room: to });
    void from;
  }

  // ------------------------------------------------------------------ Enveloppe et cartes

  private buildEnvelope() {
    const c = CENTER_RECT;
    const group = new THREE.Group();
    group.position.copy(world(c.x + c.w / 2, c.y + c.h / 2 - 1.6, 0.31));
    const paper = this.mat(0xe9dcc0, 0.9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.95), paper);
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    const flap = new THREE.Group();
    flap.position.set(0, 0.03, -0.475);
    const flapMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.55), this.mat(0xddcfb0, 0.9));
    flapMesh.position.z = 0.275;
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 18), this.mat(0x8c1d1d, 0.4));
    seal.position.set(0, 0.02, 0.5);
    flap.add(flapMesh, seal);
    group.add(flap);
    const q = this.label('?', 96, '#c9a24a');
    q.position.set(0, 0.9, 0);
    q.scale.set(0.8, 0.8, 1);
    group.add(q);
    const light = new THREE.PointLight(0xffd36b, 0, 5, 1.5);
    light.position.set(0, 1.2, 0.3);
    group.add(light);
    this.scene.add(group);
    this.envelope = { group, flap, light, mark: q };
  }

  private cardTexture(kind: 'suspect' | 'weapon' | 'room', name: string, color?: string) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 360;
    const g = c.getContext('2d')!;
    g.fillStyle = CHARTE.cartes.fond;
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = CHARTE.cartes.liseré;
    g.lineWidth = 6;
    g.strokeRect(14, 70, 228, 276);
    const band = CHARTE.cartes[kind];
    g.fillStyle = band;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#fff';
    g.font = 'bold 26px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(kind === 'suspect' ? 'SUSPECT' : kind === 'weapon' ? 'ARME' : 'PIÈCE', 128, 42);
    if (color) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(128, 160, 52, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#0006';
      g.lineWidth = 4;
      g.stroke();
    }
    g.fillStyle = '#2a2018';
    let size = 40;
    g.font = `bold ${size}px 'Playfair Display', Georgia, serif`;
    while (g.measureText(name).width > 220 && size > 18) g.font = `bold ${(size -= 2)}px 'Playfair Display', Georgia, serif`;
    g.fillText(name, 128, color ? 280 : 200);
    g.strokeStyle = band;
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 352);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private cardBack() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 360;
    const g = c.getContext('2d')!;
    g.fillStyle = CHARTE.couleurs.bordeaux;
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 8;
    g.strokeRect(14, 14, 228, 332);
    g.fillStyle = '#c9a24a';
    g.font = 'bold 120px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('?', 128, 225);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Mise en scène d'une accusation ou de la révélation finale.
   * - cards : les trois cartes (accusation, ou solution)
   * - result : 'win' (accusation juste), 'wrong' (fausse : l'enveloppe reste fermée), 'reveal' (on montre la solution)
   */
  async envelopeScene(cards: { kind: 'suspect' | 'weapon' | 'room'; name: string; color?: string }[], result: 'win' | 'wrong' | 'reveal') {
    this.clearCards();
    const env = this.envelope;
    env.mark.visible = false;
    if (!this.userCamera) this.envelopeShot();
    await this.wait(900);
    if (result !== 'wrong') {
      await this.tween(600, (k) => (env.flap.rotation.x = -k * 2.2));
    }
    const back = new THREE.MeshBasicMaterial({ map: this.cardBack() });
    const meshes = cards.map((c, i) => {
      const front = new THREE.MeshBasicMaterial({ map: this.cardTexture(c.kind, c.name, c.color) });
      const card = new THREE.Group();
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.87), front);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.87), back);
      b.rotation.y = Math.PI;
      card.add(f, b);
      card.rotation.y = Math.PI; // dos visible au début
      const base = env.group.position.clone();
      card.position.copy(base).add(new THREE.Vector3(0, 0.05, 0));
      this.cards.add(card);
      return { card, target: base.clone().add(new THREE.Vector3((i - 1) * 0.78, 0.95, 0.35)) };
    });
    // Les cartes sortent de l'enveloppe…
    await this.tween(700, (k) => {
      for (const m of meshes) m.card.position.lerpVectors(env.group.position.clone().add(new THREE.Vector3(0, 0.05, 0)), m.target, 1 - (1 - k) ** 3);
    });
    // … puis se retournent une à une
    for (const m of meshes) {
      await this.tween(380, (k) => (m.card.rotation.y = Math.PI * (1 - k)));
      await this.wait(250);
    }
    if (result === 'win' || result === 'reveal') {
      env.light.color.set(0xffd36b);
      await this.tween(500, (k) => (env.light.intensity = k * 14));
      for (const m of meshes) this.sparkle(m.card.position.clone(), 0xffe08a);
    } else {
      env.light.color.set(0xff3030);
      await this.tween(300, (k) => (env.light.intensity = k * 14));
      await this.wait(900);
      // Accusation fausse : les cartes tombent et disparaissent
      await this.tween(700, (k) => {
        for (const m of meshes) {
          m.card.position.y = m.target.y - k * 1.2;
          m.card.rotation.z = k * 0.8;
        }
      });
      this.clearCards();
      await this.tween(400, (k) => (env.light.intensity = 14 * (1 - k)));
      env.mark.visible = true;
    }
  }

  clearCards() {
    this.cards.clear();
    this.envelope.light.intensity = 0;
    this.envelope.mark.visible = true;
    this.envelope.flap.rotation.x = 0;
  }

  // ------------------------------------------------------------------ Cases accessibles

  private hlCell = new THREE.MeshStandardMaterial({ color: 0x35d06a, emissive: 0x1aa34a, emissiveIntensity: 0.8, roughness: 0.4, transparent: true, opacity: 0.92 });
  private hlHover = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa800, emissiveIntensity: 0.9, roughness: 0.4 });
  private hlRoom = new THREE.MeshBasicMaterial({ color: 0x35d06a, transparent: true, opacity: 0.25, depthWrite: false });
  private hlEdge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  private arrows: THREE.Object3D[] = [];
  private hlTiles = new Map<string, THREE.Mesh>();
  private current: SuspectId | null = null;

  setCurrent(s: SuspectId | null) {
    this.ring.visible = !!s;
    this.current = s;
  }

  /** Cases accessibles : dalles vertes lumineuses + flèche au-dessus des pièces ; aperçu du chemin au survol. */
  setReach(dests: Destination[], onPick: (d: Destination) => void) {
    this.onPick = onPick;
    this.reach.clear();
    this.highlight.clear();
    this.hlTiles.clear();
    this.arrows = [];
    this.hoverKey = '__';
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

  private showPath(key: string | null) {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.pathGroup.clear();
    for (const [k, t] of this.hlTiles) t.material = k === key ? this.hlHover : this.hlCell;
    if (!key) return;
    const d = this.reach.get(key);
    if (!d) return;
    const dot = new THREE.SphereGeometry(0.08, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const p of d.path.slice(1, -1)) {
      if (p.type !== 'cell') continue;
      const m = new THREE.Mesh(dot, mat);
      m.position.copy(world(p.x + 0.5, p.y + 0.5, 0.15));
      this.pathGroup.add(m);
    }
  }

  // ------------------------------------------------------------------ Caméra (orientation fixe)

  /** Direction de la caméra : depuis le sud, inclinée d'environ 55°. */
  private static DIR = new THREE.Vector3(0, Math.sin((55 * Math.PI) / 180), Math.cos((55 * Math.PI) / 180));

  private lookFrom(center: THREE.Vector3, distance: number, speed: number, dir = Board3D.DIR) {
    this.camGoal.look.copy(center);
    this.camGoal.pos.copy(center).addScaledVector(dir, distance);
    this.camGoal.speed = speed;
  }

  /** Le joueur rend la main : la caméra redevient automatique. */
  resumeAuto() {
    if (!this.userCamera) return;
    this.userCamera = false;
    this.onUserCamera?.(false);
  }

  /** Vue « table » : tout le plateau, comme assis devant. */
  tableView(speed = 1.8) {
    if (this.userCamera) return;
    this.follow = null;
    this.orbit = null;
    // Distance calculée pour que tout le plateau tienne à l'écran, quelle que soit sa forme
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const d = Math.max((BOARD_WIDTH / 2 + 0.8) / Math.tan(hfov / 2), ((BOARD_HEIGHT * 0.86) / 2 + 1.2) / Math.tan(vfov / 2));
    this.lookFrom(new THREE.Vector3(0, 0, 0.6), d, speed || 100);
  }

  /** Plan moyen sur un pion (début de tour). */
  focusPawn(s: SuspectId, speed = 2) {
    if (this.userCamera) return;
    this.follow = null;
    this.orbit = null;
    this.lookFrom(this.pawnPoint(s).add(new THREE.Vector3(0, 0.4, 0)), this.camera.aspect < 0.8 ? 11 : 9, speed);
  }

  /** Cadre toute une zone (ex. les cases accessibles), vue de haut, même orientation. */
  frameArea(points: THREE.Vector3[], speed = 2) {
    if (this.userCamera || !points.length) return;
    this.follow = null;
    this.orbit = null;
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dW = (size.x / 2 + 1.2) / Math.tan(hfov / 2);
    const dH = ((size.z * 0.82) / 2 + 1.4) / Math.tan(vfov / 2);
    this.lookFrom(center, THREE.MathUtils.clamp(Math.max(dW, dH), 7, 40), speed);
  }

  /** Plan sur une pièce, vue de l'avant, comme une scène de théâtre. */
  roomShot(room: RoomId, speed = 2) {
    if (this.userCamera) return;
    this.follow = null;
    this.orbit = null;
    const r = ROOM_RECTS[room];
    const pts = [world(r.x, r.y), world(r.x + r.w, r.y + r.h)];
    const dir = new THREE.Vector3(0, Math.sin(0.82), Math.cos(0.82)); // ~47°, plus bas que la vue table
    const box = new THREE.Box3().setFromPoints(pts);
    const center = box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const d = Math.max((r.w / 2 + 0.6) / Math.tan(hfov / 2), (r.h * 0.75 / 2 + 1) / Math.tan(vfov / 2));
    this.lookFrom(center, THREE.MathUtils.clamp(d, 5.5, 20), speed, dir);
  }

  /** Gros plan sur l'enveloppe. */
  envelopeShot() {
    if (this.userCamera) return;
    this.follow = null;
    this.orbit = null;
    const p = this.envelope.group.position.clone().add(new THREE.Vector3(0, 0.6, 0.2));
    const dir = new THREE.Vector3(0, Math.sin(0.5), Math.cos(0.5));
    this.lookFrom(p, this.camera.aspect < 0.8 ? 6.6 : 3.8, 2.2, dir);
  }

  /** Fin de partie : tour lent autour d'une pièce. */
  orbitRoom(room: RoomId) {
    if (this.userCamera) return;
    this.follow = null;
    const r = ROOM_RECTS[room];
    this.orbit = { center: world(r.x + r.w / 2, r.y + r.h / 2, 0.4), angle: 0, radius: Math.max(r.w, r.h) * 0.9 + 2, height: 4.5 };
  }

  private updateCamera(dt: number) {
    if (this.userCamera) {
      this.controls.update();
      this.camLook.copy(this.controls.target);
      return;
    }
    if (this.orbit) {
      this.orbit.angle += dt * 0.25;
      const o = this.orbit;
      this.camGoal.pos.set(o.center.x + Math.sin(o.angle) * o.radius, o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.camGoal.look.copy(o.center);
      this.camGoal.speed = 1.5;
    } else if (this.follow) {
      const f = this.figures.get(this.follow.s)!.root;
      if (this.follow.back) {
        // Option : caméra de dos
        const yaw = f.rotation.y;
        const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        this.camGoal.pos.copy(f.position).addScaledVector(back, 3.4).add(new THREE.Vector3(0, 2.6, 0));
        this.camGoal.look.copy(f.position).addScaledVector(back, -1.6).add(new THREE.Vector3(0, 0.5, 0));
      } else {
        // Suivi doux, sans rotation
        const d = this.follow.far ? 14 : this.camera.aspect < 0.8 ? 11 : 9;
        this.camGoal.look.copy(f.position).add(new THREE.Vector3(0, 0.4, 0));
        this.camGoal.pos.copy(this.camGoal.look).addScaledVector(Board3D.DIR, d);
      }
      this.camGoal.speed = 3;
    }
    const k = 1 - Math.exp(-dt * this.camGoal.speed);
    this.camera.position.lerp(this.camGoal.pos, k);
    this.camLook.lerp(this.camGoal.look, k);
    this.camera.lookAt(this.camLook);
    this.controls.target.copy(this.camLook);
  }

  private updateDoors(dt: number) {
    for (const d of this.doors.values()) d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * Math.min(1, dt * 7);
  }

  // ------------------------------------------------------------------ Boucle, toucher, taille

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const real = Math.min(this.clock.getDelta(), 0.05);
    const dt = real * this.timeScale * this.boost;
    for (const t of [...this.tickers]) t(dt);
    if (this.boost > 1 && this.tickers.size === 0) this.boost = 1;
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
      a.rotation.y += real * 1.5;
    }
    this.updateCamera(real);
    this.updateDoors(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** Événement « on a touché le plateau » (sert à accélérer une animation en cours). */
  onTap: (() => void) | null = null;

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
      if (e.pointerType === 'mouse' && this.reach.size && !e.buttons) {
        const k = keyAt(e);
        this.showPath(k);
        el.style.cursor = k ? 'pointer' : '';
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      down = null;
      this.onTap?.();
      const k = keyAt(e);
      if (!k) return;
      // Écran tactile : 1er toucher = aperçu du chemin, 2e toucher = on y va
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
