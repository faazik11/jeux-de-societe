// « Mes images » : photos choisies par le joueur pour remplacer les dessins des cartes.
// Elles restent sur l'appareil (IndexedDB du navigateur) : rien n'est envoyé sur Internet.

import type { CardId } from '../engine';

const DB = 'jds-images';
const STORE = 'cards';

/** Images chargées en mémoire (data URL JPEG), par carte. */
export const customImages = new Map<string, string>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Charge toutes les images (une seule fois). */
export function loadCustomImages(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const keys = (await tx('readonly', (s) => s.getAllKeys())) as string[];
        const vals = (await tx('readonly', (s) => s.getAll())) as string[];
        keys.forEach((k, i) => customImages.set(k, vals[i]));
        if (keys.length) notify();
      } catch (e) {
        console.warn('Mes images indisponibles', e);
      }
    })();
  }
  return loaded;
}

export function onCustomImagesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((f) => f());
}

/** Réduit la photo (format carte, 600×840 max) et la compresse en JPEG. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const max = 840;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.82);
}

export async function setCustomImage(id: CardId, file: File) {
  const url = await shrink(file);
  await tx('readwrite', (s) => s.put(url, id));
  customImages.set(id, url);
  notify();
}

export async function removeCustomImage(id: CardId) {
  await tx('readwrite', (s) => s.delete(id));
  customImages.delete(id);
  notify();
}
