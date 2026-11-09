// Personnage articulé en formes simples (style figurine « low poly »).
// Bras et jambes sont montés sur des pivots pour pouvoir animer la marche.

import * as THREE from 'three';

export interface Figure {
  root: THREE.Group;
  /** Avance l'animation : `walking` = vrai pendant un déplacement. */
  animate(dt: number, walking: boolean): void;
}

const SKIN = 0xf1c7a1;

function mat(color: number, rough = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}

export function makeFigure(color: number): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tout sauf l'ombre, pour le balancement
  root.add(body);

  const cloth = mat(color);
  const dark = mat(new THREE.Color(color).multiplyScalar(0.55).getHex());
  const skin = mat(SKIN, 0.8);
  const shoe = mat(0x2a2320);

  const cast = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Jambes (pivot à la hanche)
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.22, 4, 8);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.075, 0.36, 0);
    const leg = cast(new THREE.Mesh(legGeo, dark));
    leg.position.y = -0.16;
    const foot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.15), shoe));
    foot.position.set(0, -0.32, 0.03);
    pivot.add(leg, foot);
    body.add(pivot);
    legs.push(pivot);
  }

  // Buste (manteau évasé)
  const torso = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.4, 10), cloth));
  torso.position.y = 0.56;
  body.add(torso);
  const belt = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 10), dark));
  belt.position.y = 0.46;
  body.add(belt);

  // Bras (pivot à l'épaule)
  const armGeo = new THREE.CapsuleGeometry(0.042, 0.22, 4, 8);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.73, 0);
    const arm = cast(new THREE.Mesh(armGeo, cloth));
    arm.position.y = -0.15;
    arm.rotation.z = side * 0.12;
    const hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin));
    hand.position.set(side * 0.03, -0.3, 0);
    pivot.add(arm, hand);
    body.add(pivot);
    arms.push(pivot);
  }

  // Tête + chapeau
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin));
  head.position.y = 0.9;
  body.add(head);
  const brim = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14), dark));
  brim.position.y = 0.98;
  const crown = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 14), cloth));
  crown.position.y = 1.05;
  body.add(brim, crown);
  // Yeux (pour voir dans quel sens il regarde)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), mat(0x1a1a1a));
    eye.position.set(side * 0.04, 0.91, 0.1);
    body.add(eye);
  }

  // Ombre douce au sol
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  let phase = 0;
  let amount = 0; // 0 = immobile, 1 = marche franche
  return {
    root,
    animate(dt, walking) {
      amount += ((walking ? 1 : 0) - amount) * Math.min(1, dt * 10);
      phase += dt * (walking ? 11 : 2);
      const swing = Math.sin(phase) * 0.7 * amount;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
      body.position.y = Math.abs(Math.sin(phase)) * 0.035 * amount + Math.sin(phase * 0.5) * 0.004 * (1 - amount);
      body.rotation.z = Math.sin(phase) * 0.04 * amount;
    },
  };
}
