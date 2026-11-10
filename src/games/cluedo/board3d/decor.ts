// Décor de chaque pièce (formes simples en attendant les vrais graphismes).
// Coordonnées en cases : x, y = coin arrière, w = largeur (vers la droite), d = profondeur, h = hauteur en pixels.
// Pour remplacer par de vraies images plus tard, il suffira de changer ce fichier.

import type { RoomId } from '../engine';
import { CHARTE } from '../../../theme/charte';

export type DecorItem =
  | { kind: 'box'; x: number; y: number; w: number; d: number; h: number; color: number; top?: number; stripes?: number[] }
  | { kind: 'cyl'; x: number; y: number; r: number; h: number; color: number; top?: number }
  | { kind: 'plant'; x: number; y: number; r: number }
  | { kind: 'rug'; x: number; y: number; w: number; d: number; color: number; border?: number }
  | { kind: 'fire'; x: number; y: number }
  | { kind: 'stairs'; x: number; y: number; w: number; d: number; steps: number; color: number };

const WOOD = 0x8a5a33;
const DARK_WOOD = 0x5b3a1e;
const BOOKS = [0xb03a2e, 0x2e6eb0, 0x3f8f4a, 0xd4a017, 0x7d3c98, 0xe0e0e0];

/** Couleur du sol de chaque pièce. */
export const FLOOR = CHARTE.sols as Record<RoomId, { a: number; b: number }>;

export const WALL = { color: CHARTE.plateau.mur, top: CHARTE.plateau.murHaut, height: 34 };

export const DECOR: Record<RoomId, DecorItem[]> = {
  cuisine: [
    { kind: 'box', x: 0.6, y: 1.12, w: 3.6, d: 0.75, h: 16, color: 0xbfbfbf, top: 0xe8e8e8 },
    { kind: 'box', x: 1.6, y: 1.12, w: 1, d: 0.75, h: 17, color: 0x3a3a3a, top: 0x222222 },
    { kind: 'box', x: 4.9, y: 1.12, w: 0.9, d: 0.85, h: 38, color: 0xf2f2f2, top: 0xffffff },
    { kind: 'box', x: 0.12, y: 2.3, w: 0.7, d: 2.2, h: 16, color: 0xbfbfbf, top: 0xe8e8e8 },
    { kind: 'cyl', x: 1.0, y: 1.5, r: 0.18, h: 22, color: 0x7a7a7a, top: 0x9a9a9a },
  ],
  bal: [
    { kind: 'rug', x: 9.5, y: 2.6, w: 5, d: 3.6, color: 0x7a2e3a, border: 0xc9a24a },
    { kind: 'box', x: 8.15, y: 1.12, w: 2.6, d: 1.1, h: 8, color: 0x6d2531, top: 0x8c3341 },
    { kind: 'box', x: 13.4, y: 1.2, w: 1.7, d: 1.1, h: 16, color: 0x161616, top: 0x2a2a2a },
    { kind: 'cyl', x: 9, y: 6.6, r: 0.45, h: 10, color: 0xe8e0d0, top: 0xffffff },
    { kind: 'cyl', x: 15, y: 6.6, r: 0.45, h: 10, color: 0xe8e0d0, top: 0xffffff },
  ],
  veranda: [
    { kind: 'plant', x: 18.7, y: 1.6, r: 0.45 },
    { kind: 'plant', x: 20.3, y: 1.45, r: 0.35 },
    { kind: 'plant', x: 23.2, y: 1.6, r: 0.5 },
    { kind: 'plant', x: 23.3, y: 3.6, r: 0.4 },
    { kind: 'cyl', x: 21.5, y: 2.6, r: 0.5, h: 9, color: 0xc8a165, top: 0xdfbb7f },
  ],
  salleAManger: [
    { kind: 'rug', x: 1.2, y: 10.2, w: 5, d: 2.4, color: 0x2f4d6b, border: 0xc9a24a },
    { kind: 'box', x: 1.6, y: 10.6, w: 4.2, d: 1.4, h: 11, color: DARK_WOOD, top: WOOD },
    { kind: 'box', x: 0.12, y: 12.6, w: 0.7, d: 2.6, h: 18, color: DARK_WOOD, top: WOOD },
    { kind: 'cyl', x: 2.2, y: 10.35, r: 0.15, h: 14, color: 0xc9a24a },
    { kind: 'cyl', x: 5.2, y: 10.35, r: 0.15, h: 14, color: 0xc9a24a },
  ],
  billard: [
    { kind: 'box', x: 19.3, y: 8.7, w: 3.2, d: 1.7, h: 11, color: 0x3d2414, top: 0x1f7a3a },
    { kind: 'box', x: 23.1, y: 8.15, w: 0.75, d: 1.6, h: 28, color: DARK_WOOD, top: WOOD },
    { kind: 'cyl', x: 20.2, y: 9.4, r: 0.08, h: 13, color: 0xffffff },
    { kind: 'cyl', x: 21.3, y: 9.6, r: 0.08, h: 13, color: 0xd4a017 },
  ],
  bibliotheque: [
    { kind: 'box', x: 17.15, y: 14.12, w: 2.7, d: 0.6, h: 40, color: DARK_WOOD, top: WOOD, stripes: BOOKS },
    { kind: 'box', x: 21.15, y: 14.12, w: 2.0, d: 0.6, h: 40, color: DARK_WOOD, top: WOOD, stripes: BOOKS },
    { kind: 'box', x: 23.25, y: 14.8, w: 0.6, d: 3, h: 40, color: DARK_WOOD, top: WOOD, stripes: BOOKS },
    { kind: 'rug', x: 18.5, y: 15.5, w: 3.5, d: 2.2, color: 0x4a6b3a, border: 0xc9a24a },
    { kind: 'box', x: 18.0, y: 17.6, w: 0.9, d: 0.9, h: 12, color: 0x7a2e2e, top: 0x8f3838 },
  ],
  salon: [
    { kind: 'rug', x: 1.2, y: 20.6, w: 4.2, d: 3, color: 0x8c6a2f, border: 0x3a2a12 },
    { kind: 'box', x: 2.4, y: 19.1, w: 1.6, d: 0.55, h: 28, color: 0x8b8378, top: 0xa59d92 },
    { kind: 'fire', x: 3.2, y: 19.7 },
    { kind: 'box', x: 0.15, y: 20.6, w: 0.9, d: 2.4, h: 12, color: 0x5a2424, top: 0x6e2c2c },
    { kind: 'box', x: 4.6, y: 23.4, w: 1, d: 1, h: 12, color: 0x5a2424, top: 0x6e2c2c },
  ],
  hall: [
    { kind: 'rug', x: 11, y: 18.1, w: 2, d: 6.6, color: 0x7a1f2b, border: 0xc9a24a },
    { kind: 'stairs', x: 9.15, y: 18.15, w: 1.6, d: 2.4, steps: 6, color: 0xb8ad98 },
    { kind: 'box', x: 13.8, y: 18.4, w: 0.8, d: 0.8, h: 14, color: 0xd8d2c4, top: 0xeeeeee },
    { kind: 'cyl', x: 14.2, y: 18.8, r: 0.22, h: 34, color: 0xbab3a4, top: 0xd8d2c4 },
  ],
  bureau: [
    { kind: 'box', x: 19.4, y: 21.4, w: 2.4, d: 1.1, h: 13, color: DARK_WOOD, top: WOOD },
    { kind: 'box', x: 20.3, y: 22.65, w: 0.7, d: 0.7, h: 10, color: 0x3a2a1a, top: 0x4d3825 },
    { kind: 'box', x: 22.6, y: 21.12, w: 1.25, d: 0.6, h: 36, color: DARK_WOOD, top: WOOD, stripes: BOOKS },
    { kind: 'cyl', x: 19.9, y: 21.8, r: 0.12, h: 20, color: 0xc9a24a, top: 0xffe9a8 },
  ],
};

/** Emoji provisoire pour chaque arme. */
export const WEAPON_ICON: Record<string, string> = {
  chandelier: '🕯️',
  poignard: '🗡️',
  tuyau: '🔧',
  revolver: '🔫',
  corde: '🪢',
  cle: '🔩',
};
