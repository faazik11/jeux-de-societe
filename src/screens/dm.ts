// Conversation privée entre deux joueurs : utilisée en partie (volet) et dans la messagerie (page).

import { getProfile, markRead, sendDM, watchDM, type DirectMessage } from '../online/account';
import { portraitHTML } from '../games/cluedo/ui/cards';
import { play } from '../games/cluedo/ui/sound';
import type { CardId } from '../games/cluedo/engine';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function time(at: number): string {
  if (!at) return '';
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export interface ConversationOpts {
  me: string;
  other: string;
  /** Nom affiché (sinon pris dans le profil). */
  name?: string;
  /** Portrait (id de suspect) de l'autre joueur. */
  avatar?: string;
  /** Bouton de fermeture / retour. */
  onClose: () => void;
  closeLabel?: string;
}

/** Monte une conversation dans `host`. Renvoie une fonction pour tout arrêter. */
export function mountConversation(host: HTMLElement, o: ConversationOpts): () => void {
  host.innerHTML = `
    <div class="dm">
      <div class="dm-head">
        <button class="dm-close" id="dm-close">${o.closeLabel ?? '✕'}</button>
        <span class="dm-avatar">${o.avatar ? portraitHTML(o.avatar as CardId) : ''}</span>
        <div class="dm-name">${esc(o.name ?? '…')}<small>message privé 🤫</small></div>
      </div>
      <div class="dm-list" id="dm-list"><p class="muted dm-empty">Aucun message pour l'instant. Ce que vous écrivez ici, vous seuls le voyez.</p></div>
      <form class="dm-form" id="dm-form" autocomplete="off">
        <input id="dm-input" maxlength="500" placeholder="Écrire un message…" enterkeyhint="send">
        <button class="primary" type="submit" aria-label="Envoyer">➤</button>
      </form>
    </div>`;
  const list = host.querySelector<HTMLElement>('#dm-list')!;
  const input = host.querySelector<HTMLInputElement>('#dm-input')!;
  host.querySelector('#dm-close')!.addEventListener('click', o.onClose);
  if (!o.name || !o.avatar)
    void getProfile(o.other).then((p) => {
      if (!p) return;
      if (!o.name) host.querySelector('.dm-name')!.firstChild!.textContent = p.name;
      if (!o.avatar && p.avatar) host.querySelector('.dm-avatar')!.innerHTML = portraitHTML(p.avatar as CardId);
    });

  let count = -1;
  const stop = watchDM(o.me, o.other, (msgs: DirectMessage[]) => {
    if (count >= 0 && msgs.length > count && msgs[msgs.length - 1].from !== o.me) play('turn');
    count = msgs.length;
    if (!msgs.length) return;
    let lastDay = '';
    list.innerHTML = msgs
      .map((m) => {
        const day = m.at ? new Date(m.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
        const sep = day && day !== lastDay ? `<div class="dm-day">${day}</div>` : '';
        lastDay = day || lastDay;
        return `${sep}<div class="dm-msg ${m.from === o.me ? 'mine' : ''}"><div class="dm-bubble">${esc(m.text)}</div><div class="dm-time">${time(m.at)}</div></div>`;
      })
      .join('');
    list.scrollTop = list.scrollHeight;
    void markRead(o.me, o.other);
  });
  host.querySelector<HTMLFormElement>('#dm-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    sendDM(o.me, o.other, t).catch(() => {
      input.value = t;
    });
    input.focus();
  });
  void markRead(o.me, o.other);
  return stop;
}
