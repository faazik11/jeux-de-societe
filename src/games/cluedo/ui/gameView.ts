// Écran de partie (version simple vue de dessus, en attendant le plateau isométrique).
// Utilisé à la fois par le mode test local et par le jeu en ligne.

import {
  CELLS,
  CENTER_RECT,
  DOORS,
  ROOMS,
  ROOM_RECTS,
  SUSPECTS,
  WEAPONS,
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
} from '../engine';

export interface GameViewOptions {
  state: GameState;
  /** Joueur qui regarde l'écran. */
  me: string;
  /** Envoie une action ; renvoie un message d'erreur éventuel. */
  act: (action: Action) => void;
  error?: string;
  /** Bandeau en haut de l'écran (HTML). */
  banner?: string;
  /** Noms des joueurs déconnectés : la partie est en pause. */
  pausedBy?: string[];
  /** Bouton « nouvelle partie » / « retour » en fin de partie. */
  onExit?: { label: string; run: () => void };
}

const notebooks = new Map<string, Record<string, string>>();
const MARKS = ['', '✗', '?', '✓'];

const suspectColor = (id: SuspectId) => SUSPECTS.find((s) => s.id === id)!.color;
export const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function nameOf(v: { players: { id: string; name: string; suspect: SuspectId }[] }, id: string | null, me?: string) {
  if (!id) return 'personne';
  const p = v.players.find((pl) => pl.id === id)!;
  return `<span class="who" style="background:${suspectColor(p.suspect)}"></span>${esc(p.name)}${id === me ? ' (toi)' : ''}`;
}

function logLine(v: PlayerView, e: LogEntry): string {
  const n = (id: string) => nameOf(v, id, v.me);
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
    const pawns = SUSPECTS.filter((s) => {
      const p = v.pawns[s.id];
      return p.type === 'room' && p.room === r.id;
    });
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
    cards
      .map(
        (c) => `<tr><td>${c.name}${myHand.has(c.id as CardId) ? ' <span class="muted">(ma carte)</span>' : ''}</td>
      <td class="mark" data-mark="${c.id}">${nb[c.id] ?? (myHand.has(c.id as CardId) ? '✗' : '')}</td></tr>`,
      )
      .join('');
  return `<table class="notebook">${section('Suspects', SUSPECTS)}${section('Armes', WEAPONS)}${section('Pièces', ROOMS)}</table>
    <p class="muted">Touche une case pour cocher : ✗ innocent, ? doute, ✓ coupable.</p>`;
}

export function renderGame(el: HTMLElement, o: GameViewOptions) {
  const g = o.state;
  const me = o.me;
  const paused = (o.pausedBy?.length ?? 0) > 0 && g.phase !== 'finished';
  const v = getPlayerView(g, me);
  const a = getAvailableActions(g, me);
  const mePlayer = v.players.find((p) => p.id === me)!;
  const dests = a.move && !paused ? getDestinations(g) : [];
  const reach = new Set(dests.map((d) => posKey(d.to)));
  const myPos = v.pawns[mePlayer.suspect];
  const myRoom = myPos.type === 'room' ? myPos.room : null;
  const opts = (items: readonly { id: string; name: string }[]) =>
    items.map((i) => `<option value="${i.id}">${i.name}</option>`).join('');
  const waitingFor = g.phase === 'refuting' ? g.pending!.refuter : g.currentPlayer;

  let controls = '';
  if (g.phase === 'finished') {
    controls = `<div class="winner">${
      g.endReason === 'abandoned'
        ? 'Partie abandonnée par le maître de jeu.'
        : g.winner
          ? `${nameOf(g, g.winner, me)} a gagné !`
          : 'Personne n’a gagné.'
    }<br>
      Solution : <b>${getCard(g.solution.suspect).name}</b>, avec <b>${getCard(g.solution.weapon).name}</b>, dans <b>${getCard(g.solution.room).name}</b></div>
      ${o.onExit ? `<div class="row"><button class="primary" id="exit">${esc(o.onExit.label)}</button></div>` : ''}`;
  } else if (paused) {
    controls = `<div class="banner">⏸ Partie en pause : ${o.pausedBy!.map(esc).join(', ')} ${o.pausedBy!.length > 1 ? 'sont déconnectés' : 'est déconnecté'}. Elle reprendra à son retour.</div>`;
  } else if (g.phase === 'refuting') {
    const p = g.pending!;
    const head = `<p>${nameOf(g, p.by, me)} suppose : <b>${getCard(p.suspect).name}</b>, <b>${getCard(p.weapon).name}</b>, <b>${getCard(p.room).name}</b>.</p>`;
    controls = a.showCard.length
      ? `${head}<p>Choisis la carte à lui montrer (lui seul la verra) :</p>
        <div class="row">${a.showCard.map((c) => `<button class="primary" data-show="${c}">${getCard(c).name}</button>`).join('')}</div>`
      : `${head}<p class="muted">En attente de ${nameOf(g, p.refuter, me)}, qui doit montrer une carte…</p>`;
  } else if (g.currentPlayer !== me) {
    controls = `<p class="muted">C'est au tour de ${nameOf(g, g.currentPlayer, me)}.</p>
      ${g.dice ? `<p>Dés : <b>${g.dice.join(' + ')} = ${g.dice.reduce((x, y) => x + y, 0)}</b></p>` : ''}
      ${mePlayer.eliminated ? '<p class="muted">Tu es éliminé : tu continues à montrer tes cartes quand on te le demande.</p>' : ''}`;
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

  // On garde l'état du panneau « Accusation » et la position du journal entre deux affichages
  const accuseOpen = (el.querySelector('details.panel') as HTMLDetailsElement | null)?.open ?? false;

  el.innerHTML = `
    ${o.banner ?? ''}
    <div class="layout">
      <div>${renderBoard(v, reach)}</div>
      <div>
        <div class="panel">
          <h2>${g.phase === 'finished' ? 'Fin de partie' : `Tour ${g.turn} : ${nameOf(g, waitingFor, me)}`}</h2>
          ${controls}
          <div class="error">${esc(o.error ?? '')}</div>
          ${a.abandon && g.phase !== 'finished' ? `<div class="row"><button class="danger" id="abandon">Abandonner la partie (maître de jeu)</button></div>` : ''}
        </div>
        <div class="panel"><h2>Mes cartes</h2>
          <div class="cards">${(mePlayer.hand ?? []).map((c) => `<div class="card ${getCard(c).kind}">${getCard(c).name}</div>`).join('')}</div>
        </div>
        <div class="panel"><h2>Joueurs</h2>
          ${v.players.map((p) => `<div class="row" style="margin:2px 0">${nameOf(v, p.id, me)}
            <span class="muted">${p.handSize} cartes${p.id === g.hostId ? ' · maître de jeu' : ''}${p.eliminated ? ' · éliminé' : ''}</span></div>`).join('')}
        </div>
        <div class="panel"><h2>Journal</h2><div class="log">${[...v.log].reverse().map((e) => `<div>${logLine(v, e)}</div>`).join('')}</div></div>
        <div class="panel"><h2>Carnet d'enquête</h2>${renderNotebook(me, v)}</div>
      </div>
    </div>`;

  const details = el.querySelector('details.panel') as HTMLDetailsElement | null;
  if (details && accuseOpen) details.open = true;

  const on = (id: string, fn: () => void) => el.querySelector(`#${id}`)?.addEventListener('click', fn);
  const val = (id: string) => (el.querySelector(`#${id}`) as HTMLSelectElement).value as never;
  on('exit', () => o.onExit?.run());
  on('roll', () => o.act({ type: 'roll', player: me }));
  on('passage', () => o.act({ type: 'secretPassage', player: me }));
  on('end', () => o.act({ type: 'endTurn', player: me }));
  on('suggest', () => o.act({ type: 'suggest', player: me, suspect: val('sSus'), weapon: val('sWea') }));
  on('accuse', () => o.act({ type: 'accuse', player: me, suspect: val('aSus'), weapon: val('aWea'), room: val('aRoo') }));
  on('abandon', () => {
    if (confirmInline(el, 'abandon')) o.act({ type: 'abandon', player: me });
  });
  el.querySelectorAll<HTMLElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => o.act({ type: 'showCard', player: me, card: b.dataset.show as CardId })),
  );
  el.querySelector('#board')!.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-cell],[data-room]');
    if (!target) return;
    const key = target.dataset.cell ?? `room:${target.dataset.room}`;
    const dest = dests.find((d) => posKey(d.to) === key);
    if (dest) o.act({ type: 'move', player: me, to: dest.to });
  });
  el.querySelectorAll<HTMLElement>('[data-mark]').forEach((td) =>
    td.addEventListener('click', () => {
      const nb = notebooks.get(me)!;
      const cur = MARKS.indexOf(td.textContent ?? '');
      nb[td.dataset.mark!] = MARKS[(cur + 1) % MARKS.length];
      td.textContent = nb[td.dataset.mark!];
    }),
  );
}

/** Demande une confirmation sans boîte de dialogue : il faut cliquer deux fois. */
function confirmInline(el: HTMLElement, id: string): boolean {
  const btn = el.querySelector<HTMLButtonElement>(`#${id}`)!;
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  btn.textContent = 'Confirmer l’abandon ?';
  return false;
}
