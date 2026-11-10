// Point d'entrée : petite navigation par l'adresse (#/ accueil, #/test mode test, #/p/CODE partie en ligne).

import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/600.css';
import './style.css';
import { setupAudioUnlock } from './games/cluedo/ui/sound';
import { applyCharteCss } from './theme/charte';
import './pwa';
import { renderHome, startOnline } from './screens/online';
import { startLocal } from './screens/local';
import { destroyGameView } from './games/cluedo/ui/gameView';

applyCharteCss();
setupAudioUnlock();
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
  else renderHome(app, go);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
