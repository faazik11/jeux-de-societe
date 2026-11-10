// Réglages d'affichage, propres à chaque appareil (gardés dans le navigateur).

export interface DisplaySettings {
  /** Plateau en vraie 3D, ou en 2.5D (plus léger pour les vieux téléphones). */
  board: '3d' | '2.5d';
  /** Vitesse des animations. */
  speed: 'normal' | 'fast';
  /** Jouer les mises en scène (hypothèses, accusations…). */
  cinematics: boolean;
  /** Caméra de dos pendant les déplacements (sinon suivi doux vu de haut). */
  backCam: boolean;
}

const KEY = 'jds:display';
const DEFAULTS: DisplaySettings = { board: '3d', speed: 'normal', cinematics: true, backCam: false };

export function loadSettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: DisplaySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* navigation privée : les réglages ne seront pas gardés */
  }
}

/** Le navigateur sait-il afficher de la 3D (WebGL) ? */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
