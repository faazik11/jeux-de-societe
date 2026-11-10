// Cartes illustrées, dans l'esprit des cartes du Cluedo (dessins originaux) :
//  - suspects : portrait dans un médaillon à la couleur du personnage ;
//  - armes : objet en métal gravé sur fond de velours ;
//  - pièces : petite gravure de la pièce ;
//  - en bas, une plaque dorée avec le nom.

import { SUSPECTS, getCard, type CardId } from '../engine';
import { customImages } from './customImages';

const KIND_LABEL = { suspect: 'Suspect', weapon: 'Arme', room: 'Pièce' } as const;

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

const SKIN = '#ecc9a4';
const SKIN_SHADE = '#d4a77f';
const INK = '#2a1d14';

/** Assombrit une couleur #rrggbb. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Portraits des suspects (viewBox 0 0 100 120, visage centré)

function face(extra = '') {
  return `
    <rect x="43" y="66" width="14" height="20" fill="${SKIN_SHADE}"/>
    <ellipse cx="50" cy="54" rx="17" ry="21" fill="${SKIN}"/>
    <ellipse cx="43.5" cy="54" rx="2" ry="2.4" fill="${INK}"/><ellipse cx="56.5" cy="54" rx="2" ry="2.4" fill="${INK}"/>
    <path d="M40 48.5 q3.5 -2 7 0 M53 48.5 q3.5 -2 7 0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M50 56 l-1.5 6 h3" stroke="${SKIN_SHADE}" stroke-width="1.3" fill="none"/>
    ${extra}`;
}

const PORTRAITS: Record<string, (c: string) => string> = {
  // Mademoiselle Rose : longs cheveux, rose dans les cheveux, collier
  rouge: (c) => `
    <path d="M28 66 C22 40 32 24 50 24 C70 24 80 40 72 70 C70 80 64 84 62 86 L38 86 C34 82 30 76 28 66Z" fill="#5a1f1a"/>
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="${c}"/>
    <path d="M36 88 Q50 100 64 88" fill="none" stroke="${SKIN}" stroke-width="7"/>
    ${face(`<path d="M45 64 q5 3 10 0" stroke="#a3202e" stroke-width="2.2" fill="none" stroke-linecap="round"/>`)}
    <path d="M33 46 C36 30 50 26 60 30 C52 34 44 36 40 48 C38 44 35 44 33 46Z" fill="#5a1f1a"/>
    <path d="M66 36 C68 32 72 32 72 36 C76 36 76 41 72 41 C72 45 67 45 67 41 C63 41 63 36 66 36Z" fill="#c8324a"/><circle cx="69.5" cy="38.5" r="2" fill="#7a1022"/>
    <g fill="#fff8e8">${[38, 43, 48, 53, 58, 63].map((x, i) => `<circle cx="${x}" cy="${92 + (i === 0 || i === 5 ? -2 : i === 1 || i === 4 ? 1 : 2)}" r="1.8"/>`).join('')}</g>`,
  // Colonel Moutarde : képi, grosse moustache, épaulettes dorées
  jaune: (c) => `
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="${shade(c, 0.75)}"/>
    <path d="M44 86 L50 100 L56 86Z" fill="#f2e6c8"/>
    <rect x="13" y="92" width="18" height="6" rx="2" fill="#e6c475"/><rect x="69" y="92" width="18" height="6" rx="2" fill="#e6c475"/>
    <g fill="#e6c475"><circle cx="50" cy="106" r="2"/><circle cx="50" cy="114" r="2"/></g>
    ${face(`<path d="M36 61 C40 57 46 58 50 61 C54 58 60 57 64 61 C62 66 56 63 50 63 C44 63 38 66 36 61Z" fill="#7a4a1e"/>`)}
    <path d="M32 40 C32 28 68 28 68 40Z" fill="${shade(c, 0.6)}"/><rect x="31" y="38" width="38" height="5" fill="#3a2a10"/>
    <path d="M30 43 Q50 50 70 43 L72 46 Q50 54 28 46Z" fill="#2a1d0c"/><circle cx="50" cy="34" r="3" fill="#e6c475"/>`,
  // Madame Leblanc : chignon gris, coiffe de domestique, col blanc
  blanc: (c) => `
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="#3a3a44"/>
    <path d="M34 88 Q50 104 66 88 L64 120 L36 120Z" fill="${c}"/>
    <path d="M38 87 Q50 96 62 87" fill="none" stroke="#fff" stroke-width="4"/>
    ${face(`<path d="M44 64 q6 -1 12 0" stroke="#8a4a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M38 60 q2 3 4 3 M62 60 q-2 3 -4 3" stroke="${SKIN_SHADE}" stroke-width="1"/>`)}
    <path d="M32 50 C30 30 70 30 68 50 C64 40 56 36 50 36 C44 36 36 40 32 50Z" fill="#9a9aa4"/>
    <circle cx="50" cy="28" r="9" fill="#9a9aa4"/>
    <path d="M30 38 C36 26 64 26 70 38 C64 34 36 34 30 38Z" fill="#fff"/>
    <path d="M30 38 q3 -4 6 0 q3 -4 6 0 q3 -4 6 0 q3 -4 6 0 q3 -4 6 0 q3 -4 6 0" fill="none" stroke="#ddd" stroke-width="1.5"/>`,
  // Révérend Olive : cheveux plaqués, col romain
  vert: (c) => `
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="#22262a"/>
    <path d="M40 86 L50 96 L60 86 L58 120 L42 120Z" fill="${shade(c, 0.55)}"/>
    <rect x="44" y="84" width="12" height="6" rx="1" fill="#fff"/>
    ${face(`<path d="M44 63 q6 2 12 0" stroke="#8a4a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)}
    <path d="M32 50 C30 28 68 26 68 46 C62 36 54 34 44 36 C38 38 34 42 32 50Z" fill="#2a1d14"/>
    <path d="M44 36 C50 30 58 31 66 40" stroke="#4a3424" stroke-width="2" fill="none"/>
    <circle cx="50" cy="106" r="5" fill="none" stroke="${c}" stroke-width="2"/>`,
  // Madame Pervenche : grand chapeau à plume, perles
  bleu: (c) => `
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="${c}"/>
    <path d="M36 88 Q50 98 64 88" fill="none" stroke="${SKIN}" stroke-width="6"/>
    <g fill="#fff8e8">${[37, 41, 45, 50, 55, 59, 63].map((x, i) => `<circle cx="${x}" cy="${93 + Math.sin((i / 6) * Math.PI) * 4}" r="1.9"/>`).join('')}</g>
    ${face(`<path d="M45 64 q5 2.5 10 0" stroke="#7a2030" stroke-width="2" fill="none" stroke-linecap="round"/>`)}
    <path d="M33 52 C30 40 36 34 42 36 L42 50Z" fill="#3a2418"/><path d="M67 52 C70 40 64 34 58 36 L58 50Z" fill="#3a2418"/>
    <ellipse cx="50" cy="36" rx="34" ry="7" fill="${shade(c, 0.6)}"/>
    <path d="M32 34 C34 18 66 18 68 34Z" fill="${shade(c, 0.75)}"/>
    <path d="M62 24 C70 10 86 8 88 14 C80 14 72 20 66 28Z" fill="#2b9b8a"/><path d="M66 26 C72 16 82 12 86 13" stroke="#14564c" stroke-width="1"/>`,
  // Professeur Violet : lunettes rondes, nœud papillon, cheveux en couronne
  violet: (c) => `
    <path d="M14 120 C16 96 30 86 50 86 C70 86 84 96 86 120Z" fill="#6a5a44"/>
    <path d="M42 86 L50 104 L58 86Z" fill="#f2e6c8"/>
    <path d="M42 92 L50 96 L42 100Z M58 92 L50 96 L58 100Z" fill="${c}"/><circle cx="50" cy="96" r="2.2" fill="${shade(c, 0.6)}"/>
    ${face(`<circle cx="43.5" cy="54" r="5.5" fill="#ffffff33" stroke="#3a2a1a" stroke-width="1.6"/><circle cx="56.5" cy="54" r="5.5" fill="#ffffff33" stroke="#3a2a1a" stroke-width="1.6"/><path d="M49 54 h2" stroke="#3a2a1a" stroke-width="1.4"/><path d="M45 64 q5 1.5 10 0" stroke="#8a4a3a" stroke-width="1.6" fill="none"/>`)}
    <path d="M32 54 C28 40 34 36 38 40 C36 44 35 48 35 54Z" fill="#b8b4ac"/><path d="M68 54 C72 40 66 36 62 40 C64 44 65 48 65 54Z" fill="#b8b4ac"/>
    <path d="M40 36 C44 32 56 32 60 36" stroke="#b8b4ac" stroke-width="2" fill="none"/>`,
};

function suspectArt(id: string, color: string): string {
  const g = nextId('m');
  return `<svg viewBox="0 0 100 120" class="gc-art">
    <defs>
      <radialGradient id="${g}" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="${shade(color, 1.25)}"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, 0.55)}"/></radialGradient>
      <clipPath id="${g}c"><ellipse cx="50" cy="60" rx="44" ry="56"/></clipPath>
    </defs>
    <ellipse cx="50" cy="60" rx="44" ry="56" fill="url(#${g})"/>
    <g clip-path="url(#${g}c)">${(PORTRAITS[id] ?? (() => ''))(color)}</g>
    <ellipse cx="50" cy="60" rx="44" ry="56" fill="none" stroke="#c9a24a" stroke-width="3"/>
    <ellipse cx="50" cy="60" rx="47.5" ry="59" fill="none" stroke="#8a6a2a" stroke-width="1"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Armes : métal gravé sur velours vert

const WEAPON_ART: Record<string, string> = {
  chandelier: `<rect x="22" y="60" width="16" height="4" rx="2"/><path d="M26 60 L28 32 L32 32 L34 60Z"/><circle cx="30" cy="44" r="4"/>
    <rect x="22" y="26" width="16" height="6" rx="3"/><rect x="26" y="10" width="8" height="16" rx="2"/>
    <path d="M30 1 C25 7 35 7 30 1Z" fill="#ffb340" stroke="none"/>`,
  poignard: `<path d="M30 4 L35 40 L25 40Z"/><rect x="17" y="40" width="26" height="5" rx="2.5"/><rect x="26.5" y="45" width="7" height="14" rx="3"/><circle cx="30" cy="62" r="4"/>`,
  tuyau: `<path d="M18 62 L18 30 Q18 14 34 14 L46 14" fill="none" stroke="url(#MTL)" stroke-width="9" stroke-linecap="round"/>
    <rect x="12" y="56" width="12" height="6" rx="2"/><rect x="44" y="9" width="6" height="10" rx="2"/>`,
  revolver: `<rect x="8" y="20" width="34" height="8" rx="3"/><rect x="30" y="18" width="14" height="16" rx="4"/><circle cx="37" cy="26" r="6"/>
    <path d="M38 32 L50 58 L40 60 L32 36Z"/><path d="M30 34 Q28 42 34 42" fill="none" stroke="url(#MTL)" stroke-width="2.5"/>`,
  corde: `<circle cx="30" cy="40" r="17" fill="none" stroke="url(#MTL)" stroke-width="5"/><circle cx="30" cy="40" r="10" fill="none" stroke="url(#MTL)" stroke-width="5"/>
    <path d="M44 28 Q50 14 40 8 Q32 4 34 14" fill="none" stroke="url(#MTL)" stroke-width="5" stroke-linecap="round"/>`,
  cle: `<rect x="26" y="20" width="8" height="42" rx="4"/><path d="M18 6 L42 6 L42 22 L36 22 L36 13 L24 13 L24 22 L18 22Z"/>`,
};

function weaponArt(id: string): string {
  const g = nextId('w');
  const art = (WEAPON_ART[id] ?? '').replaceAll('url(#MTL)', `url(#${g})`);
  return `<svg viewBox="0 0 100 120" class="gc-art">
    <defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f7f9"/><stop offset=".45" stop-color="#9aa1ab"/><stop offset="1" stop-color="#535962"/></linearGradient>
      <radialGradient id="${g}v" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2f5a43"/><stop offset="1" stop-color="#132a1e"/></radialGradient>
    </defs>
    <ellipse cx="50" cy="60" rx="44" ry="56" fill="url(#${g}v)"/>
    <ellipse cx="50" cy="60" rx="36" ry="48" fill="none" stroke="#ffffff14" stroke-width="1" stroke-dasharray="2 3"/>
    <g transform="translate(11 16) scale(1.3)" fill="url(#${g})" stroke="#2a2e33" stroke-width="1">${art}</g>
    <ellipse cx="50" cy="60" rx="44" ry="56" fill="none" stroke="#c9a24a" stroke-width="3"/>
    <ellipse cx="50" cy="60" rx="47.5" ry="59" fill="none" stroke="#8a6a2a" stroke-width="1"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Pièces : petites gravures à l'encre sépia

const L = `stroke="#5a3d22" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
const F = (c: string) => `fill="${c}" stroke="#5a3d22" stroke-width="2" stroke-linejoin="round"`;

const ROOM_ART: Record<string, string> = {
  cuisine: `<rect x="22" y="60" width="56" height="36" ${F('#d9c9a3')}/><rect x="28" y="70" width="44" height="20" ${F('#bfa77a')}/>
    <path d="M22 60 h56" ${L}/><ellipse cx="38" cy="54" rx="9" ry="4" ${F('#9a9aa4')}/><path d="M30 54 v-8 h16 v8" ${F('#9a9aa4')}/>
    <path d="M60 56 h14 M67 56 v-12 M62 44 h10" ${L}/><path d="M36 40 q2 -6 0 -10 M41 40 q2 -6 0 -10" ${L} opacity=".5"/>`,
  bal: `<path d="M50 22 v10" ${L}/><path d="M34 40 q16 10 32 0" ${L}/><path d="M38 36 h24" ${L}/>
    <g fill="#e6c475" stroke="#5a3d22" stroke-width="1.2">${[34, 42, 50, 58, 66].map((x) => `<path d="M${x} 40 l-2 6 h4z"/>`).join('')}</g>
    <path d="M18 98 L36 70 h28 L82 98Z" ${F('#c9a46a')}/><path d="M30 98 L42 70 M50 98 V70 M70 98 L58 70 M24 89 h52 M28 80 h44" ${L} opacity=".6"/>`,
  veranda: `<path d="M20 98 V48 Q50 18 80 48 V98" ${F('#e8f0e6')}/><path d="M50 30 V98 M20 66 H80 M35 38 V98 M65 38 V98" ${L}/>
    <rect x="58" y="80" width="14" height="14" ${F('#a0522d')}/><path d="M65 80 q-12 -16 -4 -26 M65 80 q10 -18 2 -28 M65 80 q0 -14 8 -20" stroke="#2f6b3f" stroke-width="3" fill="none"/>`,
  salleAManger: `<ellipse cx="50" cy="78" rx="34" ry="10" ${F('#8a5a33')}/><path d="M22 80 v14 M78 80 v14 M40 86 v10 M60 86 v10" ${L}/>
    <path d="M44 74 v-18 M56 74 v-18" ${L}/><rect x="42" y="50" width="4" height="8" ${F('#fff8e8')}/><rect x="54" y="50" width="4" height="8" ${F('#fff8e8')}/>
    <path d="M44 46 q-2 -4 0 -6 q2 2 0 6 M56 46 q-2 -4 0 -6 q2 2 0 6" fill="#ffb340"/><ellipse cx="33" cy="76" rx="5" ry="2" ${F('#fff')}/><ellipse cx="67" cy="76" rx="5" ry="2" ${F('#fff')}/>`,
  billard: `<path d="M16 74 L30 54 H70 L84 74Z" ${F('#2f6b3f')}/><path d="M16 74 v6 h68 v-6" ${F('#5a3520')}/><path d="M22 80 v12 M78 80 v12" ${L}/>
    <circle cx="44" cy="64" r="3" fill="#fff" stroke="#5a3d22"/><circle cx="56" cy="62" r="3" fill="#c8324a" stroke="#5a3d22"/><circle cx="52" cy="68" r="3" fill="#d9a21b" stroke="#5a3d22"/>
    <path d="M20 40 L62 62" stroke="#8a5a33" stroke-width="3" stroke-linecap="round"/>`,
  bibliotheque: `<rect x="18" y="26" width="64" height="72" ${F('#5a3520')}/><path d="M18 50 h64 M18 74 h64" ${L}/>
    ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${22 + i * 7.3}" y="${30 + r * 24 + (i % 3)}" width="5.5" height="${17 - (i % 3)}" fill="${['#7a1f2b', '#2f5a43', '#c9a24a', '#4b5560', '#6b3a1e'][(i + r) % 5]}" stroke="#2a1d14" stroke-width=".8"/>`).join('')).join('')}`,
  salon: `<rect x="56" y="34" width="28" height="44" ${F('#9a8f80')}/><rect x="62" y="54" width="16" height="24" ${F('#2a1d14')}/>
    <path d="M66 74 q4 -10 4 -14 q4 6 4 14Z" fill="#ff8a2a"/><path d="M54 34 h32" ${L}/>
    <path d="M16 96 V62 Q16 50 30 50 Q44 50 44 62 V96" ${F('#7a1f2b')}/><path d="M12 72 h8 v24 M48 72 h-8 v24" ${F('#6b1e2a')}/><path d="M20 80 h20" ${L}/>`,
  hall: `<path d="M14 98 h22 v-10 h10 v-10 h10 v-10 h10 v-10 h10 v-10 h10" ${L}/><path d="M14 98 L76 38" ${L} opacity=".4"/>
    <path d="M16 98 V58 q0 -10 10 -10 q10 0 10 10 V98" ${F('#5a3520')}/><circle cx="32" cy="76" r="1.8" fill="#c9a24a"/>
    <path d="M10 98 h80" ${L}/><path d="M56 98 L60 92 h20 L84 98" ${F('#7d1f2a')}/>`,
  bureau: `<rect x="18" y="66" width="64" height="8" ${F('#5a3520')}/><path d="M22 74 v22 M78 74 v22 M50 74 v14 h28" ${L}/>
    <path d="M66 66 v-18 l8 -10" ${L}/><path d="M68 38 l12 -4 l2 8 l-12 4z" ${F('#2f5a43')}/>
    <rect x="28" y="56" width="10" height="10" ${F('#2a1d14')}/><path d="M33 56 L44 36" stroke="#e6e0d0" stroke-width="2"/>
    <rect x="42" y="60" width="16" height="6" ${F('#fff8e8')}/>`,
};

function roomArt(id: string): string {
  const g = nextId('r');
  return `<svg viewBox="0 0 100 120" class="gc-art">
    <defs><radialGradient id="${g}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fbf4e2"/><stop offset="1" stop-color="#dccaa0"/></radialGradient>
    <clipPath id="${g}c"><rect x="8" y="8" width="84" height="104" rx="6"/></clipPath></defs>
    <rect x="8" y="8" width="84" height="104" rx="6" fill="url(#${g})"/>
    <g clip-path="url(#${g}c)">${ROOM_ART[id] ?? ''}</g>
    <rect x="8" y="8" width="84" height="104" rx="6" fill="none" stroke="#c9a24a" stroke-width="3"/>
    <rect x="4.5" y="4.5" width="91" height="111" rx="8" fill="none" stroke="#8a6a2a" stroke-width="1"/>
  </svg>`;
}

// ---------------------------------------------------------------------------

export interface CardOptions {
  size?: 'sm' | 'md' | 'lg';
  /** Attributs HTML en plus (ex. data-pick="..."). */
  attrs?: string;
  selected?: boolean;
  dim?: boolean;
  /** Petit ruban (ex. « ta carte »). */
  note?: string;
}

/** HTML d'une carte. */
export function cardHTML(id: CardId, o: CardOptions = {}): string {
  const c = getCard(id);
  let art = '';
  let plate = `<span class="gc-surname">${c.name}</span>`;
  if (c.kind === 'suspect') {
    const s = SUSPECTS.find((x) => x.id === id)!;
    art = suspectArt(id, s.color);
    plate = `<span class="gc-title">${s.title}</span><span class="gc-surname">${s.surname}</span>`;
  } else if (c.kind === 'weapon') art = weaponArt(id);
  else art = roomArt(id);
  const photo = customImages.get(id);
  if (photo) art = `<img class="gc-photo" src="${photo}" alt="">`;
  const cls = ['gcard', c.kind, o.size ?? 'md', o.selected ? 'selected' : '', o.dim ? 'dim' : ''].join(' ');
  return `<div class="${cls}" ${o.attrs ?? ''}>
    <div class="gc-type">❦ ${KIND_LABEL[c.kind]} ❦</div>
    <div class="gc-pic">${art}</div>
    <div class="gc-plate">${plate}</div>
    ${o.note ? `<div class="gcard-note">${o.note}</div>` : ''}
  </div>`;
}

/** Dos de carte. */
export function cardBackHTML(size: 'sm' | 'md' | 'lg' = 'lg'): string {
  return `<div class="gcard back ${size}"><div class="gcard-back-mark">?</div></div>`;
}

const BAND = { suspect: '#7a1f2b', weapon: '#4b5560', room: '#2f5a43' } as const;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** La même carte en SVG autonome (256×360), pour la texture des cartes 3D. */
export function cardSVG(id: CardId): string {
  const c = getCard(id);
  const s = c.kind === 'suspect' ? SUSPECTS.find((x) => x.id === id)! : null;
  const art = s ? suspectArt(id, s.color) : c.kind === 'weapon' ? weaponArt(id) : roomArt(id);
  const photo = customImages.get(id);
  const inner = photo
    ? `<clipPath id="ph"><rect x="26" y="54" width="204" height="222" rx="8"/></clipPath><image href="${photo}" x="26" y="54" width="204" height="222" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/><rect x="26" y="54" width="204" height="222" rx="8" fill="none" stroke="#c9a24a" stroke-width="4"/>`
    : art.replace('<svg viewBox="0 0 100 120" class="gc-art">', '<svg x="38" y="62" width="180" height="216" viewBox="0 0 100 120">');
  const serif = `font-family="'Playfair Display', Georgia, serif"`;
  const surname = s ? s.surname : c.name;
  const fs = surname.length > 12 ? 24 : 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="360" viewBox="0 0 256 360">
    <defs><radialGradient id="pp" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#f1e4c4"/><stop offset="1" stop-color="#d9c49a"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d98c"/><stop offset=".55" stop-color="#c9a24a"/><stop offset="1" stop-color="#a07a2a"/></linearGradient></defs>
    <rect width="256" height="360" rx="14" fill="url(#pp)"/>
    <rect width="256" height="44" fill="${BAND[c.kind]}"/>
    <text x="128" y="30" text-anchor="middle" fill="#f6e7c1" font-size="22" font-weight="700" letter-spacing="2" ${serif}>❦ ${KIND_LABEL[c.kind].toUpperCase()} ❦</text>
    ${inner}
    <rect x="22" y="284" width="212" height="58" rx="5" fill="url(#gold)"/>
    ${s ? `<text x="128" y="305" text-anchor="middle" fill="#2a1a08" font-size="17" font-style="italic" ${serif}>${esc(s.title)}</text>` : ''}
    <text x="128" y="${s ? 332 : 322}" text-anchor="middle" fill="#2a1a08" font-size="${fs}" font-weight="700" ${serif}>${esc(surname)}</text>
    <rect x="3" y="3" width="250" height="354" rx="12" fill="none" stroke="#c9a24a" stroke-width="6"/>
    <rect x="10" y="10" width="236" height="340" rx="8" fill="none" stroke="${BAND[c.kind]}" stroke-width="2"/>
  </svg>`;
}

/** Portrait seul (médaillon), pour la barre des joueurs et les annonces. */
export function portraitHTML(id: CardId): string {
  const s = SUSPECTS.find((x) => x.id === id);
  const photo = customImages.get(id);
  if (s && photo) return `<img class="portrait photo" src="${photo}" alt="" style="border-color:${s.color}">`;
  return s ? suspectArt(id, s.color).replace('class="gc-art"', 'class="portrait"') : '';
}
