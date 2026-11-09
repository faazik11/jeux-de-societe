// Plateau : grille de 24 colonnes x 25 lignes.
// Chaque case est soit un mur (hors plateau), soit un couloir, soit une partie d'une pièce,
// soit le centre (inaccessible). On n'entre dans une pièce que par ses portes.

import type { RoomId, SuspectId } from './data';

export const BOARD_WIDTH = 24;
export const BOARD_HEIGHT = 25;

export type CellType = 'wall' | 'corridor' | 'room' | 'center';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Emplacement des pièces sur la grille (x = colonne, y = ligne). */
export const ROOM_RECTS: Record<RoomId, Rect> = {
  cuisine: { x: 0, y: 1, w: 6, h: 6 },
  bal: { x: 8, y: 1, w: 8, h: 7 },
  veranda: { x: 18, y: 1, w: 6, h: 5 },
  salleAManger: { x: 0, y: 9, w: 8, h: 7 },
  billard: { x: 18, y: 8, w: 6, h: 5 },
  bibliotheque: { x: 17, y: 14, w: 7, h: 5 },
  salon: { x: 0, y: 19, w: 7, h: 6 },
  hall: { x: 9, y: 18, w: 6, h: 7 },
  bureau: { x: 17, y: 21, w: 7, h: 4 },
};

/** Zone centrale (l'enveloppe du crime), inaccessible. */
export const CENTER_RECT: Rect = { x: 10, y: 10, w: 5, h: 7 };

export interface Door {
  /** Case de couloir devant la porte. */
  x: number;
  y: number;
  room: RoomId;
}

export const DOORS: readonly Door[] = [
  { x: 4, y: 7, room: 'cuisine' },
  { x: 7, y: 5, room: 'bal' },
  { x: 16, y: 5, room: 'bal' },
  { x: 10, y: 8, room: 'bal' },
  { x: 13, y: 8, room: 'bal' },
  { x: 18, y: 6, room: 'veranda' },
  { x: 6, y: 8, room: 'salleAManger' },
  { x: 8, y: 12, room: 'salleAManger' },
  { x: 6, y: 16, room: 'salleAManger' },
  { x: 17, y: 9, room: 'billard' },
  { x: 22, y: 13, room: 'billard' },
  { x: 16, y: 16, room: 'bibliotheque' },
  { x: 20, y: 13, room: 'bibliotheque' },
  { x: 6, y: 18, room: 'salon' },
  { x: 11, y: 17, room: 'hall' },
  { x: 12, y: 17, room: 'hall' },
  { x: 15, y: 21, room: 'hall' },
  { x: 17, y: 20, room: 'bureau' },
];

/** Passages secrets (dans les deux sens). */
export const SECRET_PASSAGES: Partial<Record<RoomId, RoomId>> = {
  cuisine: 'bureau',
  bureau: 'cuisine',
  veranda: 'salon',
  salon: 'veranda',
};

/** Cases de départ de chaque pion. */
export const START_CELLS: Record<SuspectId, { x: number; y: number }> = {
  rouge: { x: 16, y: 24 },
  jaune: { x: 0, y: 17 },
  blanc: { x: 7, y: 0 },
  vert: { x: 16, y: 0 },
  bleu: { x: 23, y: 7 },
  violet: { x: 23, y: 20 },
};

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

const START_KEYS = new Set(Object.values(START_CELLS).map((c) => `${c.x},${c.y}`));

/** Grille calculée une seule fois : CELLS[y][x]. */
export const CELLS: CellType[][] = buildCells();
/** Pour une case de pièce, la pièce correspondante. */
export const CELL_ROOM: (RoomId | null)[][] = buildCellRooms();

function buildCells(): CellType[][] {
  const grid: CellType[][] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (inRect(x, y, CENTER_RECT)) row.push('center');
      else if (Object.values(ROOM_RECTS).some((r) => inRect(x, y, r))) row.push('room');
      else if (y === 0 && !START_KEYS.has(`${x},${y}`)) row.push('wall');
      else row.push('corridor');
    }
    grid.push(row);
  }
  return grid;
}

function buildCellRooms(): (RoomId | null)[][] {
  const grid: (RoomId | null)[][] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row: (RoomId | null)[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const entry = (Object.entries(ROOM_RECTS) as [RoomId, Rect][]).find(([, r]) => inRect(x, y, r));
      row.push(entry ? entry[0] : null);
    }
    grid.push(row);
  }
  return grid;
}

export function cellType(x: number, y: number): CellType {
  if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return 'wall';
  return CELLS[y][x];
}

export function isCorridor(x: number, y: number): boolean {
  return cellType(x, y) === 'corridor';
}

export function doorsOf(room: RoomId): Door[] {
  return DOORS.filter((d) => d.room === room);
}

export function doorAt(x: number, y: number): Door | undefined {
  return DOORS.find((d) => d.x === x && d.y === y);
}
