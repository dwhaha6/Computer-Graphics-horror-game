import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DOOR } from './layout.js';

const S = {
  DORMANT: 'DORMANT', COUNTDOWN: 'COUNTDOWN', ENTER: 'ENTER', LOOKAROUND: 'LOOKAROUND',
  WALK: 'WALK', INSPECT: 'INSPECT', NOTICE: 'NOTICE', CAUGHT: 'CAUGHT', LEAVE: 'LEAVE',
  HIDE_SCARE: 'HIDE_SCARE', PATROL: 'PATROL', GLANCE: 'GLANCE',
};
const BASE_TIME = 20;          // visible countdown (s)
const WALK_SPEED = 0.62;       // m/s — slow, shuffling patrol
const ENTER_DUR = 1.3;
const LOOKAROUND_DUR = 3.0;    // she steps in and slowly scans the room first
const WALK_TIMEOUT = 16;       // safety: never get stuck mid-walk on geometry
const FIG_RADIUS = 0.28;       // her footprint, for furniture avoidance
const INSPECT_DUR = 1.8;
const NOTICE_DUR = 0.45;
const CAUGHT_DUR = 1.4;

// Waypoints in the room (x,z). She enters at the door, walks to the centre,
// then approaches the chair before deciding.
// patrol path kept to the open +x side so she doesn't walk through the table
// (x[-0.8,0.8]) / desk / wardrobe. Full collision is a later pass.
const P_ENTER = new THREE.Vector3(DOOR.x - 0.5, 0, 0);
const P_CENTER = new THREE.Vector3(1.9, 0, -0.6);
const P_NEAR = new THREE.Vector3(1.3, 0, 1.5);
const P_EXIT = new THREE.Vector3(DOOR.x - 0.4, 0, 0);

const ENTER_LINES = ['…누가 다녀갔나?', '쉬이… 가만히.', '냄새가 나는구나.', '엄마가 왔단다.'];
const SAFE_LINES = ['흠… 착각이었나…', '…아무것도 아니군.', '얌전하구나. 다행이지.'];
const CAUGHT_LINES = ['거짓말쟁이…!', '움직였구나, 못된 것.', '벌레들은 거짓말을 안 한단다.'];

/**
 * The returning captor as a slow-patrolling 3D figure. A trigger starts a 60s
 * countdown; when it expires (or you've fully hidden — seated AND re-cuffed) she
 * opens the door and a dark humanoid walks a fixed path through the room. If the
 * room was disturbed she snaps toward you and the grandmother lunges (jump-scare
 * death); otherwise she mutters that it was nothing and leaves.
 *
 * Her cold light travels with her, so the DDGI indirect lighting shifts as she
 * patrols — the dread cue is also the GI showcase.
 */
export class Captor {
  constructor(opts) {
    this.scene = opts.scene;
    this.proxyScene = opts.proxyScene;
    this.lights = opts.lights;
    this.audio = opts.audio;
    this.getPlayerPos = opts.getPlayerPos;
    this.chairPos = opts.chairPos.clone();
    this.onCaught = opts.onCaught || (() => {});
    this.subtitle = opts.subtitle || (() => {});
    this.onTimer = opts.onTimer || (() => {});
    this.checkCompliance = opts.checkCompliance || null;
    this.isReady = opts.isReady || (() => this._atChair());
    this.isHidden = opts.isHidden || (() => false);        // player hiding in the wardrobe
    this.onHideScare = opts.onHideScare || (() => {});      // hide jump-scare → game over
    // where she should walk to inspect (player's spot / wardrobe). null → P_NEAR.
    this.getApproachTarget = opts.getApproachTarget || (() => null);
    this._approach = P_NEAR.clone();
    this.solids = opts.solids || [];     // furniture/wall footprints she must not walk through
    this._walkElapsed = 0;

    this.state = S.DORMANT;
    this.timer = 0;
    this.tension = 0;
    this.level = 0;
    this._stepCd = 0;
    this._walkPhase = 0;
    this._stage = 0;            // 0 → centre, 1 → near chair, 2 → exit
    this._doorAngle = 0; this._doorTarget = 0;
    this.mixer = null; this.walkAction = null;
    this._modelYaw = opts.modelYaw || 0;            // yaw offset to face the model forward (+z)
    this._useAnim = opts.useModelAnim !== false;     // false → ignore baked clips, use our shuffle
    this.darkenModel = opts.darkenModel !== false;   // default: darken (placeholder)

    this._buildDoor();
    this._buildFigure();
    if (opts.modelUrl) this._loadModel(opts.modelUrl);
  }

  // Load a rigged character (.fbx or .glb) to replace the placeholder mannequin.
  _loadModel(url) {
    const onLoaded = (obj, animations) => {
      // auto-fit to ~1.7 m and ground the feet at y=0 (handles any source units)
      let box = new THREE.Box3().setFromObject(obj);
      const h = box.getSize(new THREE.Vector3()).y || 1;
      obj.scale.multiplyScalar(1.7 / h);
      box = new THREE.Box3().setFromObject(obj);
      obj.position.y -= box.min.y;
      obj.rotation.y = this._modelYaw;

      const dark = this.darkenModel ? new THREE.MeshStandardMaterial({ color: 0x17171d, roughness: 0.92, metalness: 0.0 }) : null;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.frustumCulled = false;
        if (dark) o.material = dark;                  // placeholder → dark silhouette
        else if (o.material) o.material.side = THREE.DoubleSide; // keep texture; avoid thin-shell holes
      });

      this._proc.visible = false;           // hide the placeholder
      this.figure.add(obj);
      this.model = obj;

      if (this._useAnim && animations && animations.length) {
        const clip = animations[0];
        // strip ROOT MOTION (hip translation) — otherwise the clip drags her
        // forward and snaps back on loop, on top of our own movement → teleport.
        clip.tracks = clip.tracks.filter((t) => !/(Hips|hip|root)\.position$/i.test(t.name));
        this.mixer = new THREE.AnimationMixer(obj);
        this.walkAction = this.mixer.clipAction(clip);
        this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
        this.walkAction.play();
        this.walkAction.timeScale = 0;       // frozen until she walks
      }
    };
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const fail = (e) => console.warn('[captor] model load failed; keeping placeholder', e);
    if (ext === 'fbx') new FBXLoader().load(url, (fbx) => onLoaded(fbx, fbx.animations), undefined, fail);
    else new GLTFLoader().load(url, (g) => onLoaded(g.scene, g.animations), undefined, fail);
  }

  _buildDoor() {
    const w = (DOOR.maxZ - DOOR.minZ) + 0.08;
    const h = DOOR.height;
    const geo = new THREE.BoxGeometry(0.06, h, w);
    const mk = (mat) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(DOOR.x, h / 2, DOOR.minZ - 0.04);
      const panel = new THREE.Mesh(geo.clone(), mat);
      panel.position.set(0, 0, w / 2);
      pivot.add(panel);
      return { pivot, panel };
    };
    this.door = mk(new THREE.MeshStandardMaterial({ color: 0x2c1d12, roughness: 0.8 }));
    this.doorProxy = mk(new THREE.MeshLambertMaterial({ color: 0x2c1d12 }));
    this.door.panel.castShadow = this.door.panel.receiveShadow = true;
    this.scene.add(this.door.pivot);
    this.proxyScene.add(this.doorProxy.pivot);
  }

  // procedural dark humanoid
  _buildFigure() {
    this.figure = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x060507, roughness: 0.95, metalness: 0.0 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), dark); torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), dark); head.position.y = 1.5;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.55, 12), dark); skirt.position.y = 0.6;
    this.armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), dark); this.armL.position.set(-0.24, 1.12, 0);
    this.armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), dark); this.armR.position.set(0.24, 1.12, 0);
    this.legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), dark); this.legL.position.set(-0.09, 0.5, 0);
    this.legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), dark); this.legR.position.set(0.09, 0.5, 0);
    for (const m of [torso, head, skirt, this.armL, this.armR, this.legL, this.legR]) m.castShadow = true;
    this._proc = new THREE.Group(); // placeholder mannequin; hidden once a model loads
    this._proc.add(torso, head, skirt, this.armL, this.armR, this.legL, this.legR);
    this.figure.add(this._proc);
    this.figure.visible = false;
    this.figure.position.copy(P_ENTER);
    this.scene.add(this.figure);
  }

  trigger(seconds, subtitleText) {
    if (this.state !== S.DORMANT) return;
    this.level++;
    this._countdownTime = seconds || BASE_TIME;
    this._countdownSub = subtitleText || '누군가 온다…!';
    this._enter(S.COUNTDOWN);
  }

  /** Force her fully off-stage (used on respawn after a non-fatal death). */
  reset() {
    this._doorTarget = 0;
    this._enter(S.DORMANT);
  }

  isPresent() {
    return this.state === S.ENTER || this.state === S.LOOKAROUND || this.state === S.WALK ||
           this.state === S.INSPECT || this.state === S.NOTICE || this.state === S.CAUGHT ||
           this.state === S.LEAVE || this.state === S.HIDE_SCARE || this.state === S.PATROL ||
           this.state === S.GLANCE;
  }
  /** world point the camera should be forced to look at while she's present. */
  getLookTarget() {
    return _look.set(this.figure.position.x, 1.4, this.figure.position.z);
  }

  _atChair() {
    const p = this.getPlayerPos();
    return Math.hypot(p.x - this.chairPos.x, p.z - this.chairPos.z) < 0.95;
  }
  // would her footprint overlap any solid at (x,z)?
  _blocked(x, z) {
    const r = FIG_RADIUS;
    for (const s of this.solids) {
      if (x > s.minX - r && x < s.maxX + r && z > s.minZ - r && z < s.maxZ + r) return true;
    }
    return false;
  }
  _compliant() {
    return this._atChair() && (this.checkCompliance ? this.checkCompliance() : true);
  }
  _pick(arr) { return arr[(this.level - 1 + arr.length) % arr.length]; }

  // move the figure toward a target on the floor; animate the walk; return true at arrival
  _walkTo(target, dt, stopDist = 0.12) {
    const dx = target.x - this.figure.position.x, dz = target.z - this.figure.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < stopDist) { this._idlePose(dt); return true; }
    const inv = 1 / dist;
    const stepX = dx * inv * WALK_SPEED * dt;
    const stepZ = dz * inv * WALK_SPEED * dt;
    const px = this.figure.position.x, pz = this.figure.position.z;
    // per-axis slide: she rounds furniture/walls instead of clipping through them
    if (!this._blocked(px + stepX, pz)) this.figure.position.x += stepX;
    if (!this._blocked(this.figure.position.x, pz + stepZ)) this.figure.position.z += stepZ;
    this.figure.rotation.y = Math.atan2(dx, dz);
    if (this.mixer) {                       // rigged model: let the clip animate
      if (this.walkAction) this.walkAction.timeScale = 1.0;
    } else if (this.model) {                // static mesh: slow, eerie shuffle
      this._walkPhase += dt * 3.0;
      this.figure.position.y = Math.abs(Math.sin(this._walkPhase * 2)) * 0.03; // step bob
      this.model.rotation.z = Math.sin(this._walkPhase) * 0.05;                // weight rock
    } else {                                // procedural placeholder: swing limbs
      this._walkPhase += dt * 6.5;
      const sw = Math.sin(this._walkPhase) * 0.5;
      this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.6; this.armR.rotation.x = sw * 0.6;
      this.figure.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.02;
    }
    this._stepCd -= dt;
    if (this._stepCd <= 0) { this.audio.oneShotAt('step', this.figure, 0.8, 3.0); this._stepCd = 0.42; }
    this._followLight();
    return false;
  }
  _idlePose(dt) {
    if (this.mixer) {                       // freeze the clip mid-stance
      if (this.walkAction) this.walkAction.timeScale = 0;
    } else if (this.model) {                // settle the shuffle
      this.model.rotation.z = THREE.MathUtils.damp(this.model.rotation.z, 0, 6, dt);
      this.figure.position.y = THREE.MathUtils.damp(this.figure.position.y, 0, 6, dt);
    } else {
      this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, 0, 6, dt);
      this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, 0, 6, dt);
      this.armL.rotation.x = THREE.MathUtils.damp(this.armL.rotation.x, 0, 6, dt);
      this.armR.rotation.x = THREE.MathUtils.damp(this.armR.rotation.x, 0, 6, dt);
    }
    this._followLight();
  }
  _facePlayer(dt) {
    const p = this.getPlayerPos();
    const target = Math.atan2(p.x - this.figure.position.x, p.z - this.figure.position.z);
    this.figure.rotation.y = THREE.MathUtils.damp(this.figure.rotation.y, target, 8, dt);
  }
  _followLight() {
    // dim + cold: with the room light killed she's barely visible
    this.lights.setIntensity(this.lights.captor, 3.2);
    this.lights.setPosition(this.lights.captor, this.figure.position.x, 1.7, this.figure.position.z);
  }

  _enter(state) {
    this.state = state; this.timer = 0;
    switch (state) {
      case S.COUNTDOWN:
        this.subtitle(this._countdownSub);
        this.onTimer(this._countdownTime);
        if (this._approachSfx) this._approachSfx.stop();
        this._approachSfx = this.audio.loop('approach', 0.7); // "할머니 오고 있을 때" — plays until she leaves
        break;
      case S.ENTER: {
        this.onTimer(null);
        this._verdict = this._compliant();
        // She only walks right up to you when she's going to catch you (room
        // disturbed, or you're hiding). If everything's in order she just takes
        // a look around the room and leaves.
        this._willCatch = this.isHidden() || !this._verdict;
        const t = this.getApproachTarget();          // player's spot or the wardrobe
        this._approach.copy(t || P_NEAR);
        this._stage = 0;
        this.figure.position.copy(P_ENTER);
        this.figure.rotation.y = -Math.PI / 2;   // face into the room, not sideways
        this.figure.visible = true;
        this._doorTarget = -1.9;
        this.audio.oneShotAt('creak', this.figure, 1.0, 4.0);
        this.subtitle(this._pick(ENTER_LINES));
        this.tension = 1.0;
        break;
      }
      case S.INSPECT:
        break;
      case S.NOTICE:
        break;
      case S.CAUGHT:
        this.audio.oneShot('stinger', 1.0);
        this.subtitle(this._pick(CAUGHT_LINES));
        this.onCaught();
        break;
      case S.HIDE_SCARE:
        this.onHideScare();   // main: ominous line → door cracks → face → game over
        break;
      case S.LEAVE:
        this.subtitle(this._pick(SAFE_LINES));
        this._stage = 2;
        break;
      case S.DORMANT:
        this.figure.visible = false;
        this.lights.setIntensity(this.lights.captor, 0);
        this.onTimer(null);
        this.tension = 0;
        if (this._approachSfx) { this._approachSfx.stop(); this._approachSfx = null; } // she's gone → BGM off
        break;
      default: break;
    }
  }

  /** Freeze a debug tableau: door open, figure standing inside. */
  debugPose() {
    this._doorAngle = this._doorTarget = -1.9;
    this.door.pivot.rotation.y = -1.9;
    this.doorProxy.pivot.rotation.y = -1.9;
    this.figure.visible = true;
    this.figure.position.copy(P_CENTER);
    this._followLight();
    this.state = S.DORMANT;
  }

  update(dt) {
    // door keeps animating even when DORMANT, so it can finish closing after she leaves
    this._doorAngle = THREE.MathUtils.damp(this._doorAngle, this._doorTarget, 6, dt);
    this.door.pivot.rotation.y = this._doorAngle;
    this.doorProxy.pivot.rotation.y = this._doorAngle;
    if (this.state === S.DORMANT) return;
    this.timer += dt;
    if (this.mixer) this.mixer.update(dt);

    switch (this.state) {
      case S.COUNTDOWN: {
        const remaining = Math.max(0, this._countdownTime - this.timer);
        this.onTimer(remaining);
        const k = this.timer / this._countdownTime;
        this.tension = 0.25 + 0.55 * k;
        this._stepCd -= dt;
        if (this._stepCd <= 0) { this.audio.oneShot('step', 0.35); this._stepCd = THREE.MathUtils.lerp(1.2, 0.7, k); }
        this.lights.setIntensity(this.lights.captor, 2.0 * Math.max(0, k - 0.6) / 0.4);
        this.lights.setPosition(this.lights.captor, DOOR.x + 1.0, 1.6, 0);
        if (remaining <= 0 || (this.isReady() && this.timer > 2.0)) this._enter(S.ENTER);
        break;
      }
      case S.ENTER:
        this._idlePose(dt);
        if (this.timer >= ENTER_DUR) this._enter(S.LOOKAROUND);
        break;
      case S.LOOKAROUND:
        this._idlePose(dt);
        // she steps in and slowly scans the room — head/body turning side to side
        this.figure.rotation.y = -Math.PI / 2 + Math.sin(this.timer * 1.7) * 0.7;
        this.tension = 1.0;
        this._followLight();
        if (this.timer >= LOOKAROUND_DUR) {
          this._walkElapsed = 0;
          this._enter(this._willCatch ? S.WALK : S.PATROL); // catch → approach you; else → casual sweep
        }
        break;
      case S.PATROL:                                  // compliant: stroll to the centre, glance, leave
        this._walkElapsed += dt;
        if (this._walkTo(P_CENTER, dt, 0.25) || this._walkElapsed > WALK_TIMEOUT) this._enter(S.GLANCE);
        break;
      case S.GLANCE:
        this._idlePose(dt);
        this.figure.rotation.y = Math.sin(this.timer * 1.4) * 0.85;  // sweep the room with her gaze
        this.tension = 0.7;
        this._followLight();
        if (this.timer >= 2.4) this._enter(S.LEAVE);   // satisfied → turns and goes
        break;
      case S.WALK: {
        this._walkElapsed += dt;
        const stage1 = this._stage === 1;
        const target = this._stage === 0 ? P_CENTER : (this._stage === 2 ? P_EXIT : this._approach);
        const arrived = this._walkTo(target, dt, stage1 ? 1.1 : 0.12); // stop short of the player/wardrobe
        if (arrived || this._walkElapsed > WALK_TIMEOUT) {             // safety: never get stuck on geometry
          if (this._stage === 0) { this._stage = 1; this._walkElapsed = 0; }
          else if (this._stage === 1) this._enter(S.INSPECT);
          else if (this._stage === 2) { this._doorTarget = 0; this._enter(S.DORMANT); } // reached exit → leave
        }
        break;
      }
      case S.INSPECT:
        this._idlePose(dt);
        this._facePlayer(dt);
        this.tension = 1.0;
        if (this.timer >= INSPECT_DUR) {
          if (this.isHidden()) this._enter(S.HIDE_SCARE);          // found you in the wardrobe
          else this._enter(this._verdict ? S.LEAVE : S.NOTICE);
        }
        break;
      case S.HIDE_SCARE:
        break; // main drives the crack + face + game over
      case S.NOTICE:
        this._facePlayer(dt);
        if (this.timer >= NOTICE_DUR) this._enter(S.CAUGHT);
        break;
      case S.CAUGHT:
        this._facePlayer(dt);
        if (this.timer >= CAUGHT_DUR) this._enter(S.DORMANT);
        break;
      case S.LEAVE:
        // walk to the exit (handled in WALK via stage 2)
        this._enter(S.WALK); this._stage = 2; this._walkElapsed = 0;
        break;
      default: break;
    }
  }
}

const _look = new THREE.Vector3();
