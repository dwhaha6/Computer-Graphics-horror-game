// Single source of truth for spatial layout, shared by the player controller,
// room geometry, and the DDGI probe volume so they never drift apart.
//
//  plan view (x right, z down):
//
//        z-
//    +-----------+        (main room)  -4..4 in x, -4..4 in z
//    |           |####    door gap on +x wall at z in [-0.8, 0.8]
//    |   ROOM    |####===> CORRIDOR  4..7 in x, -0.9..0.9 in z
//    |           |####
//    +-----------+
//        z+

export const ROOM = { minX: -4, maxX: 4, minZ: -4, maxZ: 4 };
export const CORRIDOR = { minX: 4, maxX: 7, minZ: -0.9, maxZ: 0.9 };
export const DOOR = { x: 4, minZ: -0.8, maxZ: 0.8, height: 2.1 };
export const CEILING_Y = 3.0;

// Walkable union used by the player controller.
export const WALKABLE = [
  { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
  // include the door slab so the player can pass through the wall line
  { minX: ROOM.maxX - 0.05, maxX: CORRIDOR.minX + 0.05, minZ: DOOR.minZ, maxZ: DOOR.maxZ },
  { minX: CORRIDOR.minX, maxX: CORRIDOR.maxX, minZ: CORRIDOR.minZ, maxZ: CORRIDOR.maxZ },
];

// Bounds the DDGI probe grid must cover (room + corridor + a small margin).
export const GI_BOUNDS = {
  min: [ROOM.minX - 0.4, -0.2, ROOM.minZ - 0.4],
  max: [CORRIDOR.maxX + 0.4, CEILING_Y + 0.2, ROOM.maxZ + 0.4],
};

// Probe grid resolution (counts along x,y,z). Kept modest for WebGL2 raster
// gather; tune on GPU. ~10*4*8 = 320 probes for the larger room.
export const PROBE_COUNTS = [10, 4, 8];
