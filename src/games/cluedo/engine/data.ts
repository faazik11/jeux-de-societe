// Données du jeu : personnages, armes et pièces du Cluedo (version française).
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
  /** Titre (« Colonel ») et nom (« Moutarde »), affichés sur deux lignes sur les cartes. */
  title: string;
  surname: string;
}

export const SUSPECTS: readonly SuspectInfo[] = [
  { id: 'rouge', kind: 'suspect', name: 'Mlle Rose', title: 'Mademoiselle', surname: 'Rose', color: '#c8324a' },
  { id: 'jaune', kind: 'suspect', name: 'Colonel Moutarde', title: 'Colonel', surname: 'Moutarde', color: '#d9a21b' },
  { id: 'blanc', kind: 'suspect', name: 'Mme Leblanc', title: 'Madame', surname: 'Leblanc', color: '#e9e4d8' },
  { id: 'vert', kind: 'suspect', name: 'Révérend Olive', title: 'Révérend', surname: 'Olive', color: '#3f8a4a' },
  { id: 'bleu', kind: 'suspect', name: 'Mme Pervenche', title: 'Madame', surname: 'Pervenche', color: '#4f6fd0' },
  { id: 'violet', kind: 'suspect', name: 'Professeur Violet', title: 'Professeur', surname: 'Violet', color: '#7d3c98' },
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
