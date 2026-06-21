import * as THREE from 'three';

// Item definitions. makeMesh() builds a fresh 3D model used both for the
// world pickup and the centered inspect view.
export function makeSpoonMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d5db, roughness: 0.2, metalness: 0.92 });

  // oval bowl elongated ALONG the handle (length on +y), narrow across (x),
  // flattened in depth (z) — a real spoon scoop, not a disc across the handle.
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 22), steel);
  bowl.scale.set(0.62, 1.3, 0.34);
  bowl.position.y = -0.045;

  // a slightly darker, recessed front face to read as the hollow of the scoop
  const hollow = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 28, 18),
    new THREE.MeshStandardMaterial({ color: 0x9fa3ab, roughness: 0.3, metalness: 0.85 }),
  );
  hollow.scale.set(0.5, 1.12, 0.3);
  hollow.position.set(0, -0.045, 0.006);

  // tapered neck into a straight handle, in line with the bowl
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.022, 0.045, 16), steel);
  neck.position.y = 0.045;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.012, 0.17, 16), steel);
  handle.position.y = 0.16;

  g.add(bowl, hollow, neck, handle);
  return g;
}

export const SPOON = {
  id: 'spoon',
  name: '숟가락',
  desc: '낡은 양철 숟가락. 끝이 닳아 제법 날카롭다. 무언가를 긁거나 비틀어 여는 데 쓸 수 있을 것 같다.',
  makeMesh: makeSpoonMesh,
};

// The clock's minute hand — drops off when the clock is turned counter-clockwise.
// It doubles as the key to the locked wardrobe.
export function makeMinuteHandMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x70727a, roughness: 0.4, metalness: 0.85 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.004), mat); // long thin hand
  blade.position.y = 0.06;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), mat);
  hub.rotation.x = Math.PI / 2;
  hub.position.y = -0.05;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 4), mat); // arrowhead tip
  tip.position.y = 0.17;
  g.add(blade, hub, tip);
  return g;
}

export const MINUTE_HAND = {
  id: 'minute_hand',
  name: '분침',
  desc: '시계에서 빠진 가느다란 분침. 끝이 열쇠처럼 생겼다. 어딘가를 열 수 있을 것 같다.',
  makeMesh: makeMinuteHandMesh,
};

// Clue note hidden inside the wardrobe — points to the next puzzle.
export function makeNoteMesh() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xcabd9c, roughness: 0.9 }));
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.008, 0.004),
    new THREE.MeshStandardMaterial({ color: 0xa89a78, roughness: 0.9 }));
  g.add(paper, fold);
  return g;
}

// folding ladder — reward for the GOLD code; reaches the vent.
export function makeLadderMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 });
  for (const sx of [-0.18, 0.18]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), mat);
    rail.position.x = sx; g.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.04), mat);
    rung.position.y = -0.55 + i * 0.28; g.add(rung);
  }
  return g;
}
export const LADDER = {
  id: 'ladder', name: '사다리',
  desc: '접이식 나무 사다리. 높은 곳 — 환풍구 — 에 닿을 수 있을 것 같다.',
  makeMesh: makeLadderMesh,
};

// drawer pictures (the NEED → 4-letter-word puzzle). image = shown big on inspect.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
function makePicMesh(url) {
  return () => {
    const g = new THREE.Group();
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.01), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 }));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15), new THREE.MeshBasicMaterial({ map: tex }));
    pic.position.z = 0.007;
    g.add(frame, pic);
    return g;
  };
}
export const PIC1 = {
  id: 'pic1', name: '사진 — 예시',
  desc: '토글 스위치와 "NEED". 규칙을 알려주는 예시 같다.',
  image: BASE + 'assets/pics/pic1.png', makeMesh: makePicMesh(BASE + 'assets/pics/pic1.png'),
};
export const PIC2 = {
  id: 'pic2', name: '사진 — 문제',
  desc: '토글 스위치 패턴만 있다. 같은 규칙으로 읽으면 네 글자 영단어가 된다.',
  image: BASE + 'assets/pics/pic2.png', makeMesh: makePicMesh(BASE + 'assets/pics/pic2.png'),
};

// --- endgame items: under-chair choice (knife / cell key) + the screwdriver ---
export function makeKnifeMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.22, metalness: 0.92 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.7 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.22, 0.006), steel); blade.position.y = 0.13;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.05, 4), steel); tip.position.y = 0.265; tip.rotation.y = Math.PI / 4;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.022), steel); guard.position.y = 0.02;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.11, 12), handleMat); handle.position.y = -0.04;
  g.add(blade, tip, guard, handle);
  return g;
}
export const KNIFE = {
  id: 'knife', name: '칼',
  desc: '날이 시퍼렇게 선 식칼. 손잡이가 손에 착 감긴다. 누군가… 끝장낼 수 있을 것 같다.',
  makeMesh: makeKnifeMesh,
};

export function makeCellKeyMesh() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8923a, roughness: 0.35, metalness: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 18), brass); ring.position.y = 0.085; ring.rotation.x = Math.PI / 2;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 10), brass);
  const bit1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.008), brass); bit1.position.set(0.018, -0.05, 0);
  const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.008), brass); bit2.position.set(0.014, -0.02, 0);
  g.add(ring, shaft, bit1, bit2);
  return g;
}
export const CELL_KEY = {
  id: 'cell_key', name: '열쇠',
  desc: '오래된 황동 열쇠. 옆방 김씨가 그토록 찾던 그 열쇠인 듯하다.',
  makeMesh: makeCellKeyMesh,
};

export function makeScrewdriverMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb0b4bc, roughness: 0.3, metalness: 0.9 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x9a2018, roughness: 0.5 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.1, 12), handleMat); handle.position.y = -0.06;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 10), steel); shaft.position.y = 0.06;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.004), steel); tip.position.y = 0.15;
  g.add(handle, shaft, tip);
  return g;
}
export const SCREWDRIVER = {
  id: 'screwdriver', name: '드라이버',
  desc: '김씨가 건네준 드라이버. 환풍구 덮개의 나사를 풀 수 있겠다.',
  makeMesh: makeScrewdriverMesh,
};

export const NOTE_CLUE = {
  id: 'note_clue',
  name: '쪽지',
  descSize: '1.45rem',   // the clue numbers were too small to read — enlarge
  desc: [
    '너무 괴롭다 구더기가 들끓는 스프만 벌써 세번째다',
    '이런식이면 일주일도 못 가 사망할거야...',
    '빨리 탈출구를 찾아야 해...',
    '',
    '3-5=9,',
    '1-6 | 2-1 | 2-8 | 3-5',
  ].join('\n'),
  makeMesh: makeNoteMesh,
};
