import * as THREE from 'three';

// Clock + desk against the -z wall.
const CLOCK_POS = new THREE.Vector3(-1.0, 0.95, -3.55);  // clock face centre
const LOOK_CAM = new THREE.Vector3(-1.0, 1.02, -2.92);   // lowered, leaning in
const SPEED = 1.7;            // rad/s while holding Q / R
const THRESH = Math.PI / 2;  // ±90° resolves the puzzle

/**
 * The alarm-clock puzzle. Interact (E) to lean in and look at the clock; while
 * looking, Q turns the minute hand counter-clockwise, R clockwise (E stands up).
 * A note reads "(RHS, z, 90)" — right-hand rule about +z by 90° = counter-
 * clockwise, which pops the minute hand onto the desk as a pickable KEY for the
 * wardrobe. Turning the wrong way (clockwise) trips the alarm and summons her.
 */
export class Clock {
  constructor({ scene, proxyScene, camera, audio, onAlarm, onDropKey }) {
    this.scene = scene;
    this.proxyScene = proxyScene;
    this.camera = camera;
    this.audio = audio;
    this.onAlarm = onAlarm || (() => {});
    this.onDropKey = onDropKey || (() => {});

    this.looking = false;
    this.resolved = false;
    this.angle = 0;          // minute-hand angle (rad); + = CCW
    this._t = 0;             // 0 standing … 1 leaned in
    this._dir = 1;           // transition direction
    this._standPos = new THREE.Vector3();
    this._lookCam = new THREE.PerspectiveCamera();
    this.solids = [];

    this._build();
  }

  _build() {
    // ---- desk (display + proxy) ----
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.7 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.78, 0.55), wood);
    desk.position.set(-1.0, 0.39, -3.62);
    desk.castShadow = desk.receiveShadow = true;
    this.scene.add(desk);
    const deskProx = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.78, 0.55), new THREE.MeshLambertMaterial({ color: 0x4a3526 }));
    deskProx.position.copy(desk.position);
    this.proxyScene.add(deskProx);
    this.solids.push({ minX: -1.65, maxX: -0.35, minZ: -3.9, maxZ: -3.34 });

    // ---- clock assembly (faces +z, toward the room) ----
    this.clock = new THREE.Group();
    this.clock.position.copy(CLOCK_POS);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6, metalness: 0.3 }),
    );
    body.rotation.x = Math.PI / 2; body.position.z = -0.028;

    this.face = new THREE.Mesh(
      new THREE.CircleGeometry(0.088, 36),
      new THREE.MeshStandardMaterial({ color: 0xddd2b8, roughness: 0.5 }),
    );

    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1410 });
    const hour = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.05, 0.004), dark);
    hour.position.set(0, 0.018, 0.008); hour.rotation.z = -0.9;

    this.minutePivot = new THREE.Group(); this.minutePivot.position.z = 0.012;
    this.minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.075, 0.004), dark);
    this.minuteHand.position.y = 0.03;
    this.minutePivot.add(this.minuteHand);

    this.clock.add(body, this.face, hour, this.minutePivot);
    this.scene.add(this.clock);

    // ---- note: "(RHS, z, 90)" on the desk in front of the clock ----
    const note = this._makeNote('( RHS , z , 90 )');
    note.position.set(-0.5, 0.79, -3.46);
    note.rotation.set(-Math.PI / 2 + 0.12, 0, 0.18);
    this.scene.add(note);
  }

  _makeNote(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 150;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#cabd9c'; ctx.fillRect(0, 0, 256, 150);
    ctx.strokeStyle = '#9a8c6a'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 244, 138);
    ctx.fillStyle = '#1a1208'; ctx.font = 'bold 38px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(text, 128, 90);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.14), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  }

  // ---- interaction: enter look mode ----
  meshes() { return this.resolved ? [] : [this.face]; }
  getPrompt(ctx) {
    if (this.looking || this.resolved) return null;
    if (ctx.lookingAt === this.face && ctx.dist < 2.3) return '[E] 시계 보기';
    return null;
  }
  interact() { if (!this.looking && !this.resolved) this._enter(); }

  _enter() {
    this.looking = true; this._dir = 1; this._t = 0;
    this._standPos.copy(this.camera.position);
  }
  exitLook() { this._dir = -1; }      // animate back, then release in update()
  isLooking() { return this.looking; }

  /** dir: +1 = CCW (Q), -1 = CW (R). */
  rotate(dir, dt) {
    if (!this.looking || this.resolved || this._dir < 0) return;
    this.angle = THREE.MathUtils.clamp(this.angle + dir * SPEED * dt, -2.2, 2.2);
    if (this.angle >= THRESH) this._dropKey();
    else if (this.angle <= -THRESH) this._alarm();
  }

  _dropKey() {
    if (this.resolved) return; this.resolved = true;
    this.minutePivot.visible = false;
    if (this.audio) this.audio.oneShot('handle', 0.5);
    this.onDropKey(new THREE.Vector3(-0.7, 0.80, -3.42));
    this.exitLook();
  }
  _alarm() {
    if (this.resolved) return;          // key already dropped → clock is spent
    if (this.audio) this.audio.oneShot('alarm', 1.0);
    this.onAlarm();
    this.angle = 0;                     // hand back to 12; clock stays usable (turn CCW next time)
    this.exitLook();
  }

  update(dt) {
    this.minutePivot.rotation.z = this.angle;
    if (!this.looking) return false;

    this._t = THREE.MathUtils.clamp(this._t + this._dir * dt * 4, 0, 1);
    this.camera.position.lerpVectors(this._standPos, LOOK_CAM, this._t);
    if (this._t > 0.05) {
      this._lookCam.position.copy(this.camera.position);
      this._lookCam.lookAt(CLOCK_POS);
      this.camera.quaternion.slerp(this._lookCam.quaternion, 1 - Math.exp(-9 * dt));
    }
    if (this._dir < 0 && this._t <= 0) { this.looking = false; return false; }
    return true;
  }
}
