// Plateau isométrique (vue de biais, en relief) dessiné avec Phaser.
//
// Le plateau ne décide de rien : il affiche l'état fourni par le moteur de règles
// et anime les changements (déplacements, dés, hypothèses). Quand le joueur touche
// une case accessible, il appelle onPick.

import type Phaser from 'phaser';
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
  WEAPONS,
  posKey,
  type Destination,
  type GameState,
  type LogEntry,
  type Position,
  type RoomId,
  type SuspectId,
  type WeaponId,
} from '../engine';
import { DECOR, FLOOR, WALL, WEAPON_ICON, type DecorItem } from './decor';
import { CHARTE } from '../../../theme/charte';

// Taille d'une case à l'écran (losange de 64 x 32 pixels)
const HW = 32;
const HH = 16;
const SLAB = 22; // épaisseur du plateau

export interface BoardUpdate {
  state: GameState;
  me: string;
  /** Cases où le joueur peut aller (vide si ce n'est pas à lui de bouger). */
  destinations: Destination[];
  onPick: (dest: Destination) => void;
}

interface Pt {
  x: number;
  y: number;
}

export function iso(gx: number, gy: number, z = 0): Pt {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - z };
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const depthAt = (gx: number, gy: number) => (gx + gy) * 100;
const hex = (c: string) => parseInt(c.slice(1), 16);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Position (en cases, valeurs décimales) d'un pion dans une pièce : chaque personnage a sa place. */
function roomSlot(room: RoomId, suspect: SuspectId): Pt {
  const r = ROOM_RECTS[room];
  const i = SUSPECTS.findIndex((s) => s.id === suspect);
  const col = (i % 3) - 1;
  const row = Math.floor(i / 3);
  return { x: r.x + r.w / 2 + col * 0.85, y: r.y + r.h / 2 + row * 0.85 - 0.1 };
}

function weaponSlot(room: RoomId, weapon: WeaponId): Pt {
  const r = ROOM_RECTS[room];
  const i = WEAPONS.findIndex((w) => w.id === weapon);
  return { x: r.x + 0.55 + i * ((r.w - 1.1) / 5), y: r.y + r.h - 0.55 };
}

function gridPoint(p: Position, suspect: SuspectId): Pt {
  return p.type === 'cell' ? { x: p.x + 0.5, y: p.y + 0.5 } : roomSlot(p.room, suspect);
}

export class IsoBoard {
  private game: Phaser.Game | null = null;
  private scene: BoardScene | null = null;
  private pending: BoardUpdate | null = null;
  private ro: ResizeObserver | null = null;
  private dice: HTMLDivElement;

  private constructor(private host: HTMLElement) {
    this.dice = document.createElement('div');
    this.dice.className = 'dice-overlay';
    host.appendChild(this.dice);
  }

  static create(host: HTMLElement): IsoBoard {
    const board = new IsoBoard(host);
    void board.boot();
    return board;
  }

  private async boot() {
    const { default: P } = await import('phaser');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(this.host.clientWidth, 100);
    const h = Math.max(this.host.clientHeight, 100);
    const SceneClass = makeSceneClass(P);
    const scene = new SceneClass(this);
    this.game = new P.Game({
      type: P.AUTO,
      parent: this.host,
      width: w * dpr,
      height: h * dpr,
      backgroundColor: '#1b1d24',
      antialias: true,
      scale: { mode: P.Scale.NONE, zoom: 1 / dpr },
      scene,
      banner: false,
      input: { activePointers: 3 },
    });
    this.ro = new ResizeObserver(() => {
      if (!this.game) return;
      const nw = Math.max(this.host.clientWidth, 100);
      const nh = Math.max(this.host.clientHeight, 100);
      this.game.scale.resize(nw * dpr, nh * dpr);
      this.game.scale.setZoom(1 / dpr);
      this.scene?.onResize();
    });
    this.ro.observe(this.host);
  }

  /** Appelé par la scène quand elle est prête. */
  sceneReady(scene: BoardScene) {
    this.scene = scene;
    setTimeout(() => this.onEvent?.({ type: 'ready' }), 50);
    if (this.pending) scene.apply(this.pending);
  }

  recenter() {
    this.scene?.recenter();
  }

  onEvent: ((e: { type: 'dice'; total: number; player: string } | { type: 'ready' } | { type: 'idle' }) => void) | null = null;

  update(u: BoardUpdate) {
    this.pending = u;
    this.scene?.apply(u);
  }

  /** Animation des dés (en HTML, par-dessus le plateau). */
  async rollDice(values: number[]) {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    this.dice.innerHTML = values.map(() => '<div class="die rolling"></div>').join('');
    this.dice.classList.add('show');
    const dice = [...this.dice.querySelectorAll<HTMLElement>('.die')];
    for (let t = 0; t < 10; t++) {
      dice.forEach((d) => (d.textContent = faces[Math.floor(Math.random() * 6)]));
      await sleep(70);
    }
    dice.forEach((d, i) => {
      d.textContent = faces[values[i] - 1];
      d.classList.remove('rolling');
    });
    await sleep(700);
    this.dice.classList.remove('show');
  }

  destroy() {
    this.ro?.disconnect();
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
    this.dice.remove();
  }
}

type BoardScene = InstanceType<ReturnType<typeof makeSceneClass>>;

function makeSceneClass(P: typeof Phaser) {
  return class Scene extends P.Scene {
    private pawns = new Map<SuspectId, Phaser.GameObjects.Container>();
    private pawnGrid = new Map<SuspectId, Pt>();
    private weapons = new Map<WeaponId, Phaser.GameObjects.Container>();
    private highlight!: Phaser.GameObjects.Graphics;
    private turnRing!: Phaser.GameObjects.Graphics;
    private roomFlash!: Phaser.GameObjects.Graphics;
    private state: GameState | null = null;
    private latest: BoardUpdate | null = null;
    private queue: Promise<void> = Promise.resolve();
    private animating = false;
    private reach = new Map<string, Destination>();

    // Caméra
    private fitZoom = 1;
    private drag = { active: false, moved: 0, x: 0, y: 0 };
    private pinch: { dist: number; zoom: number } | null = null;
    /** Vrai si le joueur a bougé la caméra lui-même : on arrête de la déplacer automatiquement jusqu'au tour suivant. */
    private userCamera = false;

    constructor(private owner: IsoBoard) {
      super({ key: 'board' });
    }

    create() {
      this.drawBoard();
      this.highlight = this.add.graphics().setDepth(-400);
      this.tweens.add({ targets: this.highlight, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
      this.roomFlash = this.add.graphics().setDepth(-450).setAlpha(0);
      this.turnRing = this.add.graphics();
      this.turnRing.lineStyle(3, 0xffd36b, 1).strokeEllipse(0, 0, 40, 20);
      this.turnRing.fillStyle(0xffd36b, 0.18).fillEllipse(0, 0, 40, 20);
      this.tweens.add({ targets: this.turnRing, scale: { from: 0.85, to: 1.15 }, alpha: { from: 1, to: 0.5 }, duration: 650, yoyo: true, repeat: -1 });
      this.turnRing.setVisible(false);

      for (const s of SUSPECTS) this.pawns.set(s.id, this.makePawn(hex(s.color)));
      for (const w of WEAPONS) this.weapons.set(w.id as WeaponId, this.makeWeapon(w.id as WeaponId));

      this.setupInput();
      this.fit();
      this.owner.sceneReady(this);
    }

    // ---------------------------------------------------------------- Dessin du plateau

    private poly(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha = 1) {
      g.fillStyle(color, alpha);
      g.fillPoints(pts as Phaser.Types.Math.Vector2Like[] as Phaser.Math.Vector2[], true);
    }

    private tile(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, z = 0) {
      this.poly(g, [iso(x, y, z), iso(x + 1, y, z), iso(x + 1, y + 1, z), iso(x, y + 1, z)], color);
    }

    private drawBoard() {
      // Socle du plateau (effet maquette)
      const base = this.add.graphics().setDepth(-2000);
      const c00 = iso(0, 0), c10 = iso(BOARD_WIDTH, 0), c11 = iso(BOARD_WIDTH, BOARD_HEIGHT), c01 = iso(0, BOARD_HEIGHT);
      const down = (p: Pt) => ({ x: p.x, y: p.y + SLAB });
      this.poly(base, [c10, c11, down(c11), down(c10)], 0x3b2416);
      this.poly(base, [c01, c11, down(c11), down(c01)], 0x2c1a10);
      this.poly(base, [c00, c10, c11, c01], 0x4a2f1c);

      // Sol : couloirs, pièces, centre
      const floor = this.add.graphics().setDepth(-1000);
      for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          const t = CELLS[y][x];
          const odd = (x + y) % 2 === 1;
          if (t === 'corridor') this.tile(floor, x, y, odd ? CHARTE.plateau.couloirA : CHARTE.plateau.couloirB);
          else if (t === 'room') {
            const f = FLOOR[CELL_ROOM[y][x]!];
            this.tile(floor, x, y, odd ? f.b : f.a);
          } else if (t === 'center') this.tile(floor, x, y, 0x24242b);
        }
      }
      // Lignes de la grille des couloirs
      floor.lineStyle(1, 0x000000, 0.08);
      for (let y = 0; y < BOARD_HEIGHT; y++)
        for (let x = 0; x < BOARD_WIDTH; x++)
          if (CELLS[y][x] === 'corridor')
            floor.strokePoints([iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)] as Phaser.Math.Vector2[], true);
      // Paillassons devant les portes
      for (const d of DOORS)
        this.poly(floor, [iso(d.x + 0.15, d.y + 0.15), iso(d.x + 0.85, d.y + 0.15), iso(d.x + 0.85, d.y + 0.85), iso(d.x + 0.15, d.y + 0.85)], 0x9b7442);

      for (const r of ROOMS) this.drawWalls(r.id as RoomId);
      for (const [room, items] of Object.entries(DECOR)) for (const it of items) this.drawDecor(it, room as RoomId);

      // Centre : l'enveloppe du crime
      const c = CENTER_RECT;
      const plinth = this.add.graphics().setDepth(depthAt(c.x + c.w / 2, c.y + c.h / 2));
      this.box(plinth, c.x + 0.2, c.y + 0.2, c.w - 0.4, c.h - 0.4, 12, 0x1f1f26, 0x2e2e38);
      const env = iso(c.x + c.w / 2, c.y + c.h / 2, 12);
      const envG = this.add.graphics().setDepth(depthAt(c.x + c.w / 2, c.y + c.h / 2) + 1);
      envG.fillStyle(0xe9dcc0, 1).fillRect(env.x - 26, env.y - 17, 52, 34);
      envG.lineStyle(2, 0x9c8a66, 1).strokeRect(env.x - 26, env.y - 17, 52, 34);
      envG.lineBetween(env.x - 26, env.y - 17, env.x, env.y + 2).lineBetween(env.x + 26, env.y - 17, env.x, env.y + 2);
      envG.fillStyle(0x8c1d1d, 1).fillCircle(env.x, env.y + 2, 6);
      this.add.text(env.x, env.y - 34, '?', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#c9a24a', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(1e6).setResolution(2).setShadow(0, 2, '#000', 4, true, true);

      // Noms des pièces
      for (const r of ROOMS) {
        const rect = ROOM_RECTS[r.id as RoomId];
        const p = iso(rect.x + rect.w / 2, rect.y + rect.h - 0.15);
        this.add.text(p.x, p.y, r.name.toUpperCase(), {
          fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff7e0', fontStyle: 'bold',
          stroke: '#1a1208', strokeThickness: 4,
        }).setOrigin(0.5, 0.5).setDepth(1e6 - 1).setResolution(2).setAlpha(0.92);
      }
    }

    /** Boîte en relief : x, y, w, d en cases, h en pixels. */
    private box(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, h: number, color: number, top?: number, stripes?: number[]) {
      const A = iso(x, y, h), B = iso(x + w, y, h), C = iso(x + w, y + d, h), D = iso(x, y + d, h);
      const Bb = iso(x + w, y), Cb = iso(x + w, y + d), Db = iso(x, y + d);
      this.poly(g, [B, C, Cb, Bb], shade(color, 0.78));
      this.poly(g, [D, C, Cb, Db], shade(color, 0.6));
      this.poly(g, [A, B, C, D], top ?? shade(color, 1.1));
      if (stripes) {
        // Livres sur la face avant
        const shelves = 3;
        for (let s = 0; s < shelves; s++) {
          const z0 = 3 + (s * (h - 4)) / shelves;
          const z1 = z0 + (h - 4) / shelves - 3;
          let k = 0;
          for (let bx = x + 0.06; bx < x + w - 0.1; bx += 0.13) {
            const col = stripes[(k++ * 7 + s * 3) % stripes.length];
            const bw = 0.1;
            const zt = z1 - ((k * 13) % 4);
            this.poly(g, [iso(bx, y + d, z0), iso(bx + bw, y + d, z0), iso(bx + bw, y + d, zt), iso(bx, y + d, zt)], shade(col, 0.75));
          }
        }
      }
    }

    private drawWalls(room: RoomId) {
      const r = ROOM_RECTS[room];
      const gaps = { n: new Set<number>(), s: new Set<number>(), w: new Set<number>(), e: new Set<number>() };
      for (const d of DOORS.filter((dd) => dd.room === room)) {
        if (d.y === r.y - 1) gaps.n.add(d.x);
        else if (d.y === r.y + r.h) gaps.s.add(d.x);
        else if (d.x === r.x - 1) gaps.w.add(d.y);
        else if (d.x === r.x + r.w) gaps.e.add(d.y);
      }
      const T = 0.14;
      const wall = (x: number, y: number, w: number, d: number, h: number) => {
        const g = this.add.graphics().setDepth(depthAt(x + w / 2, y + d / 2) - 5);
        this.box(g, x, y, w, d, h, WALL.color, WALL.top);
      };
      const LOW = 9;
      for (let i = 0; i < r.w; i++) {
        const x = r.x + i;
        if (!gaps.n.has(x)) wall(x, r.y, 1, T, WALL.height);
        else this.doorFrame(x, r.y, 'n');
        if (!gaps.s.has(x)) wall(x, r.y + r.h - T, 1, T, LOW);
      }
      for (let j = 0; j < r.h; j++) {
        const y = r.y + j;
        if (!gaps.w.has(y)) wall(r.x, y, T, 1, WALL.height);
        else this.doorFrame(r.x, y, 'w');
        if (!gaps.e.has(y)) wall(r.x + r.w - T, y, T, 1, LOW);
      }
    }

    /** Linteau au-dessus des portes des murs du fond. */
    private doorFrame(x: number, y: number, side: 'n' | 'w') {
      const g = this.add.graphics().setDepth(depthAt(x + 0.5, y) - 5);
      const H = WALL.height;
      if (side === 'n') {
        this.box(g, x, y, 0.12, 0.14, H, WALL.color, WALL.top);
        this.box(g, x + 0.88, y, 0.12, 0.14, H, WALL.color, WALL.top);
        const A = iso(x, y + 0.14, H), B = iso(x + 1, y + 0.14, H), C = iso(x + 1, y + 0.14, H - 7), D = iso(x, y + 0.14, H - 7);
        this.poly(g, [A, B, C, D], shade(WALL.color, 0.6));
      } else {
        this.box(g, x, y, 0.14, 0.12, H, WALL.color, WALL.top);
        this.box(g, x, y + 0.88, 0.14, 0.12, H, WALL.color, WALL.top);
        const A = iso(x + 0.14, y, H), B = iso(x + 0.14, y + 1, H), C = iso(x + 0.14, y + 1, H - 7), D = iso(x + 0.14, y, H - 7);
        this.poly(g, [A, B, C, D], shade(WALL.color, 0.78));
      }
    }

    private drawDecor(it: DecorItem, _room: RoomId) {
      switch (it.kind) {
        case 'box': {
          const g = this.add.graphics().setDepth(depthAt(it.x + it.w / 2, it.y + it.d / 2));
          this.box(g, it.x, it.y, it.w, it.d, it.h, it.color, it.top, it.stripes);
          break;
        }
        case 'cyl': {
          const g = this.add.graphics().setDepth(depthAt(it.x, it.y));
          this.cyl(g, it.x, it.y, it.r, it.h, it.color, it.top);
          break;
        }
        case 'plant': {
          const g = this.add.graphics().setDepth(depthAt(it.x, it.y));
          this.cyl(g, it.x, it.y, it.r * 0.55, 12, 0xa0522d, 0x6b3a1e);
          const p = iso(it.x, it.y, 12);
          const R = it.r * 34;
          g.fillStyle(0x2f6b2f, 1).fillCircle(p.x, p.y - R * 0.7, R);
          g.fillStyle(0x3f8f3f, 1).fillCircle(p.x - R * 0.35, p.y - R * 0.95, R * 0.6);
          g.fillStyle(0x52a852, 1).fillCircle(p.x + R * 0.3, p.y - R * 1.15, R * 0.45);
          break;
        }
        case 'rug': {
          const g = this.add.graphics().setDepth(-900);
          const pts = [iso(it.x, it.y), iso(it.x + it.w, it.y), iso(it.x + it.w, it.y + it.d), iso(it.x, it.y + it.d)];
          this.poly(g, pts, it.color);
          if (it.border) {
            g.lineStyle(3, it.border, 0.9).strokePoints(pts as Phaser.Math.Vector2[], true);
            const inset = [iso(it.x + 0.25, it.y + 0.25), iso(it.x + it.w - 0.25, it.y + 0.25), iso(it.x + it.w - 0.25, it.y + it.d - 0.25), iso(it.x + 0.25, it.y + it.d - 0.25)];
            g.lineStyle(1.5, it.border, 0.6).strokePoints(inset as Phaser.Math.Vector2[], true);
          }
          break;
        }
        case 'fire': {
          const p = iso(it.x, it.y, 4);
          const glow = this.add.graphics().setDepth(-850).setBlendMode(P.BlendModes.ADD);
          glow.fillStyle(0xff7a1a, 0.18).fillEllipse(p.x, p.y + 20, 220, 110);
          glow.fillStyle(0xffa040, 0.18).fillEllipse(p.x, p.y + 14, 120, 60);
          this.tweens.add({ targets: glow, alpha: { from: 1, to: 0.55 }, duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            onRepeat: () => { glow.alpha = 0.7 + Math.random() * 0.3; } });
          const flame = this.add.graphics().setDepth(depthAt(it.x, it.y) + 1);
          const drawFlame = () => {
            flame.clear();
            const j = () => (Math.random() - 0.5) * 4;
            flame.fillStyle(0xff5a00, 1).fillTriangle(p.x - 10, p.y, p.x + 10, p.y, p.x + j(), p.y - 20 + j());
            flame.fillStyle(0xffc23a, 1).fillTriangle(p.x - 5, p.y, p.x + 5, p.y, p.x + j(), p.y - 12 + j());
          };
          drawFlame();
          this.time.addEvent({ delay: 110, loop: true, callback: drawFlame });
          break;
        }
        case 'stairs': {
          for (let i = 0; i < it.steps; i++) {
            const sd = it.d / it.steps;
            const g = this.add.graphics().setDepth(depthAt(it.x + it.w / 2, it.y + i * sd + sd / 2));
            this.box(g, it.x, it.y + i * sd, it.w, sd, (it.steps - i) * 6, it.color, shade(it.color, 1.15));
          }
          break;
        }
      }
    }

    private cyl(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, h: number, color: number, top?: number) {
      const p = iso(x, y);
      const rx = r * HW * 1.41;
      const ry = r * HH * 1.41;
      g.fillStyle(shade(color, 0.7), 1).fillEllipse(p.x, p.y, rx * 2, ry * 2);
      g.fillStyle(shade(color, 0.82), 1).fillRect(p.x - rx, p.y - h, rx * 2, h);
      g.fillStyle(top ?? shade(color, 1.1), 1).fillEllipse(p.x, p.y - h, rx * 2, ry * 2);
    }

    // ---------------------------------------------------------------- Pions et armes

    private makePawn(color: number): Phaser.GameObjects.Container {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.35).fillEllipse(0, 0, 26, 13);
      // socle
      g.fillStyle(shade(color, 0.55), 1).fillEllipse(0, -2, 22, 11);
      g.fillStyle(shade(color, 0.7), 1).fillRect(-11, -6, 22, 4);
      g.fillStyle(shade(color, 0.85), 1).fillEllipse(0, -6, 22, 11);
      // corps (cône)
      g.fillStyle(color, 1).fillPoints([{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 4, y: -28 }, { x: -4, y: -28 }] as Phaser.Math.Vector2[], true);
      g.fillStyle(shade(color, 0.75), 1).fillPoints([{ x: 2, y: -6 }, { x: 8, y: -6 }, { x: 4, y: -28 }, { x: 1, y: -28 }] as Phaser.Math.Vector2[], true);
      // col + tête
      g.fillStyle(shade(color, 0.85), 1).fillEllipse(0, -28, 14, 6);
      g.fillStyle(color, 1).fillCircle(0, -35, 7.5);
      g.fillStyle(0xffffff, 0.45).fillCircle(-2.5, -37.5, 2.5);
      g.lineStyle(1.2, 0x000000, 0.45).strokeCircle(0, -35, 7.5);
      const c = this.add.container(0, 0, [g]);
      c.setVisible(false);
      return c;
    }

    private makeWeapon(id: WeaponId): Phaser.GameObjects.Container {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3).fillEllipse(0, 0, 22, 10);
      g.fillStyle(0xd9c9a0, 1).fillEllipse(0, -1, 18, 8);
      const t = this.add.text(0, -12, WEAPON_ICON[id] ?? '?', { fontSize: '17px' }).setOrigin(0.5).setResolution(2);
      const c = this.add.container(0, 0, [g, t]);
      c.setVisible(false);
      return c;
    }

    private placePawn(s: SuspectId, gp: Pt) {
      const c = this.pawns.get(s)!;
      const p = iso(gp.x, gp.y);
      c.setPosition(p.x, p.y).setDepth(depthAt(gp.x, gp.y) + 50).setVisible(true).setAlpha(1).setScale(1);
      this.pawnGrid.set(s, gp);
    }

    private placeWeapon(w: WeaponId, room: RoomId) {
      const gp = weaponSlot(room, w);
      const p = iso(gp.x, gp.y);
      this.weapons.get(w)!.setPosition(p.x, p.y).setDepth(depthAt(gp.x, gp.y) + 40).setVisible(true);
    }

    // ---------------------------------------------------------------- Mise à jour

    apply(u: BoardUpdate) {
      this.latest = u;
      const prev = this.state;
      this.state = u.state;
      // Première fois, ou nouvelle partie : on place tout sans animation
      if (!prev || u.state.log.length < prev.log.length) {
        for (const s of SUSPECTS) this.placePawn(s.id, gridPoint(u.state.pawns[s.id], s.id));
        for (const w of WEAPONS) this.placeWeapon(w.id as WeaponId, u.state.weapons[w.id as WeaponId]);
        this.refreshOverlay();
        this.userCamera = false;
        this.time.delayedCall(900, () => this.focusCurrent(1000));
        return;
      }
      const turnChanged = prev.currentPlayer !== u.state.currentPlayer;
      const fresh = u.state.log.slice(prev.log.length);
      const target = u.state;
      this.animating = true;
      this.refreshOverlay();
      this.queue = this.queue
        .then(() => this.playEntries(fresh, target))
        .catch((e) => console.error(e))
        .then(() => {
          // Sécurité : on aligne tout sur l'état final
          for (const s of SUSPECTS) {
            const want = gridPoint(target.pawns[s.id], s.id);
            const have = this.pawnGrid.get(s.id);
            if (!have || have.x !== want.x || have.y !== want.y) this.placePawn(s.id, want);
          }
          for (const w of WEAPONS) this.placeWeapon(w.id as WeaponId, target.weapons[w.id as WeaponId]);
          if (this.state === target) {
            this.animating = false;
            this.refreshOverlay();
            this.owner.onEvent?.({ type: 'idle' });
            if (turnChanged) {
              this.userCamera = false;
              this.focusCurrent();
            }
          }
        });
    }

    private suspectOf(state: GameState, player: string): SuspectId {
      return state.players.find((p) => p.id === player)!.suspect;
    }

    private async playEntries(entries: LogEntry[], state: GameState) {
      for (const e of entries) {
        if (e.type === 'rolled') {
          await this.owner.rollDice(e.dice);
          this.owner.onEvent?.({ type: 'dice', total: e.dice.reduce((a, b) => a + b, 0), player: e.player });
        }
        else if (e.type === 'moved') await this.walk(this.suspectOf(state, e.player), e.path);
        else if (e.type === 'secretPassage') {
          const s = this.suspectOf(state, e.player);
          await this.teleport(s, roomSlot(e.to, s));
          this.flashRoom(e.to);
        } else if (e.type === 'suggested') {
          const slot = roomSlot(e.room, e.suspect);
          const r = ROOM_RECTS[e.room];
          this.focus({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, 400);
          await sleep(350);
          const cur = this.pawnGrid.get(e.suspect);
          const moves: Promise<void>[] = [];
          if (!cur || cur.x !== slot.x || cur.y !== slot.y) moves.push(this.teleport(e.suspect, slot));
          moves.push(this.teleportWeapon(e.weapon, e.room));
          this.flashRoom(e.room, 0xffd36b);
          await Promise.all(moves);
          await sleep(250);
        }
      }
    }

    private walk(s: SuspectId, path: Position[]): Promise<void> {
      const c = this.pawns.get(s)!;
      const start = this.pawnGrid.get(s);
      if (start) this.focus(start, 300);
      return new Promise((resolve) => {
        const steps = path.slice(1);
        let i = 0;
        const next = () => {
          if (i >= steps.length) return resolve();
          const pos = steps[i++];
          const gp = gridPoint(pos, s);
          const to = iso(gp.x, gp.y);
          const from = { x: c.x, y: c.y };
          c.setDepth(Math.max(c.depth, depthAt(gp.x, gp.y) + 50));
          this.tweens.addCounter({
            from: 0, to: 1, duration: pos.type === 'room' ? 260 : 150, ease: 'Sine.easeInOut',
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              c.x = from.x + (to.x - from.x) * t;
              c.y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 7;
            },
            onComplete: () => {
              c.setDepth(depthAt(gp.x, gp.y) + 50);
              this.pawnGrid.set(s, gp);
              this.focus(gp, 200, false);
              if (pos.type === 'room') this.flashRoom(pos.room);
              next();
            },
          });
        };
        next();
      });
    }

    private teleport(s: SuspectId, gp: Pt): Promise<void> {
      const c = this.pawns.get(s)!;
      return new Promise((resolve) => {
        this.sparkle(c.x, c.y - 18);
        this.tweens.add({
          targets: c, alpha: 0, scaleX: 0.3, scaleY: 1.6, duration: 260, ease: 'Back.easeIn',
          onComplete: () => {
            const p = iso(gp.x, gp.y);
            c.setPosition(p.x, p.y).setDepth(depthAt(gp.x, gp.y) + 50);
            this.pawnGrid.set(s, gp);
            this.sparkle(p.x, p.y - 18);
            this.tweens.add({ targets: c, alpha: 1, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.easeOut', onComplete: () => resolve() });
          },
        });
      });
    }

    private teleportWeapon(w: WeaponId, room: RoomId): Promise<void> {
      const c = this.weapons.get(w)!;
      const gp = weaponSlot(room, w);
      const p = iso(gp.x, gp.y);
      if (Math.abs(c.x - p.x) < 1 && Math.abs(c.y - p.y) < 1) return Promise.resolve();
      return new Promise((resolve) => {
        this.tweens.add({
          targets: c, alpha: 0, y: c.y - 30, duration: 220,
          onComplete: () => {
            c.setPosition(p.x, p.y - 30).setDepth(depthAt(gp.x, gp.y) + 40);
            this.tweens.add({ targets: c, alpha: 1, y: p.y, duration: 380, ease: 'Bounce.easeOut', onComplete: () => resolve() });
          },
        });
      });
    }

    private sparkle(x: number, y: number) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const dot = this.add.circle(x, y, 2.5, 0xfff2b0).setDepth(1e6 - 10).setBlendMode(P.BlendModes.ADD);
        this.tweens.add({ targets: dot, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 16, alpha: 0, duration: 450, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
      }
    }

    /** La pièce s'illumine quand quelqu'un y entre. */
    private flashRoom(room: RoomId, color = 0xfff1c9) {
      const r = ROOM_RECTS[room];
      const g = this.roomFlash;
      g.clear();
      this.poly(g, [iso(r.x, r.y), iso(r.x + r.w, r.y), iso(r.x + r.w, r.y + r.h), iso(r.x, r.y + r.h)], color, 0.35);
      g.setAlpha(1);
      this.tweens.killTweensOf(g);
      this.tweens.add({ targets: g, alpha: 0, duration: 900, ease: 'Quad.easeOut' });
    }

    /** Surbrillance des cases accessibles + anneau sous le joueur dont c'est le tour. */
    private refreshOverlay() {
      const u = this.latest;
      this.highlight.clear();
      this.reach.clear();
      if (!u) return;
      const st = u.state;
      const current = st.phase === 'finished' ? null : st.players.find((p) => p.id === st.currentPlayer);
      if (current && !this.animating) {
        const pawn = this.pawns.get(current.suspect)!;
        this.turnRing.setPosition(pawn.x, pawn.y).setDepth(pawn.depth - 1).setVisible(true);
      } else this.turnRing.setVisible(false);

      if (this.animating) return;
      for (const d of u.destinations) {
        this.reach.set(posKey(d.to), d);
        if (d.to.type === 'cell') {
          const { x, y } = d.to;
          this.poly(this.highlight, [iso(x + 0.08, y + 0.08), iso(x + 0.92, y + 0.08), iso(x + 0.92, y + 0.92), iso(x + 0.08, y + 0.92)], 0x5fd35f, 0.75);
        } else {
          const r = ROOM_RECTS[d.to.room];
          const pts = [iso(r.x, r.y), iso(r.x + r.w, r.y), iso(r.x + r.w, r.y + r.h), iso(r.x, r.y + r.h)];
          this.poly(this.highlight, pts, 0x5fd35f, 0.28);
          this.highlight.lineStyle(4, 0x7dff7d, 0.95).strokePoints(pts as Phaser.Math.Vector2[], true);
        }
      }
    }

    // ---------------------------------------------------------------- Caméra et toucher

    fit() {
      const cam = this.cameras.main;
      if (!cam) return;
      const left = iso(0, BOARD_HEIGHT).x, right = iso(BOARD_WIDTH, 0).x;
      const top = iso(0, 0).y - WALL.height - 30, bottom = iso(BOARD_WIDTH, BOARD_HEIGHT).y + SLAB;
      const w = right - left, h = bottom - top;
      this.fitZoom = Math.min(this.scale.width / w, this.scale.height / h) * 0.96;
      cam.setZoom(this.fitZoom);
      cam.centerOn((left + right) / 2, (top + bottom) / 2);
    }

    /** Taille de l'écran changée : on recalcule sans perdre le cadrage en cours. */
    onResize() {
      const cam = this.cameras.main;
      if (!cam) return;
      const ratio = cam.zoom / this.fitZoom;
      const center = cam.midPoint.clone();
      const left = iso(0, BOARD_HEIGHT).x, right = iso(BOARD_WIDTH, 0).x;
      const top = iso(0, 0).y - WALL.height - 30, bottom = iso(BOARD_WIDTH, BOARD_HEIGHT).y + SLAB;
      this.fitZoom = Math.min(this.scale.width / (right - left), this.scale.height / (bottom - top)) * 0.96;
      cam.setZoom(this.fitZoom * ratio);
      cam.centerOn(center.x, center.y);
    }

    /** Zoom « de jeu » : assez gros pour bien voir les cases. */
    private playZoom(): number {
      // environ 11 cases visibles dans la largeur, quelle que soit la taille de l'écran
      return P.Math.Clamp(this.scale.width / (11 * HW * 2), this.fitZoom * 1.2, this.fitZoom * 4);
    }

    /** Centre la caméra en douceur sur un point du plateau (en cases). */
    focus(gp: Pt, duration = 700, zoom = true) {
      if (this.userCamera) return;
      const cam = this.cameras.main;
      const p = iso(gp.x, gp.y, 20);
      cam.pan(p.x, p.y, duration, 'Sine.easeInOut', true);
      if (zoom) cam.zoomTo(this.playZoom(), duration, 'Sine.easeInOut', true);
    }

    private focusCurrent(duration = 700) {
      const st = this.state;
      if (!st || st.phase === 'finished') return;
      const cur = st.players.find((p) => p.id === st.currentPlayer);
      if (!cur) return;
      const gp = this.pawnGrid.get(cur.suspect);
      if (gp) this.focus(gp, duration);
    }

    private zoomAt(factor: number, sx: number, sy: number) {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(sx, sy);
      const z = P.Math.Clamp(cam.zoom * factor, this.fitZoom * 0.8, this.fitZoom * 4);
      cam.setZoom(z);
      const after = cam.getWorldPoint(sx, sy);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    }

    private setupInput() {
      this.input.addPointer(2);
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        const pointers = this.input.manager.pointers.filter((pp) => pp.isDown);
        if (pointers.length >= 2) {
          const [a, b] = pointers;
          this.pinch = { dist: P.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.cameras.main.zoom };
          this.drag.active = false;
          return;
        }
        this.drag = { active: true, moved: 0, x: p.x, y: p.y };
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        const cam = this.cameras.main;
        if (this.pinch) {
          const pointers = this.input.manager.pointers.filter((pp) => pp.isDown);
          if (pointers.length >= 2) {
            const [a, b] = pointers;
            const dist = P.Math.Distance.Between(a.x, a.y, b.x, b.y);
            const target = P.Math.Clamp(this.pinch.zoom * (dist / this.pinch.dist), this.fitZoom * 0.8, this.fitZoom * 4);
            this.userCamera = true;
            this.zoomAt(target / cam.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
          }
          return;
        }
        if (!this.drag.active || !p.isDown) return;
        const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = p.x;
        this.drag.y = p.y;
        if (this.drag.moved > 8) {
          this.userCamera = true;
          cam.scrollX -= dx / cam.zoom;
          cam.scrollY -= dy / cam.zoom;
        }
      });
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.pinch) {
          if (this.input.manager.pointers.filter((pp) => pp.isDown).length < 2) this.pinch = null;
          this.drag.active = false;
          return;
        }
        if (this.drag.active && this.drag.moved <= 8) this.pick(p.worldX, p.worldY);
        this.drag.active = false;
      });
      this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        this.userCamera = true;
        this.zoomAt(dy > 0 ? 0.9 : 1.1, p.x, p.y);
      });
    }

    /** Bouton ⤢ : vue d'ensemble, puis retour sur le joueur au clic suivant. */
    recenter() {
      const cam = this.cameras.main;
      if (Math.abs(cam.zoom - this.fitZoom) < 0.01) {
        this.userCamera = false;
        this.focusCurrent(500);
        return;
      }
      this.userCamera = true;
      const left = iso(0, BOARD_HEIGHT).x, right = iso(BOARD_WIDTH, 0).x;
      const top = iso(0, 0).y - WALL.height - 30, bottom = iso(BOARD_WIDTH, BOARD_HEIGHT).y + SLAB;
      cam.pan((left + right) / 2, (top + bottom) / 2, 500, 'Sine.easeInOut', true);
      cam.zoomTo(this.fitZoom, 500, 'Sine.easeInOut', true);
    }

    private pick(wx: number, wy: number) {
      if (!this.latest || this.animating || this.reach.size === 0) return;
      const gx = Math.floor((wx / HW + wy / HH) / 2);
      const gy = Math.floor((wy / HH - wx / HW) / 2);
      if (gx < 0 || gy < 0 || gx >= BOARD_WIDTH || gy >= BOARD_HEIGHT) return;
      let dest = this.reach.get(`${gx},${gy}`);
      if (!dest && CELLS[gy][gx] === 'room') dest = this.reach.get(`room:${CELL_ROOM[gy][gx]}`);
      if (dest) this.latest.onPick(dest);
    }
  };
}
