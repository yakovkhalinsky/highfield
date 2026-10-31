/* Human and site scale for the Highfield visual fork of world.js.
 * Pose Y values were authored for FIGURE_REF_H; drawFigure scales the root. */

export const FLOOR_H = 1.35;          // world units per storey
export const TILE_TOP = 0.12;         // the walking surface: top of a ground tile
export const WALK_Y = TILE_TOP + 0.005;

/* Standing adult to the hair. Doors and furniture are fractions of this
 * so a body, a doorway and a bench stay in one scale (real doorway is
 * ~18% taller than the person). */
export const PERSON_H = 0.82;
export const FIGURE_REF_H = 0.90;
export const FIGURE_SCALE = PERSON_H / FIGURE_REF_H;
export const DOOR_H = PERSON_H * 1.18;       // ~0.97 — clear a standing adult
export const SHOP_DOOR_H = PERSON_H * 1.40;
/* Park-bench seat ~32% of standing height (local to the fixture). */
export const BENCH_SEAT = PERSON_H * 0.32;

/* A season shifts the living ground and the trees; the road, the paving and
 * the buildings are the same in every season, because they are not alive. */
export const SEASONS = [
  { lawn: 0x6f8f52, play: 0xb5945a, path: 0x938a7b, water: 0x3d6f88,
    canopy: [0x4e7a3a, 0x5c8a44, 0x3f6b33] },
  { lawn: 0x63863c, play: 0xbe9a58, path: 0x9a9080, water: 0x3a7392,
    canopy: [0x3f7a35, 0x4e8a3f, 0x366b2d] },
  { lawn: 0x8a7c3e, play: 0xb08a4c, path: 0x8d8474, water: 0x39677d,
    canopy: [0x9a7b2e, 0xa8862f, 0x80651f] },
  { lawn: 0x8b9189, play: 0xa89a80, path: 0x8c8c8c, water: 0x35586b,
    canopy: [0x8a8f82, 0x7c8277, 0x6e746a] },
];

/* The site names are the pack's (`codes` in /api/ground); this is only what
 * each one looks like. An unknown site gets a stable colour rather than a
 * second copy of the site list, so a pack that adds a site still draws. */
export const SITE_COLOUR = {
  road: 0x3a4048, path: 0x938a7b, paved: 0x6d6a63, lawn: 0x6f8f52,
  play: 0xb5945a, water: 0x3d6f88, building: 0x2f3640,
  yard: 0x86817a,
};

export const BUILDING_STYLE = {
  block: { wall: 0xb7b0a1, roof: 0x444b52, trim: 0x8f887b },
  shop: { wall: 0xcf9f60, roof: 0x7c4038, trim: 0xf0c98a },
  /* red brick and a slate roof: a school looks like nothing else here */
  school: { wall: 0xa8654a, roof: 0x3e4650, trim: 0xe3d6bf },
};

/* Clothing and hair are hashed from the resident id so the crowd reads as
 * people, not as role tokens. Role still sets height (and elder hair). */
export const CLOTHING = [
  0x5b7c99, 0x6a8f71, 0x9a6b5a, 0x7a6e8c, 0xb08948,
  0x4f6a78, 0x8b5e4a, 0x5e7a6a, 0x946b7a, 0x6e7580,
];
export const PANTS = [0x3a4550, 0x4a4038, 0x2f3d4a, 0x4a4a52, 0x3d3830];
export const HAIR = [0x1a1410, 0x3b2a1a, 0x6b4a2a, 0x8a7a6a, 0xc8b090, 0x2a2a2e];
export const SKIN = [0xf1d5b5, 0xe8c39a, 0xc68863, 0x8d5524];

/* A weather is a fact about the sky, so it tints the sky (and the fog that
 * matches it) rather than only the ground. Clear days keep the phase's own
 * blue; rain and storm pull it to grey, frost to a cold haze, heat to a
 * warm one. Night keeps its dark blue — the tint fades out with the light,
 * because a grey sky at midnight is not what rain looks like. */
export const WEATHER_SKY = {
  rain:  { hex: 0x8c98a3, mix: 0.68, sun: 0.72 },
  storm: { hex: 0x6d7883, mix: 0.8, sun: 0.55 },
  frost: { hex: 0xd7e2ea, mix: 0.45, sun: 0.85 },
  heat:  { hex: 0xe8cfa0, mix: 0.32, sun: 1.02 },
};

/* the sun never gets low enough to throw a shadow across the sky */
export const SUN_MIN_Y = 19;

export function hash01(n, salt) {
  let x = (n * 374761393 + (salt || 0) * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) | 0;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967295;
}

export function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function doorFace(b) {
  const dx = b.door[0], dy = b.door[1];
  if (dy < b.y) return { axis: 'z', sign: -1, at: b.y };
  if (dy >= b.y + b.h) return { axis: 'z', sign: 1, at: b.y + b.h };
  if (dx < b.x) return { axis: 'x', sign: -1, at: b.x };
  return { axis: 'x', sign: 1, at: b.x + b.w };
}
