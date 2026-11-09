// Générateur aléatoire déterministe (mulberry32).
// Son état est stocké dans la partie : rejouer les mêmes actions donne toujours le même résultat.

export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Petit utilitaire pour enchaîner les tirages en gardant l'état. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const [value, next] = nextRandom(this.state);
    this.state = next;
    return value;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  die(): number {
    return this.int(6) + 1;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
