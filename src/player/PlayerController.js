import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const EYE_HEIGHT = 1.55;
const WALK_SPEED = 2.6;   // m/s
const RUN_SPEED = 3.8;
const CROUCH_SPEED = 1.3;
const ACCEL = 12.0;       // approach target velocity
const PLAYER_RADIUS = 0.28;

/**
 * First-person controller: PointerLockControls for look, WASD for move,
 * with simple AABB clamping against a "walkable" description (a set of
 * axis-aligned rectangles the player is allowed to stand in) plus solid
 * obstacle boxes to push out of.
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    camera.position.copy(this.position);

    // Walkable regions: list of {minX,maxX,minZ,maxZ}. Player center must
    // stay inside the union (inflated by -radius). Set via setWalkable().
    this.walkable = [{ minX: -3, maxX: 3, minZ: -3, maxZ: 3 }];
    // Solid obstacles to keep the player out of (furniture footprints).
    this.solids = []; // {minX,maxX,minZ,maxZ}

    this.locked = false;
    this.controls.addEventListener('lock', () => (this.locked = true));
    this.controls.addEventListener('unlock', () => (this.locked = false));

    this.enabled = true;
    this.crouching = false;
  }

  toggleCrouch() { this.crouching = !this.crouching; }

  get object() { return this.controls.getObject ? this.controls.getObject() : this.camera; }

  setWalkable(regions) { this.walkable = regions; }
  setSolids(boxes) { this.solids = boxes; }

  lock() { this.controls.lock(); }

  /** Is point (x,z) inside the walkable union, given player radius? */
  _insideWalkable(x, z) {
    for (const r of this.walkable) {
      if (x >= r.minX + PLAYER_RADIUS && x <= r.maxX - PLAYER_RADIUS &&
          z >= r.minZ + PLAYER_RADIUS && z <= r.maxZ - PLAYER_RADIUS) return true;
    }
    return false;
  }

  /** Resolve one axis at a time so the player slides along walls. */
  _tryMove(from, dx, dz) {
    let x = from.x, z = from.z;
    // X axis
    if (this._insideWalkable(x + dx, z) && !this._inSolid(x + dx, z)) x += dx;
    // Z axis
    if (this._insideWalkable(x, z + dz) && !this._inSolid(x, z + dz)) z += dz;
    return new THREE.Vector2(x, z);
  }

  _inSolid(x, z) {
    for (const s of this.solids) {
      if (x >= s.minX - PLAYER_RADIUS && x <= s.maxX + PLAYER_RADIUS &&
          z >= s.minZ - PLAYER_RADIUS && z <= s.maxZ + PLAYER_RADIUS) return true;
    }
    return false;
  }

  update(dt, input) {
    if (!this.enabled || !this.locked) return;

    const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // Camera-relative basis on the horizontal plane.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

    const wish = new THREE.Vector3()
      .addScaledVector(dir, forward)
      .addScaledVector(right, strafe);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    // Smooth toward wish velocity.
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x, ACCEL, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z, ACCEL, dt);

    const obj = this.object;
    const next = this._tryMove(obj.position, this.velocity.x * dt, this.velocity.z * dt);
    obj.position.x = next.x;
    obj.position.z = next.y;
    obj.position.y = this.crouching ? 0.95 : EYE_HEIGHT;
    this.position.copy(obj.position);
  }
}
