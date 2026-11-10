// Écran de partie (version simple vue de dessus, en attendant le plateau isométrique).
// Utilisé à la fois par le mode test local et par le jeu en ligne.

import { IsoBoard, type BoardUpdate } from '../board3d/IsoBoard';
import { Board3DView } from '../board3d/Board3DView';
import { loadSettings, saveSettings, webglAvailable, type DisplaySettings } from './settings';
import {
  ROOMS,
  SUSPECTS,
  WEAPONS,
  getAvailableActions,
  getCard,
  getDestinations,
  getPlayerView,
  type Action,
  type CardId,
  type GameState,
  type LogEntry,
  type PlayerView,
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

interface BoardLike {
  update(u: BoardUpdate): void;
  recenter(): void;
  destroy(): void;
}

const boards = new WeakMap<HTMLElement, BoardLike>();
const lastOptions = new WeakMap<HTMLElement, GameViewOptions>();

/** Crée la structure de l'écran (une seule fois) et le plateau (3D ou 2.5D selon les réglages). */
function ensureLayout(el: HTMLElement): BoardLike {
  const existing = boards.get(el);
  if (existing && el.querySelector('#board-host')) return existing;
  existing?.destroy();
  const settings = loadSettings();
  const use3d = settings.board === '3d' && webglAvailable();
  el.innerHTML = `
    <div id="gv-top"></div>
    <div class="layout">
      <div class="board-wrap">
        <div id="board-host"></div>
        <button class="board-btn" id="recenter" title="Recentrer la caméra">⤢</button>
        <button class="board-btn" id="settings-btn" title="Réglages" style="top:58px">⚙</button>
        <div class="cam-hint" id="cam-hint">Caméra libre · touche ⤢ pour recentrer</div>
        <div class="settings-panel" id="settings-panel" hidden></div>
      </div>
      <div id="gv-side"></div>
    </div>`;
  const host = el.querySelector<HTMLElement>('#board-host')!;
  const hint = el.querySelector<HTMLElement>('#cam-hint')!;
  const board: BoardLike = use3d
    ? Board3DView.create(host, settings, (user) => hint.classList.toggle('show', user))
    : IsoBoard.create(host);
  boards.set(el, board);
  el.querySelector('#recenter')!.addEventListener('click', () => board.recenter());
  setupSettings(el, settings, use3d);
  return board;
}

/** Panneau de réglages (⚙) affiché par-dessus le plateau. */
function setupSettings(el: HTMLElement, s: DisplaySettings, use3d: boolean) {
  const panel = el.querySelector<HTMLElement>('#settings-panel')!;
  const opt = (name: string, value: string, label: string, checked: boolean) =>
    `<label class="opt"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`;
  panel.innerHTML = `
    <h3>Réglages</h3>
    <div class="set-row"><span>Plateau</span>${opt('board', '3d', '3D', s.board === '3d')}${opt('board', '2.5d', '2.5D (plus léger)', s.board === '2.5d')}</div>
    ${use3d ? `
    <div class="set-row"><span>Animations</span>${opt('speed', 'normal', 'Normales', s.speed === 'normal')}${opt('speed', 'fast', 'Rapides', s.speed === 'fast')}</div>
    <div class="set-row"><span>Mises en scène</span>${opt('cine', '1', 'Oui', s.cinematics)}${opt('cine', '0', 'Passer', !s.cinematics)}</div>
    <div class="set-row"><span>Caméra pendant la marche</span>${opt('back', '0', 'Vue de haut', !s.backCam)}${opt('back', '1', 'De dos', s.backCam)}</div>
    <p class="muted">Astuce : touche le plateau pendant une animation pour l'accélérer.</p>` : ''}
    <div class="row"><button class="primary" id="settings-close">OK</button></div>`;
  el.querySelector('#settings-btn')!.addEventListener('click', () => (panel.hidden = !panel.hidden));
  panel.querySelector('#settings-close')!.addEventListener('click', () => (panel.hidden = true));
  panel.addEventListener('change', () => {
    const val = (n: string) => panel.querySelector<HTMLInputElement>(`input[name="${n}"]:checked`)?.value;
    const next: DisplaySettings = {
      board: val('board') === '2.5d' ? '2.5d' : '3d',
      speed: val('speed') === 'fast' ? 'fast' : 'normal',
      cinematics: (val('cine') ?? (s.cinematics ? '1' : '0')) === '1',
      backCam: (val('back') ?? (s.backCam ? '1' : '0')) === '1',
    };
    saveSettings(next);
    // On reconstruit le plateau avec les nouveaux réglages
    const o = lastOptions.get(el);
    destroyGameView(el);
    el.innerHTML = '';
    if (o) renderGame(el, o);
  });
}

/** À appeler en quittant l'écran de partie : libère le plateau. */
export function destroyGameView(el: HTMLElement) {
  boards.get(el)?.destroy();
  boards.delete(el);
}

export function renderGame(el: HTMLElement, o: GameViewOptions) {
  lastOptions.set(el, o);
  const g = o.state;
  const me = o.me;
  const paused = (o.pausedBy?.length ?? 0) > 0 && g.phase !== 'finished';
  const v = getPlayerView(g, me);
  const a = getAvailableActions(g, me);
  const mePlayer = v.players.find((p) => p.id === me)!;
  const dests = a.move && !paused ? getDestinations(g) : [];
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

  const board = ensureLayout(el);
  const side = el.querySelector<HTMLElement>('#gv-side')!;
  el.querySelector<HTMLElement>('#gv-top')!.innerHTML = o.banner ?? '';

  // On garde l'état du panneau « Accusation » entre deux affichages
  const accuseOpen = (side.querySelector('details.panel') as HTMLDetailsElement | null)?.open ?? false;

  side.innerHTML = `
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
        <div class="panel"><h2>Carnet d'enquête</h2>${renderNotebook(me, v)}</div>`;

  const details = side.querySelector('details.panel') as HTMLDetailsElement | null;
  if (details && accuseOpen) details.open = true;

  board.update({
    state: g,
    me,
    destinations: dests,
    onPick: (dest) => o.act({ type: 'move', player: me, to: dest.to }),
  });

  const on = (id: string, fn: () => void) => side.querySelector(`#${id}`)?.addEventListener('click', fn);
  const val = (id: string) => (side.querySelector(`#${id}`) as HTMLSelectElement).value as never;
  on('exit', () => o.onExit?.run());
  on('roll', () => o.act({ type: 'roll', player: me }));
  on('passage', () => o.act({ type: 'secretPassage', player: me }));
  on('end', () => o.act({ type: 'endTurn', player: me }));
  on('suggest', () => o.act({ type: 'suggest', player: me, suspect: val('sSus'), weapon: val('sWea') }));
  on('accuse', () => o.act({ type: 'accuse', player: me, suspect: val('aSus'), weapon: val('aWea'), room: val('aRoo') }));
  on('abandon', () => {
    if (confirmInline(side, 'abandon')) o.act({ type: 'abandon', player: me });
  });
  side.querySelectorAll<HTMLElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => o.act({ type: 'showCard', player: me, card: b.dataset.show as CardId })),
  );
  side.querySelectorAll<HTMLElement>('[data-mark]').forEach((td) =>
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
