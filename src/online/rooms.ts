// Salons de jeu en ligne.
//
// Structure dans la base :
//   rooms/{CODE}/
//     game: "cluedo"
//     hostUid: identifiant du maître de jeu
//     createdAt: date de création
//     status: "lobby" | "playing" | "finished"
//     players/{uid}: { name, suspect, joinedAt }
//     presence/{uid}: true si connecté, false sinon (mis à jour automatiquement)
//     state: l'état complet de la partie (texte JSON)
//
// Chaque action passe par une « transaction » : Firebase garantit que deux joueurs
// ne modifient jamais l'état en même temps, et le moteur de règles refuse les coups interdits.

import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { SUSPECTS, applyAction, createGame, type Action, type GameState, type SuspectId } from '../games/cluedo/engine';
import { db } from './firebase';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  name: string;
  suspect: SuspectId | null;
  joinedAt: number;
}

export interface Room {
  code: string;
  hostUid: string;
  status: RoomStatus;
  players: Record<string, RoomPlayer>;
  presence: Record<string, boolean>;
  state: GameState | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (faciles à confondre)

function randomCode(): string {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function firstFreeSuspect(players: Record<string, RoomPlayer>): SuspectId | null {
  const taken = new Set(Object.values(players).map((p) => p.suspect));
  return SUSPECTS.find((s) => !taken.has(s.id))?.id ?? null;
}

/** Crée un salon et renvoie son code. Le créateur devient maître de jeu. */
export async function createRoom(uid: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const exists = await get(ref(db, `rooms/${code}/hostUid`));
    if (exists.exists()) continue;
    await update(ref(db), {
      [`rooms/${code}/game`]: 'cluedo',
      [`rooms/${code}/hostUid`]: uid,
      [`rooms/${code}/createdAt`]: serverTimestamp(),
      [`rooms/${code}/status`]: 'lobby',
      [`rooms/${code}/players/${uid}`]: { name, suspect: 'rouge', joinedAt: serverTimestamp() },
    });
    return code;
  }
  throw new Error('Impossible de créer un salon, réessaie.');
}

/** Rejoint un salon existant (ou y revient après une déconnexion). */
export async function joinRoom(uid: string, code: string, name: string): Promise<void> {
  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) throw new Error('Aucune partie avec ce code.');
  const room = snap.val();
  const players: Record<string, RoomPlayer> = room.players ?? {};
  if (players[uid]) {
    // Déjà dans la partie : on met juste le nom à jour
    if (room.status === 'lobby') await set(ref(db, `rooms/${code}/players/${uid}/name`), name);
    return;
  }
  if (room.status !== 'lobby') throw new Error('Cette partie a déjà commencé.');
  if (Object.keys(players).length >= 6) throw new Error('La partie est complète (6 joueurs).');
  await set(ref(db, `rooms/${code}/players/${uid}`), {
    name,
    suspect: firstFreeSuspect(players),
    joinedAt: serverTimestamp(),
  });
}

export async function leaveRoom(uid: string, code: string): Promise<void> {
  await remove(ref(db, `rooms/${code}/players/${uid}`));
  await remove(ref(db, `rooms/${code}/presence/${uid}`));
}

export async function chooseSuspect(uid: string, code: string, suspect: SuspectId): Promise<void> {
  await set(ref(db, `rooms/${code}/players/${uid}/suspect`), suspect);
}

/** Signale sa présence : passe automatiquement à false si l'appareil se déconnecte. */
export function trackPresence(uid: string, code: string): () => void {
  const presenceRef = ref(db, `rooms/${code}/presence/${uid}`);
  return onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(presenceRef)
      .set(false)
      .then(() => set(presenceRef, true));
  });
}

export function subscribeRoom(code: string, cb: (room: Room | null) => void): () => void {
  return onValue(ref(db, `rooms/${code}`), (snap) => {
    if (!snap.exists()) return cb(null);
    const v = snap.val();
    cb({
      code,
      hostUid: v.hostUid,
      status: v.status,
      players: v.players ?? {},
      presence: v.presence ?? {},
      state: v.state ? (JSON.parse(v.state) as GameState) : null,
    });
  });
}

/** Le maître de jeu lance la partie : le moteur tire la solution et distribue les cartes. */
export async function startGame(uid: string, room: Room): Promise<void> {
  if (room.hostUid !== uid) throw new Error('Seul le maître de jeu peut lancer la partie.');
  const players = Object.entries(room.players)
    .sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
    .map(([id, p]) => ({ id, name: p.name, suspect: p.suspect as SuspectId }));
  if (players.some((p) => !p.suspect)) throw new Error('Chaque joueur doit choisir un personnage.');
  const state = createGame({ players, hostId: room.hostUid });
  await update(ref(db, `rooms/${room.code}`), { state: JSON.stringify(state), status: 'playing' });
}

/** Envoie une action. Lève une erreur si le moteur de règles la refuse. */
export async function sendAction(code: string, action: Action): Promise<void> {
  let ruleError: unknown = null;
  const result = await runTransaction(ref(db, `rooms/${code}/state`), (current: string | null) => {
    if (current === null) return current; // pas encore chargé : Firebase rappellera avec la vraie valeur
    try {
      ruleError = null;
      return JSON.stringify(applyAction(JSON.parse(current) as GameState, action));
    } catch (e) {
      ruleError = e;
      return undefined; // annule la transaction
    }
  });
  if (ruleError) throw ruleError;
  if (!result.committed) throw new Error("L'action n'a pas pu être enregistrée, réessaie.");
  const state = JSON.parse(result.snapshot.val()) as GameState;
  if (state.phase === 'finished') await set(ref(db, `rooms/${code}/status`), 'finished');
}

/** Liste des joueurs déconnectés pendant une partie (la partie est alors en pause). */
export function disconnectedPlayers(room: Room): string[] {
  if (room.status !== 'playing') return [];
  return Object.keys(room.players).filter((uid) => room.presence[uid] !== true);
}
