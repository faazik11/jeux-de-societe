// Écran de partie : plateau (3D ou 2.5D) + panneau de jeu (actions, cartes, carnet, journal).
// Utilisé à la fois par le mode test local et par le jeu en ligne.

import { IsoBoard, type BoardUpdate } from '../board3d/IsoBoard';
import { Board3DView } from '../board3d/Board3DView';
import { loadSettings, saveSettings, webglAvailable, type DisplaySettings } from './settings';
import { cardBackHTML, cardHTML } from './cards';
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

const MARKS = ['', '✗', '✓', '?'];
type Notebook = Record<string, string>; // clé « carte » ou « carte|joueur » -> marque

function notebookKey(me: string, hand: CardId[]) {
  return `jds:nb:${me}:${[...hand].sort().join(',')}`;
}
function loadNotebook(key: string): Notebook {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}
function saveNotebook(key: string, nb: Notebook) {
  try {
    localStorage.setItem(key, JSON.stringify(nb));
  } catch {
    /* rien */
  }
}

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

/**
 * Carnet d'enquête en grille : une ligne par carte ; une colonne « bilan » et une colonne par adversaire.
 * Ce qu'on sait déjà est pré-rempli (mes cartes, cartes qu'on m'a montrées) ; le reste se coche à la main.
 */
function renderNotebook(me: string, v: PlayerView, nb: Notebook): string {
  const myHand = new Set(v.players.find((p) => p.id === me)!.hand ?? []);
  // Cartes qu'on m'a montrées : qui les a
  const shownBy = new Map<string, string>();
  for (const e of v.log) if (e.type === 'cardShown' && e.to === me && e.card) shownBy.set(e.card, e.player);
  const others = v.players.filter((p) => p.id !== me);
  const auto = (card: string, col: string): string => {
    if (col === 'status') return myHand.has(card as CardId) || shownBy.has(card) ? '✗' : '';
    if (myHand.has(card as CardId)) return '✗';
    if (shownBy.get(card) === col) return '✓';
    return '';
  };
  const cell = (card: string, col: string) => {
    const key = col === 'status' ? card : `${card}|${col}`;
    const manual = nb[key];
    const val = manual ?? auto(card, col);
    const cls = val === '✓' ? 'yes' : val === '✗' ? 'no' : val === '?' ? 'maybe' : '';
    return `<td class="nb-cell ${col === 'status' ? 'status' : ''} ${cls} ${manual === undefined && val ? 'auto' : ''}" data-nb="${key}">${val}</td>`;
  };
  const head = `<tr><th></th><th title="Bilan">Bilan</th>${others
    .map((p) => `<th title="${esc(p.name)}"><span class="who" style="background:${suspectColor(p.suspect)}"></span>${esc(p.name.slice(0, 3))}</th>`)
    .join('')}</tr>`;
  const section = (title: string, cards: readonly { id: string; name: string }[]) =>
    `<tr class="section"><td colspan="${2 + others.length}">${title}</td></tr>` +
    cards
      .map((c) => `<tr class="${myHand.has(c.id as CardId) ? 'mine' : ''}"><td class="nb-name">${c.name}</td>${cell(c.id, 'status')}${others.map((p) => cell(c.id, p.id)).join('')}</tr>`)
      .join('');
  return `<div class="nb-wrap"><table class="notebook grid">${head}${section('Suspects', SUSPECTS)}${section('Armes', WEAPONS)}${section('Pièces', ROOMS)}</table></div>
    <p class="muted">Touche une case pour changer : ✗ ne l'a pas / innocent · ✓ l'a / coupable · ? doute. Les cases en gris sont remplies automatiquement.</p>`;
}

interface BoardLike {
  update(u: BoardUpdate): void;
  recenter(): void;
  destroy(): void;
}

const boards = new WeakMap<HTMLElement, BoardLike>();
const lastOptions = new WeakMap<HTMLElement, GameViewOptions>();

/** État de l'interface qui doit survivre aux réaffichages (onglet, cartes choisies, journal déjà vu). */
interface UiState {
  tab: 'action' | 'cards' | 'notebook' | 'log';
  sSus?: string;
  sWea?: string;
  aSus?: string;
  aWea?: string;
  aRoo?: string;
  accuseOpen: boolean;
  /** Longueur du journal déjà vue, par joueur (pour ne montrer chaque révélation qu'une fois). */
  seen: Record<string, number>;
  me: string;
}
const uiStates = new WeakMap<HTMLElement, UiState>();

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
  const waitingFor = g.phase === 'refuting' ? g.pending!.refuter : g.currentPlayer;
  const myHand = mePlayer.hand ?? [];

  // État d'interface (réinitialisé si le joueur qui regarde change, ex. en mode test)
  let ui = uiStates.get(el);
  if (!ui || ui.me !== me) {
    ui = { tab: 'action', accuseOpen: false, seen: ui?.seen ?? {}, me };
    uiStates.set(el, ui);
  }
  if (ui.seen[me] === undefined || ui.seen[me] > g.log.length) ui.seen[me] = g.log.length;
  const myMove = !paused && g.phase !== 'finished' && (g.currentPlayer === me || a.showCard.length > 0);
  if (myMove && ui.tab !== 'action' && (a.showCard.length > 0 || a.suggest)) ui.tab = 'action';

  const picker = (items: readonly { id: string }[], field: 'sSus' | 'sWea' | 'aSus' | 'aWea' | 'aRoo') =>
    `<div class="card-row">${items
      .map((c) => cardHTML(c.id as CardId, { size: 'sm', attrs: `data-pick="${field}" data-id="${c.id}"`, selected: ui![field] === c.id, note: myHand.includes(c.id as CardId) ? 'ta carte' : undefined }))
      .join('')}</div>`;

  let controls = '';
  if (g.phase === 'finished') {
    controls = `<div class="winner">${
      g.endReason === 'abandoned'
        ? 'Partie abandonnée par le maître de jeu.'
        : g.winner
          ? `🏆 ${nameOf(g, g.winner, me)} a gagné !`
          : 'Personne n’a gagné.'
    }</div>
      <p class="muted">La solution :</p>
      <div class="card-row center">${cardHTML(g.solution.suspect)}${cardHTML(g.solution.weapon)}${cardHTML(g.solution.room)}</div>
      ${o.onExit ? `<div class="row"><button class="primary" id="exit">${esc(o.onExit.label)}</button></div>` : ''}`;
  } else if (paused) {
    controls = `<div class="banner">⏸ Partie en pause : ${o.pausedBy!.map(esc).join(', ')} ${o.pausedBy!.length > 1 ? 'sont déconnectés' : 'est déconnecté'}. Elle reprendra à son retour.</div>`;
  } else if (g.phase === 'refuting') {
    const p = g.pending!;
    const trio = `<div class="card-row center">${cardHTML(p.suspect, { size: 'sm' })}${cardHTML(p.weapon, { size: 'sm' })}${cardHTML(p.room, { size: 'sm' })}</div>`;
    controls = a.showCard.length
      ? `<p>${nameOf(g, p.by, me)} suppose :</p>${trio}
        <p class="callout">Tu as ${a.showCard.length > 1 ? 'plusieurs de ces cartes : choisis celle' : 'une de ces cartes : touche-la'} pour la montrer. <b>Lui seul la verra.</b></p>
        <div class="card-row center">${a.showCard.map((c) => cardHTML(c, { size: 'lg', attrs: `data-show="${c}"` })).join('')}</div>`
      : `<p>${nameOf(g, p.by, me)} suppose :</p>${trio}
        <p class="muted">En attente de ${nameOf(g, p.refuter, me)}, qui doit montrer une carte…</p>`;
  } else if (g.currentPlayer !== me) {
    controls = `<p class="muted">C'est au tour de ${nameOf(g, g.currentPlayer, me)}.</p>
      ${g.dice ? `<p>Dés : <b>${g.dice.join(' + ')} = ${g.dice.reduce((x, y) => x + y, 0)}</b></p>` : ''}
      ${mePlayer.eliminated ? '<p class="muted">Tu es éliminé : tu continues à montrer tes cartes quand on te le demande.</p>' : ''}`;
  } else {
    const total = g.dice ? g.dice.reduce((x, y) => x + y, 0) : 0;
    controls = `
      <div class="row">
        ${a.roll ? `<button class="primary big" id="roll">🎲 Lancer les dés</button>` : ''}
        ${a.secretPassage ? `<button id="passage">🕳️ Passage secret → ${getCard(a.secretPassage).name}</button>` : ''}
        ${a.endTurn ? `<button id="end">Finir mon tour</button>` : ''}
      </div>
      ${g.dice ? `<p>Dés : <b>${g.dice.join(' + ')} = ${total}</b>${a.move ? ` · tu peux avancer de <b>1 à ${total}</b> cases : touche une case verte ou une pièce avec une flèche.` : ''}</p>` : ''}
      ${a.suggest ? `
        <div class="panel inner"><h2>Hypothèse dans : ${getCard(myRoom!).name}</h2>
          <p class="muted">Choisis un suspect et une arme :</p>
          ${picker(SUSPECTS, 'sSus')}
          ${picker(WEAPONS, 'sWea')}
          <div class="row"><button class="primary" id="suggest" ${ui.sSus && ui.sWea ? '' : 'disabled'}>Proposer l'hypothèse</button></div>
        </div>` : ''}
      ${a.accuse ? `
        <details class="panel inner" id="accuse-box" ${ui.accuseOpen ? 'open' : ''}><summary>⚖️ Accusation finale</summary>
          <p class="muted">Tu penses avoir trouvé ? Si tu te trompes, tu es éliminé.</p>
          ${picker(SUSPECTS, 'aSus')}${picker(WEAPONS, 'aWea')}${picker(ROOMS, 'aRoo')}
          <div class="row"><button class="danger" id="accuse" ${ui.aSus && ui.aWea && ui.aRoo ? '' : 'disabled'}>Accuser</button></div></details>` : ''}`;
  }

  const board = ensureLayout(el);
  const side = el.querySelector<HTMLElement>('#gv-side')!;
  el.querySelector<HTMLElement>('#gv-top')!.innerHTML = o.banner ?? '';

  const nbKey = notebookKey(me, myHand);
  const nb = loadNotebook(nbKey);
  const tabBtn = (id: UiState['tab'], label: string, badge = false) =>
    `<button class="gv-tab ${ui!.tab === id ? 'active' : ''}" data-tab="${id}">${label}${badge ? '<span class="dot"></span>' : ''}</button>`;
  side.className = `tab-${ui.tab}`;
  side.innerHTML = `
    <nav class="gv-tabs">${tabBtn('action', 'Jeu', myMove)}${tabBtn('cards', 'Cartes')}${tabBtn('notebook', 'Carnet')}${tabBtn('log', 'Journal')}</nav>
    <section class="panel" data-sec="action">
      <h2>${g.phase === 'finished' ? 'Fin de partie' : `Tour ${g.turn} : ${nameOf(g, waitingFor, me)}`}</h2>
      ${controls}
      <div class="error">${esc(o.error ?? '')}</div>
      ${a.abandon && g.phase !== 'finished' ? `<div class="row"><button class="danger small" id="abandon">Abandonner la partie (maître de jeu)</button></div>` : ''}
    </section>
    <section class="panel" data-sec="cards"><h2>Mes cartes</h2>
      <div class="card-row hand">${myHand.map((c) => cardHTML(c, { size: 'md' })).join('')}</div>
      <p class="muted">Ces cartes ne sont pas dans l'enveloppe : leurs suspects, armes et pièces sont innocents.</p>
    </section>
    <section class="panel" data-sec="notebook"><h2>Carnet d'enquête</h2>${renderNotebook(me, v, nb)}</section>
    <section class="panel" data-sec="log"><h2>Joueurs</h2>
      ${v.players.map((p) => `<div class="row" style="margin:2px 0">${nameOf(v, p.id, me)}
        <span class="muted">${p.handSize} cartes${p.id === g.hostId ? ' · maître de jeu' : ''}${p.eliminated ? ' · éliminé' : ''}</span></div>`).join('')}
      <h2 style="margin-top:12px">Journal</h2><div class="log">${[...v.log].reverse().map((e) => `<div>${logLine(v, e)}</div>`).join('')}</div>
    </section>`;

  board.update({
    state: g,
    me,
    destinations: dests,
    onPick: (dest) => o.act({ type: 'move', player: me, to: dest.to }),
  });

  // Révélations : carte qu'on vient de me montrer, ou personne n'a pu répondre
  const fresh = v.log.slice(ui.seen[me]);
  ui.seen[me] = v.log.length;
  for (const e of fresh) {
    if (e.type === 'cardShown' && e.to === me && e.card) showReveal(el, `${nameOf(v, e.player, me)} te montre :`, e.card);
    else if (e.type === 'cardShown' && e.player === me && e.card) toast(el, `Tu as montré « ${getCard(e.card).name} » à ${nameOf(v, e.to, me)}.`);
    else if (e.type === 'noOneRefuted' && e.player === me) showReveal(el, 'Personne n’a pu répondre à ton hypothèse !', null);
  }

  // Événements
  const on = (id: string, fn: () => void) => side.querySelector(`#${id}`)?.addEventListener('click', fn);
  side.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      ui!.tab = b.dataset.tab as UiState['tab'];
      renderGame(el, o);
    }),
  );
  side.querySelectorAll<HTMLElement>('[data-pick]').forEach((c) =>
    c.addEventListener('click', () => {
      ui![c.dataset.pick as 'sSus'] = c.dataset.id;
      renderGame(el, o);
    }),
  );
  side.querySelector<HTMLDetailsElement>('#accuse-box')?.addEventListener('toggle', (e) => {
    ui!.accuseOpen = (e.target as HTMLDetailsElement).open;
  });
  on('exit', () => o.onExit?.run());
  on('roll', () => o.act({ type: 'roll', player: me }));
  on('passage', () => o.act({ type: 'secretPassage', player: me }));
  on('end', () => o.act({ type: 'endTurn', player: me }));
  on('suggest', () => {
    const { sSus, sWea } = ui!;
    if (!sSus || !sWea) return;
    ui!.sSus = ui!.sWea = undefined;
    o.act({ type: 'suggest', player: me, suspect: sSus as never, weapon: sWea as never });
  });
  on('accuse', () => {
    if (!confirmInline(side, 'accuse', 'Sûr ? Touche encore pour accuser')) return;
    const { aSus, aWea, aRoo } = ui!;
    ui!.accuseOpen = false;
    o.act({ type: 'accuse', player: me, suspect: aSus as never, weapon: aWea as never, room: aRoo as never });
  });
  on('abandon', () => {
    if (confirmInline(side, 'abandon', 'Confirmer l’abandon ?')) o.act({ type: 'abandon', player: me });
  });
  side.querySelectorAll<HTMLElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => o.act({ type: 'showCard', player: me, card: b.dataset.show as CardId })),
  );
  side.querySelectorAll<HTMLElement>('[data-nb]').forEach((td) =>
    td.addEventListener('click', () => {
      const cur = MARKS.indexOf(td.textContent ?? '');
      const next = MARKS[(cur + 1) % MARKS.length];
      nb[td.dataset.nb!] = next;
      saveNotebook(nbKey, nb);
      td.textContent = next;
      td.className = `nb-cell ${td.classList.contains('status') ? 'status' : ''} ${next === '✓' ? 'yes' : next === '✗' ? 'no' : next === '?' ? 'maybe' : ''}`;
    }),
  );
}

/** Grande carte qui se retourne au milieu de l'écran (visible seulement par celui qui la reçoit). */
function showReveal(el: HTMLElement, title: string, card: CardId | null) {
  const ov = document.createElement('div');
  ov.className = 'reveal';
  ov.innerHTML = `<div class="reveal-box">
    <p class="reveal-title">${title}</p>
    ${card ? `<div class="flip"><div class="flip-inner"><div class="flip-face back">${cardBackHTML('lg')}</div><div class="flip-face front">${cardHTML(card, { size: 'lg' })}</div></div></div>
      <p class="muted">Pense à la cocher dans ton carnet (c'est fait automatiquement 😉).</p>`
    : '<div class="reveal-none">🤫</div><p class="muted">Aucun joueur n’a ces cartes… sauf peut-être toi !</p>'}
    <button class="primary" id="reveal-ok">OK</button></div>`;
  el.appendChild(ov);
  requestAnimationFrame(() => setTimeout(() => ov.classList.add('flipped'), 500));
  ov.querySelector('#reveal-ok')!.addEventListener('click', () => ov.remove());
}

function toast(el: HTMLElement, html: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  el.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

/** Demande une confirmation sans boîte de dialogue : il faut cliquer deux fois. */
function confirmInline(el: HTMLElement, id: string, label: string): boolean {
  const btn = el.querySelector<HTMLButtonElement>(`#${id}`)!;
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  btn.textContent = label;
  return false;
}
