// Armes en métal gris (comme les petites armes en métal du jeu en vrai) :
// un matériau métallique qui reflète la lumière, différent du reste du décor.

import * as THREE from 'three';
import type { WeaponId } from '../games/cluedo/engine';

export function makeWeapon(id: WeaponId, envMap: THREE.Texture | null): THREE.Group {
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb9bec6,
    metalness: 1,
    roughness: 0.28,
    envMap,
    envMapIntensity: 1.4,
  });
  const darkMetal = metal.clone();
  darkMetal.color.set(0x7d838c);
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material = metal) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  switch (id) {
    case 'chandelier': {
      // Chandelier debout
      add(new THREE.CylinderGeometry(0.11, 0.13, 0.03, 20)).position.y = 0.015;
      add(new THREE.CylinderGeometry(0.025, 0.04, 0.26, 12)).position.y = 0.16;
      add(new THREE.SphereGeometry(0.045, 12, 10)).position.y = 0.12;
      add(new THREE.CylinderGeometry(0.06, 0.035, 0.05, 14)).position.y = 0.3;
      const candle = add(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), darkMetal);
      candle.position.y = 0.37;
      break;
    }
    case 'poignard': {
      // Poignard couché
      const blade = add(new THREE.ConeGeometry(0.035, 0.32, 4));
      blade.rotation.z = -Math.PI / 2;
      blade.scale.set(1, 1, 0.3);
      blade.position.set(0.12, 0.02, 0);
      const guard = add(new THREE.BoxGeometry(0.03, 0.025, 0.14), darkMetal);
      guard.position.set(-0.05, 0.02, 0);
      const grip = add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), darkMetal);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(-0.12, 0.02, 0);
      add(new THREE.SphereGeometry(0.03, 10, 8)).position.set(-0.19, 0.02, 0);
      break;
    }
    case 'tuyau': {
      // Tuyau de plomb coudé
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.2, 0.035, 0),
        new THREE.Vector3(0.05, 0.035, 0),
        new THREE.Vector3(0.13, 0.035, 0.05),
        new THREE.Vector3(0.16, 0.035, 0.16),
      ]);
      add(new THREE.TubeGeometry(curve, 24, 0.032, 10, false), darkMetal);
      const ring = add(new THREE.TorusGeometry(0.036, 0.01, 6, 14));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-0.2, 0.035, 0);
      break;
    }
    case 'revolver': {
      const barrel = add(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 12));
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.08, 0.06, 0);
      const drum = add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12), darkMetal);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(-0.04, 0.06, 0);
      const frame = add(new THREE.BoxGeometry(0.1, 0.05, 0.035));
      frame.position.set(-0.05, 0.06, 0);
      const grip = add(new THREE.BoxGeometry(0.045, 0.12, 0.035), darkMetal);
      grip.position.set(-0.11, 0.0, 0);
      grip.rotation.z = -0.35;
      // couché sur le côté
      g.rotation.x = Math.PI / 2;
      g.position.y = 0.02;
      break;
    }
    case 'corde': {
      // Corde enroulée (en métal, comme la figurine du jeu)
      const coil = add(new THREE.TorusGeometry(0.1, 0.025, 8, 24));
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.025;
      const coil2 = add(new THREE.TorusGeometry(0.075, 0.025, 8, 24), darkMetal);
      coil2.rotation.x = Math.PI / 2;
      coil2.position.y = 0.07;
      const knot = add(new THREE.TorusKnotGeometry(0.035, 0.014, 32, 6));
      knot.position.set(0.14, 0.04, 0.06);
      break;
    }
    case 'cle': {
      // Clé anglaise
      const handle = add(new THREE.BoxGeometry(0.28, 0.025, 0.045));
      handle.position.set(-0.03, 0.015, 0);
      const head = add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), darkMetal);
      head.position.set(0.14, 0.015, 0);
      const notch = add(new THREE.BoxGeometry(0.06, 0.032, 0.04), new THREE.MeshBasicMaterial({ color: 0x14151b }));
      notch.position.set(0.18, 0.016, 0);
      break;
    }
  }
  // Un peu plus gros pour bien les voir
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.scale.setScalar(1.25);
  return wrap;
}
