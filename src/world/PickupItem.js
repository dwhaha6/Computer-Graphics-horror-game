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

    // Forgiving hit target: the visible items are THIN (a spoon, a key, a thin
    // clock hand), so a crosshair that looks "on" the item can still slip
    // between the thin parts and miss — painful on low-FPS machines where the
    // mouse-look is jumpy. Add an invisible solid box hugging the item's own
    // silhouette so anywhere on it registers. Sized to the item's OWN bounds so
    // it never bleeds onto a neighbouring interactable (e.g. the soup bowl).
    const _b = new THREE.Box3().setFromObject(this.mesh);
    const _c = _b.getCenter(new THREE.Vector3());
    const _s = _b.getSize(new THREE.Vector3());
    const _hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(_s.x * 1.15, 0.07), Math.max(_s.y * 1.15, 0.07), Math.max(_s.z * 1.15, 0.07)),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    _hit.position.copy(_c);
    this.mesh.add(_hit);                 // child → inherits the item's transform, removed with it on pickup

    this.mesh.position.copy(position);
    if (rotation) this.mesh.rotation.copy(rotation);
    scene.add(this.mesh);

    this._targets = [];
    this.mesh.traverse((o) => { if (o.isMesh) this._targets.push(o); }); // includes the invisible hitbox
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
