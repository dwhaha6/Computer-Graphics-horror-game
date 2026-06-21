import * as THREE from 'three';

const POS = new THREE.Vector3(0.7, 0.39, -3.62); // a 2nd desk, to the right of the clock desk

/**
 * A second desk with a HOLLOW drawer locked by a 4-digit code (9219). E at the
 * lock opens the dial UI (in main); a correct code unlocks it. Once unlocked, E
 * toggles the drawer open/closed. Items placed in `drawerGroup` slide with it.
 */
export class Drawer {
  constructor({ scene, proxyScene, onTryUnlock }) {
    this.scene = scene;
    this.proxyScene = proxyScene;
    this.onTryUnlock = onTryUnlock || (() => {});
    this.locked = true;
    this.open = false;
    this.code = '9219';
    this._slide = 0;
    this.solids = [];
    this._build();
  }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.7 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.78, 0.55), wood);
    desk.position.copy(POS);
    desk.castShadow = desk.receiveShadow = true;
    this.scene.add(desk);
    const prox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.78, 0.55), new THREE.MeshLambertMaterial({ color: 0x4a3526 }));
    prox.position.copy(POS);
    this.proxyScene.add(prox);
    this.solids.push({ minX: POS.x - 0.5, maxX: POS.x + 0.5, minZ: POS.z - 0.3, maxZ: POS.z + 0.3 });

    // hollow drawer tray (open top) — slides out toward +z; contents go inside it
    this._baseZ = POS.z + 0.03;
    this.drawerGroup = new THREE.Group();
    this.drawerGroup.position.set(POS.x, 0.5, this._baseZ);
    const dw = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.72 });
    const W = 0.72, H = 0.17, D = 0.46, t = 0.02;
    const panel = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dw);
      m.position.set(x, y, z); m.castShadow = true; this.drawerGroup.add(m); return m;
    };
    panel(W, t, D, 0, -H / 2 + t / 2, 0);          // bottom
    this.front = panel(W, H, t, 0, 0, D / 2 - t / 2); // front (carries the lock)
    panel(W, H, t, 0, 0, -D / 2 + t / 2);          // back
    panel(t, H, D, -W / 2 + t / 2, 0, 0);          // left side
    panel(t, H, D, W / 2 - t / 2, 0, 0);           // right side

    this.lock = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.07, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.4, metalness: 0.85 }),
    );
    this.lock.position.set(0, 0, D / 2 + 0.01);
    this.drawerGroup.add(this.lock);
    this.scene.add(this.drawerGroup);
  }

  meshes() { return [this.front, this.lock]; }

  getPrompt(ctx) {
    const hit = ctx.lookingAt === this.front || ctx.lookingAt === this.lock;
    if (!hit || ctx.dist > 2.3) return null;
    if (this.locked) return '[E] 자물쇠 — 번호 맞추기';
    return this.open ? '[E] 서랍 닫기' : '[E] 서랍 열기';
  }

  interact() {
    if (this.locked) { this.onTryUnlock(); return; }
    this.open = !this.open;
  }

  unlock() { this.locked = false; this.open = true; }
  isClosed() { return !this.open; }

  update(dt) {
    this._slide = THREE.MathUtils.damp(this._slide, this.open ? 1 : 0, 6, dt);
    this.drawerGroup.position.z = this._baseZ + this._slide * 0.34;
  }
}
