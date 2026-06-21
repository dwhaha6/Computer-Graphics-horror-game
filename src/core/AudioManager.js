import * as THREE from 'three';

// Files you drop later override the placeholders. Put them at
// public/assets/audio/<name>.(ogg|mp3|wav) and add <name> to AUDIO_MANIFEST.
const AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'flac'];
export const AUDIO_MANIFEST = [
  // --- real clips the user supplied (override the procedural placeholders) ---
  'approach',       // 할머니 오고 있을 때 (countdown)
  'roach',          // 서랍 바퀴벌레 소리
  'knife',          // 칼로 공격하는 소리 (knife kill, played a few times)
  'death',          // death sound
  'ending_news',    // 신문(살인) 엔딩 이미지 사운드
  'ending_vent',    // 환풍구 쫓아오는 엔딩 이미지 사운드
  'rain',           // 둘다 탈출 엔딩 빗소리
  'bgm_start',      // 게임 배경음악
  'baby_scream',    // 아기 사진 최초 응시 비명 (4개 중 1개만 잘라 씀)
  'key_pickup',     // 열쇠 줍는 소리
  // --- captor voice is OFF (subtitle-only). Re-enable by setting USE_VOICE in
  //     Captor.js and uncommenting these vo_* lines. ---
  // 'vo_enter_1', 'vo_enter_2', 'vo_enter_3', 'vo_enter_4', 'vo_enter_5', 'vo_enter_6',
  // 'vo_safe_1', 'vo_safe_2', 'vo_safe_3', 'vo_caught_1', 'vo_caught_2', 'vo_caught_3',
];

/**
 * Spatial audio via Web Audio (THREE.AudioListener on the camera).
 * Ships with PROCEDURAL placeholder buffers so the game is audible with zero
 * asset files; real CC0 / AI-generated clips override them by name.
 */
export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.loader = new THREE.AudioLoader();
    this.buffers = new Map();
    this.base = (import.meta.env && import.meta.env.BASE_URL) || './';
    this._synthFallbacks();
  }

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  /** Load any real files listed in AUDIO_MANIFEST; keep placeholders on miss. */
  async loadAll(names = AUDIO_MANIFEST) {
    await Promise.all(names.map((name) => new Promise((res) => {
      let i = 0;
      const tryNext = () => {
        if (i >= AUDIO_EXTS.length) return res(); // none found → keep placeholder
        this.loader.load(`${this.base}assets/audio/${name}.${AUDIO_EXTS[i++]}`,
          (buf) => { this.buffers.set(name, buf); res(); },
          undefined,
          tryNext);
      };
      tryNext();
    })));
  }

  // ---- playback ----
  oneShot(name, volume = 1) {
    const buf = this.buffers.get(name); if (!buf) return null;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf); a.setVolume(volume); a.play();
    return a;
  }
  /** Play only a fraction of a clip (e.g. one of several screams in one file). */
  oneShotPart(name, volume = 1, startFrac = 0, endFrac = 1) {
    const buf = this.buffers.get(name); if (!buf) return null;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const gain = this.ctx.createGain(); gain.gain.value = volume;
    src.connect(gain); gain.connect(this.listener.getInput());
    const off = buf.duration * Math.max(0, startFrac);
    const dur = buf.duration * Math.min(1, endFrac - startFrac);
    src.start(0, off, dur);
    return src;
  }
  loop(name, volume = 1) {
    const buf = this.buffers.get(name); if (!buf) return null;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf); a.setLoop(true); a.setVolume(volume); a.play();
    return a;
  }
  /** Positional one-shot attached to an Object3D (e.g. the captor emitter). */
  oneShotAt(name, obj, volume = 1, refDistance = 1.5) {
    const buf = this.buffers.get(name); if (!buf || !obj) return null;
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(buf); a.setVolume(volume); a.setRefDistance(refDistance);
    obj.add(a); a.play();
    a.onEnded = () => { a.stop(); if (a.parent) a.parent.remove(a); };
    return a;
  }

  // ---- procedural placeholders ------------------------------------------------
  _synthFallbacks() {
    this.buffers.set('step', this._noiseHit(0.16, 2.2, 0.45));
    this.buffers.set('handle', this._noiseHit(0.28, 1.4, 0.9));
    this.buffers.set('insect', this._noiseHit(0.7, 0.5, 1.0));
    this.buffers.set('roach', this._noiseHit(1.0, 0.4, 0.9));   // fallback until roach.flac loads
    this.buffers.set('heartbeat', this._heartbeat());
    this.buffers.set('door', this._softCreak(1.0));   // wardrobe / normal doors
    this.buffers.set('creak', this._creak(1.9));        // the grandmother's door only
    this.buffers.set('stinger', this._stinger(1.3));
    this.buffers.set('hum', this._hum(3.2));
    this.buffers.set('ambient', this._drone(6.0));
    this.buffers.set('struggle', this._grunt(0.7));
    this.buffers.set('alarm', this._alarm(1.7));
    this.buffers.set('stab', this._stab(0.5));
    this.buffers.set('knife', this._stab(0.5));   // fallback until knife.flac loads
    this.buffers.set('scream', this._scream(1.1));     // jump-scare (drawer reveal)
    this.buffers.set('scratch', this._scratch(1.4));   // random wall-scratch dread
  }

  // harsh horror screech — white noise through a sweeping resonant band-pass +
  // pitch jitter + soft clipping. Noise-driven (not pure tones), so it reads as a
  // scream, not a horn.
  _scream(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, p = t / dur;
      const fc = 750 + 1500 * Math.sin(p * Math.PI) + 140 * Math.sin(2 * Math.PI * 24 * t); // wail + jitter
      const w = 2 * Math.PI * Math.min(fc, sr * 0.45) / sr;
      const r = 0.965;                                          // resonance (rings → screechy)
      const x = (Math.random() * 2 - 1);
      const y = (1 - r) * x + 2 * r * Math.cos(w) * y1 - r * r * y2;
      y2 = y1; y1 = y;
      const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * 19 * t);  // rough flutter
      const env = Math.min(1, t / 0.008) * Math.pow(1 - p, 0.5);
      d[i] = Math.tanh(y * 5) * trem * env * 0.5;               // clip → grit
    }
    return b;
  }

  // nails dragging across a wall — rough, stick-slip amplitude-modulated scrape
  _scratch(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, p = i / d.length;
      const grain = (Math.sin(t * 88) > 0 ? 1 : 0.18) * (0.6 + 0.4 * Math.sin(t * 23));
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = lp * grain * Math.sin(Math.PI * p) * 0.5;
    }
    return b;
  }

  // wet stab — a fast slashing whoosh into a dull impact + metallic ring
  _stab(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const whoosh = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.5;          // blade slash
      const impactEnv = t > 0.05 ? Math.exp(-(t - 0.05) * 30) : 0;
      const impact = (Math.sin(2 * Math.PI * 70 * t) + (Math.random() * 2 - 1) * 0.6) * impactEnv * 0.8; // dull thud
      const ring = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 40) * 0.12;  // steel ring
      d[i] = whoosh + impact + ring;
    }
    return b;
  }

  // ringing alarm clock — two-tone bell gated at ~8Hz
  _alarm(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ring = Math.sin(2 * Math.PI * 880 * t) + 0.6 * Math.sin(2 * Math.PI * 1320 * t);
      const gate = Math.sin(2 * Math.PI * 8 * t) > 0 ? 1 : 0.05;
      const env = Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.06);
      d[i] = ring * gate * env * 0.42;
    }
    return b;
  }

  // strained effort grunt — handcuff struggle without the tool
  _grunt(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.sin(Math.PI * Math.min(1, t / (dur * 0.85))) * Math.exp(-t * 0.7);
      const f = 108 + 12 * Math.sin(t * 7.0);
      const voice = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.18;
      const noise = (Math.random() * 2 - 1) * 0.14;
      d[i] = (voice + noise) * env * 0.7;
    }
    return b;
  }

  _buf(dur) {
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    return this.ctx.createBuffer(1, n, this.ctx.sampleRate);
  }
  // enveloped low-passed noise — footsteps / handle / skitter
  _noiseHit(dur, decay, tone) {
    const b = this._buf(dur), d = b.getChannelData(0);
    let lp = 0; const k = THREE.MathUtils.clamp(tone, 0.05, 1.0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.pow(1 - i / d.length, decay);
      lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
      d[i] = lp * env * 0.9;
    }
    return b;
  }
  _heartbeat() {
    const b = this._buf(0.9), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    const thump = (start, f, amp, len) => {
      for (let i = 0; i < len * sr; i++) {
        const t = i / sr, env = Math.exp(-t * 18);
        const idx = Math.floor(start * sr + i);
        if (idx < d.length) d[idx] += Math.sin(2 * Math.PI * f * t) * env * amp;
      }
    };
    thump(0.0, 55, 0.9, 0.25);   // lub
    thump(0.28, 45, 0.6, 0.25);  // dub
    return b;
  }
  // soft wooden creak (wardrobe / ordinary doors)
  _softCreak(dur) {
    const b = this._buf(dur), d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      const wob = 0.5 + 0.5 * Math.sin(t * 40 + Math.sin(t * 9) * 6);
      lp = lp * 0.85 + (Math.random() * 2 - 1) * 0.15;
      d[i] = lp * wob * Math.sin(Math.PI * t) * 0.55;
    }
    return b;
  }

  // slow rusty-hinge creak ("끼이익") — rising, wavering stick-slip screech
  _creak(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, k = i / d.length;
      const f = 170 + 360 * Math.min(1, k * 1.3) + 45 * Math.sin(t * 6.5); // pitch rises + wavers
      phase += (2 * Math.PI * f) / sr;
      const saw = ((phase / Math.PI) % 2) - 1;                              // harsh sawtooth
      const grind = 0.45 + 0.55 * Math.sin(t * 21 + Math.sin(t * 3.1) * 9); // irregular stick-slip
      const noise = (Math.random() * 2 - 1) * 0.12;
      const env = Math.min(1, k / 0.05) * Math.min(1, (1 - k) / 0.14);
      d[i] = (saw * 0.5 * grind + noise) * env * 0.5;
    }
    return b;
  }
  _stinger(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    const freqs = [330, 349, 466, 587, 622];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, env = Math.exp(-t * 3.5);
      let s = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 9); // noise crack
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * t * (1 + t * 0.4)) * 0.12;
      d[i] = s * env;
    }
    return b;
  }
  _hum(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const mel = 110 + 8 * Math.sin(t * 1.3);
      const s = Math.sin(2 * Math.PI * mel * t) + 0.6 * Math.sin(2 * Math.PI * mel * 1.005 * t);
      d[i] = s * 0.18 * (0.7 + 0.3 * Math.sin(t * 2.1));
    }
    return b;
  }
  _drone(dur) {
    const b = this._buf(dur), d = b.getChannelData(0), sr = this.ctx.sampleRate;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      lp = lp * 0.995 + (Math.random() * 2 - 1) * 0.005; // rumble bed
      const sub = Math.sin(2 * Math.PI * 42 * t) * 0.08;
      d[i] = (lp * 2.0 + sub) * 0.5;
    }
    return b;
  }
}
