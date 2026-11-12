// Accueil : galerie des suspects qui défile, puis le menu.

import { SUSPECTS } from '../games/cluedo/engine';
import { cardImage, portraitHTML } from '../games/cluedo/ui/cards';
import { audioPrefs, play, setAudioPrefs } from '../games/cluedo/ui/sound';
import { loadSettings, saveSettings } from '../games/cluedo/ui/settings';
import { ensureSignedIn } from '../online/firebase';
import { createRoom, joinRoom, normalizeCode } from '../online/rooms';
import { renderInstall } from '../pwa';

/** Répliques d'alibi (une par suspect). */
const ALIBIS: Record<string, string> = {
  rouge: "Moi ? Je dansais toute la soirée. Tout le monde m'a vue… enfin, presque tout le monde.",
  jaune: "J'étais au fumoir, avec mon cigare et mes souvenirs de campagne. Demandez donc au majordome.",
  blanc: "Je fais le ménage dans cette maison depuis trente ans. Je sais où chacun cache ses secrets.",
  vert: "Je priais dans la véranda. Le Seigneur est mon témoin, et Il ne ment jamais.",
  bleu: "Une dame de mon rang ne se salit pas les mains, voyons. Elle a des gens pour cela.",
  violet: "J'étudiais un vieux traité de chimie à la bibliothèque. Purement théorique, bien sûr.",
};

export interface HomeDeps {
  go: (hash: string) => void;
  getName: () => string;
  setName: (n: string) => void;
  lastRoom: () => string | null;
  forgetRoom: () => void;
  message: (e: unknown) => string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
let timer: number | null = null;

export function renderHomeScreen(app: HTMLElement, d: HomeDeps, error = '') {
  if (timer !== null) clearInterval(timer);
  let idx = Math.floor(Math.random() * SUSPECTS.length);
  const last = d.lastRoom();
  const name = d.getName();

  app.innerHTML = `
  <div class="home">
    <div class="home-hero">
      ${SUSPECTS.map((s, i) => `<img class="home-slide ${i === idx ? 'on' : ''}" data-i="${i}" src="${cardImage(s.id) ?? ''}" alt="">`).join('')}
    </div>
    <button class="home-back" id="back" aria-label="Retour à la ludothèque">‹ Ludothèque</button>
    <div class="home-top">
      <div class="home-title">Cluedo</div>
      ${name ? `<div class="home-hello">Bonsoir, ${esc(name)}.</div>` : ''}
    </div>
    ${last ? `<div class="home-resume"><button class="home-resume-go" id="resume">Partie <b>${esc(last)}</b> en cours · <u>Reprendre</u> ›</button><button class="home-resume-x" id="forget" aria-label="Oublier">✕</button></div>` : ''}
    <div class="home-quote" id="quote"></div>
    <div class="home-thumbs">${SUSPECTS.map((s, i) => `<button class="home-thumb ${i === idx ? 'on' : ''}" data-i="${i}" aria-label="${s.name}">${portraitHTML(s.id)}</button>`).join('')}</div>
    <div class="home-menu">
      <div class="error" id="err">${esc(error)}</div>
      <button class="home-btn primary" data-sheet="create">Créer une partie</button>
      <button class="home-btn" data-sheet="join">Rejoindre avec un code</button>
      <div class="home-grid">
        <button class="home-btn" data-sheet="rules">Comment jouer</button>
        <button class="home-btn" id="practice">Entraînement</button>
        <button class="home-btn" data-sheet="settings">Réglages</button>
        <button class="home-btn" data-sheet="profile">Mon profil</button>
      </div>
      <div id="install"></div>
    </div>
    <div class="home-sheet-bg" id="sheet-bg" hidden></div>
    <div class="home-sheet" id="sheet" hidden></div>
  </div>`;

  renderInstall(app.querySelector<HTMLElement>('#install')!);
  const err = app.querySelector<HTMLElement>('#err')!;

  // ---------------- Galerie
  const show = (i: number) => {
    idx = (i + SUSPECTS.length) % SUSPECTS.length;
    const s = SUSPECTS[idx];
    app.querySelectorAll<HTMLElement>('.home-slide').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === idx));
    app.querySelectorAll<HTMLElement>('.home-thumb').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === idx));
    const q = app.querySelector<HTMLElement>('#quote')!;
    q.classList.remove('in');
    void q.offsetWidth;
    q.innerHTML = `« ${ALIBIS[s.id]} »<small>${s.name}</small>`;
    q.classList.add('in');
  };
  show(idx);
  const restart = () => {
    if (timer !== null) clearInterval(timer);
    timer = window.setInterval(() => {
      if (!app.querySelector('.home')) {
        clearInterval(timer!);
        timer = null;
        return;
      }
      show(idx + 1);
    }, 6000);
  };
  restart();
  app.querySelectorAll<HTMLElement>('.home-thumb').forEach((b) =>
    b.addEventListener('click', () => {
      play('click');
      show(Number(b.dataset.i));
      restart();
    }),
  );
  // Glisser sur l'image pour changer de suspect
  const hero = app.querySelector<HTMLElement>('.home-hero')!;
  let x0: number | null = null;
  hero.addEventListener('pointerdown', (e) => (x0 = e.clientX));
  hero.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) {
      show(idx + (dx < 0 ? 1 : -1));
      restart();
    }
  });

  // ---------------- Reprendre
  app.querySelector('#resume')?.addEventListener('click', () => d.go(`#/p/${last}`));
  app.querySelector('#forget')?.addEventListener('click', () => {
    d.forgetRoom();
    renderHomeScreen(app, d);
  });
  app.querySelector('#back')!.addEventListener('click', () => d.go('#/'));
  app.querySelector('#practice')!.addEventListener('click', () => d.go('#/test'));

  // ---------------- Volets
  const sheet = app.querySelector<HTMLElement>('#sheet')!;
  const bg = app.querySelector<HTMLElement>('#sheet-bg')!;
  const close = () => {
    sheet.hidden = true;
    bg.hidden = true;
  };
  bg.addEventListener('click', close);
  const nameField = () =>
    `<label class="home-label">Ton prénom<input id="f-name" maxlength="20" placeholder="Ton prénom" value="${esc(d.getName())}"></label>`;
  const readName = (): string | null => {
    const n = sheet.querySelector<HTMLInputElement>('#f-name')?.value.trim() ?? d.getName();
    if (!n) {
      sheet.querySelector<HTMLElement>('.error')!.textContent = 'Écris ton prénom.';
      sheet.querySelector<HTMLInputElement>('#f-name')?.focus();
      return null;
    }
    d.setName(n);
    return n;
  };
  const busy = (b: boolean) => sheet.querySelectorAll('button').forEach((x) => (x.disabled = b));

  const open = (kind: string) => {
    play('click');
    let html = '';
    switch (kind) {
      case 'create':
        html = `<h2>Nouvelle partie</h2>
          <p class="muted">Tu seras le maître de jeu : tu recevras un code à partager, et tu choisiras les règles avant de lancer.</p>
          ${nameField()}
          <div class="error"></div>
          <button class="home-btn primary" id="do-create">Créer</button>`;
        break;
      case 'join':
        html = `<h2>Rejoindre une partie</h2>
          ${nameField()}
          <label class="home-label">Code de la partie<input id="f-code" maxlength="5" placeholder="ABCDE" class="code-input" autocapitalize="characters"></label>
          <div class="error"></div>
          <button class="home-btn primary" id="do-join">Rejoindre</button>`;
        break;
      case 'rules':
        html = `<h2>Comment jouer</h2>
          <div class="rules">
            <p><b>🎯 Le but.</b> Un crime a eu lieu au manoir. Trouve <b>qui</b>, avec <b>quelle arme</b> et dans <b>quelle pièce</b> : ces trois cartes sont cachées dans l'enveloppe.</p>
            <p><b>🃏 Tes cartes.</b> Les autres cartes sont distribuées. Celles que tu as ne sont pas dans l'enveloppe : coche-les dans ton carnet.</p>
            <p><b>🎲 À ton tour.</b> Lance les dés et avance (jusqu'au total). Les passages secrets relient les pièces en coin.</p>
            <p><b>🔍 L'hypothèse.</b> Dans une pièce, propose un suspect et une arme. Le premier joueur suivant qui a une de ces cartes t'en montre <b>une</b>, en secret.</p>
            <p><b>⚖️ L'accusation.</b> Quand tu es sûr, accuse. Juste : tu gagnes. Faux : tu es éliminé, mais tu continues à montrer tes cartes.</p>
            <p><b>💡 Astuce.</b> Le carnet se remplit tout seul avec ce que tu apprends. Touche une case pour noter tes doutes.</p>
          </div>
          <button class="home-btn" id="do-close">Compris !</button>`;
        break;
      case 'settings': {
        const s = loadSettings();
        const opt = (n: string, v: string, l: string, c: boolean) => `<label class="opt"><input type="radio" name="${n}" value="${v}" ${c ? 'checked' : ''}> ${l}</label>`;
        html = `<h2>Réglages</h2>
          <div class="set-row"><span>Musique</span>${opt('music', '1', 'Oui', audioPrefs.music)}${opt('music', '0', 'Non', !audioPrefs.music)}</div>
          <div class="set-row"><span>Bruitages</span>${opt('sfx', '1', 'Oui', audioPrefs.sfx)}${opt('sfx', '0', 'Non', !audioPrefs.sfx)}</div>
          <div class="set-row"><span>Plateau</span>${opt('board', '3d', '3D', s.board === '3d')}${opt('board', '2.5d', '2.5D (plus léger)', s.board === '2.5d')}</div>
          <div class="set-row"><span>Animations</span>${opt('speed', 'normal', 'Normales', s.speed === 'normal')}${opt('speed', 'fast', 'Rapides', s.speed === 'fast')}</div>
          <p class="muted">« Mes images » se trouve dans le menu ☰ pendant une partie.</p>
          <button class="home-btn" id="do-close">OK</button>`;
        break;
      }
      case 'profile':
        html = `<h2>Mon profil</h2>
          ${nameField()}
          <p class="muted">Ce prénom est proposé automatiquement quand tu crées ou rejoins une partie.</p>
          <div class="error"></div>
          <button class="home-btn primary" id="do-profile">Enregistrer</button>`;
        break;
    }
    sheet.innerHTML = html;
    sheet.hidden = false;
    bg.hidden = false;
    sheet.querySelector('#do-close')?.addEventListener('click', close);
    sheet.querySelector('#do-profile')?.addEventListener('click', () => {
      if (readName()) renderHomeScreen(app, d);
    });
    sheet.querySelector('#do-create')?.addEventListener('click', async () => {
      const n = readName();
      if (!n) return;
      busy(true);
      try {
        const user = await ensureSignedIn();
        d.go(`#/p/${await createRoom(user.uid, n)}`);
      } catch (e) {
        sheet.querySelector<HTMLElement>('.error')!.textContent = d.message(e);
        busy(false);
      }
    });
    sheet.querySelector('#do-join')?.addEventListener('click', async () => {
      const n = readName();
      if (!n) return;
      const code = normalizeCode(sheet.querySelector<HTMLInputElement>('#f-code')!.value);
      if (code.length !== 5) {
        sheet.querySelector<HTMLElement>('.error')!.textContent = 'Le code fait 5 caractères.';
        return;
      }
      busy(true);
      try {
        const user = await ensureSignedIn();
        await joinRoom(user.uid, code, n);
        d.go(`#/p/${code}`);
      } catch (e) {
        sheet.querySelector<HTMLElement>('.error')!.textContent = d.message(e);
        busy(false);
      }
    });
    sheet.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      const val = (n: string) => sheet.querySelector<HTMLInputElement>(`input[name="${n}"]:checked`)?.value;
      if (t.name === 'music' || t.name === 'sfx') setAudioPrefs({ music: val('music') === '1', sfx: val('sfx') === '1' });
      if (t.name === 'board' || t.name === 'speed') {
        const s = loadSettings();
        saveSettings({ ...s, board: val('board') === '2.5d' ? '2.5d' : '3d', speed: val('speed') === 'fast' ? 'fast' : 'normal' });
      }
    });
    (sheet.querySelector<HTMLInputElement>('#f-name:placeholder-shown') ?? sheet.querySelector<HTMLInputElement>('#f-code'))?.focus();
  };
  app.querySelectorAll<HTMLElement>('[data-sheet]').forEach((b) => b.addEventListener('click', () => open(b.dataset.sheet!)));
  if (error) err.scrollIntoView({ block: 'center' });
}
