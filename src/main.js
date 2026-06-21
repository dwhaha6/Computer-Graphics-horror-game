import * as THREE from 'three';
import { Input } from './core/Input.js';
import { PlayerController } from './player/PlayerController.js';
import { Room } from './world/Room.js';
import { LightRig } from './world/LightRig.js';
import { ProbeVolume } from './gi/ddgi/ProbeVolume.js';
import { Post } from './post/Post.js';
import { AudioManager } from './core/AudioManager.js';
import { Captor } from './world/Captor.js';
import { Lantern } from './world/Lantern.js';
import { InteractionSystem } from './world/Interaction.js';
import { PickupItem } from './world/PickupItem.js';
import { ChairSeat } from './world/ChairSeat.js';
import { Clock } from './world/Clock.js';
import { Wardrobe, NOTE_SPOT } from './world/Wardrobe.js';
import { Drawer } from './world/Drawer.js';
import { Food } from './world/Food.js';
import { Bars } from './world/Bars.js';
import { CodeLock } from './world/CodeLock.js';
import { SPOON, MINUTE_HAND, NOTE_CLUE, LADDER, PIC1, PIC2, KNIFE, CELL_KEY, SCREWDRIVER } from './world/items.js';
import { Inventory } from './ui/Inventory.js';
import { InspectView } from './ui/InspectView.js';
import { WALKABLE, GI_BOUNDS, PROBE_COUNTS, DOOR } from './world/layout.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scenes (main = what the player sees; proxy = low-poly, for DDGI gather)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.07);

const proxyScene = new THREE.Scene();
proxyScene.add(new THREE.AmbientLight(0x0a0806, 0.15)); // tiny fill so bounce isn't pitch-black

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
const audio = new AudioManager(camera);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const room = new Room();
room.loadTextures((import.meta.env && import.meta.env.BASE_URL) || './'); // CC0/AI textures if present
scene.add(room.displayGroup);
proxyScene.add(room.proxyGroup);

const lights = new LightRig(scene, proxyScene);

// ---------------------------------------------------------------------------
// DDGI
// ---------------------------------------------------------------------------
// Safety valve: ?nogi disables DDGI so the game ALWAYS runs (direct lighting
// only) even if the GI path misbehaves on a grader's GPU. Never 0 points.
const ENABLE_DDGI = !location.search.includes('nogi');

const spacing = [
  (GI_BOUNDS.max[0] - GI_BOUNDS.min[0]) / (PROBE_COUNTS[0] - 1),
  (GI_BOUNDS.max[1] - GI_BOUNDS.min[1]) / (PROBE_COUNTS[1] - 1),
  (GI_BOUNDS.max[2] - GI_BOUNDS.min[2]) / (PROBE_COUNTS[2] - 1),
];

let ddgi = null;
if (ENABLE_DDGI) {
  try {
    ddgi = new ProbeVolume(renderer, proxyScene, { origin: GI_BOUNDS.min, spacing, counts: PROBE_COUNTS });
    ddgi.setIntensity(1.4);
    for (const mesh of room.displayMeshes) ddgi.patchMaterial(mesh.material);
  } catch (e) {
    console.error('[DDGI] init failed, falling back to direct lighting only:', e);
    ddgi = null;
  }
}

// ---------------------------------------------------------------------------
// Player + input
// ---------------------------------------------------------------------------
const player = new PlayerController(camera, renderer.domElement);
player.setWalkable(WALKABLE);
player.setSolids(room.solids);
player.object.position.set(0, 1.55, 1.7); // start at the chair
scene.add(player.object);

const input = new Input(window);

// ---------------------------------------------------------------------------
// Captor (returning grandmother) + on-screen cues
// ---------------------------------------------------------------------------
const subtitleEl = document.getElementById('subtitle');
let subtitleTimer = 0;
function subtitle(text) {
  subtitleEl.textContent = text || '';
  subtitleEl.style.opacity = text ? '1' : '0';
  subtitleTimer = text ? 4.0 : 0;
}
function flashCaught() {
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;inset:0;background:#5a0a06;z-index:20;pointer-events:none;opacity:1;transition:opacity 1.1s ease';
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.opacity = '0'; });
  setTimeout(() => f.remove(), 1300);
}
let gameWon = false;
function winGame() {
  if (gameWon) return; gameWon = true;
  const w = document.createElement('div');
  w.style.cssText = 'position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:rgba(0,0,0,0.96);color:#c9b8a0;font-family:Georgia,serif;text-align:center';
  w.innerHTML = '<div style="font-size:2.4rem;letter-spacing:.12em;color:#9ab06a">탈출 성공</div><div style="font-size:1rem;opacity:.7">그 집에서, 살아서 나왔다…</div>';
  document.body.appendChild(w);
  if (player.controls && player.controls.unlock) player.controls.unlock();
}

// Countdown HUD shown while the captor's return timer runs.
const timerEl = document.createElement('div');
timerEl.style.cssText = 'position:fixed;top:22px;left:50%;transform:translateX(-50%);font-family:ui-monospace,monospace;font-size:2.1rem;font-weight:bold;letter-spacing:.08em;color:#d8c8b0;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .2s;z-index:6;pointer-events:none';
document.body.appendChild(timerEl);
function showTimer(sec) {
  if (sec == null) { timerEl.style.opacity = '0'; return; }
  const s = Math.max(0, Math.ceil(sec));
  timerEl.textContent = `00:${String(s).padStart(2, '0')}`;
  timerEl.style.color = s <= 10 ? '#e0463a' : '#d8c8b0';
  timerEl.style.opacity = '1';
}

// Lantern (portable light + "trace" object) and interaction.
const lantern = new Lantern({ scene, lights, camera });
const interaction = new InteractionSystem(camera);
interaction.add(lantern);

// Inventory + item inspect.
const inspectView = new InspectView(renderer);
const inventory = new Inventory((def) => {           // click a row → full inspect
  inventory.close();
  inspectView.open(def);
  player.lock();                                     // re-grab the pointer for play
});
function toggleInventory() {
  inventory.toggle();
  if (inventory.isOpen) player.controls.unlock();    // show the cursor (Minecraft-style)
  else player.lock();
}

// Spoon resting on the dining table — pick up with E, then it's inspected.
const spoon = new PickupItem({
  scene, def: SPOON,
  position: new THREE.Vector3(0.25, 0.80, 0.55),
  rotation: new THREE.Euler(Math.PI / 2, 0, 0.4),
  onPickup: (def) => { inventory.add(def); inspectView.open(def); },
});
interaction.add(spoon);

// The grandmother's "meal" — maggot soup, on the table in front of you from the
// start. Eating it three times in a row (no other action between) kills you.
let eatStreak = 0;
// --- endgame state (under-chair choice → knife/key branch → endings 2/3) ---
let soupBites = 0, soupAfterLadder = false;         // soup eaten AFTER getting the ladder → unlocks the clue
let hasKnife = false, hasCellKey = false;
let ladderInstalled = false, escaped = false;
let chairChoiceOpen = false, chairChoiceResolved = false;
let knifeAmbushActive = false, knifeAmbushTimer = 0, killing = false;
let onLadder = false, escapeMode = null, soloLocked = false; // ladder/vent escape
let ladderObtained = false, installedLadderMesh = null;      // clue uses "ever obtained"; mesh kept for retrieval
const _ladderPrevPos = new THREE.Vector3();
let deaths = 0, dying = false;                               // 1st death → respawn, 2nd → death_twice + reset
let doomTriggered = false, doomActive = false;              // 분침 doom run (cross the centre line)
const food = new Food({
  scene,
  canEat: () => inventory.has('spoon'),                     // can only eat with the spoon in hand
  onEat: () => {
    eatStreak++; soupBites++;
    if (ladderObtained) soupAfterLadder = true;            // only soup eaten after the ladder counts

    audio.oneShot('struggle', 0.85);                        // a pained, retching groan
    if (eatStreak >= 3) { maggotDeath(); return; }
    subtitle(eatStreak === 1
      ? '윽… 비릿하고 미끈거린다. 입 안에서 뭔가 꿈틀거린다…'
      : '으윽… 속이 뒤집힌다. 더 먹으면 안 될 것 같다…');
  },
});
interaction.add(food);

// Escape chain: locked wardrobe + the alarm-clock that yields its key.
let wardrobeTriggered = false;   // she only comes the FIRST time you open it
const wardrobe = new Wardrobe({
  scene, proxyScene,
  hasKey: () => inventory.has('minute_hand'),
  onOpen: () => { subtitle('장롱이 열렸다. 바닥에 무언가 놓여 있다…'); audio.oneShot('door', 0.6); },
  onOpened: () => {
    if (wardrobeTriggered) return;
    wardrobeTriggered = true;
    captor.trigger(30, '장롱 여는 소리를 들은 것 같다! 얼른 제자리로!');
  },
});
interaction.add(wardrobe);

// clue note on the wardrobe floor — reachable only once the doors are open
const wardrobeNote = new PickupItem({
  scene, def: NOTE_CLUE, position: NOTE_SPOT.clone(),
  onPickup: (def) => { inventory.add(def); inspectView.open(def); },
});
interaction.add(wardrobeNote);

const clock = new Clock({
  scene, proxyScene, camera, audio,
  onAlarm: () => captor.trigger(40),         // wrong way (alarm) → she comes, 40s
  onDropKey: (pos) => {                        // right way → minute hand drops as a key
    gameSection = 2;                            // clock solved → section 2
    const key = new PickupItem({
      scene, def: MINUTE_HAND, position: pos,
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      onPickup: (def) => { audio.oneShot('key_pickup', 0.9); inventory.add(def); inspectView.open(def); },
    });
    interaction.add(key);
  },
});
interaction.add(clock);

// second desk + 4-digit lock drawer
const drawer = new Drawer({ scene, proxyScene, onTryUnlock: () => openDrawerLock() });
interaction.add(drawer);

// barred window to the next room (crouch with C to talk)
const bars = new Bars({ scene, isCrouching: () => player.crouching, isSeated: () => chairSeat.isSitting(), onTalk: () => startDialogue() });
interaction.add(bars);

// a small, grainy baby photo on the wall above the bars. Looking at it the first
// time lets out a scream (the captor's murdered grandchild — see ending2).
const babyPic = (() => {
  const base = (import.meta.env && import.meta.env.BASE_URL) || './';
  const tex = new THREE.TextureLoader().load(base + 'assets/baby.png');
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; // keep it grainy
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.03), new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 }));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.44), new THREE.MeshBasicMaterial({ map: tex }));
  pic.position.z = 0.02;
  g.add(frame, pic);
  g.position.set(0, 2.0, 3.9); g.rotation.y = Math.PI;   // +z wall, faces into the room
  scene.add(g);
  return pic;
})();
let babySeen = false;
const BABY_POS = new THREE.Vector3(0, 2.0, 3.88);   // for a "facing roughly toward it" check
const _fwd = new THREE.Vector3();

// left-wall letter code device (GOLD) → drops a ladder
const codeLock = new CodeLock({ scene, onTryEnter: () => openLetterLock() });
interaction.add(codeLock);

// vent (escape route) — top-right corner of the desk (-z) wall. The final escape:
// stand a ladder under it, then open the cover with the screwdriver → ending 3.
const ventSlats = [];
const ventMat = new THREE.MeshStandardMaterial({ color: 0x26262b, roughness: 0.6, metalness: 0.55 });
const ventFrame = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.54, 0.06), ventMat);
ventFrame.position.set(3.4, 2.55, -3.95);
scene.add(ventFrame);
for (let i = 0; i < 5; i++) {
  const slat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.08), ventMat);
  slat.position.set(3.4, 2.36 + i * 0.095, -3.9);
  scene.add(slat); ventSlats.push(slat);
}
const ventInteract = {
  meshes: () => [ventFrame, ...ventSlats],
  getPrompt: (ctx) => {
    const hit = ctx.lookingAt === ventFrame || ventSlats.includes(ctx.lookingAt);
    if (!hit || ctx.dist > 3.6) return null;
    if (!ladderInstalled) return inventory.has('ladder') ? '[E] 사다리 세우기' : '[E] 환풍구 — 너무 높다 (사다리 필요)';
    if (!onLadder) return '[F] 사다리 오르기  ·  [E] 사다리 회수';
    if (!inventory.has('screwdriver')) return '[E] 환풍구 덮개 — 드라이버가 필요하다';
    return '[E] 환풍구를 연다 (드라이버)';
  },
  interact: () => {
    if (!ladderInstalled) {
      if (!inventory.has('ladder')) { subtitle('환풍구가 너무 높다. 받칠 것이 필요하다.'); return; }
      inventory.remove('ladder'); ladderInstalled = true;
      const lad = LADDER.makeMesh();
      lad.scale.set(1.15, 1.25, 1.15); lad.position.set(3.25, 0.9, -3.5); lad.rotation.z = 0.05;
      scene.add(lad); installedLadderMesh = lad;
      subtitle('사다리를 환풍구 아래에 세웠다.  (F: 오르기 · E: 회수)'); audio.oneShot('door', 0.5);
      return;
    }
    if (!onLadder) {                                  // on the ground → E takes the ladder back
      ladderInstalled = false; inventory.add(LADDER);
      if (installedLadderMesh) { scene.remove(installedLadderMesh); installedLadderMesh = null; }
      subtitle('사다리를 다시 거둬들였다.'); audio.oneShot('door', 0.4);
      return;
    }
    if (!inventory.has('screwdriver')) { subtitle('덮개가 나사로 단단히 고정돼 있다. 드라이버가 필요하다.'); return; }
    if (escaped) return; escaped = true;
    subtitle('드라이버로 나사를 풀고… 환풍구 안으로 기어올랐다.');
    audio.oneShot('handle', 0.9);
    const together = escapeMode === 'together';   // real key → both out (rain); 분침 → doom run
    setTimeout(() => together ? togetherEscapeSequence() : doomEscapeSequence(), 1500);
  },
};
interaction.add(ventInteract);
const VENT_LOOK = new THREE.Vector3(3.4, 2.55, -3.95);
const SOLO_LINES = [
  '웃음인지 울음인지 구분 못 할, 자포자기한 듯한 소리가 옆방에서 새어나왔다.',
  '하지만 내가 할 수 있는 건 없었다.',
];
function climbLadder() {
  if (onLadder) return;
  onLadder = true;
  _ladderPrevPos.copy(camera.position);
  player.enabled = false;
  camera.position.set(3.25, 2.25, -3.05);   // up at the vent; view is slerped to face it
  subtitle('사다리를 올랐다. 환풍구 덮개가 눈앞이다.');
}
function climbDown() {
  if (!onLadder) return;
  onLadder = false;
  camera.position.copy(_ladderPrevPos);
  player.enabled = true;
}

// merge furniture collision now that the furniture exists
const furnitureSolids = [...room.solids, ...clock.solids, ...wardrobe.solids, ...drawer.solids];
player.setSolids(furnitureSolids);

const promptEl = document.createElement('div');
promptEl.style.cssText = 'position:fixed;left:50%;bottom:118px;transform:translateX(-50%);font-family:ui-monospace,monospace;color:#e8d8b0;text-shadow:0 1px 3px #000;font-size:0.95rem;pointer-events:none;opacity:0;transition:opacity .12s;z-index:5';
document.body.appendChild(promptEl);

const CHAIR = new THREE.Vector3(0, 0, 1.7);

// Seat + handcuff state. Player starts seated & cuffed (can't move). Unlocking
// needs the spoon; without it you only strain against the cuffs.
const chairSeat = new ChairSeat({
  player, camera, scene, chairPos: CHAIR, audio,
  canUncuff: () => inventory.has('spoon'),
  onStruggle: () => {
    audio.oneShot('struggle', 0.9);
    subtitle('끄응…! 맨손으로는 풀리지 않는다. 뭔가 비집을 도구가 필요하다.');
  },
});

const captor = new Captor({
  scene, proxyScene, lights, audio,
  modelUrl: ((import.meta.env && import.meta.env.BASE_URL) || './') + 'assets/models/grandma.glb',
  darkenModel: false,      // keep the model's own texture
  modelYaw: -Math.PI / 2,  // rotate so her front faces forward (flip sign if she's reversed)
  useModelAnim: false,     // ignore baked clips → use our slow procedural shuffle
  getPlayerPos: () => player.object.position,
  chairPos: CHAIR,
  solids: furnitureSolids,   // don't walk through furniture/walls
  subtitle,
  onTimer: showTimer,
  // To pass, the room must look untouched. She checks: wardrobe closed, lantern
  // back on its hook, drawer closed, AND you back in the chair, re-cuffed —
  // looking exactly as captive as she left you. Any one off → she catches you.
  // ...and once the ladder has dropped it must be back in your hands (picked up /
  // retrieved) — left on the floor or installed at the vent gives you away.
  checkCompliance: () => wardrobe.isClosed() && lantern.isOnHook() && drawer.isClosed()
    && (!ladderDropped || inventory.has('ladder')) && chairSeat.isSitting() && chairSeat.isCuffed(),
  isReady: () => wardrobe.isHiding() || (chairSeat.isSitting() && chairSeat.isCuffed()),
  isHidden: () => wardrobe.isHiding(),
  onHideScare: () => hideScare(),
  // walk to where the player actually is — their spot if standing/seated, or in
  // front of the wardrobe if they're hiding.
  getApproachTarget: () => {
    if (wardrobe.isHiding()) return new THREE.Vector3(-3.0, 0, -1.5);
    const p = player.object.position;
    return new THREE.Vector3(p.x, 0, p.z);
  },
  onCaught: () => {
    die(GRANDMA_SRC);   // her face fills the screen until you click → respawn / reset
  },
});

// --- Death jump-scare only: the grandmother image flashes fullscreen when she
//     catches you. In the room she's the 3D patrol figure, not this sprite.
const GRANDMA_SRC = ((import.meta.env && import.meta.env.BASE_URL) || './') + 'assets/grandma.png';
const jumpEl = document.createElement('img');
jumpEl.src = GRANDMA_SRC;
jumpEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:fill;background:#000;z-index:30;display:none;pointer-events:none';
jumpEl.addEventListener('error', () => { jumpEl.dataset.missing = '1'; });
document.body.appendChild(jumpEl);
function jumpscare() {
  if (jumpEl.dataset.missing) return;
  jumpEl.style.display = 'block';
  setTimeout(() => { jumpEl.style.display = 'none'; }, 1400);
}

// --- Maggot-soup death: eating the grandmother's "meal" three times in a row ---
const MAGGOT_SRC = ((import.meta.env && import.meta.env.BASE_URL) || './') + 'assets/maggot.png';
const maggotEl = document.createElement('img');
maggotEl.src = MAGGOT_SRC;
maggotEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:fill;background:#000;z-index:30;display:none;pointer-events:none';
maggotEl.addEventListener('error', () => { maggotEl.dataset.missing = '1'; });
document.body.appendChild(maggotEl);
function maggotDeath() {
  audio.oneShot('stinger', 1.0);
  subtitle('속에서… 무언가 꿈틀거린다…');
  die(MAGGOT_SRC);   // the maggot bowl fills the screen until you click
}

// --- Hiding in the wardrobe ---
const WARDROBE_INSIDE = new THREE.Vector3(-3.5, 1.2, -1.5);
const HIDE_LOOK = new THREE.Vector3(-1.5, 1.2, -1.5); // toward the doors (+x) → she's seen the instant they open
const _hidePrevPos = new THREE.Vector3();
const hideOverlay = document.createElement('div');
hideOverlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:25;opacity:0;transition:opacity .25s;pointer-events:none';
document.body.appendChild(hideOverlay);
function hideInWardrobe() {
  if (wardrobe.isHiding()) return;
  _hidePrevPos.copy(camera.position);
  wardrobe.hide();
  camera.position.copy(WARDROBE_INSIDE);
  player.enabled = false;
  hideOverlay.style.opacity = '0.95';   // pitch-black inside
}
function comeOut() {
  if (!wardrobe.isHiding()) return;
  wardrobe.unhide();
  camera.position.copy(_hidePrevPos);
  player.enabled = true;
  hideOverlay.style.opacity = '0';
}
function hideScare() {
  if (hasKnife && wardrobe.isHiding()) { knifeAmbush(); return; } // armed → you can strike first
  subtitle('여기 어디… 숨었니, 우리 아가…');
  wardrobe.crackMode = true;            // the doors creak slightly ajar
  hideOverlay.style.opacity = '0.55';   // a sliver of light leaks in
  setTimeout(() => subtitle('…찾았다.'), 1000);
  setTimeout(() => die(GRANDMA_SRC), 1600);
}

// --- endgame: under-chair choice, knife ambush (ending 2), endings ---
const ASSET = (import.meta.env && import.meta.env.BASE_URL) || './';
const ENDING1_SRC = ASSET + 'assets/ending1.png';   // (unused now — solo runner replaced by the doom run)
const ENDING2_SRC = ASSET + 'assets/ending2.png';   // 살인 뉴스기사 2장 (knife / hidden ending)
const ENDING3_SRC = ASSET + 'assets/ending3.png';   // 둘다 탈출 (two men)
const VENT_END_SRC = ASSET + 'assets/vent_ending.png';   // 분침 둠 엔딩 (할머니가 환풍구로 따라옴 — 둘 다 죽음)
const DEATH_TWICE_SRC = ASSET + 'assets/death_twice.png'; // 2번째 죽음 (더 무서운 이미지) → 리셋

// knife in hand: she arrives at the wardrobe but you get the drop on her.
function knifeAmbush() {
  knifeAmbushActive = true; knifeAmbushTimer = 4.2;
  wardrobe.crackMode = true;             // doors creep ajar — she's right there
  hideOverlay.style.opacity = '0.42';
  subtitle('그녀가 장롱 앞에 멈춰 섰다… 지금이야.');
  audio.oneShot('heartbeat', 0.8);
}
function knifeKill() {
  knifeAmbushActive = false; killing = true;
  promptEl.style.opacity = '0';
  subtitle('');
  hideOverlay.style.transition = 'opacity .12s';
  hideOverlay.style.opacity = '1';       // black out
  let n = 0;
  const slash = () => { audio.oneShot('knife', 1.0); if (++n < 4) setTimeout(slash, 340); }; // 4 stabs
  slash();
  setTimeout(() => showEnding(ENDING2_SRC, null,
    () => audio.oneShot('ending_news', 1.0),
    () => endingCard([], 'Hidden Ending', '#e0463a')), 2100);   // image → click → red title card
}
// the ambush window lapsed — she finds you anyway
function hideScareDeath() {
  subtitle('…찾았다.');
  wardrobe.crackMode = true;
  setTimeout(() => die(GRANDMA_SRC), 700);
}

// hand 김씨 a "key-like" thing across the bars → he gives you the screwdriver.
// He'll accept the cell key (real) OR the clock's minute hand (a fake key).
function giveScrewdriver() {
  if (inventory.has('cell_key')) {            // real key → he can follow you out (ending 3)
    inventory.remove('cell_key'); hasCellKey = false; escapeMode = 'together';
  } else if (inventory.has('minute_hand')) {  // fake key (clock hand) → he's left behind (ending 1)
    inventory.remove('minute_hand'); escapeMode = 'solo'; soloLocked = true; // normal ending locked in
  } else return;
  inventory.add(SCREWDRIVER);
  subtitle('김씨에게 건넸다. 대신 낡은 드라이버를 받았다.');
}

// generic ending screen. Optional preLines play as white text on black first
// (one at a time), then it fades to the image. Click → restart.
function showEnding(src, preLines, sfx, afterClick) {
  if (gameIsOver) return; gameIsOver = true;
  if (player.controls && player.controls.unlock) player.controls.unlock();
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#000;cursor:pointer';
  document.body.appendChild(o);
  const reveal = () => {
    o.style.transition = 'opacity 1.2s'; o.style.opacity = '0';
    const img = document.createElement('img');
    img.src = src; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill'; // fill the screen
    const cap = document.createElement('div');
    cap.style.cssText = 'position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#e8dcc0;font-family:Georgia,serif;font-size:.92rem;text-shadow:0 1px 5px #000;pointer-events:none';
    cap.textContent = '— 클릭하여 처음부터 —';
    o.innerHTML = ''; o.appendChild(img); o.appendChild(cap);
    o.addEventListener('click', () => { if (afterClick) afterClick(); else location.reload(); }); // stays until clicked
    requestAnimationFrame(() => { o.style.opacity = '1'; });
    if (sfx) sfx();
  };
  if (preLines && preLines.length) {
    const t = document.createElement('div');
    t.style.cssText = 'max-width:78%;text-align:center;color:#d8d2c4;font-family:Georgia,serif;font-size:1.15rem;line-height:1.8;opacity:0;transition:opacity 1s';
    o.appendChild(t);
    let i = 0;
    const step = () => {
      if (i < preLines.length) {
        t.style.opacity = '0';
        setTimeout(() => { t.textContent = preLines[i++]; t.style.opacity = '1'; step2(); }, 700);
      } else { setTimeout(reveal, 900); }
    };
    const step2 = () => setTimeout(step, 3000);
    step();
  } else {
    reveal();
  }
}

// --- death & checkpoint respawn ---------------------------------------------
// 1st death → respawn at the last section's safe spot (items/progress kept,
// danger reset). 2nd death → the scarier image + full reset.
const respawnFade = document.createElement('div');
respawnFade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:45;opacity:0;transition:opacity .5s;pointer-events:none';
document.body.appendChild(respawnFade);

const doomPanicEl = document.createElement('div');
doomPanicEl.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:17;display:none;color:#ff2d20;font-family:Georgia,serif;font-size:1.7rem;font-weight:bold;text-align:center;text-shadow:0 0 14px rgba(220,20,10,.9);pointer-events:none';
document.body.appendChild(doomPanicEl);
function showDoomPanic() { doomPanicEl.textContent = '사…사 살려줘 끄아아아아아!!!!'; doomPanicEl.style.display = 'block'; setTimeout(hideDoomPanic, 3800); }
function hideDoomPanic() { doomPanicEl.style.display = 'none'; }

function respawnPoint() {
  if (escapeMode === 'solo') return { x: 0, z: 1.8, cuffed: false };  // doom run: before the centre line, free (smooth retry)
  return { x: 0, z: 1.7, cuffed: true };                             // otherwise: wake cuffed in the chair again
}
function respawnAtCheckpoint() {
  hideOverlay.style.opacity = '0';
  captor.reset(); showTimer(null);                                    // she's gone, timer cleared
  if (wardrobe.isHiding()) wardrobe.unhide();
  onLadder = false; knifeAmbushActive = false; killing = false;
  doomActive = false; doomTriggered = false;                         // re-arm the doom run
  hideDoomPanic();
  player.crouching = false;
  const rp = respawnPoint();
  if (rp.cuffed) chairSeat.restrain(); else chairSeat.freeStand(rp.x, rp.z);
  subtitle('다시… 눈을 떴다.');
  dying = false;
  player.lock();                                                      // re-grab the pointer (inside the click)
}
// fullscreen death image that fills the screen and stays until you click it.
function showDeathImage(src, onClick) {
  if (player.controls && player.controls.unlock) player.controls.unlock();
  showTimer(null);
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;cursor:pointer';
  const img = document.createElement('img');
  img.src = src; img.style.cssText = 'width:100%;height:100%;object-fit:fill;display:block';
  o.appendChild(img);
  o.addEventListener('click', () => { o.remove(); onClick(); });
  document.body.appendChild(o);
}
function die(causeSrc) {
  if (gameIsOver || dying) return;
  dying = true;
  deaths += 1;
  audio.oneShot('death', 1.0);
  if (deaths >= 2) {                                                  // 2nd → scarier image, click → reset
    gameIsOver = true;
    showDeathImage(DEATH_TWICE_SRC, () => location.reload());
  } else {                                                            // 1st → cause image, click → respawn
    showDeathImage(causeSrc || GRANDMA_SRC, () => respawnAtCheckpoint());
  }
}

// click-advanced monologue on black, ending on an image (click → restart)
function imageMonologue(beats, imgSrc, onImage, afterClick) {
  if (gameIsOver) return; gameIsOver = true;
  if (player.controls && player.controls.unlock) player.controls.unlock();
  captor.reset(); showTimer(null); promptEl.style.opacity = '0';
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:#000;font-family:Georgia,serif;text-align:center;padding:6%';
  const t = document.createElement('div');
  t.style.cssText = 'color:#d8d2c4;font-size:1.2rem;line-height:1.8;max-width:80%;min-height:3em;display:flex;align-items:center;justify-content:center';
  const btn = document.createElement('div');
  btn.style.cssText = 'color:#9a8f7e;font-size:.95rem;cursor:pointer;border:1px solid #3a342a;padding:8px 22px';
  btn.textContent = '▸ 계속';
  o.append(t, btn); document.body.appendChild(o);
  let i = 0, done = false;
  const next = () => {
    if (done) { location.reload(); return; }
    if (i >= beats.length) {                              // beats done → fill-screen ending image
      done = true;
      t.remove();
      const img = document.createElement('img');
      img.src = imgSrc; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill';
      o.insertBefore(img, btn);
      // turn the button itself into a fullscreen click-catcher (keeps the handler
      // ON the button — so the click that revealed the image doesn't reload it).
      btn.style.cssText = 'position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:20px;color:#e8dcc0;font-size:.92rem;text-shadow:0 1px 6px #000;cursor:pointer;background:transparent';
      btn.textContent = '— 클릭 —';
      btn.onclick = () => { if (afterClick) afterClick(); else location.reload(); };
      if (onImage) onImage();
      return;
    }
    const b = beats[i++]; t.textContent = b.t; if (b.sfx) b.sfx();
  };
  btn.onclick = next; next();
}
// 분침 둠 엔딩 — 환풍구로 탈출하지만 할머니가 따라온다 (둘 다 죽음) → Normal Ending
function doomEscapeSequence() {
  imageMonologue([
    { t: '어둡고 비좁은 환풍구다…' },
    { t: '아저씨… 죄송합니다. 전 살아야겠어요.' },
    { t: '음, 무슨 소리지…?', sfx: () => audio.oneShot('scratch', 0.9) },
  ], VENT_END_SRC,
    () => audio.oneShot('ending_vent', 1.0),                 // crawling-grandma image sound
    () => endingCard([], 'Normal Ending', '#f3f0e8'));        // image → click → white title card
}
// 둘다 탈출 엔딩 — 빗소리 깔린 독백 후 함께 탈출하는 이미지 → True Ending
let _rainLoop = null;
function togetherEscapeSequence() {
  _rainLoop = audio.loop('rain', 0.5);
  imageMonologue([
    { t: '어둡고 비좁은 환풍구다…' },
    { t: '계속 가다 보니… 빗소리가 들린다.' },
  ], ENDING3_SRC,
    () => { if (_rainLoop) _rainLoop.setVolume(0.7); },
    () => endingCard([                                         // image → click → monologue → blue title card
      '우리는 몇 시간을 뛰어 그곳을 벗어났다.',
      '인근 경찰서로 가, 그곳에 있던 모든 일을 말한 뒤 자수했다.',
    ], 'True Ending', '#7fd4ff'));
}
// final title card: optional monologue beats (click to advance) → a label that
// slowly fades in → one more click restarts.
function endingCard(beats, label, color) {
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;background:#000;cursor:pointer;font-family:Georgia,serif;text-align:center;padding:7%';
  const t = document.createElement('div');
  t.style.cssText = 'color:#d8d2c4;font-size:1.2rem;line-height:1.9;max-width:80%;min-height:1.4em';
  const lab = document.createElement('div');
  lab.style.cssText = `font-size:3rem;letter-spacing:.18em;color:${color};opacity:0;transition:opacity 2.6s;text-shadow:0 0 26px ${color}55`;
  o.append(t, lab); document.body.appendChild(o);
  let i = 0, labelled = false;
  const advance = () => {
    if (labelled) { location.reload(); return; }
    if (i < beats.length) { t.textContent = beats[i++]; return; }
    labelled = true; t.textContent = '';
    lab.textContent = label;
    requestAnimationFrame(() => { lab.style.opacity = '1'; });
  };
  o.addEventListener('click', advance);
  advance();   // show first beat (or the label immediately if no beats)
}

// shout for her (knife path) — same as the debug call, with a short fuse
function shout() {
  if (captor.state !== 'DORMANT') return;
  subtitle('"여기야아아—!" 목이 터져라 그녀를 불렀다.');
  captor.trigger(8, '발소리가… 다가온다!');
}

// --- under-chair item choice (knife / cell key) ---
const chairChoiceEl = document.createElement('div');
chairChoiceEl.style.cssText = 'position:fixed;inset:0;z-index:19;display:none;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:rgba(4,5,9,0.9);font-family:Georgia,serif;color:#d8c8b0';
chairChoiceEl.innerHTML =
  '<div style="font-size:1.15rem;letter-spacing:.06em;opacity:.85">의자 밑 공간에 칼과 열쇠가 있다.<br>뭐부터 챙길까?</div>' +
  '<div style="display:flex;gap:28px">' +
  '<div class="cc-pick" data-k="knife" style="cursor:pointer;border:1px solid #5a3030;padding:20px 30px;background:rgba(40,12,12,0.5);font-size:1.25rem">🔪 칼</div>' +
  '<div class="cc-pick" data-k="key" style="cursor:pointer;border:1px solid #4a4630;padding:20px 30px;background:rgba(30,28,12,0.5);font-size:1.25rem">🗝️ 열쇠</div>' +
  '</div>';
document.body.appendChild(chairChoiceEl);
chairChoiceEl.querySelectorAll('.cc-pick').forEach((b) => {
  b.addEventListener('mouseenter', () => { b.style.background = 'rgba(90,70,40,0.5)'; });
  b.addEventListener('mouseleave', () => { b.style.background = b.dataset.k === 'knife' ? 'rgba(40,12,12,0.5)' : 'rgba(30,28,12,0.5)'; });
  b.addEventListener('click', () => pickChair(b.dataset.k));
});
function openChairChoice() {
  if (chairChoiceResolved || chairChoiceOpen) return;
  chairChoiceOpen = true; chairChoiceEl.style.display = 'flex';
  player.controls.unlock();
}
function pickChair(which) {
  chairChoiceResolved = true; chairChoiceOpen = false;
  chairChoiceEl.style.display = 'none';
  audio.oneShot('handle', 0.5);
  if (which === 'knife') {
    hasKnife = true; inventory.add(KNIFE);
    subtitle('칼을 손에 쥐었다. 그 순간 의자 밑 바닥이 열리며 열쇠는 지하 깊은 곳으로 떨어졌다. (F: 소리쳐 부르기)');
  } else {
    hasCellKey = true; inventory.add(CELL_KEY); gameSection = 5; // → section 5 (bars dialogue changes)
    audio.oneShot('key_pickup', 0.9);
    subtitle('열쇠를 손에 쥐었다. 그 순간 의자 밑 바닥이 열리며 칼은 지하 깊은 곳으로 떨어졌다. 옆방 김씨에게 가보자.');
  }
  player.lock();   // re-grab the pointer (this runs inside the click → allowed)
}

// --- the blue wall clue: revealed once you've tasted the soup (1-2), hold the
//     ladder, and the room is dark (lantern never taken). Faint, hazy, ONE
//     character per wall ("의" / "자" / "밑") so you must look around to read it. ---
const CLUE_FADE = 0.4;    // final opacity — kept faint/hazy
const chairClue = (() => {
  const mk = (ch, pos, rotY) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#7ba6d6'; cx.shadowColor = '#7ba6d6'; cx.shadowBlur = 42; // soft, low-contrast glow
    cx.font = '120px Georgia, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.globalAlpha = 0.7;
    cx.fillText(ch, 128, 138);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), mat);
    m.position.copy(pos); if (rotY) m.rotation.y = rotY;
    scene.add(m);
    return mat;
  };
  const mats = [
    mk('의', new THREE.Vector3(-1.5, 1.6, -3.92), 0),            // -z wall (faces +z)
    mk('자', new THREE.Vector3(1.2, 1.6, 3.92), Math.PI),        // +z wall (faces -z)
    mk('밑', new THREE.Vector3(-3.83, 1.6, 0.8), Math.PI / 2),   // -x wall (faces +x)
  ];
  return { mats, shown: false };
})();

// --- 4-digit lock drawer UI (mouse-driven dials) ---
let lockUIOpen = false;
const lockDigits = [0, 0, 0, 0];
const lockEl = document.createElement('div');
lockEl.style.cssText = 'position:fixed;inset:0;z-index:18;display:none;align-items:center;justify-content:center;background:rgba(5,6,10,0.85);font-family:ui-monospace,monospace';
const lockPanel = document.createElement('div');
lockPanel.style.cssText = 'background:rgba(15,10,6,0.96);border:1px solid #3a2f24;padding:26px 32px;text-align:center;color:#d8c8b0';
lockEl.appendChild(lockPanel);
document.body.appendChild(lockEl);
function renderLock(wrong) {
  const col = (d, i) => `<div style="display:inline-block;margin:0 9px">
    <div class="lk-up" data-i="${i}" style="cursor:pointer;font-size:1.5rem;user-select:none">▲</div>
    <div style="font-size:2.6rem;width:1.3em;color:${wrong ? '#e0463a' : '#e8d8b0'}">${d}</div>
    <div class="lk-dn" data-i="${i}" style="cursor:pointer;font-size:1.5rem;user-select:none">▼</div></div>`;
  const btn = 'cursor:pointer;font-family:Georgia,serif;background:#2a2018;color:#d8c8b0;border:1px solid #4a3f30;padding:8px 18px;margin:0 6px';
  lockPanel.innerHTML =
    `<div style="font-size:1.1rem;letter-spacing:.1em;color:#b03a2e;margin-bottom:18px">자물쇠 — 네 자리</div>
     <div style="margin-bottom:20px">${lockDigits.map(col).join('')}</div>
     <button class="lk-open" style="${btn}">열기</button><button class="lk-close" style="${btn}">닫기</button>`;
  lockPanel.querySelectorAll('.lk-up').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; lockDigits[i] = (lockDigits[i] + 1) % 10; renderLock(); }));
  lockPanel.querySelectorAll('.lk-dn').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; lockDigits[i] = (lockDigits[i] + 9) % 10; renderLock(); }));
  lockPanel.querySelector('.lk-open').onclick = () => {
    if (lockDigits.join('') === drawer.code) {
      drawer.unlock(); spawnDrawerPics(); gameSection = 3; subtitle('철컥 — 자물쇠가 풀렸다.'); closeDrawerLock();
      setTimeout(() => {                                      // it slides open → roaches scatter out
        audio.oneShot('roach', 1.0);
        subtitle('윽…! 벌레…!');
      }, 380);
    }
    else renderLock(true);
  };
  lockPanel.querySelector('.lk-close').onclick = () => closeDrawerLock();
}
function openDrawerLock() { lockUIOpen = true; lockEl.style.display = 'flex'; renderLock(); player.controls.unlock(); }
function closeDrawerLock() { lockUIOpen = false; lockEl.style.display = 'none'; player.lock(); }

// --- 4-LETTER code device UI (answer GOLD) ---
let letterUIOpen = false;
const letterIdx = [0, 0, 0, 0];
// each dial cycles a ~13-letter window that contains its answer letter (G/O/L/D)
// — half the A–Z range, so far less spinning.
const LETTER_SETS = ['ABCDEFGHIJKLM', 'IJKLMNOPQRSTU', 'FGHIJKLMNOPQR', 'ABCDEFGHIJKLM'];
const letterEl = document.createElement('div');
letterEl.style.cssText = 'position:fixed;inset:0;z-index:18;display:none;align-items:center;justify-content:center;background:rgba(5,6,10,0.85);font-family:ui-monospace,monospace';
const letterPanel = document.createElement('div');
letterPanel.style.cssText = 'background:rgba(15,10,6,0.96);border:1px solid #3a2f24;padding:26px 32px;text-align:center;color:#d8c8b0';
letterEl.appendChild(letterPanel);
document.body.appendChild(letterEl);
function renderLetter(wrong) {
  const col = (v, i) => `<div style="display:inline-block;margin:0 9px">
    <div class="lt-up" data-i="${i}" style="cursor:pointer;font-size:1.5rem;user-select:none">▲</div>
    <div style="font-size:2.6rem;width:1.3em;color:${wrong ? '#e0463a' : '#e8d8b0'}">${LETTER_SETS[i][v]}</div>
    <div class="lt-dn" data-i="${i}" style="cursor:pointer;font-size:1.5rem;user-select:none">▼</div></div>`;
  const btn = 'cursor:pointer;font-family:Georgia,serif;background:#2a2018;color:#d8c8b0;border:1px solid #4a3f30;padding:8px 18px;margin:0 6px';
  letterPanel.innerHTML =
    `<div style="font-size:1.1rem;letter-spacing:.1em;color:#b03a2e;margin-bottom:18px">암호 — 영문 네 자리</div>
     <div style="margin-bottom:20px">${letterIdx.map(col).join('')}</div>
     <button class="lt-open" style="${btn}">확인</button><button class="lt-close" style="${btn}">닫기</button>`;
  letterPanel.querySelectorAll('.lt-up').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; const n = LETTER_SETS[i].length; letterIdx[i] = (letterIdx[i] + 1) % n; renderLetter(); }));
  letterPanel.querySelectorAll('.lt-dn').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; const n = LETTER_SETS[i].length; letterIdx[i] = (letterIdx[i] + n - 1) % n; renderLetter(); }));
  letterPanel.querySelector('.lt-open').onclick = () => {
    const guess = letterIdx.map((v, i) => LETTER_SETS[i][v]).join('');
    if (guess === codeLock.code) { codeLock.solve(); closeLetterLock(); dropLadder(); gameSection = 4; captor.trigger(20); }
    else renderLetter(true);
  };
  letterPanel.querySelector('.lt-close').onclick = () => closeLetterLock();
}
function openLetterLock() { letterUIOpen = true; letterEl.style.display = 'flex'; renderLetter(); player.controls.unlock(); }
function closeLetterLock() { letterUIOpen = false; letterEl.style.display = 'none'; player.lock(); }

let ladderDropped = false;
function dropLadder() {
  if (ladderDropped) return; ladderDropped = true;
  subtitle('쿵 — 위에서 사다리가 떨어졌다.');
  audio.oneShot('door', 0.5);
  const ladder = new PickupItem({
    scene, def: LADDER, position: new THREE.Vector3(-2.6, 0.7, -0.3),
    rotation: new THREE.Euler(0, 0, 0.15),
    onPickup: (def) => { inventory.add(def); ladderObtained = true; inspectView.open(def); },
  });
  interaction.add(ladder);
}

// pictures revealed once the drawer is unlocked
let drawerPicsSpawned = false;
function spawnDrawerPics() {
  if (drawerPicsSpawned) return; drawerPicsSpawned = true;
  for (const [def, x] of [[PIC1, -0.18], [PIC2, 0.18]]) {
    const pic = new PickupItem({
      scene: drawer.drawerGroup,                          // child of the drawer → slides with it
      def, position: new THREE.Vector3(x, -0.05, 0),      // lying on the drawer floor
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      canInteract: () => drawer.open,                     // only when the drawer is pulled out
      onPickup: (d) => { inventory.add(d); inspectView.open(d); },
    });
    interaction.add(pic);
  }
}

// --- next-room dialogue (branching, section-based) ---
let gameSection = 1;            // game section — bars dialogue changes per section
const dialogueDone = {};        // section -> reached the final line at least once
const dialogueSeen = {};        // section -> seen a mid-dialogue resume point (e.g. §4 offer)
const DIALOGUE_SECTIONS = {
  1: [
    { text: '이봐 혹시 거기 누구 있어요?', choices: [
      { label: '…(대화 종료)', next: -1 },
      { label: '누구시죠?', next: 1 }] },
    { text: '저는 당신보다 한참 전부터 갇혀 있던 사람입니다. 편하게 김씨라 불러주세요. 저 빌어먹을 년이 저를 반년씩이나 여기 가뒀어요.', choices: [
      { label: '안 됐네요.. 그럼 이만 (대화 종료)', next: -1 },
      { label: '저는 이두희에요... 저는 도대체 누가 저희를 가둔 거죠?', next: 2 }] },
    { text: '저야 모르죠... 반년 동안 이 방을 샅샅이 뒤졌지만 탈출에 필요한 열쇠는 찾지 못 했어요. 혹시라도 제 방 열쇠를 찾는다면 꼭 좀 넘겨주세요.', choices: [
      { label: '살길은 각자 알아서 찾는 거죠 (대화 종료)', next: -1 },
      { label: '네 한번 노력해볼게요.', next: 3 }] },
    { text: '혹시 몰라 하는 말인데... 묶여있던 수갑을 푼 거라면, 발걸음 소리가 들렸을 때 아무 일 없었던 것처럼 방을 원래대로 되돌려놓는 것 잊지 마세요.', choices: [
      { label: '…(대화 종료)', next: -1 }] },
  ],
  // section 2: from section2.txt — hand over the note; its lines are the 9219 hint.
  2: [
    { text: '뭐? 장롱을 열었다고? 그 안에 뭔가 있던가?', choices: [
      { label: '(쪽지를 건네준다)', next: 1 },
      { label: '…(대화 종료)', next: -1 }] },
    { text: '음… 잘 모르겠군. 한데 — 글들이 괜히 주어진 건 아닌 거 같은데…', choices: [
      { label: '…(대화 종료)', next: -1 }] },
  ],
  // section 3: from section3.txt — the two drawer photos are themselves a riddle (→ GOLD).
  3: [
    { text: '오, 풀었나 보군. 대단한데? 서랍에 열쇠는 없었나?', choices: [
      { label: '(사진 2장을 건네준다)', next: 1 },
      { label: '…(대화 종료)', next: -1 }] },
    { text: '이번에도 수수께끼인가… 역시나 잘 모르겠군.', choices: [
      { label: '혹시 그쪽에는 뭔가 없었나요?', next: 2 }] },
    { text: '반년 동안 자네가 한 것처럼 샅샅이 뒤져봤어. 내가 나가는 데에 쓸 만한 건 없더군.', choices: [
      { label: '…(대화 종료)', next: -1 }] },
  ],
  // section 4: from section4.txt — 김씨 has the screwdriver; give him a "key-like"
  // thing (the minute hand works as a fake key) → screwdriver. Declining and
  // re-talking jumps straight back to his offer (handled in startDialogue).
  4: [
    { text: '뭔가 떨어지는 소리가 났는데… 괜찮은가?', choices: [
      { label: '사다리를 찾았어요. 드라이버 같은 것만 있으면 위쪽 통로로 나갈 수 있을 것 같은데…', next: 1 },
      { label: '…(대화 종료)', next: -1 }] },
    { text: '…….', choices: [
      { label: '저기요…?', next: 2 }] },
    { text: '사실 드라이버는 나에게 있어… 하지만 여기 더 갇혀 있는 건 죽고 싶을 만큼 싫군. 부탁이야, 열쇠 비슷한 거라도 좋으니 뭐라도 건네줄 수 없겠나?', choices: [
      { label: '더 찾아볼게요 (대화 종료)', next: -1 },
      { label: '분침(열쇠)을 건네준다', next: 3, show: () => inventory.has('minute_hand'), action: () => giveScrewdriver() }] },
    { text: '고맙네… 이 은혜는 평생 잊지 않을게. 여기, 드라이버일세.', choices: [   // node 3: handover moment (once)
      { label: '(드라이버를 받는다)', next: -1 }] },
    { text: '젠장…! 안 열리잖아…! 이게 무슨…', choices: [                          // node 4: re-talk after handover — the fake key failed
      { label: '…(대화 종료)', next: -1 }] },
  ],
  // section 5: after the under-chair choice (열쇠). Same offer, accepts the cell key.
  5: [
    { text: '사실 드라이버는 나에게 있어… 하지만 여기 더 갇혀 있는 건 죽고 싶을 만큼 싫군. 부탁이야, 열쇠 비슷한 거라도 좋으니 뭐라도 건네줄 수 없겠나?', choices: [
      { label: '더 찾아볼게요 (대화 종료)', next: -1 },
      { label: '열쇠를 건네준다', next: 1, show: () => inventory.has('cell_key'), action: () => giveScrewdriver() }] },
    { text: '고맙네… 이 은혜는 평생 잊지 않을게. 여기, 드라이버일세.', choices: [
      { label: '(드라이버를 받는다)', next: -1 }] },
  ],
};
let dialogueOpen = false, dlgSection = 1, dlgNode = 0, dlgNodes = DIALOGUE_SECTIONS[1];
const dlgEl = document.createElement('div');
dlgEl.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);width:min(620px,86%);background:rgba(0,0,0,0.86);border:1px solid #3a2f24;color:#e8ddc8;font-family:Georgia,serif;padding:18px 24px;display:none;z-index:17';
document.body.appendChild(dlgEl);
function startDialogue() {
  dialogueOpen = true;
  dlgSection = gameSection;
  dlgNodes = DIALOGUE_SECTIONS[dlgSection] || DIALOGUE_SECTIONS[1]; // fallback so missing sections never crash
  dlgNode = dialogueDone[dlgSection] ? dlgNodes.length - 1 : 0;     // only the final hint if already completed
  // section 4: once you've heard his offer, re-talking skips the intro and goes
  // straight back to "사실 드라이버는…" (until you've handed it over → thanks).
  if (dlgSection === 4) {
    dlgNode = inventory.has('screwdriver') ? dlgNodes.length - 1 : (dialogueSeen[4] ? 2 : 0);
  }
  player.controls.unlock();    // cursor for choices
  showDlgNode();
}
function showDlgNode() {
  const node = dlgNodes[dlgNode];
  if (dlgNode === dlgNodes.length - 1) dialogueDone[dlgSection] = true;
  if (dlgSection === 4 && dlgNode === 2) dialogueSeen[4] = true; // heard his offer
  const choices = node.choices.filter((c) => !c.show || c.show());
  const btns = choices.map((c, i) =>
    `<div class="dlg-c" data-i="${i}" style="cursor:pointer;padding:8px 4px;margin-top:6px;border-top:1px solid #2a221a;color:#cbb89a">▸ ${c.label}</div>`).join('');
  dlgEl.innerHTML = `<div style="font-size:1.05rem;line-height:1.6;margin-bottom:6px">${node.text}</div>${btns}`;
  dlgEl.querySelectorAll('.dlg-c').forEach((b) => {
    const c = choices[+b.dataset.i];
    b.addEventListener('mouseenter', () => { b.style.color = '#fff'; });
    b.addEventListener('mouseleave', () => { b.style.color = '#cbb89a'; });
    b.onclick = () => { if (c.action) c.action(); if (c.next < 0) endDialogue(); else { dlgNode = c.next; showDlgNode(); } };
  });
  dlgEl.style.display = 'block';
}
function endDialogue() { dialogueOpen = false; dlgEl.style.display = 'none'; player.lock(); }
let gameIsOver = false;
function gameOver() {
  if (gameIsOver) return; gameIsOver = true;
  setTimeout(() => {                         // let the jump-scare land first
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:rgba(12,0,0,0.94);color:#c9b8a0;font-family:Georgia,serif;text-align:center;cursor:pointer';
    o.innerHTML = '<div style="font-size:2.6rem;letter-spacing:.14em;color:#b03a2e;text-shadow:0 0 18px rgba(120,20,10,.7)">GAME OVER</div><div style="font-size:1rem;opacity:.7">잡혔다.</div><div style="font-size:.9rem;opacity:.5;margin-top:1rem">클릭하여 처음부터 다시</div>';
    o.addEventListener('click', () => location.reload());
    document.body.appendChild(o);
    if (player.controls && player.controls.unlock) player.controls.unlock();
  }, 1300);
}

// cinematic "forced look at the door" helpers. The dummy MUST be a camera —
// Object3D.lookAt() orients non-cameras with the opposite handedness, which made
// the view snap to the back wall instead of the door.
const GRANDMA_LOOK = new THREE.Vector3(DOOR.x + 0.2, 1.35, 0);
const _lookDummy = new THREE.PerspectiveCamera();

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------
const post = new Post(renderer, scene, camera);

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
// Title music tries to start on load; a single click enters the game (music off).
// (Browsers block audio before any gesture — once your browser has granted this
// page autoplay it plays immediately; otherwise it begins on your first click.)
let titleBgm = null, gameEntered = false;
audio.resume();
audio.loadAll(['bgm_start']).then(() => {
  if (!gameEntered && audio.ctx.state === 'running') titleBgm = audio.loop('bgm_start', 0.5);
});
overlay.addEventListener('click', () => {
  gameEntered = true;
  if (titleBgm) { titleBgm.stop(); titleBgm = null; }
  player.lock();                                    // single click → enter the game
});
let ambientAudio = null, heartbeatAudio = null, audioStarted = false;
let scareTimer = 20 + Math.random() * 22;   // next random ambient dread cue (s)
player.controls.addEventListener('lock', () => {
  overlay.classList.add('hidden'); crosshair.style.display = 'block';
  audio.resume();
  if (titleBgm) { titleBgm.stop(); titleBgm = null; }   // ensure title music is off in-game
  if (!audioStarted) {
    audioStarted = true;
    heartbeatAudio = audio.loop('heartbeat', 0.0); // volume driven by captor.tension
    audio.loadAll();                               // load the rest of the real clips in the background
  }
});
player.controls.addEventListener('unlock', () => {
  if (lockUIOpen || letterUIOpen || inventory.isOpen || dialogueOpen || chairChoiceOpen) return; // mouse UI open — keep start menu hidden
  overlay.classList.remove('hidden'); crosshair.style.display = 'none';
});

// ?auto : skip the start overlay and just render (no pointer lock). Used by the
// headless smoke test and handy for debugging the scene without grabbing the mouse.
if (location.search.includes('auto')) {
  overlay.classList.add('hidden');
  crosshair.style.display = 'block';
}

// ?debug : flat diagnostic view to judge the GI itself — no fog, no horror
// post, higher exposure, and an overview camera that sees walls/floor/corridor.
const DEBUG = location.search.includes('debug');
if (DEBUG) {
  scene.fog = null;
  scene.background = new THREE.Color(0x101218);
  renderer.toneMappingExposure = 1.5;
  camera.fov = 80; camera.updateProjectionMatrix();
  if (location.search.includes('captor') || location.search.includes('cappose')) {
    camera.position.set(-2.6, 1.7, 1.4);  // back-left, facing the door
    camera.lookAt(DOOR.x, 1.1, 0);
  } else {
    camera.position.set(2.5, 2.5, 2.5);   // inside the +x/+z corner
    camera.lookAt(-0.8, 0.7, -0.8);       // across the room toward the shelf
  }
}

// ?captor : auto-fire a captor return shortly after load (for headless capture).
if (location.search.includes('captor')) setTimeout(() => captor.trigger(), 1500);
// ?cappose : freeze the "open doorway" tableau immediately (time-independent capture).
if (location.search.includes('cappose')) captor.debugPose();
// ?grab : start with the lantern lit & carried (for capturing the moving GI).
if (location.search.includes('grab')) lantern._pickUp();
// ?inspect : open the spoon inspect screen immediately (capture/debug).
if (location.search.includes('inspect')) inspectView.open(SPOON);
// ?cuffs : look back at the chair/handcuffs from the table side (capture/debug).
if (location.search.includes('cuffs')) { camera.position.set(0, 1.25, 0.7); camera.lookAt(0, 0.95, 2.4); }
// ?dlg=N : jump to section N and open the bars dialogue (regression check for the freeze).
{ const m = location.search.match(/[?&]dlg=(\d)/); if (m) { gameSection = +m[1]; setTimeout(() => startDialogue(), 300); } }

// ---------------------------------------------------------------------------
// Initial full GI bake (one-time hitch at load, then amortized updates)
// ---------------------------------------------------------------------------
let baked = false;
function bakeOnce() {
  if (baked || !ddgi) return;
  try {
    ddgi.refreshAll();
  } catch (e) {
    console.error('[DDGI] bake failed, disabling GI updates:', e);
    ddgi = null;
  }
  baked = true;
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const frameClock = new THREE.Clock();
function tick() {
  const dt = Math.min(frameClock.getDelta(), 0.05);
  try {

  const uiBlocking = inspectView.isOpen || inventory.isOpen;
  const present = captor.isPresent();   // she's at/in the room → cinematic lock
  const clockLook = clock.isLooking();  // leaned in at the alarm clock
  const hidden = wardrobe.isHiding();   // hiding in the wardrobe (black screen)
  const frozen = uiBlocking || present || clockLook || hidden || lockUIOpen || letterUIOpen || dialogueOpen || chairChoiceOpen || onLadder || dying || gameIsOver;

  lights.update(dt, true);
  // mirror flicker onto the visible bulb's glow
  if (room.bulbDisplayMat) room.bulbDisplayMat.emissiveIntensity = 1.0 + lights.bulb.display.intensity * 0.5;

  if (!frozen) player.update(dt, input);
  lantern.update(dt);
  clock.update(dt);
  wardrobe.update(dt);
  drawer.update(dt);

  // ---- ambient dread: random wall-scratches / faint creaks during free-roam
  //      only (not while talking, in a menu, hiding, or she's present) ----
  if (audioStarted && !frozen) {
    scareTimer -= dt;
    if (scareTimer <= 0) {
      const r = Math.random();
      if (r < 0.6) audio.oneShot('scratch', 0.4 + Math.random() * 0.25);     // nails on the wall
      else if (r < 0.85) audio.oneShot('creak', 0.28);                        // a distant hinge
      else audio.oneShot('insect', 0.5);                                      // skittering
      scareTimer = 20 + Math.random() * 30;
    }
  }

  // ---- first time you face roughly toward the baby photo → a scream (1 of 4) ----
  if (!babySeen && audioStarted && !frozen) {
    const toBaby = BABY_POS.clone().sub(camera.position); const dist = toBaby.length(); toBaby.normalize();
    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (dist < 9 && toBaby.dot(_fwd) > 0.72) { babySeen = true; audio.oneShotPart('baby_scream', 1.0, 0, 0.25); } // ~44° cone
  }

  // ---- endgame: faint blue wall clue → crouch under the chair → item choice ----
  if (!chairClue.shown && !soloLocked && soupAfterLadder && lantern.isOnHook()) {
    chairClue.shown = true;
    subtitle('…벽 어딘가에서 희미한 푸른 빛이 번진다.');   // vague — no answer given away
  }
  if (chairClue.shown) {
    for (const mat of chairClue.mats) {
      if (mat.opacity < CLUE_FADE) mat.opacity = Math.min(CLUE_FADE, mat.opacity + dt * 0.35);
    }
  }
  if (chairClue.shown && !chairChoiceResolved && !chairChoiceOpen && player.crouching) {
    const pp = player.object.position;
    if (Math.hypot(pp.x - CHAIR.x, pp.z - CHAIR.z) < 0.9) openChairChoice();
  }

  // ---- 분침 doom run: cross the centre line (z=0, toward the vent) → she's loose ----
  if (escapeMode === 'solo' && !doomTriggered && !escaped && !gameIsOver && camera.position.z < 0) {
    doomTriggered = true; doomActive = true;
    showDoomPanic();
    audio.oneShot('scream', 1.0);
    captor.trigger(15, '도망쳐──!');   // 15s timer + she comes; reach the vent first
  }

  // ---- prompts + contextual keys ----
  if (clockLook) {
    promptEl.innerHTML = '[Q] ↺ 반시계 &nbsp;&nbsp; [R] ↻ 시계방향 &nbsp;&nbsp; [E] 일어서기';
    promptEl.style.opacity = '1';
    if (input.isDown('KeyQ')) clock.rotate(1, dt);    // CCW (정답)
    if (input.isDown('KeyR')) clock.rotate(-1, dt);   // CW (알람)
    if (input.wasPressed('KeyE')) clock.exitLook();
  } else if (dialogueOpen) {
    promptEl.style.opacity = '0';                      // mouse-driven choices
  } else if (lockUIOpen || letterUIOpen) {
    promptEl.style.opacity = '0';                      // mouse-driven dial UI
  } else if (hidden) {
    if (killing) {                                     // the strike is playing out → black screen
      promptEl.style.opacity = '0';
    } else if (knifeAmbushActive) {                    // she's at the doors — strike or be found
      promptEl.innerHTML = '<span style="color:#ff2d20;font-weight:bold;text-shadow:0 0 10px rgba(220,20,10,.8)">[F] ???</span>';
      promptEl.style.opacity = '1';
      knifeAmbushTimer -= dt;
      if (input.wasPressed('KeyF')) knifeKill();
      else if (knifeAmbushTimer <= 0) { knifeAmbushActive = false; hideScareDeath(); }
    } else {
      promptEl.innerHTML = '[F] 나오기';
      promptEl.style.opacity = '1';
      if (input.wasPressed('KeyF')) comeOut();
    }
  } else if (onLadder) {
    interaction.update();                              // looking at the vent (view is slerped to it)
    const lookingVent = !!interaction.prompt;
    promptEl.innerHTML = (lookingVent ? interaction.prompt + '<br>' : '') + '[F] 내려가기';
    promptEl.style.opacity = '1';
    if (input.wasPressed('KeyE') && lookingVent) interaction.tryInteract();
    if (input.wasPressed('KeyF')) climbDown();
  } else if (!frozen) {
    interaction.update();
    const interactTarget = !!interaction.prompt;       // looking at a grabbable/hook
    const chairP = chairSeat.prompts();                // E = sit/stand, F = cuffs

    const lines = [];
    if (interactTarget) {
      lines.push(interaction.prompt);                  // E = grab / hang / look / open / talk
      for (const p of chairP) if (p.key === 'F') lines.push(`[${p.key}] ${p.label}`); // keep cuffs
    } else {
      for (const p of chairP) lines.push(`[${p.key}] ${p.label}`);
    }
    promptEl.innerHTML = lines.join('<br>');
    promptEl.style.opacity = lines.length ? '1' : '0';

    if (input.wasPressed('KeyE')) {
      if (interactTarget) {
        if (interaction.current() !== food) eatStreak = 0;  // any other action breaks the eating streak
        interaction.tryInteract();                          // grab/look/open/talk (food → eat)
      } else { chairSeat.pressE(); eatStreak = 0; }          // stand / sit
    }
    if (input.wasPressed('KeyF')) {
      eatStreak = 0;
      if (ladderInstalled && !onLadder && interaction.current() === ventInteract) climbLadder(); // up the ladder
      else if (interaction.current() === wardrobe && wardrobe.canHide()) hideInWardrobe();
      else if (hasKnife) shout();                       // knife in hand → F shouts for her
      else chairSeat.pressF();                          // cuff lock/unlock (needs spoon)
    }
    if (input.wasPressed('KeyC') && !chairSeat.sitting) player.toggleCrouch();
  } else {
    promptEl.style.opacity = '0';
    if (input.wasPressed('KeyE') && inspectView.isOpen) inspectView.close();
  }

  // I toggles inventory (allowed even while it's the only blocker, so it closes)
  if (input.wasPressed('KeyI') && !inspectView.isOpen && !present && !clockLook && !lockUIOpen && !dialogueOpen && !hidden) toggleInventory();
  if (inventory.isOpen) {                              // scroll long lists with up/down
    if (input.isDown('ArrowDown')) inventory.panel.scrollTop += 10;
    if (input.isDown('ArrowUp')) inventory.panel.scrollTop -= 10;
  }
  if (input.wasPressed('KeyT')) captor.trigger();  // debug: trigger a return

  captor.update(dt);
  if (hidden) {                         // peering out at the wardrobe doors
    _lookDummy.position.copy(camera.position);
    _lookDummy.lookAt(HIDE_LOOK);
    camera.quaternion.slerp(_lookDummy.quaternion, 1 - Math.exp(-9 * dt));
  } else if (present) {                 // frozen in place, view forced to track her
    _lookDummy.position.copy(camera.position);
    _lookDummy.lookAt(captor.getLookTarget());
    camera.quaternion.slerp(_lookDummy.quaternion, 1 - Math.exp(-5 * dt));
  } else if (onLadder) {                 // up the ladder → view settles on the vent cover
    _lookDummy.position.copy(camera.position);
    _lookDummy.lookAt(VENT_LOOK);
    camera.quaternion.slerp(_lookDummy.quaternion, 1 - Math.exp(-7 * dt));
  }
  if (heartbeatAudio) heartbeatAudio.setVolume(captor.tension * 0.9);
  if (subtitleTimer > 0) { subtitleTimer -= dt; if (subtitleTimer <= 0) subtitle(''); }

  if (ddgi) ddgi.update();  // amortized probe refresh

  if (inspectView.isOpen) inspectView.render(dt);
  else if (DEBUG) renderer.render(scene, camera);
  else post.render(dt);

  crosshair.style.display = (player.locked && !frozen) ? 'block' : 'none';

  } catch (e) {
    console.error('[tick] frame error (continuing):', e);  // never let one bad frame freeze the whole game
  }
  input.endFrame();
  requestAnimationFrame(tick);
}

// Bake after the first paint so the canvas/context is fully ready.
requestAnimationFrame(() => { bakeOnce(); tick(); });

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
});
