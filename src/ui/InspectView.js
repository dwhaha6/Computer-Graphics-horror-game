import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Full-screen item inspect: dark background with the item's 3D model rotating
 * in the centre, its name + description below. Opened on pickup (or from the
 * inventory); E closes it. Rendered directly to the canvas (bypasses the game
 * render + post) so it reads as a focused "examining the object" moment.
 */
export class InspectView {
  constructor(renderer) {
    this.renderer = renderer;
    this.isOpen = false;

    this.scene = new THREE.Scene();
    // neutral studio environment so metals get real reflections (no asset file)
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.cam = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
    this.cam.position.set(0, 0, 0.5);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.2); key.position.set(1, 1.4, 1.3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.1); rim.position.set(-1.2, -0.4, -1); this.scene.add(rim);
    this.holder = new THREE.Group(); this.scene.add(this.holder);

    this._buildDOM();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:13%;z-index:16;pointer-events:none;font-family:Georgia,serif;text-align:center';
    this.nameEl = document.createElement('div');
    this.nameEl.style.cssText = 'font-size:1.6rem;letter-spacing:.08em;color:#e8d8b0;text-shadow:0 2px 8px #000';
    this.descEl = document.createElement('div');
    this.descEl.style.cssText = 'font-size:.95rem;opacity:.82;color:#cbb89a;max-width:34rem;margin-top:10px;line-height:1.7;white-space:pre-line;text-align:center';
    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = 'font-size:.8rem;opacity:.5;color:#cbb89a;margin-top:18px';
    this.hintEl.textContent = '[E] 닫기';
    this.el.append(this.nameEl, this.descEl, this.hintEl);
    document.body.appendChild(this.el);

    // 2D image mode (for pictures/notes shown as images)
    this.imgEl = document.createElement('img');
    this.imgEl.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);max-width:60%;max-height:58%;object-fit:contain;z-index:16;display:none;box-shadow:0 0 50px rgba(0,0,0,0.85);image-rendering:auto';
    document.body.appendChild(this.imgEl);
  }

  open(def) {
    this.holder.clear();
    this.isImage = !!def.image;
    if (this.isImage) {
      this.imgEl.src = def.image;
      this.imgEl.style.display = 'block';
    } else {
      this.imgEl.style.display = 'none';
      const m = def.makeMesh();
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      m.position.sub(center);
      const maxd = Math.max(size.x, size.y, size.z) || 0.1;
      m.scale.setScalar(0.26 / maxd);
      this.holder.add(m);
    }
    this.nameEl.textContent = def.name;
    this.descEl.textContent = def.desc;
    this.descEl.style.fontSize = def.descSize || '.95rem';   // notes/clues can ask for bigger text
    this.el.style.display = 'flex';
    this.isOpen = true;
  }

  close() { this.isOpen = false; this.el.style.display = 'none'; this.holder.clear(); this.imgEl.style.display = 'none'; }

  render(dt) {
    const r = this.renderer;
    const sz = r.getSize(new THREE.Vector2());
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, sz.x, sz.y);
    r.setClearColor(0x04050a, 1);
    r.clear();
    if (this.isImage) return;       // DOM <img> shows it over the dark backdrop
    this.holder.rotation.y += dt * 0.8;
    const s = Math.min(sz.x, sz.y) * 0.5;
    r.setViewport((sz.x - s) / 2, (sz.y - s) / 2 + sz.y * 0.08, s, s);
    r.render(this.scene, this.cam);
    r.setViewport(0, 0, sz.x, sz.y);
  }
}
