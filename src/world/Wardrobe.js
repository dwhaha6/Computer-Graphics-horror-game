import * as THREE from 'three';

const POS = new THREE.Vector3(-3.6, 1.0, -1.5); // against the -x wall
export const NOTE_SPOT = new THREE.Vector3(-3.62, 0.09, -1.5); // on the interior floor

/**
 * Locked, HOLLOW wardrobe (장롱). With the minute-hand key, E unlocks and opens
 * it, revealing the clue note on its floor. After that E toggles open/close —
 * and you must close it again before she comes (a closed wardrobe is one of the
 * three things she checks). Hiding inside is a later feature.
 */
export class Wardrobe {
  constructor({ scene, proxyScene, hasKey, onOpen, onOpened }) {
    this.scene = scene;
    this.proxyScene = proxyScene;
    this.hasKey = hasKey || (() => false);
    this.onOpen = onOpen || (() => {});
    this.onOpened = onOpened || (() => {}); // fired each time the doors open
    this.locked = true;
    this.open = false;
    this.hidden = false;     // player is hiding inside
    this.crackMode = false;  // doors creak slightly ajar (for the hide jump-scare)
    this.solids = [];
    this._build();
  }

  canHide() { return !this.locked; }              // unlocked (you've opened it) → you can hide
  isHiding() { return this.hidden; }
  hide() { this.hidden = true; this.open = false; }
  unhide() { this.hidden = false; this.crackMode = false; }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.72 });
    const t = 0.04;
    const W = 0.5, H = 2.0, D = 1.25; // exterior x,y,z
    const panel = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    // hollow shell: back, bottom, top, two sides — front open for the doors
    this.back = panel(t, H, D, POS.x - W / 2 + t / 2, POS.y, POS.z);
    panel(W, t, D, POS.x, POS.y - H / 2 + t / 2, POS.z);                 // bottom
    panel(W, t, D, POS.x, POS.y + H / 2 - t / 2, POS.z);                 // top
    panel(W, H, t, POS.x, POS.y, POS.z - D / 2 + t / 2);                 // -z side
    panel(W, H, t, POS.x, POS.y, POS.z + D / 2 - t / 2);                 // +z side

    // proxy occluder (full box is fine for GI)
    const prox = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
    prox.position.copy(POS); this.proxyScene.add(prox);
    this.solids.push({ minX: POS.x - 0.25, maxX: POS.x + 0.25, minZ: POS.z - 0.62, maxZ: POS.z + 0.62 });

    // two doors hinged at the outer z edges, on the +x (room-facing) side
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.6, metalness: 0.05 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.4, metalness: 0.8 });
    this.doors = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(POS.x + W / 2, POS.y, POS.z + side * (D / 2 - 0.01));
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 0.04, D / 2 - 0.02), doorMat);
      door.position.set(0, 0, -side * (D / 4));
      door.castShadow = true;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), handleMat);
      handle.position.set(0.03, 0, -side * (D / 2 - 0.1));
      door.add(handle);
      pivot.add(door);
      this.scene.add(pivot);
      this.doors.push({ pivot, door, side });
    }
  }

  isClosed() { return !this.open; }

  meshes() { return [this.back, ...this.doors.map((d) => d.door)]; }

  getPrompt(ctx) {
    if (this.hidden) return null;
    const hit = ctx.lookingAt === this.back || this.doors.some((d) => d.door === ctx.lookingAt);
    if (!hit || ctx.dist > 2.5) return null;
    if (this.locked) return this.hasKey() ? '[E] 장롱 열기 (분침 사용)' : '[E] 잠겨 있다 — 열쇠가 필요하다';
    return (this.open ? '[E] 장롱 닫기' : '[E] 장롱 열기') + '  ·  [F] 숨기';
  }

  interact() {
    if (this.locked) {
      if (!this.hasKey()) return;
      this.locked = false; this.open = true;
      this.onOpen(); this.onOpened();
      return;
    }
    this.open = !this.open;
    if (this.open) this.onOpened();
  }

  update(dt) {
    for (const d of this.doors) {
      const target = this.crackMode ? d.side * 0.4 : (this.open ? d.side * 1.85 : 0);
      const speed = this.crackMode ? 2.2 : 6; // slow, creeping crack for the scare
      d.pivot.rotation.y = THREE.MathUtils.damp(d.pivot.rotation.y, target, speed, dt);
    }
  }
}
