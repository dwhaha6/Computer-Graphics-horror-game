import * as THREE from 'three';

// Low barred opening on the +z wall, behind where the player was tied.
const POS = new THREE.Vector3(0, 0.85, 3.93);

/**
 * An iron-barred window to the next room. It's set low, so you must crouch (C)
 * to look through; then E talks to the prisoner on the other side. Later the
 * hidden-ending path passes a key through these bars.
 */
export class Bars {
  constructor({ scene, isCrouching, isSeated, onTalk }) {
    this.scene = scene;
    this.isCrouching = isCrouching || (() => false);
    this.isSeated = isSeated || (() => false);
    this.onTalk = onTalk || (() => {});
    this._build();
  }

  _build() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x33333a, roughness: 0.5, metalness: 0.85 });
    const g = new THREE.Group();

    // dark recess (the next room beyond)
    const recess = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.DoubleSide }),
    );
    recess.position.set(POS.x, POS.y, POS.z);
    recess.rotation.y = Math.PI;
    g.add(recess);

    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), metal);
      bar.position.set(POS.x + i * 0.11, POS.y, POS.z - 0.03);
      bar.castShadow = true;
      g.add(bar);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.09), metal); top.position.set(POS.x, POS.y + 0.27, POS.z - 0.03);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.09), metal); bot.position.set(POS.x, POS.y - 0.27, POS.z - 0.03);
    g.add(top, bot);
    this.scene.add(g);

    // forgiving invisible interaction target in front of the bars
    this.target = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.target.position.set(POS.x, POS.y, POS.z - 0.22);
    this.scene.add(this.target);
  }

  meshes() { return [this.target]; }

  getPrompt(ctx) {
    if (this.isSeated()) return null;            // can't reach the bars while tied to the chair
    if (ctx.lookingAt !== this.target || ctx.dist > 2.3) return null;
    return this.isCrouching() ? '[E] 말을 건다' : '[C] 수그려서 들여다보기';
  }

  interact() { if (this.isCrouching()) this.onTalk(); }
}
