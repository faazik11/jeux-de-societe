// Mode test : tous les joueurs sur le même écran (on se passe le téléphone).

import { RuleError, SUSPECTS, applyAction, createGame, type GameState, type SuspectId } from '../games/cluedo/engine';
import { esc, renderGame } from '../games/cluedo/ui/gameView';

export function startLocal(app: HTMLElement, goHome: () => void) {
  let game: GameState | null = null;
  let error = '';
  let count = 4;

  const setup = () => {
    app.innerHTML = `
      <div class="row"><button id="home">← Accueil</button></div>
      <h1>Mode test (même écran)</h1>
      <p class="muted">Tous les joueurs jouent sur le même appareil. Pratique pour tester les règles.</p>
      <div class="panel">
        <div class="row"><label>Nombre de joueurs
          <select id="count">${[2, 3, 4, 5, 6].map((n) => `<option ${n === count ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        ${Array.from({ length: count }, (_, i) => `
          <div class="row">
            <input id="name${i}" value="Joueur ${i + 1}" style="flex:1;min-width:120px" />
            <select id="sus${i}">${SUSPECTS.map((s, j) => `<option value="${s.id}" ${j === i ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
          </div>`).join('')}
        <p class="muted">Le premier joueur est le maître de jeu.</p>
        <div class="error">${esc(error)}</div>
        <button class="primary" id="start">Lancer la partie</button>
      </div>`;
    app.querySelector('#home')!.addEventListener('click', goHome);
    app.querySelector('#count')!.addEventListener('change', (e) => {
      count = Number((e.target as HTMLSelectElement).value);
      setup();
    });
    app.querySelector('#start')!.addEventListener('click', () => {
      try {
        const players = Array.from({ length: count }, (_, i) => ({
          id: `p${i + 1}`,
          name: (app.querySelector(`#name${i}`) as HTMLInputElement).value.trim() || `Joueur ${i + 1}`,
          suspect: (app.querySelector(`#sus${i}`) as HTMLSelectElement).value as SuspectId,
        }));
        game = createGame({ players });
        error = '';
        play();
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        setup();
      }
    });
  };

  const play = () => {
    const g = game!;
    // On affiche l'écran du joueur qui doit agir
    const actor = g.phase === 'refuting' ? g.pending!.refuter : g.currentPlayer;
    renderGame(app, {
      state: g,
      me: g.phase === 'finished' ? g.hostId : actor,
      error,
      banner: `<div class="row"><button id="home2">← Accueil</button></div>
        <div class="banner">Mode test : on voit l'écran du joueur qui doit agir.</div>`,
      act: (action) => {
        try {
          game = applyAction(game!, action);
          error = '';
        } catch (e) {
          error = e instanceof RuleError ? e.message : String(e);
        }
        play();
      },
      onExit: { label: 'Nouvelle partie', run: () => { game = null; setup(); } },
    });
    app.querySelector('#home2')?.addEventListener('click', goHome);
  };

  setup();
}
