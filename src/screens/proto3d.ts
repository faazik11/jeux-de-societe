// Page de démonstration du plateau en vraie 3D (prototype).
// Seuls les déplacements sont jouables : le but est de comparer le rendu avec la version isométrique.

import { applyAction, createGame, getDestinations, getCard, SUSPECTS, type GameState } from '../games/cluedo/engine';

export function startProto3D(app: HTMLElement, goHome: () => void): () => void {
  let destroyed = false;
  let board: import('../proto3d/Board3D').Board3D | null = null;

  app.innerHTML = `
    <div class="p3d">
      <div id="p3d-host"></div>
            <div class="p3d-top">
        <button id="p3d-home">← Accueil</button>
        <span class="p3d-title">Prototype 3D</span>
      </div>
      <div class="p3d-bottom">
        <div id="p3d-info">Chargement de la 3D…</div>
        <div class="row" style="justify-content:center">
          <button class="primary" id="p3d-roll" disabled>Lancer les dés</button>
          <button id="p3d-cam">🎥 Caméra auto</button>
          <button id="p3d-over">⤢ Vue d'ensemble</button>
        </div>
      </div>
    </div>`;
  app.querySelector('#p3d-home')!.addEventListener('click', goHome);

  let game: GameState = createGame({
    players: [
      { id: 'a', name: 'Rouge', suspect: 'rouge' },
      { id: 'b', name: 'Jaune', suspect: 'jaune' },
      { id: 'c', name: 'Bleu', suspect: 'bleu' },
    ],
  });
  let busy = false;

  const info = app.querySelector<HTMLElement>('#p3d-info')!;
  const rollBtn = app.querySelector<HTMLButtonElement>('#p3d-roll')!;
  const camBtn = app.querySelector<HTMLButtonElement>('#p3d-cam')!;

  const suspectOf = (id: string) => game.players.find((p) => p.id === id)!.suspect;
  const color = (id: string) => SUSPECTS.find((s) => s.id === suspectOf(id))!.color;
  const name = (id: string) => `<span class="who" style="background:${color(id)}"></span><b>${game.players.find((p) => p.id === id)!.name}</b>`;

  const showTurn = () => {
    const cur = game.currentPlayer;
    board!.setCurrent(suspectOf(cur));
    info.innerHTML = `Au tour de ${name(cur)} : lance les dés.`;
    rollBtn.disabled = false;
    if (board!.mode === 'auto') board!.focusOn(suspectOf(cur));
  };

  rollBtn.addEventListener('click', async () => {
    if (busy || !board) return;
    busy = true;
    rollBtn.disabled = true;
    game = applyAction(game, { type: 'roll', player: game.currentPlayer });
    await board.rollDice(game.dice!);
    const total = game.dice!.reduce((a, b) => a + b, 0);
    const dests = getDestinations(game);
    info.innerHTML = `${name(game.currentPlayer)} a fait <b>${total}</b> : touche une case verte ou une pièce en surbrillance.`;
    board.setReach(dests, async (dest) => {
      board!.setReach([], () => {});
      const cur = game.currentPlayer;
      game = applyAction(game, { type: 'move', player: cur, to: dest.to });
      const last = game.log.at(-1)!;
      info.innerHTML = `${name(cur)} se déplace…`;
      if (last.type === 'moved') await board!.walk(suspectOf(cur), last.path);
      if (dest.to.type === 'room') {
        info.innerHTML = `${name(cur)} entre dans : <b>${getCard(dest.to.room).name}</b>`;
        board!.emote(suspectOf(cur), 'emote-yes');
        if (board!.mode === 'auto') board!.roomShot(dest.to.room);
        await new Promise((r) => setTimeout(r, 2600));
      } else await new Promise((r) => setTimeout(r, 400));
      if (destroyed) return;
      game = applyAction(game, { type: 'endTurn', player: cur });
      busy = false;
      showTurn();
    });
    if (!dests.length) {
      game = applyAction(game, { type: 'endTurn', player: game.currentPlayer });
      busy = false;
      showTurn();
    }
  });

  camBtn.addEventListener('click', () => {
    if (!board) return;
    board.setMode(board.mode === 'auto' ? 'free' : 'auto');
    if (board.mode === 'auto') board.focusOn(suspectOf(game.currentPlayer));
  });
  app.querySelector('#p3d-over')!.addEventListener('click', () => {
    if (!board) return;
    if (board.mode === 'free') board.setMode('auto');
    board.overview();
  });

  (async () => {
    const { Board3D } = await import('../proto3d/Board3D');
    if (destroyed) return;
    const host = app.querySelector<HTMLElement>('#p3d-host')!;
    board = new Board3D(host);
    host.addEventListener('cammode', (e) => {
      camBtn.textContent = (e as CustomEvent).detail === 'auto' ? '🎥 Caméra auto' : '🖐 Caméra libre';
    });
    for (const s of SUSPECTS) board.place(s.id, game.pawns[s.id]);
    info.innerHTML = 'Chargement des personnages…';
    await board.ready;
    info.innerHTML = 'Vraie 3D : fais glisser pour tourner autour du plateau, pince pour zoomer.';
    if (!location.search.includes('nointro')) await board.intro();
    if (!destroyed) showTurn();
  })();

  return () => {
    destroyed = true;
    board?.destroy();
  };
}
