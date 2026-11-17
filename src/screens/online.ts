// Jeu en ligne : accueil (créer / rejoindre), salon d'attente, partie.

import { SUSPECTS, type SuspectId } from '../games/cluedo/engine';
import { destroyGameView, esc, renderGame } from '../games/cluedo/ui/gameView';
import { portraitHTML } from '../games/cluedo/ui/cards';
import { variantChecked, variantHTML } from './variants';
import { auth, ensureSignedIn, multiTabTest } from '../online/firebase';
import { renderHomeScreen } from './home';
import { mountConversation } from './dm';
import { getProfile, hasAccount, recordGame, watchInbox } from '../online/account';
import { play } from '../games/cluedo/ui/sound';
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
  // Messages privés : non lus par joueur, conversation ouverte
  let unread: Record<string, number> = {};
  let lastAt: Record<string, number> = {};
  let stopInbox: (() => void) | null = null;
  let dmWith: string | null = null;
  let stopDM: (() => void) | null = null;
  let recorded = false;

  const closeDM = () => {
    stopDM?.();
    stopDM = null;
    dmWith = null;
    document.querySelector('.dm-overlay')?.remove();
  };
  const openDM = (other: string) => {
    closeDM();
    const room = lastRoom;
    const p = room?.players[other];
    dmWith = other;
    const ov = document.createElement('div');
    ov.className = 'dm-overlay';
    ov.innerHTML = '<div class="dm-backdrop"></div><div class="dm-sheet"></div>';
    document.body.appendChild(ov);
    ov.querySelector('.dm-backdrop')!.addEventListener('click', closeDM);
    stopDM = mountConversation(ov.querySelector<HTMLElement>('.dm-sheet')!, {
      me: uid,
      other,
      name: p?.name,
      avatar: p?.suspect ?? undefined,
      onClose: closeDM,
    });
  };

  app.innerHTML = '<p class="muted">Connexion…</p>';

  (async () => {
    try {
      const user = await ensureSignedIn();
      uid = user.uid;
      if (stopped) return;
      // Si on arrive par un lien partagé sans avoir encore donné son prénom, on le demande
      let name = savedName();
      if (!name && hasAccount(user)) name = (await getProfile(user.uid))?.name ?? '';
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
      let first = true;
      stopInbox = watchInbox(uid, (entries) => {
        unread = {};
        for (const e of entries) {
          unread[e.other] = e.unread;
          // Nouveau message d'un joueur de la partie, conversation fermée : petite bulle
          if (!first && e.unread > 0 && e.at > (lastAt[e.other] ?? 0) && dmWith !== e.other && lastRoom?.players[e.other]) {
            dmToast(lastRoom.players[e.other].name, e.last, () => openDM(e.other));
          }
          lastAt[e.other] = e.at;
        }
        first = false;
        if (lastRoom?.state) render();
      });
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
      app.querySelector('#home')!.addEventListener('click', () => go('#/cluedo'));
      return;
    }
    if (!room.players[uid]) {
      destroyGameView(app);
      app.innerHTML = `<p>${esc(error || 'Tu ne fais pas partie de cette partie.')}</p><button id="home">← Accueil</button>`;
      app.querySelector('#home')!.addEventListener('click', () => go('#/cluedo'));
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
      onHome: () => go('#/cluedo'),
      act: async (action) => {
        try {
          await sendAction(code, action);
          error = '';
        } catch (e) {
          error = message(e);
          render();
        }
      },
      onExit: { label: 'Retour à l’accueil', run: () => go('#/cluedo') },
      onPlayerTap: openDM,
      unread,
    });
    app.querySelector('#home')?.addEventListener('click', () => go('#/cluedo'));
    // Fin de partie : victoire ou défaite enregistrée dans le compte (une seule fois)
    const st = room.state;
    if (!recorded && st.phase === 'finished' && st.endReason !== 'abandoned' && hasAccount(auth.currentUser)) {
      recorded = true;
      const meP = st.players.find((p) => p.id === uid);
      if (meP) void recordGame(uid, `${code}_${st.solution.suspect}-${st.solution.weapon}-${st.solution.room}`, st.winner === uid, meP.suspect).catch(() => {});
    }
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

    app.querySelector('#home')!.addEventListener('click', () => go('#/cluedo'));
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
      go('#/cluedo');
    });
  };

  return () => {
    stopped = true;
    stopRoom?.();
    stopPresence?.();
    stopInbox?.();
    closeDM();
  };
}

/** Bulle « nouveau message » en haut de l'écran (toucher pour ouvrir la conversation). */
function dmToast(name: string, text: string, open: () => void) {
  play('turn');
  const t = document.createElement('button');
  t.className = 'dm-toast';
  t.innerHTML = `<b>💬 ${esc(name)}</b><span>${esc(text.length > 80 ? text.slice(0, 80) + '…' : text)}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  const hide = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  };
  t.addEventListener('click', () => {
    hide();
    open();
  });
  setTimeout(hide, 5000);
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
