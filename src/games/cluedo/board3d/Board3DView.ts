// Plateau 3D branché sur le vrai jeu.
//
// Même rôle que IsoBoard (la version 2.5D) : on lui donne l'état de la partie, il rejoue
// en 3D ce qui s'est passé depuis la dernière fois (journal), puis affiche les cases accessibles.
//
// Logique de caméra (orientation fixe, comme assis à la table) :
//   repos / tour d'un autre  → vue « table » ; on suit les autres de loin
//   début de mon tour        → plan moyen sur mon pion
//   dés                      → lancés devant le pion du joueur
//   choix de la case         → cadrage de toute la zone verte
//   marche                   → suivi doux sans rotation (ou caméra de dos en option)
//   entrée dans une pièce    → plan sur la pièce
//   hypothèse                → plan sur la pièce, le suspect est téléporté, l'arme tombe
//   accusation               → gros plan sur l'enveloppe, les cartes se retournent
//   fin                      → tour lent autour de la pièce du crime
// Si le joueur bouge la caméra lui-même, on la lui laisse jusqu'au prochain moment important.

import {
  SUSPECTS,
  WEAPONS,
  type CardId,
  type GameState,
  type LogEntry,
  type SuspectId,
  type WeaponId,
} from '../engine';
import type { BoardUpdate } from './IsoBoard';
import type { Board3D } from '../scene3d/Board3D';
import type { DisplaySettings } from '../ui/settings';

export class Board3DView {
  private scene: Board3D | null = null;
  private latest: BoardUpdate | null = null;
  private state: GameState | null = null;
  private queue: Promise<void> = Promise.resolve();
  private animating = false;
  private reachKey = '';
  private failed = false;
  /** Événements pour l'interface (ex. résultat des dés une fois qu'ils sont arrêtés). */
  onEvent: ((e: { type: 'dice'; total: number; player: string } | { type: 'ready' } | { type: 'idle' }) => void) | null = null;

  private constructor(private host: HTMLElement, private settings: DisplaySettings, private onUserCamera: (user: boolean) => void) {}

  static create(host: HTMLElement, settings: DisplaySettings, onUserCamera: (user: boolean) => void): Board3DView {
    const v = new Board3DView(host, settings, onUserCamera);
    void v.boot();
    return v;
  }

  private async boot() {
    try {
      const { Board3D } = await import('../scene3d/Board3D');
      const scene = new Board3D(this.host);
      scene.timeScale = this.settings.speed === 'fast' ? 1.8 : 1;
      scene.onUserCamera = this.onUserCamera;
      scene.onTap = () => {
        if (this.animating) scene.speedUp();
      };
      this.scene = scene;
      if (this.latest) this.apply(this.latest);
      // Le plateau est affiché : l'interface peut lancer ses annonces
      requestAnimationFrame(() => requestAnimationFrame(() => this.onEvent?.({ type: 'ready' })));
    } catch (e) {
      console.error(e);
      this.failed = true;
      this.host.innerHTML = '<p style="padding:20px">La 3D ne fonctionne pas sur cet appareil. Choisis le plateau 2.5D dans les réglages ⚙.</p>';
    }
  }

  get broken() {
    return this.failed;
  }

  update(u: BoardUpdate) {
    this.latest = u;
    if (this.scene) this.apply(u);
  }

  /** Bouton ⤢ : rend la caméra automatique et recadre selon le moment du jeu. */
  recenter() {
    const sc = this.scene;
    if (!sc) return;
    sc.resumeAuto();
    const u = this.latest;
    if (u && u.destinations.length) this.frameReach(u);
    else if (u && u.state.currentPlayer === u.me && u.state.phase !== 'finished') sc.focusPawn(this.suspectOf(u.state, u.me));
    else sc.tableView();
  }

  destroy() {
    this.scene?.destroy();
    this.scene = null;
  }

  // ------------------------------------------------------------------

  private suspectOf(st: GameState, player: string): SuspectId {
    return st.players.find((p) => p.id === player)!.suspect;
  }

  private placeAll(st: GameState) {
    const sc = this.scene!;
    for (const s of SUSPECTS) sc.place(s.id, st.pawns[s.id]);
    for (const w of WEAPONS) sc.placeWeapon(w.id as WeaponId, st.weapons[w.id as WeaponId]);
  }

  private apply(u: BoardUpdate) {
    const sc = this.scene!;
    const prev = this.state;
    this.state = u.state;
    const st = u.state;

    // Première fois (ou nouvelle partie) : on place tout sans animation
    if (!prev || st.log.length < prev.log.length) {
      this.placeAll(st);
      sc.clearDice();
      sc.clearCards();
      this.reachKey = '';
      sc.tableView(0);
      if (st.phase === 'finished') {
        sc.orbitRoom(st.solution.room);
      } else {
        void sc.wait(900).then(() => this.turnIntro(st, u.me));
      }
      this.refresh();
      return;
    }

    const fresh = st.log.slice(prev.log.length);
    if (!fresh.length) {
      this.refresh();
      return;
    }
    const turnChanged = prev.currentPlayer !== st.currentPlayer || (prev.phase !== 'finished' && st.phase === 'finished');
    this.animating = true;
    sc.setReach([], () => {});
    this.queue = this.queue
      .then(() => this.play(fresh, st, u.me))
      .catch((e) => console.error(e))
      .then(() => {
        if (this.state !== st) return; // une autre mise à jour est arrivée entre-temps
        // Sécurité : tout aligner sur l'état final (sauf en fin de partie où la scène finale est montée)
        if (st.phase !== 'finished') this.placeAll(st);
        this.animating = false;
        if (turnChanged && st.phase !== 'finished') {
          sc.clearDice();
          this.turnIntro(st, u.me);
        }
        this.refresh();
        this.onEvent?.({ type: 'idle' });
      });
  }

  /** Début d'un tour : plan sur mon pion si c'est à moi, sinon vue « table ». */
  private turnIntro(st: GameState, me: string) {
    const sc = this.scene!;
    if (st.phase === 'finished') return;
    if (st.currentPlayer === me) {
      sc.resumeAuto();
      sc.focusPawn(this.suspectOf(st, me));
    } else {
      sc.tableView();
    }
  }

  private async play(entries: LogEntry[], st: GameState, me: string) {
    const sc = this.scene!;
    const cine = this.settings.cinematics;
    for (const e of entries) {
      switch (e.type) {
        case 'rolled':
          await sc.rollDice(e.dice, this.suspectOf(st, e.player));
          this.onEvent?.({ type: 'dice', total: e.dice.reduce((a, b) => a + b, 0), player: e.player });
          await sc.wait(250);
          break;
        case 'moved': {
          const s = this.suspectOf(st, e.player);
          const mine = e.player === me;
          await sc.walk(s, e.path, mine ? (this.settings.backCam ? 'back' : 'follow') : 'far');
          const to = e.path[e.path.length - 1];
          if (to.type === 'room') {
            sc.emote(s);
            if (mine || cine) sc.roomShot(to.room);
            await sc.wait(mine ? 900 : 500);
          }
          break;
        }
        case 'secretPassage': {
          const s = this.suspectOf(st, e.player);
          if (cine) {
            sc.focusPawn(s, 3);
            await sc.wait(400);
            await sc.secretPassage(s, e.from, e.to);
          } else sc.place(s, { type: 'room', room: e.to });
          sc.emote(s);
          await sc.wait(400);
          break;
        }
        case 'suggested': {
          // Moment clé : tout le monde regarde la pièce
          if (cine) {
            sc.resumeAuto();
            sc.roomShot(e.room);
            await sc.wait(700);
            await Promise.all([
              sc.teleport(e.suspect, { type: 'room', room: e.room }),
              (async () => {
                await sc.wait(250);
                await sc.dropWeapon(e.weapon, e.room);
              })(),
            ]);
            await sc.wait(900);
          } else {
            sc.place(e.suspect, { type: 'room', room: e.room });
            sc.placeWeapon(e.weapon, e.room);
          }
          break;
        }
        case 'accused': {
          const cards = this.trio(e.suspect, e.weapon, e.room);
          if (cine) {
            sc.resumeAuto();
            await sc.envelopeScene(cards, e.correct ? 'win' : 'wrong');
            await sc.wait(e.correct ? 600 : 300);
          }
          break;
        }
        case 'gameOver': {
          const sol = e.solution;
          const lastAccuse = [...st.log].reverse().find((x) => x.type === 'accused');
          const alreadyShown = cine && lastAccuse?.type === 'accused' && lastAccuse.correct && e.reason === 'accusation';
          if (cine && !alreadyShown) {
            sc.resumeAuto();
            await sc.envelopeScene(this.trio(sol.suspect, sol.weapon, sol.room), 'reveal');
            await sc.wait(1200);
          } else if (cine) await sc.wait(1200);
          // Scène finale : le coupable et l'arme dans la pièce du crime
          sc.place(sol.suspect, { type: 'room', room: sol.room });
          sc.placeWeapon(sol.weapon, sol.room);
          sc.orbitRoom(sol.room);
          break;
        }
        default:
          break;
      }
    }
  }

  private trio(suspect: SuspectId, weapon: WeaponId, room: GameState['solution']['room']): CardId[] {
    return [suspect, weapon, room];
  }

  /** Anneau sous le joueur actif + cases accessibles (avec cadrage de la zone la première fois). */
  private refresh() {
    const sc = this.scene;
    const u = this.latest;
    if (!sc || !u) return;
    const st = u.state;
    sc.setCurrent(st.phase === 'finished' ? null : this.suspectOf(st, st.currentPlayer));
    if (this.animating) return;
    if (!u.destinations.length) {
      sc.setReach([], () => {});
      this.reachKey = '';
      return;
    }
    sc.setReach(u.destinations, u.onPick);
    const key = `${st.turn}:${u.destinations.length}`;
    if (key !== this.reachKey) {
      this.reachKey = key;
      sc.resumeAuto();
      this.frameReach(u);
    }
  }

  private frameReach(u: BoardUpdate) {
    const sc = this.scene!;
    const s = this.suspectOf(u.state, u.me);
    const pts = u.destinations.map((d) => sc.pointOf(d.to, s));
    pts.push(sc.pawnPoint(s));
    sc.frameArea(pts);
  }
}
