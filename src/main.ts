// Banc d'essai du moteur de règles : partie locale, tous les joueurs sur le même écran.
// Ce n'est pas l'interface finale (le plateau isométrique et le jeu en ligne arrivent ensuite) :
// cette page sert à vérifier que les règles fonctionnent.

import './style.css';
import {
  CELLS,
  CENTER_RECT,
  DOORS,
  ROOMS,
  ROOM_RECTS,
  RuleError,
  SUSPECTS,
  WEAPONS,
  applyAction,
  createGame,
  getAvailableActions,
  getCard,
  getDestinations,
  getPlayerView,
  posKey,
  type Action,
  type CardId,
  type GameState,
  type LogEntry,
  type PlayerView,
  type RoomId,
  type SuspectId,
} from './games/cluedo/engine';

const app = document.getElementById('app')!;
let game: GameState | null = null;
let error = '';
const notebooks = new Map<string, Record<string, string>>();
const MARKS = ['', '✗', '?', '✓'];

const suspectColor = (id: SuspectId) => SUSPECTS.find((s) => s.id === id)!.color;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------------------------------------------------------------------------
// Écran de création

function renderSetup() {
  const count = Number((document.getElementById('count') as HTMLSelectElement | null)?.value ?? 4);
  app.innerHTML = `
    <h1>Enquête : banc d'essai des règles</h1>
    <p class="muted">Version de test du moteur de règles. Tous les joueurs jouent sur le même écran (on se passe le téléphone).</p>
    <div class="panel">
      <h2>Nouvelle partie</h2>
      <div class="row">
        <label>Nombre de joueurs
          <select id="count">${[2, 3, 4, 5, 6].map((n) => `<option ${n === count ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
      </div>
      ${Array.from({ length: count }, (_, i) => `
        <div class="row">
          <input id="name${i}" value="Joueur ${i + 1}" style="flex:1;min-width:120px" />
          <select id="sus${i}">${SUSPECTS.map((s, j) => `<option value="${s.id}" ${j === i ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        </div>`).join('')}
      <p class="muted">Le premier joueur est le maître de jeu.</p>
      <div class="error">${esc(error)}</div>
      <button class="primary" id="start">Lancer la partie</button>
    </div>`;
  document.getElementById('count')!.addEventListener('change', () => renderSetup());
  document.getElementById('start')!.addEventListener('click', () => {
    try {
      const players = Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: (document.getElementById(`name${i}`) as HTMLInputElement).value.trim() || `Joueur ${i + 1}`,
        suspect: (document.getElementById(`sus${i}`) as HTMLSelectElement).value as SuspectId,
      }));
      game = createGame({ players });
      notebooks.clear();
      error = '';
      render();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      renderSetup();
    }
  });
}

// ---------------------------------------------------------------------------
// Partie

function act(action: Action) {
  try {
    game = applyAction(game!, action);
    error = '';
  } catch (e) {
    error = e instanceof RuleError ? e.message : String(e);
  }
  render();
}

function nameOf(v: PlayerView | GameState, id: string | null) {
  if (!id) return 'personne';
  const p = v.players.find((pl) => pl.id === id)!;
  return `<span class="who" style="background:${suspectColor(p.suspect)}"></span>${esc(p.name)}`;
}

function logLine(v: PlayerView, e: LogEntry): string {
  const n = (id: string) => nameOf(v, id);
  const c = (id: CardId) => getCard(id).name;
  switch (e.type) {
    case 'gameStarted': return 'La partie commence.';
    case 'rolled': return `${n(e.player)} lance les dés : ${e.dice.join(' + ')} = ${e.dice.reduce((a, b) => a + b, 0)}`;
    case 'moved': {
      const to = e.path.at(-1)!;
      return `${n(e.player)} ${to.type === 'room' ? `entre dans : ${c(to.room)}` : 'se déplace'}`;
    }
    case 'secretPassage': return `${n(e.player)} prend le passage secret : ${c(e.from)} → ${c(e.to)}`;
    case 'suggested': return `${n(e.player)} suppose : <b>${c(e.suspect)}</b>, avec <b>${c(e.weapon)}</b>, dans <b>${c(e.room)}</b>`;
    case 'couldNotRefute': return `${n(e.player)} ne peut pas répondre`;
    case 'noOneRefuted': return 'Personne ne peut répondre !';
    case 'cardShown': return `${n(e.player)} montre une carte à ${n(e.to)}${e.card ? ` : <b>${c(e.card)}</b>` : ''}`;
    case 'accused': return `${n(e.player)} accuse : ${c(e.suspect)}, ${c(e.weapon)}, ${c(e.room)} → ${e.correct ? '<b>JUSTE</b>' : 'faux'}`;
    case 'eliminated': return `${n(e.player)} est éliminé (mais continue à montrer ses cartes)`;
    case 'turnEnded': return `${n(e.player)} finit son tour`;
    case 'gameOver': return 'Partie terminée.';
  }
}

function renderBoard(v: PlayerView, reach: Set<string>): string {
  const doorKeys = new Set(DOORS.map((d) => `${d.x},${d.y}`));
  const pawnAt = new Map<string, SuspectId>();
  for (const s of SUSPECTS) {
    const p = v.pawns[s.id];
    if (p.type === 'cell') pawnAt.set(posKey(p), s.id);
  }
  let html = '';
  CELLS.forEach((row, y) =>
    row.forEach((type, x) => {
      const key = `${x},${y}`;
      const cls = ['cell', type];
      if (doorKeys.has(key)) cls.push('door');
      if (reach.has(key)) cls.push('reach');
      const pawn = pawnAt.get(key);
      html += `<div class="${cls.join(' ')}" data-cell="${key}">${pawn ? `<div class="pawn" style="background:${suspectColor(pawn)}"></div>` : ''}</div>`;
    }),
  );
  const pct = (n: number, total: number) => `${(n / total) * 100}%`;
  for (const r of ROOMS) {
    const rect = ROOM_RECTS[r.id as RoomId];
    const pawns = SUSPECTS.filter((s) => v.pawns[s.id].type === 'room' && (v.pawns[s.id] as any).room === r.id);
    const weapons = WEAPONS.filter((w) => v.weapons[w.id as keyof typeof v.weapons] === r.id);
    const isReach = reach.has(`room:${r.id}`);
    html += `<div class="room-label ${isReach ? 'reach' : ''}" data-room="${r.id}"
      style="left:${pct(rect.x, 24)};top:${pct(rect.y, 25)};width:${pct(rect.w, 24)};height:${pct(rect.h, 25)}">
      <b>${r.name}</b>
      <div class="pawns-in-room">${pawns.map((s) => `<div class="pawn" style="background:${s.color}"></div>`).join('')}</div>
      <div class="weapons-in-room">${weapons.map((w) => w.name).join(', ')}</div>
    </div>`;
  }
  html += `<div class="room-label" style="left:${pct(CENTER_RECT.x, 24)};top:${pct(CENTER_RECT.y, 25)};width:${pct(CENTER_RECT.w, 24)};height:${pct(CENTER_RECT.h, 25)}">?</div>`;
  return `<div class="board" id="board">${html}</div>`;
}

function renderNotebook(me: string, v: PlayerView): string {
  const nb = notebooks.get(me) ?? {};
  notebooks.set(me, nb);
  const myHand = new Set(v.players.find((p) => p.id === me)!.hand ?? []);
  const section = (title: string, cards: readonly { id: string; name: string }[]) =>
    `<tr class="section"><td colspan="2">${title}</td></tr>` +
    cards.map((c) => `<tr><td>${c.name}${myHand.has(c.id as CardId) ? ' <span class="muted">(ma carte)</span>' : ''}</td>
      <td class="mark" data-mark="${c.id}">${nb[c.id] ?? (myHand.has(c.id as CardId) ? '✗' : '')}</td></tr>`).join('');
  return `<table class="notebook">${section('Suspects', SUSPECTS)}${section('Armes', WEAPONS)}${section('Pièces', ROOMS)}</table>
    <p class="muted">Touche une case pour cocher : ✗ innocent, ? doute, ✓ coupable.</p>`;
}

function render() {
  if (!game) return renderSetup();
  const g = game;
  const actor = g.phase === 'refuting' ? g.pending!.refuter : g.currentPlayer;
  const v = getPlayerView(g, actor);
  const a = getAvailableActions(g, actor);
  const me = v.players.find((p) => p.id === actor)!;
  const dests = getDestinations(g);
  const reach = new Set(a.move ? dests.map((d) => posKey(d.to)) : []);
  const myRoom = v.pawns[me.suspect].type === 'room' ? (v.pawns[me.suspect] as any).room as RoomId : null;
  const opts = (items: readonly { id: string; name: string }[]) => items.map((i) => `<option value="${i.id}">${i.name}</option>`).join('');

  let controls = '';
  if (g.phase === 'finished') {
    controls = `<div class="winner">${g.endReason === 'abandoned' ? 'Partie abandonnée par le maître de jeu.' : g.winner ? `${nameOf(g, g.winner)} a gagné !` : 'Personne n’a gagné.'}<br>
      Solution : <b>${getCard(g.solution.suspect).name}</b>, avec <b>${getCard(g.solution.weapon).name}</b>, dans <b>${getCard(g.solution.room).name}</b></div>
      <div class="row"><button class="primary" id="new">Nouvelle partie</button></div>`;
  } else if (g.phase === 'refuting') {
    const p = g.pending!;
    controls = `<p>${nameOf(g, p.by)} suppose : <b>${getCard(p.suspect).name}</b>, <b>${getCard(p.weapon).name}</b>, <b>${getCard(p.room).name}</b>.</p>
      <p>${nameOf(g, actor)}, choisis la carte à lui montrer (en secret) :</p>
      <div class="row">${a.showCard.map((c) => `<button class="primary" data-show="${c}">${getCard(c).name}</button>`).join('')}</div>`;
  } else {
    controls = `
      <div class="row">
        <button class="primary" id="roll" ${a.roll ? '' : 'disabled'}>Lancer les dés</button>
        ${a.secretPassage ? `<button id="passage">Passage secret → ${getCard(a.secretPassage).name}</button>` : ''}
        <button id="end" ${a.endTurn ? '' : 'disabled'}>Finir mon tour</button>
      </div>
      ${g.dice ? `<p>Dés : <b>${g.dice.join(' + ')} = ${g.dice.reduce((x, y) => x + y, 0)}</b>${a.move ? ' : touche une case verte ou une pièce encadrée.' : ''}</p>` : ''}
      ${a.suggest ? `
        <div class="panel"><h2>Hypothèse dans : ${getCard(myRoom!).name}</h2>
          <div class="row"><select id="sSus">${opts(SUSPECTS)}</select><select id="sWea">${opts(WEAPONS)}</select>
          <button class="primary" id="suggest">Proposer</button></div></div>` : ''}
      ${a.accuse ? `
        <details class="panel"><summary>Accusation finale</summary>
          <p class="muted">Si tu te trompes, tu es éliminé.</p>
          <div class="row"><select id="aSus">${opts(SUSPECTS)}</select><select id="aWea">${opts(WEAPONS)}</select><select id="aRoo">${opts(ROOMS)}</select>
          <button class="danger" id="accuse">Accuser</button></div></details>` : ''}`;
  }

  app.innerHTML = `
    <h1>Enquête : banc d'essai des règles</h1>
    <div class="banner">Version de test : tous les joueurs sur le même écran. On voit les cartes du joueur qui doit agir.</div>
    <div class="layout">
      <div>
        ${renderBoard(v, reach)}
      </div>
      <div>
        <div class="panel">
          <h2>${g.phase === 'finished' ? 'Fin de partie' : `Tour ${g.turn} : ${nameOf(g, actor)}`}</h2>
          ${controls}
          <div class="error">${esc(error)}</div>
          ${a.abandon && g.phase !== 'finished' ? `<div class="row"><button class="danger" id="abandon">Abandonner la partie (maître de jeu)</button></div>` : ''}
        </div>
        <div class="panel"><h2>Mes cartes (${esc(me.name)})</h2>
          <div class="cards">${(me.hand ?? []).map((c) => `<div class="card ${getCard(c).kind}">${getCard(c).name}</div>`).join('')}</div>
        </div>
        <div class="panel"><h2>Journal</h2><div class="log">${[...v.log].reverse().map((e) => `<div>${logLine(v, e)}</div>`).join('')}</div></div>
        <div class="panel"><h2>Carnet d'enquête</h2>${renderNotebook(actor, v)}</div>
      </div>
    </div>`;

  // Événements
  const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', fn);
  const val = (id: string) => (document.getElementById(id) as HTMLSelectElement).value as any;
  on('new', () => { game = null; render(); });
  on('roll', () => act({ type: 'roll', player: actor }));
  on('passage', () => act({ type: 'secretPassage', player: actor }));
  on('end', () => act({ type: 'endTurn', player: actor }));
  on('suggest', () => act({ type: 'suggest', player: actor, suspect: val('sSus'), weapon: val('sWea') }));
  on('accuse', () => act({ type: 'accuse', player: actor, suspect: val('aSus'), weapon: val('aWea'), room: val('aRoo') }));
  on('abandon', () => act({ type: 'abandon', player: g.hostId }));
  app.querySelectorAll<HTMLElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => act({ type: 'showCard', player: actor, card: b.dataset.show as CardId })),
  );
  document.getElementById('board')!.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-cell],[data-room]');
    if (!el) return;
    const key = el.dataset.cell ?? `room:${el.dataset.room}`;
    const dest = dests.find((d) => posKey(d.to) === key);
    if (dest && a.move) act({ type: 'move', player: actor, to: dest.to });
  });
  app.querySelectorAll<HTMLElement>('[data-mark]').forEach((td) =>
    td.addEventListener('click', () => {
      const nb = notebooks.get(actor)!;
      const cur = MARKS.indexOf(td.textContent ?? '');
      nb[td.dataset.mark!] = MARKS[(cur + 1) % MARKS.length];
      td.textContent = nb[td.dataset.mark!];
    }),
  );
}

render();
