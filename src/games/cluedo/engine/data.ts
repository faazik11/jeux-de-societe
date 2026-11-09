// Données du jeu (thème basique provisoire : il sera remplacé par le thème original).
// Pour changer le thème, il suffit de modifier les noms et couleurs ici :
// les identifiants (id) restent les mêmes et le reste du code n'a pas à changer.

export type SuspectId = 'rouge' | 'jaune' | 'blanc' | 'vert' | 'bleu' | 'violet';
export type WeaponId = 'chandelier' | 'poignard' | 'tuyau' | 'revolver' | 'corde' | 'cle';
export type RoomId =
  | 'cuisine'
  | 'bal'
  | 'veranda'
  | 'salleAManger'
  | 'billard'
  | 'bibliotheque'
  | 'salon'
  | 'hall'
  | 'bureau';

export type CardKind = 'suspect' | 'weapon' | 'room';
export type CardId = SuspectId | WeaponId | RoomId;

export interface Card {
  id: CardId;
  kind: CardKind;
  name: string;
}

export interface SuspectInfo extends Card {
  id: SuspectId;
  kind: 'suspect';
  color: string;
}

export const SUSPECTS: readonly SuspectInfo[] = [
  { id: 'rouge', kind: 'suspect', name: 'Rouge', color: '#c0392b' },
  { id: 'jaune', kind: 'suspect', name: 'Jaune', color: '#e1b12c' },
  { id: 'blanc', kind: 'suspect', name: 'Blanc', color: '#ecf0f1' },
  { id: 'vert', kind: 'suspect', name: 'Vert', color: '#27ae60' },
  { id: 'bleu', kind: 'suspect', name: 'Bleu', color: '#2e86de' },
  { id: 'violet', kind: 'suspect', name: 'Violet', color: '#8e44ad' },
];

export const WEAPONS: readonly Card[] = [
  { id: 'chandelier', kind: 'weapon', name: 'Chandelier' },
  { id: 'poignard', kind: 'weapon', name: 'Poignard' },
  { id: 'tuyau', kind: 'weapon', name: 'Tuyau de plomb' },
  { id: 'revolver', kind: 'weapon', name: 'Revolver' },
  { id: 'corde', kind: 'weapon', name: 'Corde' },
  { id: 'cle', kind: 'weapon', name: 'Clé anglaise' },
];

export const ROOMS: readonly Card[] = [
  { id: 'cuisine', kind: 'room', name: 'Cuisine' },
  { id: 'bal', kind: 'room', name: 'Salle de bal' },
  { id: 'veranda', kind: 'room', name: 'Véranda' },
  { id: 'salleAManger', kind: 'room', name: 'Salle à manger' },
  { id: 'billard', kind: 'room', name: 'Salle de billard' },
  { id: 'bibliotheque', kind: 'room', name: 'Bibliothèque' },
  { id: 'salon', kind: 'room', name: 'Salon' },
  { id: 'hall', kind: 'room', name: 'Hall' },
  { id: 'bureau', kind: 'room', name: 'Bureau' },
];

export const ALL_CARDS: readonly Card[] = [...SUSPECTS, ...WEAPONS, ...ROOMS];

const CARD_INDEX = new Map<string, Card>(ALL_CARDS.map((c) => [c.id, c]));

export function getCard(id: CardId): Card {
  const card = CARD_INDEX.get(id);
  if (!card) throw new Error(`Carte inconnue : ${id}`);
  return card;
}

export function isSuspect(id: string): id is SuspectId {
  return SUSPECTS.some((s) => s.id === id);
}
export function isWeapon(id: string): id is WeaponId {
  return WEAPONS.some((w) => w.id === id);
}
export function isRoom(id: string): id is RoomId {
  return ROOMS.some((r) => r.id === id);
}
