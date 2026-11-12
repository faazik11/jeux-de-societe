// Ludothèque : l'accueil principal. Chaque jeu est une boîte posée sur la table.
// Pour ajouter un jeu : une entrée de plus dans GAMES (les cases libres se réduisent toutes seules).

import { cardImage } from '../games/cluedo/ui/cards';
import { play } from '../games/cluedo/ui/sound';
import { renderInstall } from '../pwa';

interface GameEntry {
  id: string;
  title: string;
  tagline: string;
  players: string;
  duration: string;
  route: string;
  /** Couvercle de la boîte (HTML). */
  lid: () => string;
}

const GAMES: GameEntry[] = [
  {
    id: 'cluedo',
    title: 'Cluedo',
    tagline: 'Qui ? Avec quoi ? Où ?',
    players: '2 à 6',
    duration: '45 min',
    route: '#/cluedo',
    lid: () => `
      <div class="lid-cluedo">
        <div class="lid-portraits">${['rouge', 'jaune', 'violet'].map((id) => `<img src="${cardImage(id) ?? ''}" alt="">`).join('')}</div>
        <svg class="lid-env" viewBox="0 0 60 40"><rect x="1" y="1" width="58" height="38" rx="2" fill="#efe3c6" stroke="#b89b62"/><path d="M1 1 L30 22 L59 1" fill="none" stroke="#b89b62"/><circle cx="30" cy="22" r="6" fill="#a3202e"/></svg>
        <svg class="lid-lens" viewBox="0 0 60 60"><circle cx="24" cy="24" r="17" fill="#ffffff22" stroke="#e2c068" stroke-width="5"/><path d="M37 37 L55 55" stroke="#5a3418" stroke-width="7" stroke-linecap="round"/></svg>
        <div class="lid-name">Cluedo</div>
      </div>`,
  },
];

/** Nombre total d'emplacements affichés (les autres sont des cases libres). */
const SLOTS = 6;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function savedName(): string {
  try {
    return (sessionStorage.getItem('jds:name') ?? localStorage.getItem('jds:name')) || '';
  } catch {
    return '';
  }
}

export function renderLibrary(app: HTMLElement, go: (hash: string) => void) {
  const name = savedName();
  const free = Math.max(1, SLOTS - GAMES.length);
  const hour = new Date().getHours();
  const hello = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';

  app.innerHTML = `
  <div class="lib">
    <div class="lib-deco" aria-hidden="true">
      <svg class="deco die d1" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="8" fill="#f6f1e4" stroke="#00000033"/><g fill="#7a1f2b"><circle cx="12" cy="12" r="3.5"/><circle cx="28" cy="28" r="3.5"/><circle cx="20" cy="20" r="3.5"/></g></svg>
      <svg class="deco die d2" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="8" fill="#f6f1e4" stroke="#00000033"/><g fill="#2a1a10"><circle cx="12" cy="12" r="3.5"/><circle cx="28" cy="12" r="3.5"/><circle cx="12" cy="28" r="3.5"/><circle cx="28" cy="28" r="3.5"/></g></svg>
      <svg class="deco pawn p1" viewBox="0 0 30 44"><circle cx="15" cy="9" r="7" fill="#c8324a"/><path d="M15 15 C7 22 6 34 3 40 H27 C24 34 23 22 15 15Z" fill="#c8324a"/><ellipse cx="15" cy="40" rx="13" ry="3.5" fill="#9e1f33"/></svg>
      <svg class="deco pawn p2" viewBox="0 0 30 44"><circle cx="15" cy="9" r="7" fill="#3f8a4a"/><path d="M15 15 C7 22 6 34 3 40 H27 C24 34 23 22 15 15Z" fill="#3f8a4a"/><ellipse cx="15" cy="40" rx="13" ry="3.5" fill="#2c6a35"/></svg>
      <svg class="deco token t1" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#d9a21b" stroke="#8a6420" stroke-width="3"/><circle cx="20" cy="20" r="10" fill="none" stroke="#8a6420" stroke-width="2" stroke-dasharray="3 3"/></svg>
      <svg class="deco card c1" viewBox="0 0 40 56"><rect x="1" y="1" width="38" height="54" rx="5" fill="#6b1e2a" stroke="#d8b25a" stroke-width="2"/><text x="20" y="35" text-anchor="middle" font-size="22" fill="#d8b25a" font-family="Georgia">?</text></svg>
    </div>

    <header class="lib-head">
      <div class="lib-title">Ludothèque</div>
      <div class="lib-sub">${hello}${name ? `, ${esc(name)}` : ''}. À quoi on joue ce soir ?</div>
    </header>

    <section class="lib-shelf">
      ${GAMES.map(
        (g) => `
        <button class="box" data-route="${g.route}" aria-label="${esc(g.title)}">
          <div class="box-lid">${g.lid()}</div>
          <div class="box-side"></div>
          <div class="box-info">
            <div class="box-title">${esc(g.title)}</div>
            <div class="box-tag">${esc(g.tagline)}</div>
            <div class="box-meta"><span>👥 ${g.players}</span><span>⏱ ${g.duration}</span></div>
          </div>
        </button>`,
      ).join('')}
      ${Array.from(
        { length: free },
        (_, i) => `
        <div class="box empty" aria-label="Emplacement libre">
          <div class="box-lid"><div class="empty-mark">+</div></div>
          <div class="box-info"><div class="box-title">Bientôt</div><div class="box-tag">${['Un nouveau jeu arrive…', 'Place libre sur l’étagère', 'Idée de jeu ?', 'Prochaine soirée…', 'À découvrir'][i % 5]}</div></div>
        </div>`,
      ).join('')}
    </section>

    <div class="lib-foot"><div id="install"></div></div>
  </div>`;

  renderInstall(app.querySelector<HTMLElement>('#install')!);
  app.querySelectorAll<HTMLElement>('.box[data-route]').forEach((b) =>
    b.addEventListener('click', () => {
      play('click');
      b.classList.add('opening');
      setTimeout(() => go(b.dataset.route!), 380);
    }),
  );
}
