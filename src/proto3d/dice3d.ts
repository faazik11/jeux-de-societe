// Dés 3D lancés avec une vraie physique (cannon-es).
//
// Le moteur de règles a déjà tiré les valeurs : on simule d'abord le lancer « en avance »
// (sans l'afficher), on regarde quelle face finit en haut, puis on colle les bons chiffres
// sur les faces pour que le résultat affiché soit exactement celui du moteur. Enfin on rejoue
// la simulation enregistrée à l'écran.

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const SIZE = 0.42;

/** Texture d'une face (points noirs sur fond ivoire). */
function faceTexture(value: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f1e3';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d8ccb0';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  const pos: Record<number, [number, number][]> = {
    1: [[64, 64]],
    2: [[34, 34], [94, 94]],
    3: [[32, 32], [64, 64], [96, 96]],
    4: [[34, 34], [94, 34], [34, 94], [94, 94]],
    5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
    6: [[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]],
  };
  g.fillStyle = value === 1 ? '#a3201b' : '#1d1d1d';
  for (const [x, y] of pos[value]) {
    g.beginPath();
    g.arc(x, y, value === 1 ? 15 : 11, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FACE_MATS = [1, 2, 3, 4, 5, 6].map(
  (v) => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.35 }),
);

// Normales locales des 6 faces d'une BoxGeometry, dans l'ordre des matériaux : +x, -x, +y, -y, +z, -z
const NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const OPPOSITE = [1, 0, 3, 2, 5, 4];

interface Frame {
  p: THREE.Vector3[];
  q: THREE.Quaternion[];
}

export interface DiceTable {
  /** Centre de la zone de lancer (coordonnées 3D) */
  center: THREE.Vector3;
  /** Demi-largeur (x) et demi-profondeur (z) de la zone */
  halfX: number;
  halfZ: number;
  /** Hauteur de la surface */
  y: number;
}

export class Dice3D {
  private meshes: THREE.Mesh[] = [];

  constructor(private scene: THREE.Scene, private table: DiceTable) {}

  /** Lance les dés et se termine quand ils sont immobiles. `onFrame` reçoit la position moyenne (pour la caméra). */
  async roll(values: number[], onFrame?: (center: THREE.Vector3) => void): Promise<void> {
    this.clear();
    const { frames, tops } = this.simulate(values.length);

    // Une boîte par dé, avec les chiffres placés pour tomber sur la bonne valeur
    values.forEach((v, i) => {
      const mats = this.assignFaces(tops[i], v);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    });

    // Lecture de la simulation enregistrée, à vitesse réelle
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const step = () => {
        const f = Math.min(frames.length - 1, Math.floor(((performance.now() - start) / 1000) * 60));
        const fr = frames[f];
        this.meshes.forEach((m, i) => {
          m.position.copy(fr.p[i]);
          m.quaternion.copy(fr.q[i]);
        });
        const c = fr.p.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / fr.p.length);
        onFrame?.(c);
        if (f >= frames.length - 1) resolve();
        else requestAnimationFrame(step);
      };
      step();
    });
  }

  clear() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
  }

  /** Choisit l'ordre des chiffres sur les faces pour que `top` affiche `value` (faces opposées = 7). */
  private assignFaces(top: number, value: number): THREE.Material[] {
    const faces: number[] = new Array(6).fill(0);
    faces[top] = value;
    faces[OPPOSITE[top]] = 7 - value;
    const rest = [1, 2, 3, 4, 5, 6].filter((v) => v !== value && v !== 7 - value);
    // les deux paires restantes, en gardant des faces opposées qui font 7
    const pairs = [rest[0], 7 - rest[0]];
    const sides = [0, 2, 4].filter((i) => i !== top && i !== OPPOSITE[top]);
    faces[sides[0]] = pairs[0];
    faces[OPPOSITE[sides[0]]] = pairs[1];
    const last = rest.filter((v) => v !== pairs[0] && v !== pairs[1]);
    faces[sides[1]] = last[0];
    faces[OPPOSITE[sides[1]]] = last[1];
    return faces.map((v) => FACE_MATS[v - 1]);
  }

  /** Simulation physique complète, enregistrée image par image. */
  private simulate(count: number): { frames: Frame[]; tops: number[] } {
    const t = this.table;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
    world.allowSleep = true;
    const mat = new CANNON.Material('m');
    world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.25, restitution: 0.45 }));

    // Table + bords invisibles
    const plane = (pos: CANNON.Vec3, axis: CANNON.Vec3, angle: number) => {
      const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
      b.position.copy(pos);
      b.quaternion.setFromAxisAngle(axis, angle);
      world.addBody(b);
    };
    const c = t.center;
    plane(new CANNON.Vec3(c.x, t.y, c.z), new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    plane(new CANNON.Vec3(c.x - t.halfX, 0, c.z), new CANNON.Vec3(0, 1, 0), Math.PI / 2);
    plane(new CANNON.Vec3(c.x + t.halfX, 0, c.z), new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
    plane(new CANNON.Vec3(c.x, 0, c.z - t.halfZ), new CANNON.Vec3(0, 1, 0), 0);
    plane(new CANNON.Vec3(c.x, 0, c.z + t.halfZ), new CANNON.Vec3(0, 1, 0), Math.PI);

    const bodies: CANNON.Body[] = [];
    for (let i = 0; i < count; i++) {
      const b = new CANNON.Body({
        mass: 1,
        material: mat,
        shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)),
        sleepSpeedLimit: 0.15,
        sleepTimeLimit: 0.25,
        linearDamping: 0.1,
        angularDamping: 0.1,
      });
      // On lance depuis le bord avant de la table, vers le fond
      b.position.set(c.x - 0.6 + i * 0.7, t.y + 1.6 + i * 0.2, c.z + t.halfZ - 0.5);
      b.velocity.set((Math.random() - 0.5) * 3, 2 + Math.random(), -(6 + Math.random() * 3));
      b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      b.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      world.addBody(b);
      bodies.push(b);
    }

    const frames: Frame[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      world.step(1 / 60);
      frames.push({
        p: bodies.map((b) => new THREE.Vector3(b.position.x, b.position.y, b.position.z)),
        q: bodies.map((b) => new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)),
      });
      if (i > 30 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    // Face du haut de chaque dé à la fin
    const last = frames[frames.length - 1];
    const up = new THREE.Vector3(0, 1, 0);
    const tops = last.q.map((q) => {
      let best = 0;
      let bestDot = -2;
      NORMALS.forEach((n, i) => {
        const d = n.clone().applyQuaternion(q).dot(up);
        if (d > bestDot) {
          bestDot = d;
          best = i;
        }
      });
      return best;
    });
    // Quelques images d'arrêt pour laisser le temps de lire
    for (let i = 0; i < 20; i++) frames.push(last);
    return { frames, tops };
  }
}
