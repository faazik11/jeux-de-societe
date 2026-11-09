// Connexion à Firebase (projet « jeux-de-societe »).
// Ces informations ne sont pas secrètes : la sécurité vient des règles de la base de données
// (voir database.rules.json), qui n'autorisent que les joueurs connectés.

import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyDAmPMAqNNNxBFIuDGmh0v2aacoQ-tub_o',
  authDomain: 'jeux-de-societe-68d05.firebaseapp.com',
  databaseURL: 'https://jeux-de-societe-68d05-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'jeux-de-societe-68d05',
  storageBucket: 'jeux-de-societe-68d05.firebasestorage.app',
  messagingSenderId: '715926987796',
  appId: '1:715926987796:web:f58fea5a6f8818509a7301',
};

export const app = initializeApp(firebaseConfig);
/**
 * Normalement, un appareil = un joueur (identité gardée même après fermeture).
 * Avec « ?multi » dans l'adresse, chaque onglet devient un joueur différent :
 * pratique pour tester une partie à plusieurs sur un seul ordinateur.
 */
export const multiTabTest = new URLSearchParams(location.search).has('multi');
export const auth = initializeAuth(app, {
  persistence: multiTabTest ? browserSessionPersistence : browserLocalPersistence,
});
export const db = getDatabase(app);

/** Connexion anonyme : chaque appareil reçoit un identifiant stable, sans créer de compte. */
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((e) => {
      stop();
      reject(e);
    });
  });
}
