import * as THREE from 'three';

/**
 * A world pickup: a 3D item resting in the scene that the player can look at
 * and grab with E. Plugs into InteractionSystem (meshes/getPrompt/interact).
 */
export class PickupItem {
  constructor({ scene, def, position, rotation, onPickup, canInteract }) {
    this.scene = scene;
    this.def = def;
    this.onPickup = onPickup || (() => {});
    this.canInteract = canInteract || null; // optional gate (e.g. only when drawer open)
    this.picked = false;

    this.mesh = def.makeMesh();
    this.mesh.position.copy(position);
    if (rotation) this.mesh.rotation.copy(rotation);
    scene.add(this.mesh);

    this._targets = [];
    this.mesh.traverse((o) => { if (o.isMesh) this._targets.push(o); });
  }

  meshes() { return this.picked ? [] : this._targets; }

  getPrompt(ctx) {
    if (this.picked || (this.canInteract && !this.canInteract())) return null;
    if (this._targets.includes(ctx.lookingAt) && ctx.dist < 2.6) return `[E] ${this.def.name} 집기`;
    return null;
  }

  interact() {
    if (this.picked || (this.canInteract && !this.canInteract())) return;
    this.picked = true;
    this.scene.remove(this.mesh);
    this.onPickup(this.def);
  }
}
