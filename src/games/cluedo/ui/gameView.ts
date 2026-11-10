// Écran de partie, façon jeu vidéo (Mario Party) :
//  - le plateau occupe tout l'écran ;
//  - par-dessus : la barre des joueurs en haut, les annonces au milieu (« Tour 3 », « Tour de Rayan »,
//    résultat des dés, hypothèses…), les boutons d'action en bas (gros bouton dé) ;
//  - cartes, carnet, journal, hypothèse, accusation et menu s'ouvrent dans des volets qui montent du bas.
// Utilisé à la fois par le mode test local et par le jeu en ligne.

import { IsoBoard, type BoardUpdate } from '../board3d/IsoBoard';
import { Board3DView } from '../board3d/Board3DView';
import { loadSettings, saveSettings, webglAvailable, type DisplaySettings } from './settings';
import { cardBackHTML, cardHTML, portraitHTML } from './cards';
import { ICONS } from './icons';
import { customImages, loadCustomImages, onCustomImagesChange, removeCustomImage, setCustomImage } from './customImages';
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
  /** Retour à l'accueil (bouton du menu). */
  onHome?: () => void;
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

type BoardEvent = { type: 'dice'; total: number; player: string } | { type: 'ready' } | { type: 'idle' };

interface BoardLike {
  update(u: BoardUpdate): void;
  recenter(): void;
  destroy(): void;
  onEvent: ((e: BoardEvent) => void) | null;
}

type SheetId = 'cards' | 'notebook' | 'log' | 'suggest' | 'accuse' | 'refute' | 'menu' | 'end' | 'images';

/** État de l'interface qui doit survivre aux réaffichages. */
interface UiState {
  sheet: SheetId | null;
  sSus?: string;
  sWea?: string;
  aSus?: string;
  aWea?: string;
  aRoo?: string;
  /** Longueur du journal déjà vue, par joueur (pour n'annoncer chaque événement qu'une fois). */
  seen: Record<string, number>;
  me: string;
  /** Dernier tour annoncé (pour « Tour de X »). */
  announcedTurn: number;
  /** File des annonces au milieu de l'écran. */
  queue: { html: string; ms: number; cls?: string }[];
  showing: boolean;
  lastError?: string;
  /** Tour pour lequel l'hypothèse doit s'ouvrir toute seule (dès que le pion est arrivé). */
  pendingSuggest?: number;
  /** Tour pour lequel elle s'est déjà ouverte (on ne la rouvre pas si le joueur la ferme). */
  autoSuggested?: number;
}

/** Plateaux prêts (les annonces attendent que le plateau soit affiché). */
const boardReady = new WeakSet<HTMLElement>();

const boards = new WeakMap<HTMLElement, BoardLike>();
const lastOptions = new WeakMap<HTMLElement, GameViewOptions>();
const uiStates = new WeakMap<HTMLElement, UiState>();

/** Crée la scène (une seule fois) : plateau plein écran + calques d'interface. */
function ensureLayout(el: HTMLElement): BoardLike {
  const existing = boards.get(el);
  if (existing && el.querySelector('#board-host')) return existing;
  existing?.destroy();
  const settings = loadSettings();
  const use3d = settings.board === '3d' && webglAvailable();
  el.innerHTML = `
    <div class="stage">
      <div id="board-host"></div>
      <div class="hud-top">
        <button class="hud-btn" data-open="menu" title="Menu">${ICONS.menu}</button>
        <div class="players-strip" id="players"></div>
        <button class="hud-btn" id="recenter" title="Recentrer la caméra">${ICONS.recenter}</button>
      </div>
      <div class="hud-status" id="status"></div>
      <div class="cam-hint" id="cam-hint">Caméra libre · touche le viseur pour recentrer</div>
      <div class="announce-layer" id="announce"></div>
      <div class="hud-bottom">
        <div class="hud-side">
          <button class="hud-btn labeled" data-open="cards">${ICONS.cards}Cartes</button>
          <button class="hud-btn labeled" data-open="notebook">${ICONS.notebook}Carnet</button>
        </div>
        <div class="hud-actions" id="actions"></div>
        <div class="hud-side right">
          <button class="hud-btn labeled" data-open="log">${ICONS.log}Journal</button>
        </div>
      </div>
      <div class="sheet-backdrop" id="sheet-backdrop"></div>
      <div class="sheet" id="sheet"><div class="sheet-handle"></div><button class="sheet-close" id="sheet-close">✕</button><div class="sheet-body" id="sheet-body"></div></div>
      <div class="settings-panel" id="settings-panel" hidden></div>
    </div>`;
  document.body.classList.add('in-game');
  const host = el.querySelector<HTMLElement>('#board-host')!;
  const hint = el.querySelector<HTMLElement>('#cam-hint')!;
  const board: BoardLike = use3d
    ? Board3DView.create(host, settings, (user) => hint.classList.toggle('show', user))
    : IsoBoard.create(host);
  board.onEvent = (e) => onBoardEvent(el, e);
  boardReady.delete(el);
  // Sécurité : si le plateau ne prévient pas, on démarre quand même les annonces
  setTimeout(() => onBoardEvent(el, { type: 'ready' }), 6000);
  boards.set(el, board);
  el.querySelector('#recenter')!.addEventListener('click', () => board.recenter());
  setupSettings(el, settings, use3d);
  // Mes images : chargées au démarrage, et la partie se réaffiche quand elles changent
  void loadCustomImages();
  imageUnsub.get(el)?.();
  imageUnsub.set(el, onCustomImagesChange(() => rerender(el)));

  // Ouverture / fermeture des volets
  el.querySelectorAll<HTMLElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const ui = uiStates.get(el);
      if (!ui) return;
      ui.sheet = ui.sheet === b.dataset.open ? null : (b.dataset.open as SheetId);
      rerender(el);
    }),
  );
  const close = () => {
    const ui = uiStates.get(el);
    if (!ui) return;
    // Le volet « montrer une carte » ne se ferme pas tant qu'on n'a pas choisi
    if (ui.sheet === 'refute') return;
    ui.sheet = null;
    rerender(el);
  };
  el.querySelector('#sheet-close')!.addEventListener('click', close);
  el.querySelector('#sheet-backdrop')!.addEventListener('click', close);
  return board;
}

function rerender(el: HTMLElement) {
  const o = lastOptions.get(el);
  if (o) renderGame(el, o);
}

/** Panneau de réglages (ouvert depuis le menu). */
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
    const o = lastOptions.get(el);
    destroyGameView(el);
    el.innerHTML = '';
    if (o) renderGame(el, o);
  });
}

const imageUnsub = new WeakMap<HTMLElement, () => void>();

/** À appeler en quittant l'écran de partie : libère le plateau. */
export function destroyGameView(el: HTMLElement) {
  imageUnsub.get(el)?.();
  imageUnsub.delete(el);
  boards.get(el)?.destroy();
  boards.delete(el);
  document.body.classList.remove('in-game');
}

// ---------------------------------------------------------------------------
// Annonces au milieu de l'écran

function announce(el: HTMLElement, html: string, ms = 1600, cls = '') {
  const ui = uiStates.get(el);
  if (!ui) return;
  ui.queue.push({ html, ms, cls });
  if (!ui.showing && boardReady.has(el)) nextAnnounce(el);
}

function nextAnnounce(el: HTMLElement) {
  const ui = uiStates.get(el);
  const layer = el.querySelector<HTMLElement>('#announce');
  if (!ui || !layer) return;
  const item = ui.queue.shift();
  if (!item) {
    ui.showing = false;
    return;
  }
  ui.showing = true;
  const box = document.createElement('div');
  box.className = `announce ${item.cls ?? ''}`;
  box.innerHTML = item.html;
  layer.appendChild(box);
  requestAnimationFrame(() => box.classList.add('in'));
  // Toucher l'annonce la passe
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    box.classList.remove('in');
    box.classList.add('out');
    setTimeout(() => {
      box.remove();
      nextAnnounce(el);
    }, 280);
  };
  box.addEventListener('click', finish);
  setTimeout(finish, item.ms);
}

function onBoardEvent(el: HTMLElement, e: BoardEvent) {
  const o = lastOptions.get(el);
  if (!o) return;
  if (e.type === 'ready') {
    if (boardReady.has(el)) return;
    boardReady.add(el);
    const ui = uiStates.get(el);
    if (ui && !ui.showing) setTimeout(() => nextAnnounce(el), 400);
    return;
  }
  if (e.type === 'idle') {
    openPendingSuggest(el, 900);
    return;
  }
  if (e.type === 'dice') {
    announce(el, `<div class="big-number">${e.total}</div><div class="sub">${nameOf(o.state, e.player, o.me)}</div>`, 1500, 'dice');
  }
}

/** Ouvre le volet « hypothèse » prévu, une fois le pion arrivé et les annonces passées. */
function openPendingSuggest(el: HTMLElement, delay: number) {
  setTimeout(() => {
    const ui = uiStates.get(el);
    const o = lastOptions.get(el);
    if (!ui || !o || ui.pendingSuggest === undefined) return;
    if (ui.pendingSuggest !== o.state.turn) {
      ui.pendingSuggest = undefined;
      return;
    }
    // On attend la fin des annonces au milieu de l'écran
    if (ui.showing || ui.queue.length) return openPendingSuggest(el, 500);
    ui.autoSuggested = ui.pendingSuggest;
    ui.pendingSuggest = undefined;
    if (getAvailableActions(o.state, o.me).suggest && !ui.sheet) {
      ui.sheet = 'suggest';
      rerender(el);
    }
  }, delay);
}

/** Ordre de jeu : index du joueur dans la liste (pour savoir quand un nouveau « tour de table » commence). */
function roundOf(g: GameState): number {
  return Math.floor((g.turn - 1) / g.players.length) + 1;
}

/** Transforme les nouveaux événements du journal en annonces. */
function announceLog(el: HTMLElement, v: PlayerView, fresh: LogEntry[], me: string) {
  const n = (id: string) => nameOf(v, id, me);
  const c = (id: CardId) => getCard(id).name;
  for (const e of fresh) {
    switch (e.type) {
      case 'moved': {
        const to = e.path.at(-1)!;
        if (to.type === 'room') announce(el, `${n(e.player)}<div class="sub">entre dans</div><div class="title">${c(to.room)}</div>`, 1700);
        break;
      }
      case 'secretPassage':
        announce(el, `🕳️ Passage secret<div class="sub">${n(e.player)} → ${c(e.to)}</div>`, 1800);
        break;
      case 'suggested':
        announce(
          el,
          `<div class="sub">${n(e.player)} soupçonne…</div>
          <div class="card-row center tight">${cardHTML(e.suspect, { size: 'md' })}${cardHTML(e.weapon, { size: 'md' })}${cardHTML(e.room, { size: 'md' })}</div>`,
          3200,
          'wide',
        );
        break;
      case 'noOneRefuted':
        if (e.player !== me) announce(el, `🤫 Personne ne peut répondre !`, 2000);
        break;
      case 'cardShown':
        if (e.to !== me && e.player !== me) announce(el, `${n(e.player)}<div class="sub">montre une carte à</div>${n(e.to)}`, 1800);
        break;
      case 'accused':
        announce(el, `⚖️ ${n(e.player)}<div class="sub">lance une accusation !</div>`, 1800);
        announce(el, e.correct ? `<div class="title gold">C'est juste !</div>` : `<div class="title red">C'est faux…</div>`, 2200, e.correct ? 'win' : 'lose');
        break;
      case 'eliminated':
        announce(el, `${n(e.player)}<div class="sub">est éliminé (mais montre toujours ses cartes)</div>`, 2200);
        break;
      case 'gameOver':
        if (e.reason === 'abandoned') announce(el, `Partie abandonnée`, 2200);
        else if (e.winner) announce(el, `🏆 ${n(e.winner)}<div class="sub">a gagné !</div>`, 3000, 'win');
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------

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
  const myHand = mePlayer.hand ?? [];
  const board = ensureLayout(el);

  // État d'interface
  let ui = uiStates.get(el);
  const firstRender = !ui;
  if (!ui || ui.me !== me) {
    ui = { sheet: null, seen: ui?.seen ?? {}, me, announcedTurn: ui?.announcedTurn ?? 0, queue: ui?.queue ?? [], showing: ui?.showing ?? false };
    uiStates.set(el, ui);
  }
  if (ui.seen[me] === undefined || ui.seen[me] > g.log.length) ui.seen[me] = g.log.length;

  // Volets ouverts automatiquement quand c'est à moi d'agir
  if (a.showCard.length && !paused) ui.sheet = 'refute';
  else if (ui.sheet === 'refute') ui.sheet = null;
  if (g.phase === 'finished' && ui.sheet !== 'end' && ui.sheet !== 'log') ui.sheet = ui.sheet ?? null;
  if (ui.sheet === 'suggest' && !a.suggest) ui.sheet = null;
  // Je viens d'entrer dans une pièce (à pied ou par un passage secret) : l'hypothèse s'ouvre toute seule
  const lastEntry = g.log[g.log.length - 1];
  const justEntered =
    !!lastEntry &&
    ((lastEntry.type === 'moved' && lastEntry.player === me && lastEntry.path[lastEntry.path.length - 1].type === 'room') ||
      (lastEntry.type === 'secretPassage' && lastEntry.player === me));
  if (a.suggest && justEntered && !paused && ui.autoSuggested !== g.turn && ui.pendingSuggest !== g.turn) {
    ui.pendingSuggest = g.turn;
    openPendingSuggest(el, 15000); // sécurité si le plateau ne prévient pas
  }
  if (ui.sheet === 'accuse' && !a.accuse) ui.sheet = null;

  // ---------------- Barre des joueurs (en haut)
  const players = el.querySelector<HTMLElement>('#players')!;
  players.innerHTML = v.players
    .map((p) => {
      const s = SUSPECTS.find((x) => x.id === p.suspect)!;
      const active = g.phase !== 'finished' && (p.id === g.currentPlayer || (g.phase === 'refuting' && g.pending?.refuter === p.id));
      const off = o.pausedBy?.includes(p.name);
      return `<div class="pl ${active ? 'active' : ''} ${p.eliminated ? 'out' : ''} ${p.id === me ? 'me' : ''}">
        <div class="pl-avatar" title="${s.name}">${portraitHTML(s.id)}</div>
        <div class="pl-name">${p.id === me ? 'Toi' : esc(p.name)}${off ? ' 📴' : ''}</div>
        <div class="pl-cards"><i class="mini-card"></i>${p.handSize}</div></div>`;
    })
    .join('');

  // ---------------- Ligne d'état (petit texte sous la barre)
  const status = el.querySelector<HTMLElement>('#status')!;
  let statusHtml = '';
  if (paused) statusHtml = `⏸ Partie en pause : ${o.pausedBy!.map(esc).join(', ')} ${o.pausedBy!.length > 1 ? 'sont déconnectés' : 'est déconnecté'}`;
  else if (g.phase === 'finished') statusHtml = 'Partie terminée';
  else if (g.phase === 'refuting' && g.pending!.refuter !== me) statusHtml = `${nameOf(v, g.pending!.refuter, me)} cherche une carte à montrer…`;
  else if (g.currentPlayer !== me) statusHtml = `${nameOf(v, g.currentPlayer, me)} joue…`;
  else if (a.move) statusHtml = `Touche une case verte ou une pièce avec une flèche`;
  status.innerHTML = statusHtml;
  status.classList.toggle('show', !!statusHtml);
  if (o.error && o.error !== ui.lastError) toast(el, `⚠️ ${esc(o.error)}`);
  ui.lastError = o.error;

  // ---------------- Boutons d'action (en bas)
  const actions = el.querySelector<HTMLElement>('#actions')!;
  let act = '';
  if (g.phase === 'finished') {
    act = `<button class="primary pill" data-open="end">Voir la solution</button>`;
  } else if (!paused && g.currentPlayer === me && g.phase !== 'refuting') {
    if (a.roll) act += `<button class="dice-btn" id="roll" aria-label="Lancer les dés"><span class="dice-face">🎲</span><span class="dice-label">Lancer</span></button>`;
    const small: string[] = [];
    if (a.suggest) small.push(`<button class="primary pill glow" data-open="suggest">🔍 Hypothèse</button>`);
    if (a.secretPassage) small.push(`<button class="pill" id="passage">🕳️ Passage → ${getCard(a.secretPassage).name}</button>`);
    if (a.endTurn) small.push(`<button class="pill" id="end">${g.phase === 'start' ? 'Rester ici' : 'Finir mon tour'}</button>`);
    if (a.accuse && g.phase !== 'moving') small.push(`<button class="pill danger" data-open="accuse">⚖️ Accuser</button>`);
    if (small.length) act += `<div class="pill-row">${small.join('')}</div>`;
  } else if (a.showCard.length) {
    act = `<button class="primary pill glow" data-open="refute">🃏 Montrer une carte</button>`;
  }
  actions.innerHTML = act;
  actions.querySelectorAll<HTMLElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      ui!.sheet = b.dataset.open as SheetId;
      renderGame(el, o);
    }),
  );
  const on = (root: HTMLElement, id: string, fn: () => void) => root.querySelector(`#${id}`)?.addEventListener('click', fn);
  on(actions, 'roll', () => {
    actions.querySelector('#roll')?.classList.add('rolling');
    o.act({ type: 'roll', player: me });
  });
  on(actions, 'passage', () => o.act({ type: 'secretPassage', player: me }));
  on(actions, 'end', () => o.act({ type: 'endTurn', player: me }));

  // ---------------- Volets (en bas)
  const sheet = el.querySelector<HTMLElement>('#sheet')!;
  const body = el.querySelector<HTMLElement>('#sheet-body')!;
  const backdrop = el.querySelector<HTMLElement>('#sheet-backdrop')!;
  const picker = (items: readonly { id: string }[], field: 'sSus' | 'sWea' | 'aSus' | 'aWea' | 'aRoo') =>
    `<div class="card-row">${items
      .map((c) => cardHTML(c.id as CardId, { size: 'md', attrs: `data-pick="${field}" data-id="${c.id}"`, selected: ui![field] === c.id, note: myHand.includes(c.id as CardId) ? 'ta carte' : undefined }))
      .join('')}</div>`;
  const nbKey = notebookKey(me, myHand);
  const nb = loadNotebook(nbKey);
  let content = '';
  switch (ui.sheet) {
    case 'cards':
      content = `<h2>Mes cartes</h2><div class="card-row center">${myHand.map((c) => cardHTML(c, { size: 'lg' })).join('')}</div>
        <p class="muted">Ces cartes ne sont pas dans l'enveloppe : leurs suspects, armes et pièces sont innocents.</p>`;
      break;
    case 'notebook':
      content = `<h2>Carnet d'enquête</h2>${renderNotebook(me, v, nb)}`;
      break;
    case 'log':
      content = `<h2>Journal</h2><div class="log">${[...v.log].reverse().map((e) => `<div>${logLine(v, e)}</div>`).join('')}</div>`;
      break;
    case 'suggest':
      content = `<h2>Hypothèse dans : ${myRoom ? getCard(myRoom).name : ''}</h2>
        <p class="muted">Qui, et avec quoi ? Touche un suspect et une arme.</p>
        ${picker(SUSPECTS, 'sSus')}${picker(WEAPONS, 'sWea')}
        <div class="row"><button class="primary big" id="suggest" ${ui.sSus && ui.sWea ? '' : 'disabled'}>Proposer l'hypothèse</button></div>`;
      break;
    case 'accuse':
      content = `<h2>⚖️ Accusation finale</h2>
        <p class="muted">Tu penses avoir trouvé ? Si tu te trompes, tu es éliminé.</p>
        ${picker(SUSPECTS, 'aSus')}${picker(WEAPONS, 'aWea')}${picker(ROOMS, 'aRoo')}
        <div class="row"><button class="danger big" id="accuse" ${ui.aSus && ui.aWea && ui.aRoo ? '' : 'disabled'}>Accuser</button></div>`;
      break;
    case 'refute': {
      const p = g.pending!;
      content = `<h2>Montre une carte</h2>
        <p>${nameOf(v, p.by, me)} soupçonne :</p>
        <div class="card-row center tight">${cardHTML(p.suspect, { size: 'md' })}${cardHTML(p.weapon, { size: 'md' })}${cardHTML(p.room, { size: 'md' })}</div>
        <p class="callout">Tu as ${a.showCard.length > 1 ? 'plusieurs de ces cartes : choisis celle' : 'une de ces cartes : touche-la'} pour la montrer. <b>Lui seul la verra.</b></p>
        <div class="card-row center">${a.showCard.map((c) => cardHTML(c, { size: 'lg', attrs: `data-show="${c}"` })).join('')}</div>`;
      break;
    }
    case 'end':
      content = `<h2>Fin de partie</h2>
        <div class="winner">${g.endReason === 'abandoned' ? 'Partie abandonnée par le maître de jeu.' : g.winner ? `🏆 ${nameOf(v, g.winner, me)} a gagné !` : 'Personne n’a gagné.'}</div>
        <p class="muted">La solution :</p>
        <div class="card-row center">${cardHTML(g.solution.suspect)}${cardHTML(g.solution.weapon)}${cardHTML(g.solution.room)}</div>
        ${o.onExit ? `<div class="row"><button class="primary" id="exit">${esc(o.onExit.label)}</button></div>` : ''}`;
      break;
    case 'menu':
      content = `<h2>Menu</h2>
        <div class="menu-extra">${o.banner ?? ''}</div>
        <div class="menu-list">
          ${o.onHome ? `<button id="go-home">← Retour à l'accueil</button>` : ''}
          <button id="open-settings">⚙ Réglages d'affichage</button>
          <button id="open-images">🖼 Mes images pour les cartes</button>
          ${a.abandon && g.phase !== 'finished' ? `<button class="danger" id="abandon">Abandonner la partie (maître de jeu)</button>` : ''}
        </div>`;
      break;
    case 'images': {
      const group = (title: string, list: readonly { id: string }[]) =>
        `<h3 class="img-kind">${title}</h3><div class="img-grid">${list
          .map(
            (c) => `<div class="img-slot">${cardHTML(c.id as CardId, { size: 'md', attrs: `data-img="${c.id}"` })}
              ${customImages.has(c.id) ? `<button data-img-del="${c.id}">Remettre le dessin</button>` : '<span class="muted" style="font-size:12px">Touche pour une photo</span>'}</div>`,
          )
          .join('')}</div>`;
      content = `<h2>Mes images</h2>
        <p class="muted">Touche une carte pour choisir une photo (par exemple celles de ta boîte de jeu). Les photos restent sur cet appareil : elles ne sont envoyées nulle part, et les autres joueurs voient leurs propres images.</p>
        <input type="file" accept="image/*" id="img-file" hidden>
        ${group('Suspects', SUSPECTS)}${group('Armes', WEAPONS)}${group('Pièces', ROOMS)}`;
      break;
    }
    default:
      content = '';
  }
  body.innerHTML = content;
  sheet.classList.toggle('open', !!ui.sheet);
  sheet.classList.toggle('locked', ui.sheet === 'refute');
  backdrop.classList.toggle('open', !!ui.sheet);

  // Événements des volets
  body.querySelectorAll<HTMLElement>('[data-pick]').forEach((c) =>
    c.addEventListener('click', () => {
      ui![c.dataset.pick as 'sSus'] = c.dataset.id;
      renderGame(el, o);
    }),
  );
  on(body, 'suggest', () => {
    const { sSus, sWea } = ui!;
    if (!sSus || !sWea) return;
    ui!.sSus = ui!.sWea = undefined;
    ui!.sheet = null;
    o.act({ type: 'suggest', player: me, suspect: sSus as never, weapon: sWea as never });
  });
  on(body, 'accuse', () => {
    if (!confirmInline(body, 'accuse', 'Sûr ? Touche encore pour accuser')) return;
    const { aSus, aWea, aRoo } = ui!;
    ui!.sheet = null;
    o.act({ type: 'accuse', player: me, suspect: aSus as never, weapon: aWea as never, room: aRoo as never });
  });
  body.querySelectorAll<HTMLElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => {
      ui!.sheet = null;
      o.act({ type: 'showCard', player: me, card: b.dataset.show as CardId });
    }),
  );
  on(body, 'exit', () => o.onExit?.run());
  on(body, 'go-home', () => o.onHome?.());
  on(body, 'open-settings', () => {
    ui!.sheet = null;
    renderGame(el, o);
    el.querySelector<HTMLElement>('#settings-panel')!.hidden = false;
  });
  on(body, 'open-images', () => {
    ui!.sheet = 'images';
    renderGame(el, o);
  });
  if (ui.sheet === 'images') {
    const input = body.querySelector<HTMLInputElement>('#img-file')!;
    let target = '';
    body.querySelectorAll<HTMLElement>('[data-img]').forEach((c) =>
      c.addEventListener('click', () => {
        target = c.dataset.img!;
        input.value = '';
        input.click();
      }),
    );
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f && target) setCustomImage(target as CardId, f).catch(() => toast(el, 'Impossible de lire cette image.'));
    });
    body.querySelectorAll<HTMLElement>('[data-img-del]').forEach((b) =>
      b.addEventListener('click', () => void removeCustomImage(b.dataset.imgDel as CardId)),
    );
  }
  on(body, 'abandon', () => {
    if (confirmInline(body, 'abandon', 'Confirmer l’abandon ?')) o.act({ type: 'abandon', player: me });
  });
  body.querySelectorAll<HTMLElement>('[data-nb]').forEach((td) =>
    td.addEventListener('click', () => {
      const cur = MARKS.indexOf(td.textContent ?? '');
      const next = MARKS[(cur + 1) % MARKS.length];
      nb[td.dataset.nb!] = next;
      saveNotebook(nbKey, nb);
      td.textContent = next;
      td.className = `nb-cell ${td.classList.contains('status') ? 'status' : ''} ${next === '✓' ? 'yes' : next === '✗' ? 'no' : next === '?' ? 'maybe' : ''}`;
    }),
  );

  // ---------------- Plateau
  board.update({
    state: g,
    me,
    destinations: dests,
    onPick: (dest) => o.act({ type: 'move', player: me, to: dest.to }),
  });

  // ---------------- Annonces
  const fresh = v.log.slice(ui.seen[me]);
  ui.seen[me] = v.log.length;
  if (!firstRender) announceLog(el, v, fresh, me);
  if (fresh.some((e) => e.type === 'gameOver'))
    setTimeout(() => {
      const u = uiStates.get(el);
      if (u && !u.sheet) {
        u.sheet = 'end';
        rerender(el);
      }
    }, 7000);
  for (const e of fresh) {
    if (e.type === 'cardShown' && e.to === me && e.card) showReveal(el, `${nameOf(v, e.player, me)} te montre :`, e.card);
    else if (e.type === 'cardShown' && e.player === me && e.card) toast(el, `Tu as montré « ${getCard(e.card).name} » à ${nameOf(v, e.to, me)}.`);
    else if (e.type === 'noOneRefuted' && e.player === me) showReveal(el, 'Personne n’a pu répondre à ton hypothèse !', null);
  }
  // Début de tour : « Tour N » (nouveau tour de table) puis « Tour de X »
  if (g.phase !== 'finished' && ui.announcedTurn !== g.turn && g.phase === 'start') {
    ui.announcedTurn = g.turn;
    const newRound = (g.turn - 1) % g.players.length === 0;
    if (newRound) announce(el, `<div class="title gold">${roundOf(g) === 1 ? '1<sup>er</sup> tour' : `Tour ${roundOf(g)}`}</div>`, 1400, 'round');
    const cur = v.players.find((p) => p.id === g.currentPlayer)!;
    const sus = SUSPECTS.find((s) => s.id === cur.suspect)!;
    announce(
      el,
      g.currentPlayer === me
        ? `<div class="avatar-big">${portraitHTML(sus.id)}</div><div class="sub">${sus.name}</div><div class="title">À toi de jouer !</div>`
        : `<div class="avatar-big">${portraitHTML(sus.id)}</div><div class="sub">Tour de</div><div class="title">${esc(cur.name)}</div><div class="sub">${sus.name}</div>`,
      1700,
    );
  }
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
