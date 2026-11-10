// Moteur de règles : fonctions pures.
//   createGame(...)          -> nouvel état de partie
//   applyAction(state, a)    -> nouvel état (lève une RuleError si l'action est interdite)
//   getAvailableActions(...) -> ce que le joueur peut faire maintenant (pour l'interface)
//   getPlayerView(...)       -> état filtré : ce qu'un joueur a le droit de voir

import { SECRET_PASSAGES, START_CELLS } from './board';
import {
  ROOMS,
  SUSPECTS,
  WEAPONS,
  isRoom,
  isSuspect,
  isWeapon,
  type CardId,
  type RoomId,
  type SuspectId,
  type WeaponId,
} from './data';
import { posKey, reachableDestinations, samePos, type Destination } from './movement';
import { Rng } from './rng';
import {
  RuleError,
  type Action,
  type GameConfig,
  type GameState,
  type LogEntry,
  type PlayerState,
  type Position,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface NewPlayer {
  id: string;
  name: string;
  suspect: SuspectId;
}

export interface CreateGameOptions {
  players: NewPlayer[];
  /** Identifiant du maître de jeu (par défaut : le premier joueur). */
  hostId?: string;
  seed?: number;
  config?: Partial<GameConfig>;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { players } = opts;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RuleError(`Il faut entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new RuleError('Deux joueurs ont le même identifiant.');
  }
  if (new Set(players.map((p) => p.suspect)).size !== players.length) {
    throw new RuleError('Deux joueurs ont choisi le même personnage.');
  }
  const hostId = opts.hostId ?? players[0].id;
  if (!players.some((p) => p.id === hostId)) throw new RuleError('Le maître de jeu doit être un des joueurs.');

  const rng = new Rng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));

  // 1. Solution secrète
  const solution = {
    suspect: rng.pick(SUSPECTS).id,
    weapon: rng.pick(WEAPONS).id as WeaponId,
    room: rng.pick(ROOMS).id as RoomId,
  };

  // 2. Distribution des cartes restantes, une par une, à tour de rôle
  const rest = rng.shuffle(
    [...SUSPECTS, ...WEAPONS, ...ROOMS]
      .map((c) => c.id as CardId)
      .filter((id) => id !== solution.suspect && id !== solution.weapon && id !== solution.room),
  );
  const hands: CardId[][] = players.map(() => []);
  rest.forEach((card, i) => hands[i % players.length].push(card));

  // 3. Ordre de jeu : comme dans le jeu d'origine, Rouge commence, puis on suit l'ordre des pions
  const suspectOrder = SUSPECTS.map((s) => s.id);
  const ordered = [...players].sort((a, b) => suspectOrder.indexOf(a.suspect) - suspectOrder.indexOf(b.suspect));

  const playerStates: PlayerState[] = ordered.map((p) => ({
    id: p.id,
    name: p.name,
    suspect: p.suspect,
    hand: hands[players.indexOf(p)],
    eliminated: false,
    movedBySuggestion: false,
  }));

  // 4. Pions sur leurs cases de départ, armes réparties dans les pièces
  const pawns = Object.fromEntries(
    SUSPECTS.map((s) => [s.id, { type: 'cell', ...START_CELLS[s.id] } as Position]),
  ) as Record<SuspectId, Position>;
  const weaponRooms = rng.shuffle(ROOMS.map((r) => r.id as RoomId));
  const weapons = Object.fromEntries(WEAPONS.map((w, i) => [w.id, weaponRooms[i]])) as Record<WeaponId, RoomId>;

  return {
    version: 1,
    config: { diceCount: 2, exactMove: false, ...opts.config },
    rng: rng.state,
    hostId,
    players: playerStates,
    solution,
    pawns,
    weapons,
    turn: 1,
    currentPlayer: playerStates[0].id,
    phase: 'start',
    dice: null,
    enteredRoomThisTurn: false,
    suggestedThisTurn: false,
    pending: null,
    winner: null,
    endReason: null,
    log: [{ type: 'gameStarted' }],
  };
}

// ---------------------------------------------------------------------------
// Petits utilitaires

export function getPlayer(state: GameState, id: string): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new RuleError(`Joueur inconnu : ${id}`);
  return p;
}

export function playerPosition(state: GameState, id: string): Position {
  return state.pawns[getPlayer(state, id).suspect];
}

function currentRoom(state: GameState, id: string): RoomId | null {
  const pos = playerPosition(state, id);
  return pos.type === 'room' ? pos.room : null;
}

/** Cases de couloir occupées par les autres pions. */
function blockedCells(state: GameState, exceptSuspect: SuspectId): Set<string> {
  const set = new Set<string>();
  for (const s of SUSPECTS) {
    if (s.id === exceptSuspect) continue;
    const p = state.pawns[s.id];
    if (p.type === 'cell') set.add(posKey(p));
  }
  return set;
}

/** Destinations possibles pour le joueur courant après son lancer de dés. */
export function getDestinations(state: GameState): Destination[] {
  if (state.phase !== 'moving' || !state.dice) return [];
  const player = getPlayer(state, state.currentPlayer);
  const total = state.dice.reduce((a, b) => a + b, 0);
  const from = state.pawns[player.suspect];
  return [...reachableDestinations(from, total, blockedCells(state, player.suspect), !!state.config.exactMove).values()];
}

function canSuggestNow(state: GameState, id: string): boolean {
  if (state.currentPlayer !== id || state.suggestedThisTurn) return false;
  const player = getPlayer(state, id);
  if (player.eliminated || !currentRoom(state, id)) return false;
  if (state.phase === 'postMove') return state.enteredRoomThisTurn;
  if (state.phase === 'start') return player.movedBySuggestion;
  return false;
}

export interface AvailableActions {
  roll: boolean;
  move: boolean;
  secretPassage: RoomId | null;
  suggest: boolean;
  showCard: CardId[];
  accuse: boolean;
  endTurn: boolean;
  abandon: boolean;
}

/** Ce que le joueur `id` peut faire maintenant. */
export function getAvailableActions(state: GameState, id: string): AvailableActions {
  const none: AvailableActions = {
    roll: false,
    move: false,
    secretPassage: null,
    suggest: false,
    showCard: [],
    accuse: false,
    endTurn: false,
    abandon: false,
  };
  if (state.phase === 'finished') return none;
  const res = { ...none, abandon: id === state.hostId };

  if (state.phase === 'refuting' && state.pending?.refuter === id) {
    res.showCard = matchingCards(state, id);
    return res;
  }
  if (state.currentPlayer !== id) return res;

  const room = currentRoom(state, id);
  const player = getPlayer(state, id);
  switch (state.phase) {
    case 'start':
      res.roll = true;
      res.secretPassage = room ? (SECRET_PASSAGES[room] ?? null) : null;
      res.suggest = canSuggestNow(state, id);
      res.accuse = true;
      // On peut rester dans une pièce où l'on a été amené par une hypothèse.
      res.endTurn = player.movedBySuggestion && room !== null;
      break;
    case 'moving': {
      const dests = getDestinations(state);
      res.move = dests.length > 0;
      res.endTurn = dests.length === 0; // bloqué : on passe son tour
      res.accuse = true;
      break;
    }
    case 'postMove':
      res.suggest = canSuggestNow(state, id);
      res.accuse = true;
      res.endTurn = true;
      break;
    case 'postSuggestion':
      res.accuse = true;
      res.endTurn = true;
      break;
  }
  return res;
}

function matchingCards(state: GameState, id: string): CardId[] {
  const p = state.pending;
  if (!p) return [];
  return getPlayer(state, id).hand.filter((c) => c === p.suspect || c === p.weapon || c === p.room);
}

// ---------------------------------------------------------------------------
// Application des actions

/** Applique une action et renvoie le nouvel état (l'ancien n'est jamais modifié). */
export function applyAction(state: GameState, action: Action): GameState {
  const s: GameState = structuredClone(state);
  if (s.phase === 'finished') throw new RuleError('La partie est terminée.');
  getPlayer(s, action.player); // vérifie que le joueur existe

  switch (action.type) {
    case 'abandon':
      if (action.player !== s.hostId) throw new RuleError('Seul le maître de jeu peut abandonner la partie.');
      finish(s, 'abandoned', null);
      return s;

    case 'showCard':
      return showCard(s, action.player, action.card);
  }

  // Toutes les autres actions se font pendant son propre tour
  if (s.currentPlayer !== action.player) throw new RuleError("Ce n'est pas ton tour.");
  const available = getAvailableActions(s, action.player);

  switch (action.type) {
    case 'roll': {
      if (!available.roll) throw new RuleError('Tu ne peux pas lancer les dés maintenant.');
      const rng = new Rng(s.rng);
      s.dice = Array.from({ length: s.config.diceCount }, () => rng.die());
      s.rng = rng.state;
      s.phase = 'moving';
      s.log.push({ type: 'rolled', player: action.player, dice: s.dice });
      return s;
    }

    case 'move': {
      if (!available.move) throw new RuleError('Tu ne peux pas te déplacer maintenant.');
      const dest = getDestinations(s).find((d) => samePos(d.to, action.to));
      if (!dest) throw new RuleError('Cette case est hors de portée.');
      const player = getPlayer(s, action.player);
      s.pawns[player.suspect] = dest.to;
      s.enteredRoomThisTurn = dest.to.type === 'room';
      player.movedBySuggestion = false;
      s.phase = 'postMove';
      s.log.push({ type: 'moved', player: action.player, path: dest.path });
      return s;
    }

    case 'secretPassage': {
      const to = available.secretPassage;
      if (!to) throw new RuleError("Il n'y a pas de passage secret ici.");
      const player = getPlayer(s, action.player);
      const from = currentRoom(s, action.player)!;
      s.pawns[player.suspect] = { type: 'room', room: to };
      s.enteredRoomThisTurn = true;
      player.movedBySuggestion = false;
      s.phase = 'postMove';
      s.log.push({ type: 'secretPassage', player: action.player, from, to });
      return s;
    }

    case 'suggest':
      if (!available.suggest) throw new RuleError('Tu ne peux pas faire d’hypothèse maintenant.');
      return suggest(s, action.player, action.suspect, action.weapon);

    case 'accuse':
      if (!available.accuse) throw new RuleError('Tu ne peux pas accuser maintenant.');
      return accuse(s, action.player, action.suspect, action.weapon, action.room);

    case 'endTurn':
      if (!available.endTurn) throw new RuleError('Tu ne peux pas finir ton tour maintenant.');
      s.log.push({ type: 'turnEnded', player: action.player });
      nextTurn(s);
      return s;
  }
}

function suggest(s: GameState, by: string, suspect: SuspectId, weapon: WeaponId): GameState {
  if (!isSuspect(suspect) || !isWeapon(weapon)) throw new RuleError('Hypothèse invalide.');
  const room = currentRoom(s, by)!;

  // Le pion du suspect et l'arme sont amenés dans la pièce
  const target: Position = { type: 'room', room };
  if (!samePos(s.pawns[suspect], target)) {
    s.pawns[suspect] = target;
    const moved = s.players.find((p) => p.suspect === suspect);
    if (moved && moved.id !== by) moved.movedBySuggestion = true;
  }
  s.weapons[weapon] = room;
  s.suggestedThisTurn = true;
  s.log.push({ type: 'suggested', player: by, suspect, weapon, room });

  // On interroge les joueurs suivants dans l'ordre (les éliminés répondent aussi)
  const idx = s.players.findIndex((p) => p.id === by);
  for (let i = 1; i < s.players.length; i++) {
    const other = s.players[(idx + i) % s.players.length];
    const has = other.hand.some((c) => c === suspect || c === weapon || c === room);
    if (has) {
      s.pending = { by, suspect, weapon, room, refuter: other.id };
      s.phase = 'refuting';
      return s;
    }
    s.log.push({ type: 'couldNotRefute', player: other.id });
  }
  s.log.push({ type: 'noOneRefuted', player: by });
  s.phase = 'postSuggestion';
  return s;
}

function showCard(s: GameState, playerId: string, card: CardId): GameState {
  if (s.phase !== 'refuting' || !s.pending) throw new RuleError("Personne n'attend de carte.");
  if (s.pending.refuter !== playerId) throw new RuleError("Ce n'est pas à toi de montrer une carte.");
  if (!matchingCards(s, playerId).includes(card)) throw new RuleError('Tu dois montrer une des cartes demandées.');
  s.log.push({ type: 'cardShown', player: playerId, to: s.pending.by, card });
  s.pending = null;
  s.phase = 'postSuggestion';
  return s;
}

function accuse(s: GameState, by: string, suspect: SuspectId, weapon: WeaponId, room: RoomId): GameState {
  if (!isSuspect(suspect) || !isWeapon(weapon) || !isRoom(room)) throw new RuleError('Accusation invalide.');
  const correct = s.solution.suspect === suspect && s.solution.weapon === weapon && s.solution.room === room;
  s.log.push({ type: 'accused', player: by, suspect, weapon, room, correct });
  if (correct) {
    finish(s, 'accusation', by);
    return s;
  }
  getPlayer(s, by).eliminated = true;
  s.log.push({ type: 'eliminated', player: by });

  const active = s.players.filter((p) => !p.eliminated);
  if (active.length === 1) finish(s, 'lastStanding', active[0].id);
  else if (active.length === 0) finish(s, 'allEliminated', null);
  else nextTurn(s);
  return s;
}

function nextTurn(s: GameState) {
  const prev = getPlayer(s, s.currentPlayer);
  prev.movedBySuggestion = false;
  const idx = s.players.indexOf(prev);
  for (let i = 1; i <= s.players.length; i++) {
    const next = s.players[(idx + i) % s.players.length];
    if (!next.eliminated) {
      s.currentPlayer = next.id;
      break;
    }
  }
  s.turn += 1;
  s.phase = 'start';
  s.dice = null;
  s.enteredRoomThisTurn = false;
  s.suggestedThisTurn = false;
  s.pending = null;
}

function finish(s: GameState, reason: GameState['endReason'] & string, winner: string | null) {
  s.phase = 'finished';
  s.endReason = reason;
  s.winner = winner;
  s.pending = null;
  s.log.push({ type: 'gameOver', reason, winner, solution: s.solution });
}

// ---------------------------------------------------------------------------
// Vue d'un joueur : on retire tout ce qu'il n'a pas le droit de voir

export interface PlayerView extends Omit<GameState, 'solution' | 'players' | 'rng'> {
  me: string;
  solution: GameState['solution'] | null;
  players: (Omit<PlayerState, 'hand'> & { hand: CardId[] | null; handSize: number })[];
}

export function getPlayerView(state: GameState, me: string): PlayerView {
  const finished = state.phase === 'finished';
  const { rng: _rng, ...rest } = state;
  void _rng;
  return {
    ...rest,
    me,
    solution: finished ? state.solution : null,
    players: state.players.map((p) => ({
      ...p,
      hand: p.id === me || finished ? [...p.hand] : null,
      handSize: p.hand.length,
    })),
    log: state.log.map((e): LogEntry => {
      if (e.type === 'cardShown' && e.player !== me && e.to !== me && !finished) return { ...e, card: null };
      return e;
    }),
  };
}
