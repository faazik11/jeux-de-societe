// Cartes illustrées (HTML/CSS) : suspects, armes, pièces.
// Même style que les cartes en 3D : bandeau de couleur selon le type, illustration, nom.

import { SUSPECTS, getCard, type CardId } from '../engine';

const KIND_LABEL = { suspect: 'Suspect', weapon: 'Arme', room: 'Pièce' } as const;

/** Petit bonhomme à la couleur du suspect (même forme que les pions 3D). */
function suspectArt(color: string): string {
  return `<svg viewBox="0 0 60 70" class="card-art">
    <ellipse cx="30" cy="66" rx="18" ry="3.5" fill="#0002"/>
    <rect x="21" y="44" width="7" height="20" rx="3.5" fill="${color}" filter="brightness(.65)"/>
    <rect x="32" y="44" width="7" height="20" rx="3.5" fill="${color}" filter="brightness(.65)"/>
    <rect x="15" y="25" width="30" height="28" rx="14" fill="${color}"/>
    <rect x="9" y="28" width="7" height="18" rx="3.5" fill="${color}" transform="rotate(12 12 28)"/>
    <rect x="44" y="28" width="7" height="18" rx="3.5" fill="${color}" transform="rotate(-12 48 28)"/>
    <circle cx="30" cy="15" r="12" fill="${color}"/>
    <circle cx="30" cy="15" r="12" fill="#fff" opacity=".22"/>
    <circle cx="25.5" cy="14" r="2.6" fill="#fff"/><circle cx="34.5" cy="14" r="2.6" fill="#fff"/>
    <circle cx="25.5" cy="14.4" r="1.4" fill="#111"/><circle cx="34.5" cy="14.4" r="1.4" fill="#111"/>
  </svg>`;
}

/** Armes en métal gris (dégradé), comme les figurines du jeu. */
// Chaque carte a son propre dégradé (un dégradé partagé disparaît s'il est défini dans une partie cachée de la page)
let gradientCount = 0;
const metalDefs = (id: string) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#f1f3f6"/><stop offset=".45" stop-color="#9aa1ab"/><stop offset="1" stop-color="#5d636c"/></linearGradient></defs>`;

const WEAPON_ART: Record<string, string> = {
  chandelier: `<rect x="22" y="60" width="16" height="4" rx="2"/><path d="M26 60 L28 32 L32 32 L34 60Z"/><circle cx="30" cy="44" r="4"/>
    <rect x="22" y="26" width="16" height="6" rx="3"/><rect x="26" y="10" width="8" height="16" rx="2"/>
    <path d="M30 2 C26 7 34 7 30 2Z" fill="#ffb340" stroke="none"/>`,
  poignard: `<path d="M30 4 L35 40 L25 40Z"/><rect x="17" y="40" width="26" height="5" rx="2.5"/><rect x="26.5" y="45" width="7" height="14" rx="3"/><circle cx="30" cy="62" r="4"/>`,
  tuyau: `<path d="M18 62 L18 30 Q18 14 34 14 L46 14" fill="none" stroke="url(#mtl)" stroke-width="9" stroke-linecap="round"/>
    <rect x="12" y="56" width="12" height="6" rx="2"/><rect x="44" y="9" width="6" height="10" rx="2"/>`,
  revolver: `<rect x="8" y="20" width="34" height="8" rx="3"/><rect x="30" y="18" width="14" height="16" rx="4"/><circle cx="37" cy="26" r="6"/>
    <path d="M38 32 L50 58 L40 60 L32 36Z"/><path d="M30 34 Q28 42 34 42" fill="none" stroke="url(#mtl)" stroke-width="2.5"/>`,
  corde: `<circle cx="30" cy="40" r="17" fill="none" stroke="url(#mtl)" stroke-width="5"/><circle cx="30" cy="40" r="10" fill="none" stroke="url(#mtl)" stroke-width="5"/>
    <path d="M44 28 Q50 14 40 8 Q32 4 34 14" fill="none" stroke="url(#mtl)" stroke-width="5" stroke-linecap="round"/>`,
  cle: `<rect x="26" y="20" width="8" height="42" rx="4"/><path d="M18 6 L42 6 L42 22 L36 22 L36 13 L24 13 L24 22 L18 22Z"/>`,
};

function weaponArt(id: string): string {
  const gid = `mtl${++gradientCount}`;
  const art = (WEAPON_ART[id] ?? '').replaceAll('url(#mtl)', `url(#${gid})`);
  return `<svg viewBox="0 0 60 70" class="card-art metal">${metalDefs(gid)}<g fill="url(#${gid})" stroke="#4a4f57" stroke-width="1">${art}</g></svg>`;
}

const ROOM_ICON: Record<string, string> = {
  cuisine: '🍳',
  bal: '💃',
  veranda: '🌿',
  salleAManger: '🍽️',
  billard: '🎱',
  bibliotheque: '📚',
  salon: '🛋️',
  hall: '🚪',
  bureau: '🖋️',
};

export interface CardOptions {
  size?: 'sm' | 'md' | 'lg';
  /** Attributs HTML en plus (ex. data-pick="..."). */
  attrs?: string;
  selected?: boolean;
  dim?: boolean;
  /** Petit texte sous la carte (ex. « ta carte »). */
  note?: string;
}

/** HTML d'une carte. */
export function cardHTML(id: CardId, o: CardOptions = {}): string {
  const c = getCard(id);
  let art = '';
  if (c.kind === 'suspect') art = suspectArt(SUSPECTS.find((s) => s.id === id)!.color);
  else if (c.kind === 'weapon') art = weaponArt(id);
  else art = `<div class="card-art room-icon">${ROOM_ICON[id] ?? '🏠'}</div>`;
  const cls = ['gcard', c.kind, o.size ?? 'md', o.selected ? 'selected' : '', o.dim ? 'dim' : ''].join(' ');
  return `<div class="${cls}" ${o.attrs ?? ''}>
    <div class="gcard-band">${KIND_LABEL[c.kind]}</div>
    ${art}
    <div class="gcard-name">${c.name}</div>
    ${o.note ? `<div class="gcard-note">${o.note}</div>` : ''}
  </div>`;
}

/** Dos de carte. */
export function cardBackHTML(size: 'sm' | 'md' | 'lg' = 'lg'): string {
  return `<div class="gcard back ${size}"><div class="gcard-back-mark">?</div></div>`;
}
