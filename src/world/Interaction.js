import * as THREE from 'three';

/**
 * Crosshair raycast + proximity interaction. Each registered item exposes:
 *   meshes()            -> array of meshes to raycast against (optional)
 *   getPrompt(ctx)      -> string | null   (ctx: {playerPos, lookingAt, dist})
 *   interact(ctx)       -> perform the action
 * The item whose mesh is under the crosshair wins; otherwise the first item
 * that returns a proximity prompt (e.g. "hang the lantern" near the hook).
 */
export class InteractionSystem {
  constructor(camera) {
    this.camera = camera;
    this.ray = new THREE.Raycaster();
    this.ray.far = 3.2;
    this.items = [];
    this.prompt = null;
    this._best = null;
    this._center = new THREE.Vector2(0, 0);
  }

  add(item) { this.items.push(item); return item; }

  update() {
    this.ray.setFromCamera(this._center, this.camera);
    const meshes = [];
    for (const it of this.items) {
      if (!it.meshes) continue;
      for (const m of it.meshes()) { m.userData._owner = it; meshes.push(m); }
    }
    const hits = meshes.length ? this.ray.intersectObjects(meshes, false) : [];
    const lookingAt = hits.length ? hits[0].object : null;
    const lookDist = hits.length ? hits[0].distance : Infinity;
    const ctx = { playerPos: this.camera.position, lookingAt, dist: lookDist };

    // Prefer the item under the crosshair.
    let best = null, prompt = null;
    if (lookingAt && lookingAt.userData._owner) {
      const it = lookingAt.userData._owner;
      const p = it.getPrompt && it.getPrompt(ctx);
      if (p) { best = it; prompt = p; }
    }
    if (!best) {
      for (const it of this.items) {
        const p = it.getPrompt && it.getPrompt(ctx);
        if (p) { best = it; prompt = p; break; }
      }
    }
    this._best = best;
    this.prompt = prompt;
    return prompt;
  }

  current() { return this._best; }

  tryInteract() {
    if (this._best && this._best.interact) {
      this._best.interact({ playerPos: this.camera.position });
    }
  }
}
