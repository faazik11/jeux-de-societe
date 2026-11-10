// Icônes de l'interface, dessinées au trait (couleur laiton = currentColor).

const svg = (body: string) =>
  `<svg class="hud-ico" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  /** Trois cartes en éventail, la première avec un médaillon. */
  cards: svg(`
    <rect x="4" y="7" width="13" height="19" rx="2" transform="rotate(-16 10 16)" opacity=".55"/>
    <rect x="15" y="7" width="13" height="19" rx="2" transform="rotate(16 22 16)" opacity=".55"/>
    <rect x="9.5" y="5" width="13" height="20" rx="2" fill="#2b1d14"/>
    <ellipse cx="16" cy="13" rx="3.6" ry="4.4"/><path d="M12.5 21.5 h7"/>`),
  /** Carnet relié avec une loupe. */
  notebook: svg(`
    <rect x="6" y="4" width="17" height="24" rx="2"/><path d="M10 4 v24"/>
    <path d="M6 9 h-2 M6 14 h-2 M6 19 h-2 M6 24 h-2"/>
    <path d="M13 10 h6 M13 14 h6"/>
    <circle cx="20" cy="20" r="4.2" fill="#2b1d14"/><path d="M23 23 l5 5" stroke-width="2.6"/>`),
  /** Parchemin déroulé. */
  log: svg(`
    <path d="M8 6 h15 a3 3 0 0 1 3 3 v1 h-4"/>
    <path d="M22 9 v15 a3 3 0 0 1 -3 3 h-12 a3 3 0 0 1 -3 -3 v-1 h12 v1 a3 3 0 0 0 3 3"/>
    <path d="M8 6 a3 3 0 0 0 -3 3 v0 M8 6 a3 3 0 0 1 3 3 v14"/>
    <path d="M14 12 h5 M14 16 h5 M14 20 h3"/>`),
  /** Menu. */
  menu: svg(`<path d="M7 10 h18 M7 16 h18 M7 22 h18"/>`),
  /** Recentrer la caméra : viseur. */
  recenter: svg(`<circle cx="16" cy="16" r="8"/><circle cx="16" cy="16" r="2" fill="currentColor"/>
    <path d="M16 3 v5 M16 24 v5 M3 16 h5 M24 16 h5"/>`),
};
