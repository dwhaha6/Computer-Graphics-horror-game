import * as THREE from 'three';

const HOOK_POS = new THREE.Vector3(-3.85, 1.45, 1.8); // on the -x wall
const HANG_RANGE = 1.9;
const PICK_RANGE = 2.6;

/**
 * The wall lantern — the player's portable light AND a "trace" object.
 * Hangs on the wall (off). Pick it up to light your way (it becomes a moving
 * point light → travelling DDGI bounce). You must hang it back before the
 * captor checks, or the disturbed room gives you away.
 */
export class Lantern {
  constructor({ scene, lights, camera }) {
    this.scene = scene;
    this.lights = lights;
    this.camera = camera;
    this.held = false;
    this.hookPos = HOOK_POS.clone();
    this._bob = 0;
    this._build();
  }

  _build() {
    // wall hook bracket
    this.hook = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.8 }),
    );
    this.hook.position.copy(this.hookPos).add(new THREE.Vector3(0.06, 0.12, 0));
    this.scene.add(this.hook);

    // invisible, forgiving raycast target around the hook — used (only while
    // holding the lantern) so hanging requires LOOKING at the wall hook.
    this.hangTarget = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.55, 0.35),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.hangTarget.position.copy(this.hookPos);
    this.scene.add(this.hangTarget);

    // lantern body
    this.mesh = new THREE.Group();
    this.cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.085, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.5, metalness: 0.6 }),
    );
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0, emissive: 0xffb050, emissiveIntensity: 0.0, roughness: 0.2,
    });
    this.glass = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), this.glassMat);
    this.mesh.add(this.cage); this.mesh.add(this.glass);
    this.mesh.position.copy(this.hookPos);
    this.scene.add(this.mesh);
  }

  // raycast against the lantern body when on the wall; against the hook target
  // when carried (so you must face the wall to hang it).
  meshes() { return this.held ? [this.hangTarget] : [this.cage, this.glass]; }
  isOnHook() { return !this.held; }
  isDisturbed() { return this.held; }

  getPrompt(ctx) {
    if (!this.held) {
      const looking = ctx.lookingAt === this.cage || ctx.lookingAt === this.glass;
      if (looking && ctx.dist < PICK_RANGE) return '[E] 랜턴 집기';
      return null;
    }
    if (ctx.lookingAt === this.hangTarget && ctx.dist < HANG_RANGE) return '[E] 벽에 걸기';
    return null;
  }

  interact(ctx) {
    if (!this.held) { this._pickUp(); return; }
    if (ctx.playerPos.distanceTo(this.hookPos) < HANG_RANGE) this._hang();
  }

  _pickUp() {
    this.held = true;
    this.lights.setIntensity(this.lights.lantern, 6.5);
    this.glassMat.emissiveIntensity = 3.0;
  }

  _hang() {
    this.held = false;
    this.mesh.position.copy(this.hookPos);
    this.mesh.quaternion.identity();
    this.lights.setIntensity(this.lights.lantern, 0.0);
    this.lights.setPosition(this.lights.lantern, this.hookPos.x, this.hookPos.y, this.hookPos.z);
    this.glassMat.emissiveIntensity = 0.0;
  }

  update(dt) {
    if (!this.held) return;
    this._bob += dt * 6;
    const off = new THREE.Vector3(0.34, -0.30 + Math.sin(this._bob) * 0.012, -0.55);
    off.applyQuaternion(this.camera.quaternion);
    const p = this.camera.position.clone().add(off);
    this.mesh.position.copy(p);
    this.mesh.quaternion.copy(this.camera.quaternion);
    this.lights.setPosition(this.lights.lantern, p.x, p.y, p.z);
  }
}
