import * as THREE from 'three';

/**
 * Owns the canonical light definitions and mirrors them into two scenes:
 *  - the MAIN scene (display lights, with shadows) the player sees
 *  - the PROXY scene (cheap clones, no shadows) used by the DDGI gather
 *
 * Keeping one source of truth means dynamic changes (flicker, the captor's
 * light spilling under the door) drive both the direct lighting AND the
 * indirect (DDGI) lighting consistently.
 */
export class LightRig {
  constructor(mainScene, proxyScene) {
    this.t = 0;
    this.lights = [];

    // --- Main bulb: a bare, warm, slightly-too-dim hanging bulb. ---
    this.bulb = this._make({
      type: 'point',
      position: new THREE.Vector3(0, 2.4, 0),
      color: new THREE.Color(0xffd9a0),
      intensity: 6.0,
      distance: 12,
      shadow: true,
    }, mainScene, proxyScene);

    // --- Captor light: spills in from the corridor / under the door. Off
    //     until the captor returns, then sweeps in. Cold/harsh. ---
    this.captor = this._make({
      type: 'point',
      position: new THREE.Vector3(5.2, 1.6, 0),
      color: new THREE.Color(0xbcd0ff),
      intensity: 0.0,
      distance: 10,
      shadow: false,
    }, mainScene, proxyScene);

    // --- Lantern: the player's MOVABLE light. Off on the wall hook; lit and
    //     carried once picked up. As it moves, the DDGI probes pick up the
    //     travelling bounce light — the core mechanic IS the GI showcase. ---
    this.lantern = this._make({
      type: 'point',
      position: new THREE.Vector3(-2.82, 1.45, 0.6),
      color: new THREE.Color(0xffb060),
      intensity: 0.0,
      distance: 9,
      shadow: false,
    }, mainScene, proxyScene);

    // A very dim ambient so pure-black areas still read as space, not void.
    this.ambient = new THREE.AmbientLight(0x14100c, 0.25);
    mainScene.add(this.ambient);
  }

  _make(def, mainScene, proxyScene) {
    const display = new THREE.PointLight(def.color, def.intensity, def.distance, 2.0);
    display.position.copy(def.position);
    if (def.shadow) {
      display.castShadow = true;
      display.shadow.mapSize.set(1024, 1024);
      display.shadow.bias = -0.0015;
      display.shadow.camera.near = 0.1;
      display.shadow.camera.far = def.distance;
    }
    mainScene.add(display);

    const proxy = new THREE.PointLight(def.color.clone(), def.intensity, def.distance, 2.0);
    proxy.position.copy(def.position);
    proxyScene.add(proxy);

    const entry = { def, display, proxy };
    this.lights.push(entry);
    return entry;
  }

  /** Set a light's live intensity (drives both scenes). */
  setIntensity(entry, value) {
    entry.display.intensity = value;
    entry.proxy.intensity = value;
  }
  setPosition(entry, x, y, z) {
    entry.display.position.set(x, y, z);
    entry.proxy.position.set(x, y, z);
  }

  /** flickerEnabled: the classic unstable-bulb horror effect. */
  update(dt, flickerEnabled = true) {
    this.t += dt;
    if (flickerEnabled) {
      // Layered noise: slow brownout + occasional sharp dropouts.
      const slow = 0.85 + 0.15 * Math.sin(this.t * 1.7);
      const buzz = 0.95 + 0.05 * Math.sin(this.t * 37.0);
      const dropout = (Math.sin(this.t * 11.3) * Math.sin(this.t * 4.7) > 0.93) ? 0.25 : 1.0;
      this.setIntensity(this.bulb, 6.0 * slow * buzz * dropout);
    } else {
      this.setIntensity(this.bulb, 6.0);
    }
  }

  /** True when any dynamic light changed enough to warrant probe refresh. */
  isDynamic() { return true; }
}
