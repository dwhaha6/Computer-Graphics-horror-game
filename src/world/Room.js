import * as THREE from 'three';
import { ROOM, CORRIDOR, DOOR, CEILING_Y } from './layout.js';

// Material palette. `tex` names a folder under public/assets/textures/<tex>/
// holding tileable CC0 PBR maps (color.jpg [+ normal.jpg, rough.jpg]); if the
// files are absent the flat `color` is used. `rep` = how many tiles across.
const PALETTE = {
  floor:   { color: 0x2a2018, rough: 0.95, metal: 0.0, tex: 'floor',   rep: 4 },
  wall:    { color: 0x3a2f24, rough: 0.9,  metal: 0.0, tex: 'wall',    rep: 3 },
  ceiling: { color: 0x1c160f, rough: 1.0,  metal: 0.0, tex: 'ceiling', rep: 3 },
  wood:    { color: 0x4a3526, rough: 0.7,  metal: 0.0, tex: 'wood',    rep: 1 },
  metal:   { color: 0x55585c, rough: 0.45, metal: 0.8 },
  cloth:   { color: 0x5a1410, rough: 0.95, metal: 0.0 },
};

/**
 * Builds the playable room + corridor as two parallel graphs:
 *  - displayGroup: textured PBR meshes (MeshStandardMaterial) the player sees
 *  - proxyGroup:   flat low-poly Lambert meshes used ONLY by the DDGI gather
 * The proxy mirrors albedo/emissive so indirect light has the right colour,
 * but stays cheap so per-probe cube renders are fast.
 */
export class Room {
  constructor() {
    this.displayGroup = new THREE.Group();
    this.proxyGroup = new THREE.Group();
    this.solids = [];           // furniture footprints for player collision
    this.interactables = [];    // populated by gameplay layer later
    this.displayMeshes = [];     // meshes that should receive DDGI
    this._texMats = {};          // tex key -> [{mat, rep}] for loadTextures()

    this._build();
  }

  _addBox(spec) {
    const { cx, cy, cz, w, h, d, pal, emissive = null, emissiveIntensity = 0, solid = false } = spec;
    const geo = new THREE.BoxGeometry(w, h, d);

    const stdMat = new THREE.MeshStandardMaterial({
      color: pal.color, roughness: pal.rough, metalness: pal.metal,
    });
    if (emissive) { stdMat.emissive = new THREE.Color(emissive); stdMat.emissiveIntensity = emissiveIntensity; }
    const mesh = new THREE.Mesh(geo, stdMat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.displayGroup.add(mesh);
    this.displayMeshes.push(mesh);

    if (pal.tex) {
      if (!this._texMats[pal.tex]) this._texMats[pal.tex] = [];
      this._texMats[pal.tex].push({ mat: stdMat, rep: pal.rep || 1 });
    }

    // proxy: flat lambert, same albedo/emissive, no shadows
    const proxMat = new THREE.MeshLambertMaterial({ color: pal.color });
    if (emissive) { proxMat.emissive = new THREE.Color(emissive); proxMat.emissiveIntensity = emissiveIntensity; }
    const prox = new THREE.Mesh(geo.clone(), proxMat);
    prox.position.set(cx, cy, cz);
    this.proxyGroup.add(prox);

    if (solid) {
      this.solids.push({
        minX: cx - w / 2, maxX: cx + w / 2,
        minZ: cz - d / 2, maxZ: cz + d / 2,
      });
    }
    return mesh;
  }

  /**
   * Apply tileable CC0/AI PBR textures from public/assets/textures/<tex>/:
   *   color.jpg (required) + normal.jpg, rough.jpg (optional).
   * Missing files just leave the flat placeholder colour. Call once after build.
   */
  loadTextures(base = './') {
    const loader = new THREE.TextureLoader();
    const apply = (key, file, srgb, assign) => {
      loader.load(`${base}assets/textures/${key}/${file}`, (tex) => {
        for (const { mat, rep } of this._texMats[key]) {
          const t = tex.clone();
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(rep, rep);
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          assign(mat, t);
          mat.needsUpdate = true;
        }
      }, undefined, () => {});
    };
    for (const key in this._texMats) {
      apply(key, 'color.jpg', true, (m, t) => { m.map = t; m.color.set(0xffffff); });
      apply(key, 'normal.jpg', false, (m, t) => { m.normalMap = t; });
      apply(key, 'rough.jpg', false, (m, t) => { m.roughnessMap = t; });
    }
  }

  _build() {
    const t = 0.15; // wall thickness

    // ---- Main room shell ----
    const rw = ROOM.maxX - ROOM.minX, rd = ROOM.maxZ - ROOM.minZ;
    const rcx = (ROOM.minX + ROOM.maxX) / 2, rcz = (ROOM.minZ + ROOM.maxZ) / 2;
    this._addBox({ cx: rcx, cy: -t / 2, cz: rcz, w: rw, h: t, d: rd, pal: PALETTE.floor });            // floor
    this._addBox({ cx: rcx, cy: CEILING_Y + t / 2, cz: rcz, w: rw, h: t, d: rd, pal: PALETTE.ceiling }); // ceiling
    this._addBox({ cx: rcx, cy: CEILING_Y / 2, cz: ROOM.minZ - t / 2, w: rw + 2 * t, h: CEILING_Y, d: t, pal: PALETTE.wall }); // -z wall
    this._addBox({ cx: rcx, cy: CEILING_Y / 2, cz: ROOM.maxZ + t / 2, w: rw + 2 * t, h: CEILING_Y, d: t, pal: PALETTE.wall }); // +z wall
    this._addBox({ cx: ROOM.minX - t / 2, cy: CEILING_Y / 2, cz: rcz, w: t, h: CEILING_Y, d: rd, pal: PALETTE.wall });          // -x wall

    // ---- +x wall WITH a door gap (two side segments + lintel above) ----
    const gapH = DOOR.height;
    const segFrontD = (DOOR.minZ - ROOM.minZ);   // segment from -z corner to door
    const segBackD = (ROOM.maxZ - DOOR.maxZ);     // door to +z corner
    this._addBox({ cx: ROOM.maxX + t / 2, cy: CEILING_Y / 2, cz: (ROOM.minZ + DOOR.minZ) / 2, w: t, h: CEILING_Y, d: segFrontD, pal: PALETTE.wall });
    this._addBox({ cx: ROOM.maxX + t / 2, cy: CEILING_Y / 2, cz: (DOOR.maxZ + ROOM.maxZ) / 2, w: t, h: CEILING_Y, d: segBackD, pal: PALETTE.wall });
    this._addBox({ cx: ROOM.maxX + t / 2, cy: (gapH + CEILING_Y) / 2, cz: 0, w: t, h: CEILING_Y - gapH, d: (DOOR.maxZ - DOOR.minZ), pal: PALETTE.wall }); // lintel

    // ---- Corridor / adjacent space ----
    const cw = CORRIDOR.maxX - CORRIDOR.minX, cd = CORRIDOR.maxZ - CORRIDOR.minZ;
    const ccx = (CORRIDOR.minX + CORRIDOR.maxX) / 2, ccz = (CORRIDOR.minZ + CORRIDOR.maxZ) / 2;
    this._addBox({ cx: ccx, cy: -t / 2, cz: ccz, w: cw, h: t, d: cd, pal: PALETTE.floor });
    this._addBox({ cx: ccx, cy: CEILING_Y + t / 2, cz: ccz, w: cw, h: t, d: cd, pal: PALETTE.ceiling });
    this._addBox({ cx: ccx, cy: CEILING_Y / 2, cz: CORRIDOR.minZ - t / 2, w: cw, h: CEILING_Y, d: t, pal: PALETTE.wall });
    this._addBox({ cx: ccx, cy: CEILING_Y / 2, cz: CORRIDOR.maxZ + t / 2, w: cw, h: CEILING_Y, d: t, pal: PALETTE.wall });
    this._addBox({ cx: CORRIDOR.maxX + t / 2, cy: CEILING_Y / 2, cz: ccz, w: t, h: CEILING_Y, d: cd, pal: PALETTE.wall }); // corridor end wall

    // ---- Furniture placeholders (swap for real CC0 models later) ----
    // Dining table the player wakes up at (center, the RE7 "dinner" beat).
    this._addBox({ cx: 0, cy: 0.72, cz: 0.6, w: 1.6, h: 0.08, d: 0.9, pal: PALETTE.wood, solid: true }); // table top
    this._addBox({ cx: 0, cy: 0.35, cz: 0.6, w: 1.4, h: 0.7, d: 0.7, pal: PALETTE.wood, solid: true });  // table body
    // Chair where the player starts "tied". NOT solid — the player spawns here
    // and must be able to move (and to "sit" back exactly on this spot).
    this._addBox({ cx: 0, cy: 0.45, cz: 1.7, w: 0.5, h: 0.9, d: 0.5, pal: PALETTE.wood });

    // ---- The hanging bulb (emissive sphere co-located with LightRig.bulb) ----
    const bulbGeo = new THREE.SphereGeometry(0.07, 16, 12);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 4.0,
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 2.4, 0);
    this.displayGroup.add(bulb);
    this.bulbDisplayMat = bulbMat; // so flicker can modulate emissive too

    const bulbProx = new THREE.Mesh(bulbGeo.clone(), new THREE.MeshLambertMaterial({
      color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 4.0,
    }));
    bulbProx.position.set(0, 2.4, 0);
    this.proxyGroup.add(bulbProx);
  }
}
