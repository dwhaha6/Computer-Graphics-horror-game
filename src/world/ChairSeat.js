import * as THREE from 'three';

// Seated vs standing eye positions at the chair (chair is at z≈1.7, facing -z).
const SIT_POS = new THREE.Vector3(0, 1.30, 1.95);
const STAND_POS = new THREE.Vector3(0, 1.55, 2.25);
const NEAR = 1.5;

/**
 * The chair seat + handcuff state. The player starts seated and cuffed (can
 * look but not move). Unlocking the cuffs needs the spoon (canUncuff); without
 * it you only strain against them. Standing requires the cuffs unlocked; you
 * can sit back and re-cuff to look captive before the grandmother checks.
 */
export class ChairSeat {
  constructor({ player, camera, scene, chairPos, audio, canUncuff, onStruggle }) {
    this.player = player;
    this.camera = camera;
    this.audio = audio;
    this.chairPos = chairPos.clone();
    this.canUncuff = canUncuff || (() => true);
    this.onStruggle = onStruggle || (() => {});

    this.sitting = true;
    this.cuffsLocked = true;

    this.camera.position.copy(SIT_POS);
    this.player.enabled = false;

    this._buildCuffs(scene);
    this._setCuffVisual();
  }

  _buildCuffs(scene) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a94, roughness: 0.4, metalness: 0.9 });
    this.cuffRoot = new THREE.Group();

    // wall anchor on the +z wall behind the chair
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), metal);
    anchor.position.set(0, 1.05, 2.9);
    // chain (anchor -> wrists)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.72, 6), metal);
    chain.rotation.x = Math.PI / 2;
    chain.position.set(0, 1.0, 2.54);
    this.cuffRoot.add(anchor, chain);

    // two wrist rings, grouped so they can drop/open when unlocked
    // wrists (forearm + a real-ish hand with fingers) bound into the cuff rings,
    // so you see your own cuffed hands when you look back.
    const skin = new THREE.MeshStandardMaterial({ color: 0xb98a6e, roughness: 0.78, metalness: 0.0 });
    const makeHand = (mirror) => {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.03, 0.07), skin);
      hand.add(palm);
      for (let i = 0; i < 4; i++) {                 // four fingers, slightly curled
        const len = 0.052 - Math.abs(i - 1.5) * 0.005;
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, len), skin);
        f.position.set(-0.028 + i * 0.018, -0.003, 0.04 + len / 2);
        f.rotation.x = 0.55;
        hand.add(f);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.04), skin);
      thumb.position.set(mirror * 0.045, -0.006, 0.018);
      thumb.rotation.set(0.3, 0, mirror * -0.7);
      hand.add(thumb);
      return hand;
    };

    this.cuffRings = new THREE.Group();
    for (const sx of [-0.075, 0.075]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 10, 20), metal);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(sx, 0.98, 2.12);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.2, 12), skin);
      forearm.rotation.x = Math.PI / 2;
      forearm.position.set(sx, 0.975, 2.0);

      const hand = makeHand(sx < 0 ? -1 : 1);
      hand.position.set(sx, 0.965, 2.17);

      this.cuffRings.add(ring, forearm, hand);
    }
    this.cuffRoot.add(this.cuffRings);
    scene.add(this.cuffRoot);
  }

  _setCuffVisual() {
    // hands + cuffs only shown while actually cuffed
    this.cuffRoot.visible = this.cuffsLocked;
  }

  isSitting() { return this.sitting; }
  isCuffed() { return this.cuffsLocked; }
  nearChair() {
    const p = this.camera.position;
    return Math.hypot(p.x - this.chairPos.x, p.z - this.chairPos.z) < NEAR;
  }

  prompts() {
    const out = [];
    if (this.sitting) {
      if (this.cuffsLocked) {
        out.push({ key: 'F', label: '수갑 풀기' });
      } else {
        out.push({ key: 'E', label: '일어나기' });
        out.push({ key: 'F', label: '수갑 다시 채우기' });
      }
    } else if (this.nearChair()) {
      out.push({ key: 'E', label: '앉기' });
    }
    return out;
  }

  pressE() {
    if (this.sitting) { if (!this.cuffsLocked) this._stand(); }
    else if (this.nearChair()) this._sit();
  }

  pressF() {
    if (!this.sitting) return;
    if (this.cuffsLocked) {
      if (!this.canUncuff()) { this.onStruggle(); return; } // no tool → only strain
      this.cuffsLocked = false;
      this._setCuffVisual();
      if (this.audio) this.audio.oneShot('handle', 0.6);
    } else {
      this.cuffsLocked = true;
      this._setCuffVisual();
      if (this.audio) this.audio.oneShot('handle', 0.6);
    }
  }

  restrain() {
    this.sitting = true;
    this.cuffsLocked = true;
    this.player.enabled = false;
    this.camera.position.copy(SIT_POS);
    this._setCuffVisual();
  }

  /** Respawn standing & free at an arbitrary spot (mid-game checkpoint). */
  freeStand(x, z) {
    this.sitting = false;
    this.cuffsLocked = false;
    this.player.enabled = true;
    this.camera.position.set(x, STAND_POS.y, z);
    this._setCuffVisual();
  }

  _sit() {
    this.sitting = true;
    this.player.enabled = false;
    this.camera.position.copy(SIT_POS);
    if (this.audio) this.audio.oneShot('handle', 0.3);
  }
  _stand() {
    this.sitting = false;
    this.camera.position.copy(STAND_POS);
    this.player.enabled = true;
  }
}
