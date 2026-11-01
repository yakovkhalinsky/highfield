/* Ground lenses: which field the view is showing, and the colour of one
 * cell. Pure and deterministic — no THREE, no document, no sim RNG — so
 * the overlay can be checked without starting the scene. The view reads
 * these and does not write the snapshot. */

export const LENSES = Object.freeze(['off', 'wear', 'puddle', 'shade', 'light']);

/* One hue per field, pale at a low value and deeper at a high one.
 * Wear darkens; the others only grow more opaque. Channels are 0..1. */
const RAMPS = {
  wear:   { r0: 0.72, g0: 0.50, b0: 0.30, r1: 0.34, g1: 0.18, b1: 0.08 },
  puddle: { r0: 0.52, g0: 0.70, b0: 0.90, r1: 0.08, g1: 0.32, b1: 0.74 },
  shade:  { r0: 0.62, g0: 0.66, b0: 0.72, r1: 0.26, g1: 0.32, b1: 0.42 },
  light:  { r0: 0.98, g0: 0.86, b0: 0.52, r1: 0.88, g1: 0.50, b1: 0.10 },
};

const NONE = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

function queryOf(search) {
  const text = String(search ?? '');
  const q = text.indexOf('?');
  const query = q >= 0 ? text.slice(q + 1) : text;
  const hash = query.indexOf('#');
  return hash >= 0 ? query.slice(0, hash) : query;
}

/** `?lens=` when it names a lens, otherwise `off`. */
export function lensFromSearch(search) {
  const lens = new URLSearchParams(queryOf(search)).get('lens');
  return lens && LENSES.indexOf(lens) >= 0 ? lens : 'off';
}

/** The next lens, wrapping. An unknown current starts at wear. */
export function nextLens(current) {
  const i = LENSES.indexOf(current);
  if (i < 0) return 'wear';
  return LENSES[(i + 1) % LENSES.length];
}

/** The previous lens, wrapping. An unknown current starts at light. */
export function prevLens(current) {
  const i = LENSES.indexOf(current);
  if (i < 0) return 'light';
  return LENSES[(i - 1 + LENSES.length) % LENSES.length];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Colour and opacity for one cell. `a` is 0 when the lens is off, the
 * kind is unknown, or the value is 0 (or not a positive finite number).
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function lensColor(kind, value0to9) {
  const ramp = RAMPS[kind];
  const value = Number(value0to9);
  if (!ramp || !Number.isFinite(value) || value <= 0) return NONE;
  const t = Math.min(value, 9) / 9;
  return {
    r: clamp01(ramp.r0 + (ramp.r1 - ramp.r0) * t),
    g: clamp01(ramp.g0 + (ramp.g1 - ramp.g0) * t),
    b: clamp01(ramp.b0 + (ramp.b1 - ramp.b0) * t),
    a: clamp01(0.26 + 0.62 * t),
  };
}
