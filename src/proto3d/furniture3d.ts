// Meubles 3D (Kenney « Furniture Kit », licence CC0) placés dans chaque pièce.
//
// Chaque meuble : nom du modèle, position (x, y en cases = centre du meuble au sol),
// rotation (en degrés : 0 = face vers le sud / vers l'avant, 90 = face vers l'est,
// -90 = face vers l'ouest, 180 = face vers le nord), taille (1 par défaut), hauteur (z).
//
// Règle de placement : on garde libres le centre des pièces (place des pions)
// et la rangée de devant (place des armes).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RoomId } from '../games/cluedo/engine';

export interface Placement {
  m: string;
  x: number;
  y: number;
  r?: number;
  s?: number;
  z?: number;
}

/** Échelle générale des meubles par rapport aux cases du plateau. */
const SCALE = 1.35;

export const FURNITURE: Record<RoomId, Placement[]> = {
  cuisine: [
    { m: 'kitchenCabinetDrawer', x: 0.55, y: 1.4 },
    { m: 'kitchenStove', x: 1.15, y: 1.4 },
    { m: 'kitchenSink', x: 1.75, y: 1.4 },
    { m: 'kitchenCabinet', x: 2.35, y: 1.4 },
    { m: 'kitchenCabinet', x: 2.95, y: 1.4 },
    { m: 'kitchenCoffeeMachine', x: 2.95, y: 1.35, z: 0.61, s: 1 },
    { m: 'kitchenFridgeLarge', x: 5.3, y: 1.5 },
    { m: 'kitchenBar', x: 0.4, y: 3.2, r: 90 },
    { m: 'kitchenBar', x: 0.4, y: 3.8, r: 90 },
    { m: 'tableCloth', x: 5.3, y: 4.0, r: 90 },
    { m: 'chairCushion', x: 4.75, y: 3.7, r: 90 },
    { m: 'chairCushion', x: 4.75, y: 4.3, r: 90 },
  ],
  bal: [
    { m: 'loungeDesignSofa', x: 10.2, y: 1.6 },
    { m: 'loungeDesignSofa', x: 13.8, y: 1.6 },
    { m: 'lampRoundFloor', x: 8.5, y: 1.45 },
    { m: 'lampRoundFloor', x: 12, y: 1.4 },
    { m: 'lampRoundFloor', x: 15.5, y: 1.45 },
    { m: 'tableRound', x: 9.2, y: 3.4 },
    { m: 'chairRounded', x: 9.2, y: 2.75 },
    { m: 'tableRound', x: 14.8, y: 3.4 },
    { m: 'chairRounded', x: 14.8, y: 2.75 },
    { m: 'pottedPlant', x: 8.5, y: 6.6 },
    { m: 'pottedPlant', x: 15.5, y: 6.6 },
  ],
  veranda: [
    { m: 'pottedPlant', x: 18.5, y: 1.5, s: 1.2 },
    { m: 'pottedPlant', x: 23.5, y: 1.5, s: 1.2 },
    { m: 'pottedPlant', x: 23.5, y: 4.3, s: 1.1 },
    { m: 'plantSmall1', x: 19.4, y: 1.4, s: 1.4 },
    { m: 'plantSmall2', x: 22.6, y: 1.4, s: 1.4 },
    { m: 'loungeChairRelax', x: 20.3, y: 1.7 },
    { m: 'loungeChairRelax', x: 21.8, y: 1.7 },
    { m: 'sideTable', x: 18.5, y: 3.3, r: 90 },
  ],
  salleAManger: [
    { m: 'tableCloth', x: 2.9, y: 10.3 },
    { m: 'tableCloth', x: 4.05, y: 10.3 },
    { m: 'chairCushion', x: 2.5, y: 11.0, r: 180 },
    { m: 'chairCushion', x: 3.3, y: 11.0, r: 180 },
    { m: 'chairCushion', x: 4.1, y: 11.0, r: 180 },
    { m: 'chairCushion', x: 4.9, y: 11.0, r: 180 },
    { m: 'chairCushion', x: 1.95, y: 10.3, r: 90 },
    { m: 'chairCushion', x: 5.0, y: 10.3, r: -90 },
    { m: 'bookcaseClosedDoors', x: 0.4, y: 13.2, r: 90 },
    { m: 'bookcaseClosedDoors', x: 0.4, y: 14.0, r: 90 },
    { m: 'lampSquareFloor', x: 0.45, y: 9.5 },
    { m: 'lampSquareFloor', x: 7.5, y: 9.5 },
  ],
  billard: [
    { m: 'benchCushion', x: 23.5, y: 11.2, r: -90 },
    { m: 'lampSquareFloor', x: 18.5, y: 8.5 },
    { m: 'pottedPlant', x: 23.5, y: 12.4 },
  ],
  bibliotheque: [
    { m: 'loungeChair', x: 22.7, y: 17.6, r: -90 },
    { m: 'lampRoundFloor', x: 23.5, y: 18.4 },
    { m: 'books', x: 18.2, y: 17.7, s: 1.2 },
  ],
  salon: [
    { m: 'loungeSofa', x: 0.55, y: 22.0, r: 90 },
    { m: 'loungeChair', x: 5.8, y: 21.3, r: -90 },
    { m: 'loungeChair', x: 5.8, y: 22.6, r: -90 },
    { m: 'lampRoundFloor', x: 0.5, y: 19.5 },
    { m: 'sideTableDrawers', x: 5.3, y: 19.45 },
    { m: 'radio', x: 5.3, y: 19.45, z: 0.52, s: 0.9 },
    { m: 'pottedPlant', x: 0.5, y: 24.4 },
  ],
  hall: [
    { m: 'stairs', x: 9.9, y: 19.8, r: 90 },
    { m: 'coatRackStanding', x: 14.5, y: 18.5 },
    { m: 'bench', x: 14.55, y: 22.6, r: -90 },
    { m: 'bench', x: 14.55, y: 23.4, r: -90 },
    { m: 'pottedPlant', x: 9.5, y: 23.0 },
    { m: 'lampSquareFloor', x: 13.4, y: 18.4 },
  ],
  bureau: [
    { m: 'desk', x: 20.4, y: 21.55 },
    { m: 'chairDesk', x: 20.4, y: 22.25, r: 180 },
    { m: 'lampSquareTable', x: 19.9, y: 21.45, z: 0.5, s: 1 },
    { m: 'bookcaseClosedWide', x: 22.9, y: 21.4 },
    { m: 'sideTable', x: 18.6, y: 21.35 },
    { m: 'televisionVintage', x: 18.6, y: 21.35, z: 0.52, s: 0.8 },
    { m: 'loungeChairRelax', x: 23.3, y: 23.4, r: -90 },
  ],
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function load(name: string): Promise<THREE.Object3D> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/furniture/${name}.glb`).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return g.scene;
    });
    cache.set(name, p);
  }
  return p;
}

/**
 * Charge et place tous les meubles.
 * @param toWorld conversion (x, y en cases, hauteur) -> point 3D
 */
export async function buildFurniture(scene: THREE.Scene, toWorld: (x: number, y: number, h?: number) => THREE.Vector3) {
  const all = Object.values(FURNITURE).flat();
  await Promise.all(
    all.map(async (f) => {
      try {
        const obj = (await load(f.m)).clone(true);
        obj.scale.setScalar(SCALE * (f.s ?? 1));
        obj.rotation.y = ((f.r ?? 0) * Math.PI) / 180;
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const target = toWorld(f.x, f.y, f.z ?? 0);
        obj.position.set(target.x - center.x, target.y - box.min.y, target.z - center.z);
        scene.add(obj);
      } catch (e) {
        console.warn('Meuble introuvable :', f.m, e);
      }
    }),
  );
}
