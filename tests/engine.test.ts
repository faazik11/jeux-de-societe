import { describe, expect, it } from 'vitest';
import {
  RuleError,
  applyAction,
  createGame,
  getAvailableActions,
  getDestinations,
  getPlayerView,
  reachableDestinations,
  allowedWeapons,
  type CardId,
  type GameState,
  type NewPlayer,
} from '../src/games/cluedo/engine';

const FOUR: NewPlayer[] = [
  { id: 'p1', name: 'Rayan', suspect: 'vert' },
  { id: 'p2', name: 'Alice', suspect: 'rouge' },
  { id: 'p3', name: 'Bob', suspect: 'bleu' },
  { id: 'p4', name: 'Chloé', suspect: 'jaune' },
];

function newGame(seed = 42): GameState {
  return createGame({ players: FOUR, seed });
}

describe('mise en place', () => {
  it('distribue toutes les cartes hors solution', () => {
    const g = newGame();
    const all = g.players.flatMap((p) => p.hand);
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
    expect(all).not.toContain(g.solution.suspect);
    expect(all).not.toContain(g.solution.weapon);
    expect(all).not.toContain(g.solution.room);
    // 18 cartes / 4 joueurs : 5,5,4,4
    expect(g.players.map((p) => p.hand.length).sort()).toEqual([4, 4, 5, 5]);
  });

  it('Rouge commence et le premier joueur est maître de jeu', () => {
    const g = newGame();
    expect(g.currentPlayer).toBe('p2');
    expect(g.hostId).toBe('p1');
  });

  it('même graine = même partie', () => {
    expect(newGame(7)).toEqual(newGame(7));
  });

  it('refuse un nombre de joueurs invalide ou un personnage en double', () => {
    expect(() => createGame({ players: FOUR.slice(0, 1) })).toThrow(RuleError);
    expect(() => createGame({ players: [FOUR[0], { ...FOUR[1], suspect: 'vert' }] })).toThrow(RuleError);
  });
});

describe('déplacements', () => {
  it('atteint des cases à exactement N pas (règle stricte)', () => {
    const d = reachableDestinations({ type: 'cell', x: 0, y: 17 }, 2, new Set(), true);
    expect(d.has('1,17')).toBe(false); // à 1 pas : interdit en règle stricte
    expect(d.has('2,17')).toBe(true);
  });

  it('règle souple (par défaut) : on peut avancer de 1 à N cases', () => {
    const d = reachableDestinations({ type: 'cell', x: 0, y: 17 }, 2, new Set());
    expect(d.has('1,17')).toBe(true); // 1 pas
    expect(d.has('2,17')).toBe(true); // 2 pas
    expect(d.has('3,17')).toBe(false); // 3 pas : trop loin
    expect(d.get('1,17')!.path).toHaveLength(2);
  });

  it('la règle souple est celle par défaut, la stricte reste disponible en option', () => {
    expect(newGame().config.exactMove).toBe(false);
    expect(createGame({ players: FOUR, config: { exactMove: true } }).config.exactMove).toBe(true);
  });

  it('entrer dans une pièce arrête le déplacement, même avec des points en trop', () => {
    // La porte du salon est en (6,18) ; depuis (0,17), il faut 7 pas pour y être, 8 pour entrer.
    const d = reachableDestinations({ type: 'cell', x: 0, y: 17 }, 12, new Set());
    expect(d.has('room:salon')).toBe(true);
    expect(d.get('room:salon')!.path).toHaveLength(9);
  });

  it('un pion bloque le couloir', () => {
    const d = reachableDestinations({ type: 'cell', x: 0, y: 17 }, 1, new Set(['1,17']));
    expect(d.has('1,17')).toBe(false);
  });

  it('on ne peut pas ressortir et revenir dans la même pièce', () => {
    const d = reachableDestinations({ type: 'room', room: 'bal' }, 6, new Set());
    expect(d.has('room:bal')).toBe(false);
  });

  it('calcule rapidement les destinations avec 12 pas', () => {
    const t = performance.now();
    for (const pos of [
      { type: 'cell' as const, x: 8, y: 16 },
      { type: 'cell' as const, x: 15, y: 19 },
      { type: 'room' as const, room: 'bal' as const },
    ]) {
      reachableDestinations(pos, 12, new Set());
    }
    expect(performance.now() - t).toBeLessThan(1500);
  });

  it('lancer puis se déplacer sur une case proposée', () => {
    let g = newGame();
    g = applyAction(g, { type: 'roll', player: 'p2' });
    expect(g.phase).toBe('moving');
    const dests = getDestinations(g);
    expect(dests.length).toBeGreaterThan(0);
    g = applyAction(g, { type: 'move', player: 'p2', to: dests[0].to });
    expect(g.phase).toBe('postMove');
    expect(g.pawns.rouge).toEqual(dests[0].to);
  });

  it("refuse d'agir hors de son tour", () => {
    const g = newGame();
    expect(() => applyAction(g, { type: 'roll', player: 'p1' })).toThrow(RuleError);
  });
});

/** Place le joueur courant dans une pièce comme s'il venait d'y entrer. */
function inRoom(g: GameState, room: GameState['solution']['room']): GameState {
  const s = structuredClone(g);
  const p = s.players.find((pl) => pl.id === s.currentPlayer)!;
  s.pawns[p.suspect] = { type: 'room', room };
  s.phase = 'postMove';
  s.enteredRoomThisTurn = true;
  return s;
}

describe('hypothèses', () => {
  it('déplace le suspect et l’arme, puis le premier joueur qui peut réfuter montre une carte', () => {
    let g = inRoom(newGame(), 'cuisine');
    // On choisit une hypothèse dont une carte est chez p3
    const p3 = g.players.find((p) => p.id === 'p3')!;
    const p4 = g.players.find((p) => p.id === 'p4')!;
    const order = g.players.map((p) => p.id);
    expect(order).toEqual(['p2', 'p4', 'p1', 'p3']); // rouge, jaune, vert, bleu
    void p4;
    const weapon = p3.hand.find((c) => ['chandelier', 'poignard', 'tuyau', 'revolver', 'corde', 'cle'].includes(c));
    // On cherche un trio que personne avant p3 (p4, p1) ne possède
    const before = g.players.filter((p) => p.id === 'p4' || p.id === 'p1').flatMap((p) => p.hand);
    const suspect = g.solution.suspect; // personne ne l'a
    const room = g.solution.room;
    g = inRoom(g, room);
    const w = (weapon && !before.includes(weapon) ? weapon : g.solution.weapon) as any;

    g = applyAction(g, { type: 'suggest', player: 'p2', suspect, weapon: w });
    expect(g.pawns[suspect]).toEqual({ type: 'room', room });
    expect(g.weapons[w as 'corde']).toBe(room);

    if (w === g.solution.weapon) {
      expect(g.phase).toBe('postSuggestion');
      expect(g.log.at(-1)).toEqual({ type: 'noOneRefuted', player: 'p2' });
    } else {
      expect(g.phase).toBe('refuting');
      expect(g.pending?.refuter).toBe('p3');
      expect(getAvailableActions(g, 'p3').showCard).toEqual([w]);
      g = applyAction(g, { type: 'showCard', player: 'p3', card: w });
      expect(g.phase).toBe('postSuggestion');
      // Seuls p2 et p3 voient la carte
      const shown = (id: string) => getPlayerView(g, id).log.at(-1);
      expect(shown('p2')).toMatchObject({ type: 'cardShown', card: w });
      expect(shown('p3')).toMatchObject({ type: 'cardShown', card: w });
      expect(shown('p1')).toMatchObject({ type: 'cardShown', card: null });
    }
  });

  it('on doit montrer une carte demandée', () => {
    let g = inRoom(newGame(), 'cuisine');
    // Trouver une hypothèse réfutable
    for (const s of ['rouge', 'jaune', 'blanc', 'vert', 'bleu', 'violet'] as const) {
      const t = applyAction(g, { type: 'suggest', player: 'p2', suspect: s, weapon: 'corde' });
      if (t.phase === 'refuting') {
        const refuter = t.players.find((p) => p.id === t.pending!.refuter)!;
        const wrong = refuter.hand.find((c) => c !== s && c !== 'corde' && c !== 'cuisine') as CardId;
        expect(() => applyAction(t, { type: 'showCard', player: refuter.id, card: wrong })).toThrow(RuleError);
        expect(() => applyAction(t, { type: 'endTurn', player: 'p2' })).toThrow(RuleError);
        return;
      }
    }
    g = g; // aucune hypothèse réfutable : très improbable
  });

  it('une seule hypothèse par tour, et seulement en entrant dans la pièce', () => {
    let g = newGame();
    expect(getAvailableActions(g, 'p2').suggest).toBe(false);
    g = inRoom(g, 'salon');
    g = applyAction(g, { type: 'suggest', player: 'p2', suspect: g.solution.suspect, weapon: g.solution.weapon });
    if (g.phase === 'refuting') {
      const r = g.pending!.refuter;
      g = applyAction(g, { type: 'showCard', player: r, card: getAvailableActions(g, r).showCard[0] });
    }
    expect(getAvailableActions(g, 'p2').suggest).toBe(false);
  });

  it('un joueur amené par une hypothèse peut en faire une au début de son tour', () => {
    let g = inRoom(newGame(), 'hall');
    // p2 (rouge) fait venir jaune (p4, le joueur suivant)
    g = applyAction(g, { type: 'suggest', player: 'p2', suspect: 'jaune', weapon: 'corde' });
    if (g.phase === 'refuting') {
      const r = g.pending!.refuter;
      g = applyAction(g, { type: 'showCard', player: r, card: getAvailableActions(g, r).showCard[0] });
    }
    g = applyAction(g, { type: 'endTurn', player: 'p2' });
    expect(g.currentPlayer).toBe('p4');
    const a = getAvailableActions(g, 'p4');
    expect(a.suggest).toBe(true);
    expect(a.endTurn).toBe(true); // il peut rester dans la pièce
  });
});

describe('passages secrets', () => {
  it('permettent d’aller directement dans la pièce opposée', () => {
    let g = newGame();
    g.pawns.rouge = { type: 'room', room: 'cuisine' };
    expect(getAvailableActions(g, 'p2').secretPassage).toBe('bureau');
    g = applyAction(g, { type: 'secretPassage', player: 'p2' });
    expect(g.pawns.rouge).toEqual({ type: 'room', room: 'bureau' });
    expect(getAvailableActions(g, 'p2').suggest).toBe(true);
  });
});

describe('accusations', () => {
  it('une accusation juste fait gagner', () => {
    let g = newGame();
    const { suspect, weapon, room } = g.solution;
    g = applyAction(g, { type: 'accuse', player: 'p2', suspect, weapon, room });
    expect(g.phase).toBe('finished');
    expect(g.winner).toBe('p2');
    expect(getPlayerView(g, 'p1').solution).toEqual(g.solution);
  });

  it('une accusation fausse élimine, mais le joueur montre toujours ses cartes', () => {
    let g = newGame();
    const wrongRoom = g.solution.room === 'hall' ? 'salon' : 'hall';
    g = applyAction(g, { type: 'accuse', player: 'p2', suspect: g.solution.suspect, weapon: g.solution.weapon, room: wrongRoom });
    expect(g.players.find((p) => p.id === 'p2')!.eliminated).toBe(true);
    expect(g.currentPlayer).toBe('p4');
    // p2 est sauté au tour suivant
    for (const id of ['p4', 'p1', 'p3']) {
      g = applyAction(g, { type: 'roll', player: id });
      const d = getDestinations(g);
      g = d.length
        ? applyAction(g, { type: 'move', player: id, to: d[0].to })
        : g;
      g = applyAction(g, { type: 'endTurn', player: id });
    }
    expect(g.currentPlayer).toBe('p4');
  });

  it('le dernier joueur non éliminé gagne', () => {
    let g = createGame({ players: FOUR.slice(0, 2), seed: 3 });
    const wrong = g.solution.room === 'hall' ? 'salon' : 'hall';
    const first = g.currentPlayer;
    g = applyAction(g, { type: 'accuse', player: first, suspect: g.solution.suspect, weapon: g.solution.weapon, room: wrong });
    expect(g.phase).toBe('finished');
    expect(g.endReason).toBe('lastStanding');
    expect(g.winner).not.toBe(first);
  });
});

describe('maître de jeu', () => {
  it('seul le maître de jeu peut abandonner la partie', () => {
    const g = newGame();
    expect(() => applyAction(g, { type: 'abandon', player: 'p2' })).toThrow(RuleError);
    const done = applyAction(g, { type: 'abandon', player: 'p1' });
    expect(done.phase).toBe('finished');
    expect(done.endReason).toBe('abandoned');
  });
});

describe('vue joueur', () => {
  it('cache la solution et les mains des autres', () => {
    const g = newGame();
    const v = getPlayerView(g, 'p1');
    expect(v.solution).toBeNull();
    expect(v.players.find((p) => p.id === 'p1')!.hand).not.toBeNull();
    expect(v.players.find((p) => p.id === 'p2')!.hand).toBeNull();
    expect(v.players.find((p) => p.id === 'p2')!.handSize).toBeGreaterThan(0);
  });
});

describe('partie complète simulée', () => {
  it('des joueurs automatiques finissent toujours par trouver la solution', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = createGame({ players: FOUR, seed });
      // Chaque joueur retient ce qu'il sait (ses cartes + cartes montrées)
      const known = new Map(g.players.map((p) => [p.id, new Set<string>(p.hand)]));
      let guard = 0;
      while (g.phase !== 'finished' && guard++ < 5000) {
        const me = g.phase === 'refuting' ? g.pending!.refuter : g.currentPlayer;
        const a = getAvailableActions(g, me);
        const k = known.get(me)!;
        const unknown = (ids: string[]) => ids.filter((id) => !k.has(id));
        const sus = unknown(['rouge', 'jaune', 'blanc', 'vert', 'bleu', 'violet']);
        const wea = unknown(['chandelier', 'poignard', 'tuyau', 'revolver', 'corde', 'cle']);
        const roo = unknown(['cuisine', 'bal', 'veranda', 'salleAManger', 'billard', 'bibliotheque', 'salon', 'hall', 'bureau']);

        if (a.showCard.length) {
          g = applyAction(g, { type: 'showCard', player: me, card: a.showCard[0] });
          const last = g.log.at(-1)!;
          if (last.type === 'cardShown' && last.card) known.get(last.to)!.add(last.card);
        } else if (a.accuse && sus.length === 1 && wea.length === 1 && roo.length === 1) {
          g = applyAction(g, { type: 'accuse', player: me, suspect: sus[0] as any, weapon: wea[0] as any, room: roo[0] as any });
        } else if (a.suggest) {
          const room = (g.pawns[g.players.find((p) => p.id === me)!.suspect] as any).room;
          g = applyAction(g, { type: 'suggest', player: me, suspect: sus[0] as any, weapon: wea[0] as any });
          if (g.phase === 'postSuggestion' && g.log.at(-1)!.type === 'noOneRefuted' && !k.has(room)) {
            // Personne ne peut réfuter : les cartes demandées qu'on n'a pas sont dans la solution
            for (const s of sus) if (s !== sus[0]) k.add(s);
            for (const w of wea) if (w !== wea[0]) k.add(w);
            if (!k.has(room)) for (const r of roo) if (r !== room) k.add(r);
          }
        } else if (a.secretPassage && Math.random() < 0.5) {
          g = applyAction(g, { type: 'secretPassage', player: me });
        } else if (a.roll) {
          g = applyAction(g, { type: 'roll', player: me });
        } else if (a.move) {
          const d = getDestinations(g);
          const room = d.find((x) => x.to.type === 'room' && roo.includes(x.to.room)) ?? d.find((x) => x.to.type === 'room') ?? d[0];
          g = applyAction(g, { type: 'move', player: me, to: room.to });
        } else if (a.endTurn) {
          g = applyAction(g, { type: 'endTurn', player: me });
        } else {
          throw new Error(`Bloqué en phase ${g.phase}`);
        }
      }
      expect(g.phase, `graine ${seed}`).toBe('finished');
      expect(g.endReason).toBe('accusation');
    }
  });
});

describe('variante « l’arme de la pièce »', () => {
  const game = () => createGame({ players: FOUR, seed: 7, config: { diceCount: 2, weaponInRoom: true } });

  it('impose l’arme présente dans la pièce', () => {
    const g0 = game();
    const [weapon, room] = Object.entries(g0.weapons)[0] as ['corde', 'cuisine'];
    const g = inRoom(g0, room);
    expect(allowedWeapons(g, g.currentPlayer)).toEqual([weapon]);
    const other = (['chandelier', 'poignard', 'tuyau', 'revolver', 'corde', 'cle'] as const).find((w) => w !== weapon)!;
    expect(() => applyAction(g, { type: 'suggest', player: g.currentPlayer, suspect: 'vert', weapon: other })).toThrow(RuleError);
    const after = applyAction(g, { type: 'suggest', player: g.currentPlayer, suspect: 'vert', weapon });
    expect(after.weapons[weapon]).toBe(room);
  });

  it('dans une pièce sans arme, on choisit librement et l’arme est apportée', () => {
    const g0 = game();
    const used = new Set(Object.values(g0.weapons));
    const empty = (['cuisine', 'bal', 'veranda', 'salleAManger', 'billard', 'bibliotheque', 'salon', 'hall', 'bureau'] as const).find((r) => !used.has(r))!;
    const g = inRoom(g0, empty);
    expect(allowedWeapons(g, g.currentPlayer)).toHaveLength(6);
    const after = applyAction(g, { type: 'suggest', player: g.currentPlayer, suspect: 'vert', weapon: 'corde' });
    expect(after.weapons.corde).toBe(empty);
  });

  it('sans la variante, toutes les armes sont permises', () => {
    const g = inRoom(newGame(), 'cuisine');
    expect(allowedWeapons(g, g.currentPlayer)).toHaveLength(6);
  });
});
