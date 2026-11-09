// Personnages 3D animés (Kenney « Mini Characters », licence CC0).
// Chaque fichier contient les animations : idle, walk, sit, emote-yes, emote-no, pick-up…

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { SuspectId } from '../games/cluedo/engine';
import type { Figure } from './figure';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const HEIGHT = 0.95; // taille d'un personnage, en cases

export async function loadCharacter(suspect: SuspectId, color: number): Promise<Figure & { emote(name: string): void }> {
  const url = `${import.meta.env.BASE_URL}models/characters/${suspect}.glb`;
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  // Mise à l'échelle sur la hauteur voulue
  const box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(HEIGHT / (box.max.y - box.min.y));
  model.position.y = 0.02;

  const root = new THREE.Group();
  root.add(model);

  // Socle coloré façon figurine de jeu de société, pour reconnaître le personnage
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.27, 0.05, 28),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }),
  );
  base.position.y = 0.025;
  base.castShadow = base.receiveShadow = true;
  root.add(base);
  model.position.y = 0.05;

  const mixer = new THREE.AnimationMixer(model);
  const clip = (name: string) => gltf.animations.find((a) => a.name === name);
  const idle = mixer.clipAction(clip('idle')!);
  const walk = mixer.clipAction(clip('walk')!);
  walk.timeScale = 1.4;
  idle.play();
  walk.play();
  walk.weight = 0;
  let w = 0;
  let oneShot: THREE.AnimationAction | null = null;

  return {
    root,
    animate(dt, walking) {
      w += ((walking ? 1 : 0) - w) * Math.min(1, dt * 8);
      const free = oneShot ? 0 : 1;
      walk.setEffectiveWeight(w * free);
      idle.setEffectiveWeight((1 - w) * free);
      mixer.update(dt);
    },
    /** Joue une animation une fois (ex. « emote-yes »), puis revient à l'attente. */
    emote(name: string) {
      const c = clip(name);
      if (!c) return;
      oneShot?.stop();
      const a = mixer.clipAction(c);
      a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
      a.clampWhenFinished = false;
      oneShot = a;
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== a) return;
        mixer.removeEventListener('finished', done as never);
        oneShot = null;
      };
      mixer.addEventListener('finished', done as never);
    },
  };
}
