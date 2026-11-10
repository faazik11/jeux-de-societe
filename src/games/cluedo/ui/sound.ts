// Sons et musique, entièrement synthétisés (Web Audio) : aucun fichier à télécharger.
// Le son ne démarre qu'après un premier geste du joueur (règle des navigateurs).

export type SoundName =
  | 'dice' | 'step' | 'door' | 'turn' | 'myTurn' | 'room' | 'suspect' | 'reveal' | 'flip'
  | 'win' | 'wrong' | 'passage' | 'teleport' | 'drop' | 'click';

interface AudioPrefs { sfx: boolean; music: boolean }
const KEY = 'jds:audio';

function loadPrefs(): AudioPrefs {
  try {
    return { sfx: true, music: true, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { sfx: true, music: true };
  }
}
export const audioPrefs: AudioPrefs = loadPrefs();

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let reverb: ConvolverNode;
let noise: AudioBuffer;
let musicTimer: number | null = null;

function init() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = audioPrefs.sfx ? 1 : 0;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  // Réverbération : une grande pièce de manoir
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.4;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  reverb.connect(wet).connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  if (audioPrefs.music) startMusic();
}

/** À appeler une fois : le son s'active au premier toucher. */
export function setupAudioUnlock() {
  const unlock = () => {
    init();
    void ctx?.resume();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export function setAudioPrefs(p: Partial<AudioPrefs>) {
  Object.assign(audioPrefs, p);
  try {
    localStorage.setItem(KEY, JSON.stringify(audioPrefs));
  } catch { /* ignore */ }
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(audioPrefs.sfx ? 1 : 0, ctx.currentTime, 0.05);
  if (audioPrefs.music) startMusic();
  else stopMusic();
}

// ---------------------------------------------------------------- briques

function out(dest: AudioNode, rev = 0.5) {
  const g = ctx!.createGain();
  g.connect(dest);
  if (rev > 0) {
    const r = ctx!.createGain();
    r.gain.value = rev;
    g.connect(r).connect(reverb);
  }
  return g;
}

/** Note : oscillateur avec enveloppe. */
function tone(freq: number, at: number, dur: number, o: { type?: OscillatorType; vol?: number; attack?: number; dest?: AudioNode; rev?: number; glide?: number } = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(freq * o.glide, at + dur);
  const g = c.createGain();
  const v = o.vol ?? 0.2;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out(o.dest ?? sfxBus, o.rev ?? 0.5));
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Bruit filtré (claquements, pas, souffles). */
function burst(at: number, dur: number, o: { freq?: number; q?: number; vol?: number; type?: BiquadFilterType; sweep?: number; rev?: number } = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, at);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, at + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.3, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out(sfxBus, o.rev ?? 0.3));
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

// Gamme : ré mineur harmonique (ambiance mystère)
const N = (semi: number) => 293.66 * 2 ** (semi / 12);

export function play(name: SoundName) {
  if (!ctx || !audioPrefs.sfx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'click':
      burst(t, 0.04, { freq: 2500, q: 4, vol: 0.12, rev: 0 });
      break;
    case 'dice': {
      // Dés qui roulent : claquements de plus en plus espacés
      let at = t;
      for (let i = 0; i < 14; i++) {
        burst(at, 0.035, { freq: 1800 + Math.random() * 1800, q: 6, vol: 0.35 * (1 - i / 16), rev: 0.15 });
        at += 0.04 + i * 0.012 + Math.random() * 0.03;
      }
      break;
    }
    case 'step':
      burst(t, 0.07, { freq: 260 + Math.random() * 80, q: 1.5, vol: 0.16, type: 'lowpass', rev: 0.2 });
      break;
    case 'door':
      // Grincement : bruit très résonant qui glisse
      burst(t, 0.5, { freq: 700, sweep: 1100, q: 18, vol: 0.18, rev: 0.4 });
      burst(t + 0.45, 0.08, { freq: 180, q: 2, vol: 0.25, type: 'lowpass' });
      break;
    case 'turn':
      tone(N(7), t, 0.5, { type: 'triangle', vol: 0.12 });
      break;
    case 'myTurn':
      [0, 3, 7, 12].forEach((s, i) => tone(N(s), t + i * 0.09, 0.8, { type: 'triangle', vol: 0.14 }));
      break;
    case 'room':
      tone(N(-5), t, 1.2, { type: 'sine', vol: 0.12 });
      tone(N(0), t + 0.12, 1.2, { type: 'sine', vol: 0.1 });
      break;
    case 'suspect':
      // « Dun dun dunnn »
      tone(N(-12), t, 0.35, { type: 'sawtooth', vol: 0.1, rev: 0.6 });
      tone(N(-11), t + 0.38, 0.35, { type: 'sawtooth', vol: 0.1, rev: 0.6 });
      tone(N(-6), t + 0.8, 1.6, { type: 'sawtooth', vol: 0.12, rev: 0.8 });
      tone(N(-18), t + 0.8, 1.6, { type: 'sine', vol: 0.2 });
      break;
    case 'flip':
      burst(t, 0.18, { freq: 1500, sweep: 4000, q: 1, vol: 0.18, rev: 0.1 });
      break;
    case 'reveal':
      [12, 15, 19, 24].forEach((s, i) => tone(N(s), t + i * 0.07, 1.4, { type: 'sine', vol: 0.1, rev: 0.8 }));
      break;
    case 'passage':
      tone(N(-24), t, 1.4, { type: 'sine', vol: 0.25, glide: 0.5 });
      burst(t, 1.2, { freq: 400, sweep: 120, q: 1, vol: 0.2, type: 'lowpass' });
      break;
    case 'teleport':
      tone(N(12), t, 0.6, { type: 'sine', vol: 0.12, glide: 2 });
      burst(t, 0.5, { freq: 3000, sweep: 8000, q: 2, vol: 0.08 });
      break;
    case 'drop':
      tone(N(5), t, 0.9, { type: 'triangle', vol: 0.15, glide: 0.98 });
      tone(N(5) * 2.76, t, 0.6, { type: 'sine', vol: 0.06 });
      burst(t, 0.06, { freq: 3000, q: 3, vol: 0.2 });
      break;
    case 'win':
      [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((ch, i) =>
        ch.forEach((s) => tone(N(s), t + i * 0.22, i === 3 ? 1.8 : 0.3, { type: 'triangle', vol: 0.1, rev: 0.6 })),
      );
      break;
    case 'wrong':
      tone(N(-5), t, 0.5, { type: 'sawtooth', vol: 0.1 });
      tone(N(-6), t + 0.45, 0.5, { type: 'sawtooth', vol: 0.1 });
      tone(N(-7), t + 0.9, 1.4, { type: 'sawtooth', vol: 0.11, glide: 0.94 });
      break;
  }
}

// ---------------------------------------------------------------- musique d'ambiance
// Nappe grave + arpèges lents en ré mineur, avec une horloge qui fait tic-tac au loin.

const CHORDS = [
  [0, 3, 7], // ré m
  [-4, 0, 3], // si♭
  [-7, -3, 0], // sol m
  [-5, -1, 2], // la (dominante)
];

function startMusic() {
  if (!ctx || musicTimer !== null) return;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  let bar = 0;
  let next = ctx.currentTime + 0.2;
  const BAR = 4.8;
  const schedule = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 2 * BAR) {
      const ch = CHORDS[bar % CHORDS.length];
      // Nappe
      ch.forEach((s) => tone(N(s - 12), next, BAR + 0.6, { type: 'sine', vol: 0.05, attack: 1.4, dest: musicBus, rev: 0.7 }));
      tone(N(ch[0] - 24), next, BAR + 0.4, { type: 'triangle', vol: 0.06, attack: 0.8, dest: musicBus, rev: 0.4 });
      // Arpège (façon boîte à musique), une note sur deux parfois absente
      const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
      pattern.forEach((p, i) => {
        if (Math.random() < 0.25) return;
        const s = p === 3 ? ch[0] + 12 : ch[p];
        tone(N(s + 12), next + i * (BAR / 8), 1.6, { type: 'sine', vol: 0.035, dest: musicBus, rev: 1 });
      });
      // Horloge lointaine
      for (let i = 0; i < 8; i++) {
        const at = next + i * (BAR / 8);
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = i % 2 ? 2600 : 2100;
        f.Q.value = 12;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
        src.connect(f).connect(g).connect(musicBus);
        src.start(at, Math.random() * 0.5);
        src.stop(at + 0.05);
      }
      next += BAR;
      bar++;
    }
  };
  schedule();
  musicTimer = window.setInterval(schedule, 1000);
}

function stopMusic() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
}

/** Musique plus discrète pendant les moments importants. */
export function duckMusic(ms = 2500) {
  if (!ctx || musicTimer === null) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.15, t, 0.1);
  musicBus.gain.setTargetAtTime(0.5, t + ms / 1000, 0.8);
}
