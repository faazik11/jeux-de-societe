import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT, BOARD_WIDTH, CELL_ROOM, DOORS, ROOMS, SECRET_PASSAGES, START_CELLS,
  cellType, isCorridor, neighbours, posKey, type Position,
} from '../src/games/cluedo/engine';

describe('plateau', () => {
  it('chaque porte est un couloir collé à sa pièce', () => {
    for (const d of DOORS) {
      expect(isCorridor(d.x, d.y), `porte ${d.x},${d.y}`).toBe(true);
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const x = d.x + dx, y = d.y + dy;
        return x >= 0 && y >= 0 && x < BOARD_WIDTH && y < BOARD_HEIGHT && CELL_ROOM[y][x] === d.room;
      });
      expect(adj, `porte ${d.x},${d.y} -> ${d.room}`).toBe(true);
    }
  });

  it('chaque pièce a au moins une porte', () => {
    for (const r of ROOMS) expect(DOORS.some((d) => d.room === r.id), r.id).toBe(true);
  });

  it('les cases de départ sont des couloirs', () => {
    for (const c of Object.values(START_CELLS)) expect(cellType(c.x, c.y)).toBe('corridor');
  });

  it('les passages secrets vont dans les deux sens', () => {
    for (const [a, b] of Object.entries(SECRET_PASSAGES)) expect(SECRET_PASSAGES[b!]).toBe(a);
  });

  it('toutes les cases de couloir et toutes les pièces sont reliées', () => {
    const start: Position = { type: "cell", x: START_CELLS.rouge.x, y: START_CELLS.rouge.y };
    const queue: Position[] = [start];
    const seen = new Set([posKey(start)]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of neighbours(cur)) {
        const k = posKey(n);
        if (!seen.has(k)) { seen.add(k); queue.push(n); }
      }
    }
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++)
        if (isCorridor(x, y)) expect(seen.has(`${x},${y}`), `case ${x},${y}`).toBe(true);
    for (const r of ROOMS) expect(seen.has(`room:${r.id}`), r.id).toBe(true);
  });
});
