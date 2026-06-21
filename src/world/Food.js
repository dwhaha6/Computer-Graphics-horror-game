import * as THREE from 'three';

const POS = new THREE.Vector3(-0.15, 0.80, 0.95); // on the dining table, in front of the chair

/**
 * The grandmother's "meal" — a bowl of maggot soup on the table. E eats it (a
 * pained groan each time). Eating it 3 times in a row, with no other action in
 * between, kills you (maggot image). Handled by main via onEat.
 */
export class Food {
  constructor({ scene, onEat, canEat }) {
    this.scene = scene;
    this.onEat = onEat || (() => {});
    this.canEat = canEat || (() => true);   // e.g. only with a spoon in hand
    this._build();
  }

  _build() {
    const g = new THREE.Group();
    this.bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.07, 0.055, 20),
      new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.7 }),
    );
    this.bowl.position.y = 0.025;
    const soup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.092, 0.092, 0.02, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a3f28, roughness: 0.45 }),
    );
    soup.position.y = 0.045;
    g.add(this.bowl, soup);
    for (let i = 0; i < 7; i++) {                 // a few pale maggots on top
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshStandardMaterial({ color: 0xe6ddc8 }));
      m.scale.set(1, 1, 2.2);
      m.position.set(Math.sin(i * 1.7) * 0.055, 0.05, Math.cos(i * 2.3) * 0.055);
      m.rotation.y = i; g.add(m);
    }
    g.position.copy(POS);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
  }

  meshes() { return [this.bowl]; }

  getPrompt(ctx) {
    if (ctx.lookingAt !== this.bowl || ctx.dist > 2.6) return null;
    return this.canEat() ? '[E] 먹는다…' : '[E] 먹는다 — 떠먹을 도구가 필요하다';
  }

  interact() { if (this.canEat()) this.onEat(); }
}
