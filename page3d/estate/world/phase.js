/* Overlay one of today's recorded phases onto a live snapshot — same
 * rules as hud.js phaseView, kept here so the scene can follow the clock
 * without forking the vendored HUD. */

const MODE = { i: 'in', a: 'at', s: 'school', w: 'away' };

/**
 * @param {object} st live /api/state snapshot
 * @param {number} index into st.phases.order; <0 leaves st unchanged
 * @returns {object} st, or a shallow copy with people rewritten
 */
export function phaseView(st, index) {
  const ph = st && st.phases;
  if (!ph || !ph.order || index < 0 || index >= ph.order.length) return st;
  const name = ph.order[index];
  const at = (ph.at || {})[name];
  if (!at) return st;
  const before = index > 0 ? (ph.at || {})[ph.order[index - 1]] : null;
  const people = (st.people || []).map((p) => {
    const r = at[String(p.id)];
    if (!r) return p;
    const q = { ...p };
    const mode = MODE[r[2]] || 'at';
    const b = before ? before[String(p.id)] : null;
    const pmode = b ? (MODE[b[2]] || 'at') : (p.pin ? 'in' : 'at');
    q.x = r[0]; q.y = r[1]; q.mode = mode;
    q.unit = r[3]; q.fixture = r[4]; q.with = r[5];
    if (b) { q.px = b[0]; q.py = b[1]; q.punit = b[3]; }
    q.pin = pmode === 'in';
    q.pmode = pmode;
    /* off the estate at work: hidden, except in the phase they left,
     * when they are at the stop waiting for the bus */
    q.in = mode === 'in' || (mode === 'away' && pmode === 'away');
    return q;
  });
  return {
    ...st,
    people,
    viewPhase: name,
    viewKey: Number(st.day) + ':' + name,
  };
}

/** Apply the named phase, or return st if that name is missing. */
export function phaseByName(st, name) {
  const order = (st && st.phases && st.phases.order) || [];
  const i = order.indexOf(name);
  return i < 0 ? st : phaseView(st, i);
}
