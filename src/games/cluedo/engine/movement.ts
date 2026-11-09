// Calcul des déplacements possibles.
// Règles : on avance d'exactement N cases (N = total des dés), orthogonalement,
// sans repasser par la même case et sans traverser une case occupée par un autre pion.
// Entrer dans une pièce (par une porte) arrête le déplacement, même s'il reste des points.
// Sortir d'une pièce par une de ses portes compte comme un pas.

import { doorAt, doorsOf, isCorridor } from './board';
import type { RoomId } from './data';
import type { Position } from './types';

export function posKey(p: Position): string {
  return p.type === 'room' ? `room:${p.room}` : `${p.x},${p.y}`;
}

export function samePos(a: Position, b: Position): boolean {
  return posKey(a) === posKey(b);
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Cases voisines accessibles depuis une position (sans tenir compte des pions). */
export function neighbours(p: Position): Position[] {
  if (p.type === 'room') {
    return doorsOf(p.room).map((d) => ({ type: 'cell', x: d.x, y: d.y }) as Position);
  }
  const out: Position[] = [];
  for (const [dx, dy] of DIRS) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (isCorridor(x, y)) out.push({ type: 'cell', x, y });
  }
  const door = doorAt(p.x, p.y);
  if (door) out.push({ type: 'room', room: door.room });
  return out;
}

export interface Destination {
  to: Position;
  /** Chemin complet, position de départ comprise (utile pour animer le pion). */
  path: Position[];
}

/**
 * Toutes les destinations possibles avec exactement `steps` pas
 * (ou moins si l'on entre dans une pièce).
 * @param blocked cases de couloir occupées par d'autres pions
 */
export function reachableDestinations(from: Position, steps: number, blocked: Set<string>): Map<string, Destination> {
  const result = new Map<string, Destination>();
  const startRoom: RoomId | null = from.type === 'room' ? from.room : null;
  const visited = new Set<string>([posKey(from)]);
  const path: Position[] = [from];

  // Mémo : (case, pas restants) déjà explorés sans rien trouver de nouveau.
  // Comme on ne peut pas repasser par une case, ce n'est qu'une optimisation
  // approximative ; on la limite aux cas où le chemin ne compte pas.
  const explored = new Set<string>();

  const dfs = (current: Position, remaining: number) => {
    for (const next of neighbours(current)) {
      const key = posKey(next);
      if (visited.has(key)) continue;

      if (next.type === 'room') {
        if (next.room === startRoom) continue; // on doit sortir de la pièce, pas y revenir
        const prev = result.get(key);
        // on garde le chemin le plus court (plus joli à animer)
        if (!prev || prev.path.length > path.length + 1) result.set(key, { to: next, path: [...path, next] });
        continue; // entrer dans une pièce termine le déplacement
      }

      if (blocked.has(key)) continue;

      if (remaining === 1) {
        if (!result.has(key)) result.set(key, { to: next, path: [...path, next] });
        continue;
      }

      const memoKey = `${key}|${remaining - 1}|${visitedSignature(visited, next, remaining - 1)}`;
      if (explored.has(memoKey)) continue;
      explored.add(memoKey);

      visited.add(key);
      path.push(next);
      dfs(next, remaining - 1);
      path.pop();
      visited.delete(key);
    }
  };

  if (steps > 0) dfs(from, steps);
  return result;
}

/**
 * Signature des cases déjà visitées qui sont encore à portée : deux chemins arrivant
 * sur la même case avec les mêmes cases « proches » visitées offrent les mêmes possibilités.
 */
function visitedSignature(visited: Set<string>, at: Position, remaining: number): string {
  if (at.type === 'room') return '';
  const near: string[] = [];
  for (const key of visited) {
    if (key.startsWith('room:')) {
      near.push(key);
      continue;
    }
    const [x, y] = key.split(',').map(Number);
    if (Math.abs(x - at.x) + Math.abs(y - at.y) <= remaining) near.push(key);
  }
  return near.sort().join(';');
}
