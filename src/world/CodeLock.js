import * as THREE from 'three';

const POS = new THREE.Vector3(-3.92, 1.3, -0.5); // on the -x wall (left, by the lantern)

/**
 * A wall-mounted 4-letter code device (answer GOLD). E opens the letter dial UI
 * (handled in main); solving it drops a ladder.
 */
export class CodeLock {
  constructor({ scene, onTryEnter }) {
    this.scene = scene;
    this.onTryEnter = onTryEnter || (() => {});
    this.solved = false;
    this.code = 'GOLD';
    this._build();
  }

  _build() {
    this.body = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.32, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.5, metalness: 0.6 }),
    );
    this.body.position.copy(POS);
    this.body.castShadow = true;
    this.scene.add(this.body);

    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0b2a1c, emissive: 0x0c3a26, emissiveIntensity: 0.7 }),
    );
    this.screen.position.set(POS.x + 0.04, POS.y + 0.07, POS.z);
    this.screen.rotation.y = Math.PI / 2; // face +x (into the room)
    this.scene.add(this.screen);
  }

  meshes() { return [this.body, this.screen]; }

  getPrompt(ctx) {
    if (ctx.lookingAt !== this.body && ctx.lookingAt !== this.screen) return null;
    if (ctx.dist > 2.3) return null;
    return this.solved ? null : '[E] 암호 장치 (영문 4자리)';
  }

  interact() { if (!this.solved) this.onTryEnter(); }
  solve() {
    this.solved = true;
    this.screen.material.color.set(0x114433);
    this.screen.material.emissive.set(0x1aff88);
  }
}
