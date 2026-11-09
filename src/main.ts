// Point d'entrée : petite navigation par l'adresse (#/ accueil, #/test mode test, #/p/CODE partie en ligne).

import './style.css';
import { renderHome, startOnline } from './screens/online';
import { startLocal } from './screens/local';
import { startProto3D } from './screens/proto3d';
import { destroyGameView } from './games/cluedo/ui/gameView';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function go(hash: string) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  cleanup?.();
  cleanup = null;
  destroyGameView(app);
  const hash = location.hash || '#/';
  const room = hash.match(/^#\/p\/([A-Za-z0-9]{5})$/);
  if (room) cleanup = startOnline(app, room[1], go);
  else if (hash === '#/test') startLocal(app, () => go('#/'));
  else if (hash === '#/3d') cleanup = startProto3D(app, () => go('#/'));
  else renderHome(app, go);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
