// Écrans « Mon compte » (#/compte) et « Messages » (#/messages, #/messages/UID).

import type { User } from 'firebase/auth';
import { SUSPECTS, type CardId } from '../games/cluedo/engine';
import { portraitHTML } from '../games/cluedo/ui/cards';
import {
  acceptFriend,
  authError,
  declineFriend,
  ensureProfile,
  getProfile,
  hasAccount,
  logOut,
  onUser,
  removeFriend,
  resetPassword,
  saveProfile,
  sendFriendRequest,
  signInEmail,
  signInGoogle,
  signUpEmail,
  watchFriends,
  watchInbox,
  watchProfile,
  type InboxEntry,
  type Profile,
} from '../online/account';
import { ensureSignedIn } from '../online/firebase';
import { mountConversation } from './dm';

type Go = (hash: string) => void;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Petit cache des profils des autres joueurs (nom + portrait). */
const profiles = new Map<string, Promise<Profile | null>>();
const profileOf = (uid: string) => {
  if (!profiles.has(uid)) profiles.set(uid, getProfile(uid));
  return profiles.get(uid)!;
};

function frame(title: string, back: string, body: string) {
  return `<div class="acc">
    <div class="acc-head"><button class="home-back acc-back" data-go="${back}">‹ Retour</button><h1>${title}</h1></div>
    <div class="acc-body">${body}</div></div>`;
}

// ====================================================================== Mon compte

export function startAccount(app: HTMLElement, go: Go): () => void {
  let stops: (() => void)[] = [];
  const clear = () => {
    stops.forEach((s) => s());
    stops = [];
  };
  const stopUser = onUser((u) => {
    clear();
    if (hasAccount(u)) showProfile(u);
    else showLogin();
  });

  const bindBack = () => app.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go!)));

  // ---------------- Connexion / création de compte
  function showLogin(mode: 'login' | 'signup' = 'login', msg = '') {
    app.innerHTML = frame(
      'Mon compte',
      '#/',
      `<div class="panel acc-intro">
        <p>Un compte te permet d'<b>ajouter des amis</b>, de leur <b>envoyer des messages privés</b> et de garder tes <b>victoires et défaites</b>.</p>
        <p class="muted">Sans compte, tu peux toujours jouer en invité.</p>
      </div>
      <button class="acc-google" id="google"><svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6C6.6 42.6 14.6 48 24 48z"/></svg>Continuer avec Google</button>
      <div class="acc-or"><span>ou avec ton e-mail</span></div>
      <div class="acc-tabs"><button class="${mode === 'login' ? 'on' : ''}" data-mode="login">Se connecter</button><button class="${mode === 'signup' ? 'on' : ''}" data-mode="signup">Créer un compte</button></div>
      <form class="acc-form" id="form">
        ${mode === 'signup' ? `<label>Pseudo<input id="f-name" maxlength="20" required autocomplete="nickname"></label>` : ''}
        <label>E-mail<input id="f-email" type="email" required autocomplete="email"></label>
        <label>Mot de passe<input id="f-pass" type="password" minlength="6" required autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>
        <div class="error" id="err">${esc(msg)}</div>
        <button class="home-btn primary" type="submit">${mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</button>
        ${mode === 'login' ? '<button type="button" class="acc-link" id="forgot">Mot de passe oublié ?</button>' : ''}
      </form>`,
    );
    bindBack();
    const err = app.querySelector<HTMLElement>('#err')!;
    const busy = (b: boolean) => app.querySelectorAll<HTMLButtonElement>('button').forEach((x) => (x.disabled = b));
    app.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => showLogin(b.dataset.mode as 'login' | 'signup')));
    app.querySelector('#google')!.addEventListener('click', async () => {
      busy(true);
      try {
        await ensureSignedIn();
        const u = await signInGoogle();
        await ensureProfile(u);
      } catch (e) {
        err.textContent = authError(e);
        busy(false);
      }
    });
    app.querySelector('#forgot')?.addEventListener('click', async () => {
      const email = app.querySelector<HTMLInputElement>('#f-email')!.value.trim();
      if (!email) {
        err.textContent = 'Écris ton e-mail, puis touche « Mot de passe oublié ».';
        return;
      }
      try {
        await resetPassword(email);
        err.innerHTML = '<span class="ok">E-mail envoyé : suis le lien pour choisir un nouveau mot de passe.</span>';
      } catch (e) {
        err.textContent = authError(e);
      }
    });
    app.querySelector<HTMLFormElement>('#form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = app.querySelector<HTMLInputElement>('#f-email')!.value.trim();
      const pass = app.querySelector<HTMLInputElement>('#f-pass')!.value;
      busy(true);
      try {
        if (mode === 'signup') {
          await ensureSignedIn();
          await signUpEmail(email, pass, app.querySelector<HTMLInputElement>('#f-name')!.value.trim());
        } else {
          const u = await signInEmail(email, pass);
          await ensureProfile(u);
        }
      } catch (e2) {
        err.textContent = authError(e2);
        busy(false);
      }
    });
  }

  // ---------------- Profil, amis, statistiques
  function showProfile(u: User) {
    app.innerHTML = frame('Mon compte', '#/', '<p class="muted">Chargement…</p>');
    bindBack();
    let profile: Profile | null = null;
    let friends: string[] = [];
    let requests: string[] = [];
    let note = '';
    void ensureProfile(u);

    const draw = async () => {
      if (!profile) return;
      const p = profile;
      const st = p.stats ?? { played: 0, wins: 0, losses: 0 };
      const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
      const fav = Object.entries(st.winsBy ?? {}).sort((a, b) => b[1] - a[1])[0];
      const people = async (ids: string[]) => Promise.all(ids.map(async (id) => ({ id, p: await profileOf(id) })));
      const [fr, rq] = await Promise.all([people(friends), people(requests)]);
      const scroll = app.querySelector('.acc')?.scrollTop ?? 0;
      app.innerHTML = frame(
        'Mon compte',
        '#/',
        `<div class="panel acc-card">
          <span class="acc-avatar">${portraitHTML(p.avatar as CardId)}</span>
          <div><div class="acc-name">${esc(p.name)}</div><div class="muted">${esc(u.email ?? '')}</div></div>
        </div>

        <div class="panel">
          <h2>Statistiques</h2>
          <div class="acc-stats">
            <div><b>${st.played}</b><span>parties</span></div>
            <div><b>${st.wins}</b><span>victoires</span></div>
            <div><b>${st.losses}</b><span>défaites</span></div>
            <div><b>${rate}%</b><span>réussite</span></div>
          </div>
          ${fav && fav[1] > 0 ? `<p class="muted">Ton personnage porte-bonheur : <b>${SUSPECTS.find((s) => s.id === fav[0])?.name ?? fav[0]}</b> (${fav[1]} victoire${fav[1] > 1 ? 's' : ''}).</p>` : '<p class="muted">Termine une partie en ligne pour commencer tes statistiques.</p>'}
        </div>

        <div class="panel">
          <h2>Amis</h2>
          <div class="acc-code">Ton code d'ami : <b>${esc(p.friendCode)}</b> <button id="copy">Copier</button></div>
          <form class="row acc-add" id="add"><input id="f-friend" maxlength="6" placeholder="CODE AMI" class="code-input"><button class="primary" type="submit">Ajouter</button></form>
          <div class="muted" id="note">${esc(note)}</div>
          ${rq.length ? `<h3>Demandes reçues</h3>${rq.map((r) => `<div class="acc-person"><span class="acc-mini">${portraitHTML((r.p?.avatar ?? 'rouge') as CardId)}</span><b>${esc(r.p?.name ?? 'Joueur')}</b><span class="grow"></span><button class="primary" data-accept="${r.id}">Accepter</button><button data-decline="${r.id}">✕</button></div>`).join('')}` : ''}
          ${fr.length
            ? fr.map((f) => `<div class="acc-person"><span class="acc-mini">${portraitHTML((f.p?.avatar ?? 'rouge') as CardId)}</span><b>${esc(f.p?.name ?? 'Joueur')}</b><span class="grow"></span><button class="primary" data-go="#/messages/${f.id}">💬</button><button data-remove="${f.id}" title="Retirer">✕</button></div>`).join('')
            : '<p class="muted">Pas encore d’amis : donne ton code à tes amis, ou ajoute le leur.</p>'}
        </div>

        <div class="panel">
          <h2>Profil</h2>
          <label class="home-label">Pseudo<input id="f-name" maxlength="20" value="${esc(p.name)}"></label>
          <p class="muted">Personnage préféré (ton portrait) :</p>
          <div class="acc-avatars">${SUSPECTS.map((s) => `<button class="${p.avatar === s.id ? 'on' : ''}" data-avatar="${s.id}" title="${s.name}">${portraitHTML(s.id)}</button>`).join('')}</div>
          <button class="home-btn" id="save">Enregistrer</button>
        </div>

        <button class="home-btn" id="logout">Se déconnecter</button>`,
      );
      app.querySelector('.acc')!.scrollTop = scroll;
      bindBack();
      app.querySelector('#copy')!.addEventListener('click', () => void navigator.clipboard?.writeText(p.friendCode));
      app.querySelector<HTMLFormElement>('#add')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          note = await sendFriendRequest(u.uid, app.querySelector<HTMLInputElement>('#f-friend')!.value);
        } catch (e2) {
          note = e2 instanceof Error ? e2.message : String(e2);
        }
        void draw();
      });
      app.querySelectorAll<HTMLElement>('[data-accept]').forEach((b) => b.addEventListener('click', () => void acceptFriend(u.uid, b.dataset.accept!)));
      app.querySelectorAll<HTMLElement>('[data-decline]').forEach((b) => b.addEventListener('click', () => void declineFriend(u.uid, b.dataset.decline!)));
      app.querySelectorAll<HTMLElement>('[data-remove]').forEach((b) =>
        b.addEventListener('click', () => {
          if (confirmRemove(b)) void removeFriend(u.uid, b.dataset.remove!);
        }),
      );
      let avatar = p.avatar;
      app.querySelectorAll<HTMLElement>('[data-avatar]').forEach((b) =>
        b.addEventListener('click', () => {
          avatar = b.dataset.avatar!;
          app.querySelectorAll('[data-avatar]').forEach((x) => x.classList.toggle('on', x === b));
        }),
      );
      app.querySelector('#save')!.addEventListener('click', async () => {
        const name = app.querySelector<HTMLInputElement>('#f-name')!.value.trim();
        if (name) await saveProfile(u.uid, { name, avatar });
        try {
          localStorage.setItem('jds:name', name);
        } catch { /* ignore */ }
      });
      app.querySelector('#logout')!.addEventListener('click', () => void logOut());
    };

    stops.push(
      watchProfile(u.uid, (p) => {
        profile = p;
        void draw();
      }),
      watchFriends(u.uid, (f, r) => {
        friends = f;
        requests = r;
        void draw();
      }),
    );
  }

  return () => {
    clear();
    stopUser();
  };
}

/** Double toucher pour retirer un ami (évite les erreurs). */
function confirmRemove(b: HTMLElement): boolean {
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.textContent = 'Retirer ?';
  setTimeout(() => {
    delete b.dataset.armed;
    b.textContent = '✕';
  }, 2500);
  return false;
}

// ====================================================================== Messages

export function startMessages(app: HTMLElement, go: Go, other?: string): () => void {
  let stop: (() => void) | null = null;
  const stopUser = onUser((u) => {
    stop?.();
    stop = null;
    if (!hasAccount(u)) {
      app.innerHTML = frame('Messages', '#/', `<div class="panel"><p>Crée un compte pour envoyer des messages privés à tes amis.</p><button class="home-btn primary" data-go="#/compte">Créer un compte</button></div>`);
      app.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go!)));
      return;
    }
    if (other) {
      app.innerHTML = '<div class="acc acc-chat" id="chat"></div>';
      stop = mountConversation(app.querySelector<HTMLElement>('#chat')!, { me: u.uid, other, onClose: () => go('#/messages'), closeLabel: '‹' });
      return;
    }
    let inbox: InboxEntry[] = [];
    let friends: string[] = [];
    const draw = async () => {
      const ids = [...inbox.map((e) => e.other), ...friends.filter((f) => !inbox.some((e) => e.other === f))];
      const rows = await Promise.all(ids.map(async (id) => ({ id, p: await profileOf(id), e: inbox.find((x) => x.other === id) })));
      app.innerHTML = frame(
        'Messages',
        '#/',
        rows.length
          ? `<div class="msg-list">${rows
              .map(
                (r) => `<button class="msg-row" data-go="#/messages/${r.id}">
                  <span class="acc-mini">${portraitHTML((r.p?.avatar ?? 'rouge') as CardId)}</span>
                  <span class="msg-mid"><b>${esc(r.p?.name ?? 'Joueur')}</b><span class="muted">${r.e ? esc(r.e.last) : 'Nouvelle conversation'}</span></span>
                  ${r.e?.unread ? `<span class="badge">${r.e.unread}</span>` : ''}
                </button>`,
              )
              .join('')}</div>`
          : `<div class="panel"><p>Aucune conversation.</p><p class="muted">Ajoute des amis depuis « Mon compte », ou touche le portrait d'un joueur pendant une partie pour lui écrire.</p><button class="home-btn" data-go="#/compte">Mon compte</button></div>`,
      );
      app.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go!)));
    };
    const a = watchInbox(u.uid, (e) => {
      inbox = e;
      void draw();
    });
    const b = watchFriends(u.uid, (f) => {
      friends = f;
      void draw();
    });
    stop = () => {
      a();
      b();
    };
  });
  return () => {
    stop?.();
    stopUser();
  };
}
