// Jeu en ligne : accueil (créer / rejoindre), salon d'attente, partie.

import { SUSPECTS, type SuspectId } from '../games/cluedo/engine';
import { destroyGameView, esc, renderGame } from '../games/cluedo/ui/gameView';
import { portraitHTML } from '../games/cluedo/ui/cards';
import { variantChecked, variantHTML } from './variants';
import { ensureSignedIn, multiTabTest } from '../online/firebase';
import { renderHomeScreen } from './home';
import {
  chooseSuspect,
  disconnectedPlayers,
  joinRoom,
  leaveRoom,
  normalizeCode,
  sendAction,
  startGame,
  subscribeRoom,
  trackPresence,
  type Room,
} from '../online/rooms';

const NAME_KEY = 'jds:name';
const storage = () => (multiTabTest ? sessionStorage : localStorage);
const store = {
  get: (k: string) => {
    try { return storage().getItem(k); } catch { return null; }
  },
  set: (k: string, v: string) => {
    try { storage().setItem(k, v); } catch { /* navigation privée : tant pis */ }
  },
};

export function savedName(): string {
  return store.get(NAME_KEY) ?? '';
}

const LAST_KEY = 'jds:lastRoom';

/** Écran d'accueil (galerie des suspects + menu). */
export function renderHome(app: HTMLElement, go: (hash: string) => void, error = '') {
  renderHomeScreen(app, {
    go,
    getName: savedName,
    setName: (n) => store.set(NAME_KEY, n),
    lastRoom: () => store.get(LAST_KEY),
    forgetRoom: () => {
      try { storage().removeItem(LAST_KEY); } catch { /* ignore */ }
    },
    message,
  }, error);
}

function message(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/permission/i.test(m)) return "Action refusée par le serveur (droits d'accès).";
  if (/network|offline/i.test(m)) return 'Pas de connexion internet.';
  return m;
}

/** Salon + partie en ligne. Renvoie une fonction pour tout arrêter en quittant l'écran. */
export function startOnline(app: HTMLElement, rawCode: string, go: (hash: string) => void): () => void {
  const code = normalizeCode(rawCode);
  let stopRoom: (() => void) | null = null;
  let stopPresence: (() => void) | null = null;
  let stopped = false;
  let error = '';
  let lastRoom: Room | null = null;
  let uid = '';

  app.innerHTML = '<p class="muted">Connexion…</p>';

  (async () => {
    try {
      const user = await ensureSignedIn();
      uid = user.uid;
      if (stopped) return;
      // Si on arrive par un lien partagé sans avoir encore donné son prénom, on le demande
      let name = savedName();
      if (!name) name = await askName(app);
      if (stopped) return;
      try {
        await joinRoom(uid, code, name);
      } catch (e) {
        // La partie a commencé sans nous, ou n'existe pas : on l'affichera dans render()
        error = message(e);
      }
      if (stopped) return;
      stopPresence = trackPresence(uid, code);
      store.set(LAST_KEY, code);
      stopRoom = subscribeRoom(code, (room) => {
        lastRoom = room;
        render();
      });
    } catch (e) {
      renderHome(app, go, message(e));
    }
  })();

  const render = () => {
    const room = lastRoom;
    if (!room) {
      destroyGameView(app);
      app.innerHTML = `<p>Aucune partie avec le code <b>${esc(code)}</b>.</p><button id="home">← Accueil</button>`;
      app.querySelector('#home')!.addEventListener('click', () => go('#/'));
      return;
    }
    if (!room.players[uid]) {
      destroyGameView(app);
      app.innerHTML = `<p>${esc(error || 'Tu ne fais pas partie de cette partie.')}</p><button id="home">← Accueil</button>`;
      app.querySelector('#home')!.addEventListener('click', () => go('#/'));
      return;
    }
    if (room.status === 'lobby' || !room.state) return renderLobby(room);

    const offline = disconnectedPlayers(room).map((id) => room.players[id]?.name ?? '?');
    renderGame(app, {
      state: room.state,
      me: uid,
      error,
      pausedBy: offline,
      banner: `<p class="muted">Partie <b>${esc(code)}</b> · partage ce code pour inviter.</p>`,
      onHome: () => go('#/'),
      act: async (action) => {
        try {
          await sendAction(code, action);
          error = '';
        } catch (e) {
          error = message(e);
          render();
        }
      },
      onExit: { label: 'Retour à l’accueil', run: () => go('#/') },
    });
    app.querySelector('#home')?.addEventListener('click', () => go('#/'));
  };

  const renderLobby = (room: Room) => {
    destroyGameView(app);
    const isHost = room.hostUid === uid;
    const entries = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
    const taken = new Map(entries.map(([id, p]) => [p.suspect, id]));
    const mine = room.players[uid].suspect;
    const shareUrl = `${location.origin}${location.pathname}${location.search}#/p/${code}`;
    const dupes = entries.length !== new Set(entries.map(([, p]) => p.suspect)).size;

    app.innerHTML = `
      <div class="row"><button id="home">← Accueil</button></div>
      <h1>Salon d'attente</h1>
      <div class="panel" style="text-align:center">
        <p class="muted">Code de la partie</p>
        <div style="font-size:2.4rem;letter-spacing:8px;font-weight:700;color:var(--accent)">${esc(code)}</div>
        <div class="row" style="justify-content:center"><button id="share">Partager le lien</button></div>
        <div class="muted" id="shareMsg"></div>
      </div>
      <div class="panel">
        <h2>Joueurs (${entries.length}/6)</h2>
        ${entries.map(([id, p]) => {
          const s = SUSPECTS.find((x) => x.id === p.suspect);
          const online = room.presence[id] === true;
          return `<div class="row" style="margin:4px 0">
            ${s ? `<span class="who-portrait">${portraitHTML(s.id)}</span>` : `<span class="who" style="background:#555"></span>`}
            <b>${esc(p.name)}</b>${id === uid ? ' (toi)' : ''}
            <span class="muted">${s ? s.name : 'pas de personnage'}${id === room.hostUid ? ' · maître de jeu' : ''}${online ? '' : ' · hors ligne'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="panel">
        <h2>Ton personnage</h2>
        <div class="sus-pick">${SUSPECTS.map((s) => {
          const owner = taken.get(s.id);
          const disabled = owner && owner !== uid;
          return `<button class="sus-tile ${mine === s.id ? 'mine' : ''}" data-sus="${s.id}" ${disabled ? 'disabled' : ''} style="--c:${s.color}">
            ${portraitHTML(s.id)}<span class="sus-title">${s.title}</span><span class="sus-name">${s.surname}</span>${disabled ? '<span class="sus-taken">pris</span>' : ''}</button>`;
        }).join('')}</div>
      </div>
      <div class="error">${esc(error)}</div>
      ${isHost ? variantHTML() : ''}
      ${isHost
        ? `<button class="primary" id="start" ${entries.length < 2 || dupes ? 'disabled' : ''}>Lancer la partie</button>
           <p class="muted">${entries.length < 2 ? 'Il faut au moins 2 joueurs.' : dupes ? 'Deux joueurs ont le même personnage.' : 'Tout le monde est là ? Lance la partie !'}</p>`
        : '<p class="muted">En attente du maître de jeu pour lancer la partie…</p>'}
      <div class="row"><button class="danger" id="leave">Quitter le salon</button></div>`;

    app.querySelector('#home')!.addEventListener('click', () => go('#/'));
    app.querySelector('#share')!.addEventListener('click', async () => {
      const msg = app.querySelector('#shareMsg')!;
      try {
        if (navigator.share) await navigator.share({ title: 'Rejoins ma partie', text: `Code : ${code}`, url: shareUrl });
        else {
          await navigator.clipboard.writeText(shareUrl);
          msg.textContent = 'Lien copié !';
        }
      } catch {
        msg.textContent = shareUrl;
      }
    });
    app.querySelectorAll<HTMLButtonElement>('[data-sus]').forEach((b) =>
      b.addEventListener('click', () => chooseSuspect(uid, code, b.dataset.sus as SuspectId).catch((e) => { error = message(e); render(); })),
    );
    app.querySelector('#start')?.addEventListener('click', async () => {
      try {
        error = '';
        await startGame(uid, room, { weaponInRoom: variantChecked(app) });
      } catch (e) {
        error = message(e);
        render();
      }
    });
    app.querySelector('#leave')!.addEventListener('click', async () => {
      await leaveRoom(uid, code).catch(() => {});
      go('#/');
    });
  };

  return () => {
    stopped = true;
    stopRoom?.();
    stopPresence?.();
  };
}

function askName(app: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <h1>🔎 Enquête</h1>
      <div class="panel">
        <h2>Ton prénom pour rejoindre la partie</h2>
        <div class="row"><input id="n" maxlength="20" placeholder="Ton prénom" style="flex:1" />
        <button class="primary" id="ok">Rejoindre</button></div>
      </div>`;
    const input = app.querySelector<HTMLInputElement>('#n')!;
    const submit = () => {
      const n = input.value.trim();
      if (!n) return input.focus();
      store.set(NAME_KEY, n);
      resolve(n);
    };
    app.querySelector('#ok')!.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    input.focus();
  });
}
