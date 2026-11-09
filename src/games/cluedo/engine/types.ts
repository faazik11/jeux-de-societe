import type { CardId, RoomId, SuspectId, WeaponId } from './data';

/** Position d'un pion : sur une case de couloir, ou dans une pièce. */
export type Position = { type: 'cell'; x: number; y: number } | { type: 'room'; room: RoomId };

export interface Solution {
  suspect: SuspectId;
  weapon: WeaponId;
  room: RoomId;
}

export interface PlayerState {
  id: string;
  name: string;
  suspect: SuspectId;
  hand: CardId[];
  eliminated: boolean;
  /** Vrai si un autre joueur a déplacé ce pion dans une pièce par une hypothèse. */
  movedBySuggestion: boolean;
}

export type Phase =
  | 'start' // début du tour : lancer le dé, passage secret, hypothèse (si déplacé), accusation
  | 'moving' // dé lancé : choisir sa destination
  | 'postMove' // déplacement fait : hypothèse (si dans une pièce), accusation, fin de tour
  | 'refuting' // en attente d'un joueur qui doit montrer une carte
  | 'postSuggestion' // hypothèse traitée : accusation ou fin de tour
  | 'finished';

export interface PendingSuggestion {
  by: string;
  suspect: SuspectId;
  weapon: WeaponId;
  room: RoomId;
  /** Joueur qui doit montrer une carte. */
  refuter: string;
}

export type EndReason = 'accusation' | 'lastStanding' | 'allEliminated' | 'abandoned';

export type LogEntry =
  | { type: 'gameStarted' }
  | { type: 'rolled'; player: string; dice: number[] }
  | { type: 'moved'; player: string; path: Position[] }
  | { type: 'secretPassage'; player: string; from: RoomId; to: RoomId }
  | { type: 'suggested'; player: string; suspect: SuspectId; weapon: WeaponId; room: RoomId }
  | { type: 'couldNotRefute'; player: string }
  | { type: 'noOneRefuted'; player: string }
  /** `card` n'est visible que par `player` et `to` (voir getPlayerView). */
  | { type: 'cardShown'; player: string; to: string; card: CardId | null }
  | { type: 'accused'; player: string; suspect: SuspectId; weapon: WeaponId; room: RoomId; correct: boolean }
  | { type: 'eliminated'; player: string }
  | { type: 'turnEnded'; player: string }
  | { type: 'gameOver'; reason: EndReason; winner: string | null; solution: Solution };

export interface GameConfig {
  /** Nombre de dés lancés (2 par défaut, car le plateau est grand). */
  diceCount: number;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  /** État du générateur aléatoire (pour que toutes les machines calculent la même chose). */
  rng: number;
  hostId: string;
  players: PlayerState[];
  solution: Solution;
  /** Position des 6 pions (y compris ceux qui ne sont joués par personne). */
  pawns: Record<SuspectId, Position>;
  /** Pièce où se trouve chaque arme (pour l'affichage). */
  weapons: Record<WeaponId, RoomId>;
  turn: number;
  currentPlayer: string;
  phase: Phase;
  dice: number[] | null;
  /** Vrai si le joueur courant est entré dans une pièce pendant ce tour. */
  enteredRoomThisTurn: boolean;
  suggestedThisTurn: boolean;
  pending: PendingSuggestion | null;
  winner: string | null;
  endReason: EndReason | null;
  log: LogEntry[];
}

export type Action =
  | { type: 'roll'; player: string }
  | { type: 'move'; player: string; to: Position }
  | { type: 'secretPassage'; player: string }
  | { type: 'suggest'; player: string; suspect: SuspectId; weapon: WeaponId }
  | { type: 'showCard'; player: string; card: CardId }
  | { type: 'accuse'; player: string; suspect: SuspectId; weapon: WeaponId; room: RoomId }
  | { type: 'endTurn'; player: string }
  | { type: 'abandon'; player: string };

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}
