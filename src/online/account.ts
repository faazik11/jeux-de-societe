// Comptes joueurs : connexion (Google ou e-mail), profil, amis, messages privés et statistiques.
//
// Organisation dans la base :
//   users/{uid}            profil public : name, avatar (suspect préféré), friendCode, stats
//   friendCodes/{code}     uid du joueur qui a ce code d'ami
//   friendRequests/{to}/{from}  demande d'ami en attente
//   friends/{uid}/{ami}    true
//   dm/{uidA_uidB}/{id}    messages privés entre deux joueurs (clé = uids triés)
//   inbox/{uid}/{autre}    résumé de chaque conversation : dernier message, heure, non lus

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  signInWithCredential,
  signInWithRedirect,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  get,
  increment,
  limitToLast,
  onValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { auth, db } from './firebase';

export interface Profile {
  name: string;
  avatar: string;
  friendCode: string;
  stats?: Stats;
}
export interface Stats {
  played: number;
  wins: number;
  losses: number;
  /** Victoires par personnage joué. */
  winsBy?: Record<string, number>;
}
export interface DirectMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}
export interface InboxEntry {
  other: string;
  last: string;
  at: number;
  unread: number;
}

/** Vrai si l'utilisateur a un vrai compte (pas seulement une session anonyme). */
export const hasAccount = (u: User | null): u is User => !!u && !u.isAnonymous;

export function onUser(fn: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth, fn);
}

// ---------------------------------------------------------------- connexion

/**
 * Connexion Google. Si le joueur jouait en invité, son compte garde le même identifiant
 * (il reste dans ses parties). Si ce compte Google existe déjà, on s'y connecte simplement.
 */
export async function signInGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cur = auth.currentUser;
  try {
    if (cur?.isAnonymous) {
      try {
        return (await linkWithPopup(cur, provider)).user;
      } catch (e) {
        if (code(e) !== 'auth/credential-already-in-use') throw e;
      }
    }
    return (await signInWithPopup(auth, provider)).user;
  } catch (e) {
    // Fenêtre bloquée ou impossible (appli installée sur iPhone…) : on passe par une redirection
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code(e))) {
      if (cur?.isAnonymous) await linkWithRedirect(cur, provider);
      else await signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

/** Au retour d'une connexion par redirection : crée le profil si besoin. */
export async function finishRedirect(): Promise<void> {
  try {
    const res = await getRedirectResult(auth);
    if (res?.user) await ensureProfile(res.user);
  } catch (e) {
    if (code(e) === 'auth/credential-already-in-use') {
      const cred = GoogleAuthProvider.credentialFromError(e as never);
      if (cred) await ensureProfile((await signInWithCredential(auth, cred)).user);
    } else console.warn(e);
  }
}

export async function signUpEmail(email: string, password: string, name: string): Promise<User> {
  const cur = auth.currentUser;
  let user: User;
  if (cur?.isAnonymous) user = (await linkWithCredential(cur, EmailAuthProvider.credential(email, password))).user;
  else user = (await createUserWithEmailAndPassword(auth, email, password)).user;
  await updateProfile(user, { displayName: name });
  await ensureProfile(user, name);
  return user;
}

export async function signInEmail(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);

/** Message d'erreur lisible pour les erreurs de connexion. */
export function authError(e: unknown): string {
  switch (code(e)) {
    case 'auth/invalid-email': return 'Adresse e-mail invalide.';
    case 'auth/missing-password':
    case 'auth/weak-password': return 'Le mot de passe doit faire au moins 6 caractères.';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use': return 'Un compte existe déjà avec cette adresse : connecte-toi.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'E-mail ou mot de passe incorrect.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Connexion annulée.';
    case 'auth/popup-blocked': return 'La fenêtre de connexion a été bloquée par le navigateur.';
    case 'auth/operation-not-allowed': return 'Ce mode de connexion n’est pas encore activé dans Firebase.';
    case 'auth/unauthorized-domain': return 'Ce site n’est pas autorisé dans Firebase (domaines autorisés).';
    case 'auth/argument-error': return 'Erreur de configuration de la connexion. Recharge la page et réessaie.';
    case 'auth/too-many-requests': return 'Trop d’essais : réessaie dans quelques minutes.';
    case 'auth/network-request-failed': return 'Pas de connexion internet.';
    default: return e instanceof Error ? e.message : String(e);
  }
}
function code(e: unknown): string {
  return (e as { code?: string })?.code ?? '';
}

// ---------------------------------------------------------------- profil

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** Crée le profil au premier passage (avec un code d'ami unique). */
export async function ensureProfile(user: User, name?: string): Promise<Profile> {
  const snap = await get(ref(db, `users/${user.uid}`));
  if (snap.exists() && snap.val().friendCode) return snap.val() as Profile;
  let friendCode = '';
  for (let i = 0; i < 6 && !friendCode; i++) {
    const c = randomCode();
    const res = await runTransaction(ref(db, `friendCodes/${c}`), (cur) => (cur === null ? user.uid : undefined));
    if (res.committed) friendCode = c;
  }
  const profile: Profile = {
    name: (name || user.displayName || 'Joueur').slice(0, 20),
    avatar: 'rouge',
    friendCode,
  };
  await update(ref(db, `users/${user.uid}`), profile);
  return profile;
}

export function watchProfile(uid: string, fn: (p: Profile | null) => void): () => void {
  return onValue(ref(db, `users/${uid}`), (s) => fn(s.val() as Profile | null));
}

export async function getProfile(uid: string): Promise<Profile | null> {
  return (await get(ref(db, `users/${uid}`))).val() as Profile | null;
}

export async function saveProfile(uid: string, p: Partial<Pick<Profile, 'name' | 'avatar'>>) {
  await update(ref(db, `users/${uid}`), p);
}

// ---------------------------------------------------------------- amis

export async function sendFriendRequest(me: string, friendCode: string): Promise<string> {
  const code = friendCode.trim().toUpperCase();
  const uid = (await get(ref(db, `friendCodes/${code}`))).val() as string | null;
  if (!uid) throw new Error('Aucun joueur avec ce code.');
  if (uid === me) throw new Error('C’est ton propre code 😄');
  // Si l'autre m'a déjà demandé, on accepte directement
  if ((await get(ref(db, `friendRequests/${me}/${uid}`))).exists()) {
    await acceptFriend(me, uid);
    return 'Vous êtes maintenant amis !';
  }
  await set(ref(db, `friendRequests/${uid}/${me}`), true);
  return 'Demande envoyée.';
}

export async function acceptFriend(me: string, other: string) {
  await update(ref(db), {
    [`friends/${me}/${other}`]: true,
    [`friends/${other}/${me}`]: true,
    [`friendRequests/${me}/${other}`]: null,
  });
}
export const declineFriend = (me: string, other: string) => remove(ref(db, `friendRequests/${me}/${other}`));
export async function removeFriend(me: string, other: string) {
  await update(ref(db), { [`friends/${me}/${other}`]: null, [`friends/${other}/${me}`]: null });
}

export function watchFriends(me: string, fn: (friends: string[], requests: string[]) => void): () => void {
  let friends: string[] = [];
  let requests: string[] = [];
  const a = onValue(ref(db, `friends/${me}`), (s) => {
    friends = Object.keys(s.val() ?? {});
    fn(friends, requests);
  });
  const b = onValue(ref(db, `friendRequests/${me}`), (s) => {
    requests = Object.keys(s.val() ?? {});
    fn(friends, requests);
  });
  return () => {
    a();
    b();
  };
}

// ---------------------------------------------------------------- messages privés

export const pairKey = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export async function sendDM(me: string, other: string, text: string) {
  const t = text.trim().slice(0, 500);
  if (!t) return;
  await push(ref(db, `dm/${pairKey(me, other)}`), { from: me, text: t, at: serverTimestamp() });
  await update(ref(db), {
    [`inbox/${other}/${me}/last`]: t,
    [`inbox/${other}/${me}/at`]: serverTimestamp(),
    [`inbox/${other}/${me}/unread`]: increment(1),
    [`inbox/${me}/${other}/last`]: t,
    [`inbox/${me}/${other}/at`]: serverTimestamp(),
    [`inbox/${me}/${other}/unread`]: 0,
  });
}

export function watchDM(me: string, other: string, fn: (msgs: DirectMessage[]) => void): () => void {
  return onValue(query(ref(db, `dm/${pairKey(me, other)}`), limitToLast(200)), (s) => {
    const out: DirectMessage[] = [];
    s.forEach((c) => {
      out.push({ id: c.key!, ...(c.val() as Omit<DirectMessage, 'id'>) });
    });
    fn(out);
  });
}

export const markRead = (me: string, other: string) => set(ref(db, `inbox/${me}/${other}/unread`), 0);

export function watchInbox(me: string, fn: (entries: InboxEntry[]) => void): () => void {
  return onValue(ref(db, `inbox/${me}`), (s) => {
    const v = (s.val() ?? {}) as Record<string, Omit<InboxEntry, 'other'>>;
    fn(
      Object.entries(v)
        .map(([other, e]) => ({ other, last: e.last ?? '', at: e.at ?? 0, unread: e.unread ?? 0 }))
        .sort((a, b) => b.at - a.at),
    );
  });
}

// ---------------------------------------------------------------- statistiques

/** Enregistre une partie terminée (une seule fois par partie, grâce à la clé de la partie). */
export async function recordGame(uid: string, gameKey: string, won: boolean, suspect: string) {
  const done = await runTransaction(ref(db, `users/${uid}/games/${gameKey}`), (cur) => (cur === null ? (won ? 'win' : 'loss') : undefined));
  if (!done.committed) return;
  await update(ref(db, `users/${uid}/stats`), {
    played: increment(1),
    wins: increment(won ? 1 : 0),
    losses: increment(won ? 0 : 1),
    [`winsBy/${suspect}`]: increment(won ? 1 : 0),
  });
}
