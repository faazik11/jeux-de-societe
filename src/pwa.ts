// Installation de l'appli sur l'écran d'accueil.
// - Android / ordinateur (Chrome, Edge) : le navigateur propose l'installation, on garde l'événement
//   pour l'afficher au moment où le joueur clique sur « Installer l'appli ».
// - iPhone / iPad (Safari) : pas d'installation automatique, on explique la marche à suivre.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((fn) => fn());
});

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Affiche le bloc « Installer l'appli » dans `el` (rien si l'appli est déjà installée). */
export function renderInstall(el: HTMLElement) {
  const draw = () => {
    if (isInstalled()) {
      el.innerHTML = '';
      return;
    }
    if (deferred) {
      el.innerHTML = `<div class="panel install"><b>📲 Installe l'appli</b>
        <p class="muted">Icône sur ton écran d'accueil, plein écran, sans la barre du navigateur.</p>
        <button class="primary" id="install-btn">Installer l'appli</button></div>`;
      el.querySelector('#install-btn')!.addEventListener('click', async () => {
        const ev = deferred;
        if (!ev) return;
        await ev.prompt();
        await ev.userChoice;
        deferred = null;
        draw();
      });
    } else if (isIOS()) {
      el.innerHTML = `<div class="panel install"><b>📲 Installe l'appli sur ton iPhone</b>
        <ol class="muted"><li>Ouvre ce site dans <b>Safari</b></li>
        <li>Touche le bouton <b>Partager</b> (le carré avec une flèche ↑)</li>
        <li>Choisis <b>« Sur l'écran d'accueil »</b></li></ol></div>`;
    } else {
      el.innerHTML = '';
    }
  };
  listeners.add(draw);
  draw();
}
