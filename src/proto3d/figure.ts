// Bonhomme simple, entièrement à la couleur de son personnage (style pion de jeu de société).
// Bras et jambes sont montés sur des pivots pour animer la marche.

import * as THREE from 'three';

export interface Figure {
  root: THREE.Group;
  /** Avance l'animation : `walking` = vrai pendant un déplacement. */
  animate(dt: number, walking: boolean): void;
  /** Petit saut de joie (en entrant dans une pièce, par exemple). */
  emote(name?: string): void;
}

export function makeFigure(color: number): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const c = new THREE.Color(color);
  const main = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05 });
  const darker = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.6), roughness: 0.5 });
  const lighter = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.4 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const cast = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Socle
  const base = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 28), darker));
  base.position.y = 0.025;
  root.add(base);

  // Jambes
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.4, 0);
    const leg = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 10), darker));
    leg.position.y = -0.17;
    pivot.add(leg);
    body.add(pivot);
    legs.push(pivot);
  }

  // Corps (rond, façon bonhomme)
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 6, 16), main));
  torso.position.y = 0.6;
  body.add(torso);

  // Bras
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.72, 0);
    const arm = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), main));
    arm.position.set(side * 0.03, -0.14, 0);
    arm.rotation.z = side * 0.18;
    pivot.add(arm);
    body.add(pivot);
    arms.push(pivot);
  }

  // Tête
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), lighter));
  head.position.y = 1.0;
  body.add(head);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), white);
    eye.position.set(side * 0.06, 1.02, 0.135);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat);
    pupil.position.set(side * 0.06, 1.02, 0.163);
    body.add(eye, pupil);
  }

  // Ombre douce
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.011;
  root.add(shadow);

  let phase = 0;
  let amount = 0;
  let jump = 0; // > 0 pendant un saut de joie
  return {
    root,
    animate(dt, walking) {
      amount += ((walking ? 1 : 0) - amount) * Math.min(1, dt * 10);
      phase += dt * (walking ? 11 : 2.2);
      const swing = Math.sin(phase) * 0.75 * amount;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.9;
      arms[1].rotation.x = swing * 0.9;
      let y = Math.abs(Math.sin(phase)) * 0.04 * amount + Math.sin(phase * 0.5) * 0.006 * (1 - amount);
      if (jump > 0) {
        jump = Math.max(0, jump - dt * 1.6);
        const t = 1 - jump;
        const hop = Math.abs(Math.sin(t * Math.PI * 2)) * 0.22 * jump;
        y += hop;
        arms[0].rotation.z = -2.4 * jump;
        arms[1].rotation.z = 2.4 * jump;
      } else {
        arms[0].rotation.z = 0;
        arms[1].rotation.z = 0;
      }
      body.position.y = y;
      body.rotation.z = Math.sin(phase) * 0.05 * amount;
    },
    emote() {
      jump = 1;
    },
  };
}
