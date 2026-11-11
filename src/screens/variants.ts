// Variantes de règles choisies par le maître de jeu avant de lancer la partie (mémorisées sur l'appareil).

const KEY = 'jds:variant:weaponInRoom';

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function variantHTML(): string {
  return `<div class="panel variant">
    <label class="opt"><input type="checkbox" id="v-weapon" ${saved() ? 'checked' : ''}>
      <span><b>Variante : l'arme de la pièce</b><br><span class="muted">L'hypothèse se fait avec l'arme qui se trouve dans la pièce. Pièce sans arme : on en choisit une, qui y est apportée.</span></span></label>
  </div>`;
}

export function variantChecked(root: HTMLElement): boolean {
  const v = root.querySelector<HTMLInputElement>('#v-weapon')?.checked ?? false;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch { /* ignore */ }
  return v;
}
