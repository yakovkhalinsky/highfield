/* Where people stand, walk and sit. School walks go through the gate.
 * Highfield visual fork of world.js. */
import * as THREE from 'three';
import {
  WALK_Y, CLOTHING, PANTS, HAIR, SKIN, hash01,
} from './scale.js';
import {
  POSE_STAND, POSE_SIT, SEAT_TOP, SIT_FORWARD, SIT_IN_MS, SIT_OUT_MS,
  STRIDE_CELLS, lerpPose, easeSmooth, slerpYaw,
} from './figures.js';

export function createResidents(kit) {
  const {
    scene, ground, grid, opts, clock, staticMode, _c1,
    Walk, Crowd, Clock, buildingById, occupied,
    ensureResidents, drawFigure, hideFigure,
  } = kit;

  let people = [];
  let personAt = [];
  const toX = [], toZ = [];
  const roleScale = [];
  /* 0 stands, 1 sits on the bench, 2 stands beside it because it is full */
  const sitMode = [], seatFx = [], seatFz = [];
  /* 0..1 blend toward the seated pose; eases in on arrival and out on leaving
   * so a sit never pops. Driven every frame from whether they should sit. */
  const sitBlend = [];
  /* Each walker's route (from walk.js beside this file) and when its walk
   * began. A route is built when a person's cell changes, not once a frame
   * and not once a poll: the state repeats between days, and rebuilding on
   * every poll restarted the walk before it had got anywhere. */
  const routes = [], routeT0 = [], routeDur = [];
  /* the cell each route set off from; and, for a young child walking with
   * their guardian, the guardian's index (Crowd.place's `with`), else -1 */
  const routeFrom = [], walksWith = [];
  const facing = [];
  let routesBuilt = false;
  let routeFallbacks = 0;     // straight lines used because no path was found
  let routeMaxPoints = 0;
  const routeSample = { x: 0, z: 0, dx: 0, dz: 0, moving: false };
  /* the figures handed to Walk.separate each frame (see updateResidents),
   * and the smallest gap it left, for the HUD and the checks */
  let crowdF = null, crowdIdx = [];
  let crowdFix = null;
  let stepList = null;
  let animLast = 0;
  kit.people = people;
  kit.personAt = personAt;
  kit.sitMode = sitMode;
  kit.routes = routes;
  kit.routeT0 = routeT0;
  kit.routeDur = routeDur;
  kit.routeFallbacks = routeFallbacks;
  kit.routeMaxPoints = routeMaxPoints;

  /* ----------------------------------------------------------- trace */
  /* `?trace=1` draws every current route; `?trace=<id>` draws one. It is a
   * debugging view, rebuilt when the day arrives and never inside a frame —
   * the lines are the route the person is actually walking, not a second
   * guess at it. */
  const TRACE_MAX = 8192;           // vertices
  let traceMesh = null, traceGeo = null;
  if (opts.trace) {
    traceGeo = new THREE.BufferGeometry();
    traceGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(TRACE_MAX * 3), 3)
        .setUsage(THREE.DynamicDrawUsage));
    traceGeo.setDrawRange(0, 0);
    traceMesh = new THREE.LineSegments(traceGeo, new THREE.LineBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.9,
      depthWrite: false }));
    traceMesh.frustumCulled = false;
    traceMesh.renderOrder = 4;
    traceMesh.visible = false;
    scene.add(traceMesh);
  }

  function rebuildTrace() {
    if (!traceMesh) return;
    const pos = traceGeo.attributes.position.array;
    const want = String(opts.trace);
    const one = want === '1' ? null : Number(want);
    let n = 0;
    for (let i = 0; i < people.length && n + 6 <= TRACE_MAX * 3; i++) {
      if (one !== null && people[i].id !== one) continue;
      const r = routes[i];
      if (!r || r.n < 2) continue;
      for (let k = 0; k + 1 < r.n && n + 6 <= TRACE_MAX * 3; k++) {
        pos[n++] = r.xs[k]; pos[n++] = WALK_Y + 0.04; pos[n++] = r.zs[k];
        pos[n++] = r.xs[k + 1]; pos[n++] = WALK_Y + 0.04; pos[n++] = r.zs[k + 1];
      }
    }
    traceGeo.setDrawRange(0, n / 3);
    traceGeo.attributes.position.needsUpdate = true;
    traceMesh.visible = n > 0;
  }

  /* where everyone outdoors stood last state: a walk starts from that spot
   * (the seat they get up from, their place in the crowd) rather than the
   * cell's centre, and somebody whose spot did not move is not sent
   * walking at all */
  let prevSpot = {};
  /* The day is the clock, not the poll: `clock` (clock.js) owns the anchor
   * and the pins. The page is polled several times per day, and resetting
   * on every state made the light restart toward dawn and the walk restart
   * toward the old position before either had got anywhere. The next state
   * with a new `day` re-anchors at the fraction already reached; the light
   * is a periodic function of that fraction, so the wrap back to 0 at the
   * day's turn is the same night it wraps from. */

  const _pose = {};
  const _delta = {};

  /* Where a walk begins or ends when a block is involved: the door cell the
   * engine itself walks to, never a point on the wall. Being inside is a
   * state, not a coordinate (`_pos` in the engine makes the same turn). */
  function doorSpot(unit) {
    const u = ground.units[String(unit)];
    const b = u ? buildingById[u.b] : null;
    return b ? { x: b.door[0], y: b.door[1] } : null;
  }

  /* The school gate, where every walk in or out of the yard goes through
   * the fence: the yard is not walkable ground (nobody crosses it on the
   * way somewhere else), so the router takes a walk to the gate and the
   * last steps are through it to the pupil's place inside. */
  const schoolB = (ground.buildings || [])
    .find(b => b.kind === 'school' && b.gate);
  const schoolGate = schoolB
    ? { x: Number(schoolB.gate[0]), y: Number(schoolB.gate[1]) } : null;
  let lastViewKey = '';

  function cellsBetween(sx, sy, tx, ty) {
    if (!grid) return null;
    const c = Walk.findPath(grid, sx, sy, tx, ty);
    return c ? Array.from(c) : null;
  }

  /* the cells of a walk that starts or ends inside the fence */
  function schoolCells(scx, scy, gx, gy, wasIn, isIn) {
    const G = schoolGate;
    const inner = [G.x, G.y + 1];
    if (wasIn && isIn) return [scx, scy, gx, gy];
    if (isIn) {
      const c = cellsBetween(scx, scy, G.x, G.y);
      return c ? c.concat(inner, [gx, gy]) : null;
    }
    const c = cellsBetween(G.x, G.y, gx, gy);
    return c ? [scx, scy].concat(inner, c) : null;
  }

  /* A walk into or out of the yard, shaped like Crowd.route's: from the
   * door or where the walker last stood, to their place (`tx`, `tz`) as
   * Crowd.place set it, through the gate. */
  function schoolRoute(p, tx, tz, prev, door) {
    let scx, scy, sx, sz;
    if (door) {
      scx = door.x; scy = door.y;
      sx = scx + 0.5; sz = scy + 0.5;
    } else {
      scx = p.px == null ? p.x : p.px;
      scy = p.py == null ? p.y : p.py;
      sx = scx + 0.5; sz = scy + 0.5;
      const was = prev && prev[p.id];
      if (was && was.cell === scx + ',' + scy) { sx = was.x; sz = was.z; }
      else if (scx === p.x && scy === p.y) return null;
    }
    if (Math.abs(sx - tx) < 1e-3 && Math.abs(sz - tz) < 1e-3) return null;
    const isIn = p.mode === 'school', wasIn = p.pmode === 'school';
    const cells = schoolCells(scx, scy, Math.floor(tx), Math.floor(tz),
                              wasIn, isIn);
    if (cells) {
      return { route: Walk.routePoints(cells, sx, sz, tx, tz),
               fallback: false, from: [scx, scy] };
    }
    return { route: Walk.straight(sx, sz, tx, tz), fallback: true,
             from: [scx, scy] };
  }

  function syncResidents(st) {
    people = st.people || [];
    kit.people = people;
    ensureResidents(people.length);
    const torsoMesh = kit.torsoMesh;
    const thighLMesh = kit.thighLMesh;
    const thighRMesh = kit.thighRMesh;
    const shinLMesh = kit.shinLMesh;
    const shinRMesh = kit.shinRMesh;
    const footLMesh = kit.footLMesh;
    const footRMesh = kit.footRMesh;
    const armLMesh = kit.armLMesh;
    const armRMesh = kit.armRMesh;
    const forearmLMesh = kit.forearmLMesh;
    const forearmRMesh = kit.forearmRMesh;
    const headMesh = kit.headMesh;
    const hairMesh = kit.hairMesh;
    const shadowMesh = kit.shadowMesh;
    const figureMeshes = [torsoMesh, thighLMesh, thighRMesh, shinLMesh,
                          shinRMesh, footLMesh, footRMesh, armLMesh, armRMesh,
                          forearmLMesh, forearmRMesh, headMesh, hairMesh,
                          shadowMesh];
    figureMeshes.forEach(m => { m.count = people.length; });
    if (personAt.length < kit.capacity) {
      for (let i = personAt.length; i < kit.capacity; i++) {
        personAt[i] = null;
        toX[i] = toZ[i] = 0;
        roleScale[i] = 1;
        sitMode[i] = 0;
        sitBlend[i] = 0;
        seatFx[i] = 0;
        seatFz[i] = 1;
        routes[i] = null;
        routeT0[i] = routeDur[i] = 0;
        facing[i] = 0;
      }
    }

    /* A position only changes when a day does. The page is polled several
     * times per day, so a route is rebuilt on the day's arrival and left
     * alone in between: rebuilding it on every poll restarted the walk from
     * its beginning before it had arrived. */
    /* the scrubber's view of another phase is a new picture too */
    const viewKey = st.viewKey || '';
    const fresh = !routesBuilt || st.day !== clock.daySeen ||
                  viewKey !== lastViewKey;
    lastViewKey = viewKey;
    const spotWas = prevSpot;
    /* the fixtures first: where a crowd may stand depends on them */
    if (fresh && grid) Walk.setFixtures(grid, st.fixtures || []);

    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      personAt[i] = p;
      toX[i] = p.x + 0.5;
      toZ[i] = p.y + 0.5;
      /* Height from age bands: young children, pupils, teens; elders a
       * little shorter. Workers and adults stay at 1. */
      if (p.role === 'elder') roleScale[i] = 0.92;
      else if (p.role === 'child' || p.pupil) {
        const age = Number(p.age);
        if (Number.isFinite(age) && age < 10) roleScale[i] = 0.62;
        else if (Number.isFinite(age) && age < 14) roleScale[i] = 0.72;
        else roleScale[i] = 0.82;
      } else roleScale[i] = 1;
      sitMode[i] = 0;

      const cloth = CLOTHING[Math.floor(hash01(p.id, 7) * CLOTHING.length) %
                            CLOTHING.length];
      const pants = PANTS[Math.floor(hash01(p.id, 11) * PANTS.length) %
                          PANTS.length];
      const skin = SKIN[Math.floor(hash01(p.id, 13) * SKIN.length) %
                        SKIN.length];
      let hair = HAIR[Math.floor(hash01(p.id, 17) * HAIR.length) % HAIR.length];
      if (p.role === 'elder') hair = 0xb8b0a4;
      _c1.setHex(cloth);
      torsoMesh.setColorAt(i, _c1);
      armLMesh.setColorAt(i, _c1);
      armRMesh.setColorAt(i, _c1);
      forearmLMesh.setColorAt(i, _c1);
      forearmRMesh.setColorAt(i, _c1);
      _c1.setHex(pants);
      thighLMesh.setColorAt(i, _c1);
      thighRMesh.setColorAt(i, _c1);
      shinLMesh.setColorAt(i, _c1);
      shinRMesh.setColorAt(i, _c1);
      footLMesh.setColorAt(i, _c1);
      footRMesh.setColorAt(i, _c1);
      _c1.setHex(skin);
      headMesh.setColorAt(i, _c1);
      _c1.setHex(hair);
      hairMesh.setColorAt(i, _c1);
    }

    /* Where on their tile each resident stands (crowd.js): one figure per
     * seat on a bench and the rest standing clear of it, everyone else on a
     * shared tile packed round its middle, never inside a table or a stall.
     * A function of the snapshot alone, so a poll that repeats the state
     * repeats the picture. */
    crowdFix = Crowd ? Crowd.fixtureMap(st.fixtures) : null;
    stepList = Crowd ? Crowd.steps(ground, st.fixtures) : null;
    const spots = Crowd ? Crowd.place(Walk, grid, people, kit.benchByCell,
                                      crowdFix)
                        : null;
    kit.seatedCount = spots ? spots.seated : 0;
    const spotNow = {};
    for (let i = 0; i < people.length; i++) {
      if (!spots) break;
      toX[i] = spots.x[i];
      toZ[i] = spots.z[i];
      sitMode[i] = spots.sit[i];
      seatFx[i] = spots.fx[i];
      seatFz[i] = spots.fz[i];
      const p = people[i];
      /* Crowd still fills seats by rank; only the person who chose this
       * bench keeps the sit pose — a follower stands clear. */
      if (sitMode[i] === 1) {
        const bench = kit.benchByCell[p.x + ',' + p.y];
        if (!bench || Number(p.fixture) !== bench.id) {
          sitMode[i] = 2;
          kit.seatedCount = Math.max(0, kit.seatedCount - 1);
        } else {
          const fl = Math.hypot(seatFx[i], seatFz[i]) || 1;
          toX[i] += (seatFx[i] / fl) * SIT_FORWARD;
          toZ[i] += (seatFz[i] / fl) * SIT_FORWARD;
        }
      }
      if (!p.in) spotNow[p.id] = { cell: p.x + ',' + p.y, x: toX[i], z: toZ[i] };
    }
    prevSpot = spotNow;
    [torsoMesh, thighLMesh, thighRMesh, shinLMesh, shinRMesh,
     footLMesh, footRMesh, armLMesh, armRMesh, forearmLMesh, forearmRMesh,
     headMesh, hairMesh]
      .forEach(m => {
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });

    /* Lit windows mean someone is inside that flat, not merely assigned
     * to it while outdoors or at work. Short-end panes have unit null. */
    occupied.clear();
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in && p.mode === 'in' && p.unit != null) occupied.add(p.unit);
    }
    kit.occupancyDirty = true;

    const now = performance.now();
    /* a pace change alters the rate, not the hour: the clock keeps the
     * fraction already reached, so switching from a minute a day to five
     * seconds makes the rest of the day shorter rather than jumping the
     * light (see Clock.setPace) */
    Clock.setPace(clock, now, st.tick_seconds);

    /* Each changed position becomes a walk over the plan's own ground. A
     * resident leaving a block starts at its door; a resident already on a
     * bench starts at the seat. Anyone whose cell did not change keeps the
     * route they had — which is what lets a walk finish. */
    if (fresh) {
      routeMaxPoints = 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        routes[i] = null;
        routeFrom[i] = null;
        walksWith[i] = -1;
        if (p.in) continue;                // indoors is not drawn walking
        /* from the door when leaving a block, else from where they stood;
         * to their own place on the tile. Somebody whose place did not
         * move stays put. */
        const door = p.pin ? doorSpot(p.punit) : null;
        /* a walk into or out of the school yard goes through its gate
         * (schoolRoute); every other walk is the crowd's (crowd.js) */
        const school = Walk && schoolGate &&
                       (p.mode === 'school' || p.pmode === 'school');
        const got = school ? schoolRoute(p, toX[i], toZ[i], spotWas, door)
                  : Crowd ? Crowd.route(Walk, grid, p, toX[i], toZ[i],
                                        spotWas, door, crowdFix)
                          : null;
        if (!got) continue;
        /* no path (or no router): the straight line the page used to draw,
         * counted so a broken grid is visible rather than silent */
        if (got.fallback) routeFallbacks++;
        const route = got.route;
        routes[i] = route;
        routeFrom[i] = got.from;
        routeT0[i] = now;
        routeDur[i] = Walk ? Walk.duration(route.total, clock.dayMs)
                           : Math.max(120, clock.dayMs * 0.9);
        if (route.total > 1e-4 && route.n > routeMaxPoints) {
          routeMaxPoints = route.n;
        }
        if (route.n > 1) {
          const dx = route.xs[1] - route.xs[0];
          const dz = route.zs[1] - route.zs[0];
          if (dx || dz) facing[i] = Math.atan2(dx, dz);
        }
      }
      /* A young child out with a guardian walks the guardian's own way,
       * from where they stood to their place beside them (Crowd.place puts
       * it clear of walls, fixtures, table tops and everyone else on the
       * tile), a step behind: the pair set off, go round every wall and
       * arrive as one, and the child is never drawn off on a way of their
       * own. */
      if (Crowd && spots) {
        for (let i = 0; i < people.length; i++) {
          const g = spots.with[i];
          if (g == null || g < 0 || !routes[i] || !routes[g]) continue;
          const r = Crowd.follow(routes[g], routeFrom[g], routes[i],
                                 routeFrom[i], Walk, grid, crowdFix);
          if (r === routes[i]) continue;
          routes[i] = r;
          walksWith[i] = g;
          if (r.n > routeMaxPoints) routeMaxPoints = r.n;
        }
      }
      /* walkers setting off from one point go in turn, not as one body:
       * six out of a door file out of it (crowd.js) */
      if (Crowd) {
        const qi = [], starts = [];
        for (let i = 0; i < people.length; i++) {
          const r = routes[i];
          if (!r || r.total <= 1e-6 || walksWith[i] >= 0) continue;
          qi.push(i);
          starts.push({ id: people[i].id, x: r.xs[0], z: r.zs[0] });
        }
        const delays = Crowd.queue(starts);
        for (let k = 0; k < qi.length; k++) {
          const f = Crowd.fit(delays[k], routeDur[qi[k]], clock.dayMs);
          routeT0[qi[k]] = now + f.delay;
          routeDur[qi[k]] = f.dur;
        }
        /* a child a step behind their guardian, at the guardian's pace,
         * still inside the day */
        for (let i = 0; i < people.length; i++) {
          const g = walksWith[i];
          if (g < 0) continue;
          const f = Crowd.fit(routeT0[g] - now + Crowd.QUEUE_MS,
                              routeDur[g], clock.dayMs);
          routeT0[i] = now + f.delay;
          routeDur[i] = f.dur;
          const r = routes[i];
          if (r.n > 1) {
            const dx = r.xs[1] - r.xs[0], dz = r.zs[1] - r.zs[0];
            if (dx || dz) facing[i] = Math.atan2(dx, dz);
          }
        }
      }
      /* Seed sit blends for the new day: already seated → full sit; walking
       * to a seat → stand; leaving a bench → start seated so they stand up
       * into the walk instead of popping upright. */
      for (let i = 0; i < people.length; i++) {
        const walking = routes[i] && routes[i].total > 1e-6;
        if (sitMode[i] === 1 && !walking) {
          sitBlend[i] = 1;
        } else if (walking && sitMode[i] === 1) {
          sitBlend[i] = 0;
        } else if (walking) {
          const was = spotWas[people[i].id];
          const fromBench = was && kit.benchByCell[was.cell];
          sitBlend[i] = fromBench ? 1 : 0;
        } else {
          sitBlend[i] = sitMode[i] === 1 ? 1 : 0;
        }
      }
      kit.routeMaxPoints = routeMaxPoints;
      kit.routeFallbacks = routeFallbacks;
      routesBuilt = true;
      if (traceMesh) rebuildTrace();
    }

    /* freeze at the hour the page is showing; re-anchor at the fraction
     * already reached when the day turns (Clock.onState). */
    Clock.onState(clock, now, st);
  }

  /* Somebody queued behind others at a door is still indoors. */
  function waiting(i, now) {
    return !staticMode && !!routes[i] && people[i].pin && now < routeT0[i];
  }

  /* Where each figure is drawn this frame, before spacing: on its route
   * if it has one, else at its place. */
  function rawResident(i, now, out) {
    const r = routes[i];
    out.hidden = waiting(i, now);
    out.x = toX[i]; out.z = toZ[i];
    out.dx = out.dz = 0;
    out.moving = false;
    if (Walk && r && r.total > 1e-6) {
      const t = staticMode ? r.total
                           : (now - routeT0[i]) / (routeDur[i] || 1) * r.total;
      Walk.sample(r, t, routeSample);
      out.x = routeSample.x;
      out.z = routeSample.z;
      out.dx = routeSample.dx;
      out.dz = routeSample.dz;
      out.moving = routeSample.moving;
    }
    return out;
  }

  /* Keep figures from walking into each other: every outdoor figure is
   * handed to Walk.separate, which pushes apart any two closer than their
   * bodies and passes oncoming walkers side by side. Seated figures do not
   * move; walkers give way more readily than those standing. No push takes
   * a body onto a wall, a solid or the water, or out of the cell its route
   * has it in other than onto open ground (Walk.clearAt), nor into the
   * lamp post, tree or table in its own cell (the fixture's keep,
   * Crowd.space) — the walk's own guarantee holds after spacing too. Stateless, so a frame depends on
   * nothing but its own time. */
  const crowdDx = [], crowdDz = [];
  const crowdRaw = { x: 0, z: 0, dx: 0, dz: 0, moving: false };
  function spaceResidents(now) {
    let n = 0;
    crowdF = Walk ? Walk.figures(crowdF, people.length) : null;
    for (let i = 0; i < people.length; i++) {
      crowdDx[i] = crowdDz[i] = 0;
      if (!crowdF || people[i].in) continue;
      rawResident(i, now, crowdRaw);
      if (crowdRaw.hidden) continue;
      const F = crowdF;
      F.rx[n] = crowdRaw.x; F.rz[n] = crowdRaw.z;
      F.r[n] = Crowd.R * roleScale[i];
      const seated = sitMode[i] === 1 && !crowdRaw.moving;
      F.w[n] = seated ? 0 : crowdRaw.moving ? 1 : 0.5;
      F.hx[n] = crowdRaw.moving ? crowdRaw.dx : 0;
      F.hz[n] = crowdRaw.moving ? crowdRaw.dz : 0;
      F.layer[n] = 0;
      F.id[n] = people[i].id;
      crowdIdx[n] = i;
      n++;
    }
    if (!crowdF || n === 0) return;
    /* pushed only to open ground, and never into the lamp post, tree or
     * table in a body's own cell (crowd.js space) */
    Crowd.space(Walk, grid, crowdFix, crowdF, n);
    for (let k = 0; k < n; k++) {
      const i = crowdIdx[k];
      crowdDx[i] = crowdF.x[k] - crowdF.rx[k];
      crowdDz[i] = crowdF.z[k] - crowdF.rz[k];
    }
  }

  function updateResidents(now) {
    const torsoMesh = kit.torsoMesh;
    const thighLMesh = kit.thighLMesh;
    const thighRMesh = kit.thighRMesh;
    const shinLMesh = kit.shinLMesh;
    const shinRMesh = kit.shinRMesh;
    const footLMesh = kit.footLMesh;
    const footRMesh = kit.footRMesh;
    const armLMesh = kit.armLMesh;
    const armRMesh = kit.armRMesh;
    const forearmLMesh = kit.forearmLMesh;
    const forearmRMesh = kit.forearmRMesh;
    const headMesh = kit.headMesh;
    const hairMesh = kit.hairMesh;
    const shadowMesh = kit.shadowMesh;
    if (!torsoMesh) return;
    spaceResidents(now);
    const dt = animLast ? Math.min(0.05, Math.max(0, (now - animLast) / 1000))
                        : 0.016;
    animLast = now;

    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in || waiting(i, now)) {
        hideFigure(i);
        continue;
      }
      const s = roleScale[i];
      const r = routes[i];
      let x = toX[i], z = toZ[i];
      let moving = false;
      let along = 0;
      let wantYaw = facing[i];
      if (Walk && r && r.total > 1e-6) {
        const t = staticMode ? r.total
                             : (now - routeT0[i]) / (routeDur[i] || 1) * r.total;
        along = Math.max(0, Math.min(r.total, t));
        Walk.sample(r, t, routeSample);
        x = routeSample.x;
        z = routeSample.z;
        moving = routeSample.moving;
        if (routeSample.dx || routeSample.dz) {
          wantYaw = Math.atan2(routeSample.dx, routeSample.dz);
        }
      }
      x += crowdDx[i] || 0;
      z += crowdDz[i] || 0;

      /* facing: walk direction while moving; once still, a table or the
       * bench they share turns them (path-facing), else they keep the
       * last walk heading. Yaw eases over ~200 ms so turns do not snap. */
      let atTable = false;
      if (!moving && Crowd) {
        const yaw = Crowd.faceTable(crowdFix, p.x, p.y, x, z);
        if (yaw !== null) { wantYaw = yaw; atTable = true; }
        else if (sitMode[i] >= 1 && (seatFx[i] || seatFz[i])) {
          wantYaw = Math.atan2(seatFx[i], seatFz[i]);
        }
      }
      facing[i] = staticMode ? wantYaw
        : slerpYaw(facing[i], wantYaw, Math.min(1, dt / 0.2));

      /* sit blend: ease into the seat on arrival (starting in the last
       * stretch of the walk so they settle rather than pop); ease up as
       * soon as they leave. Static screenshots snap to the target. */
      let arriving = false;
      if (sitMode[i] === 1 && r && r.total > 1e-6 && !staticMode) {
        arriving = (now - routeT0[i]) / (routeDur[i] || 1) > 0.86;
      }
      const wantSit = (sitMode[i] === 1 && (!moving || arriving)) ? 1 : 0;
      if (sitBlend[i] == null) sitBlend[i] = wantSit;
      if (staticMode) {
        sitBlend[i] = wantSit;
      } else if (sitBlend[i] < wantSit) {
        sitBlend[i] = Math.min(1, sitBlend[i] + dt * (1000 / SIT_IN_MS));
      } else if (sitBlend[i] > wantSit) {
        sitBlend[i] = Math.max(0, sitBlend[i] - dt * (1000 / SIT_OUT_MS));
      }
      const sitT = easeSmooth(sitBlend[i]);

      const footY = WALK_Y + (Crowd ? Crowd.lift(stepList, x, z) : 0);
      const rootY = footY + (SEAT_TOP - footY) * sitT;
      lerpPose(POSE_STAND, POSE_SIT, sitT, _pose);

      const d = _delta;
      d.bob = 0; d.leanX = 0; d.sway = 0;
      d.torsoRx = 0; d.torsoRy = 0;
      d.legL = 0; d.legR = 0; d.kneeL = 0; d.kneeR = 0;
      d.armL = 0; d.armR = 0; d.elbowL = 0; d.elbowR = 0;
      d.footL = 0; d.footR = 0;
      d.armOut = 0; d.armZ = 0;
      d.headYaw = 0; d.headPitch = 0;
      d.sit = sitT; d.shadowZ = 0; d.hipZ = 0;
      /* keep the disc on the ground (or step) under them, not mid-air when
       * the root rises onto the seat */
      d.shadowY = 0.008 - (rootY - footY);
      /* nudge hips a little toward the seat front so thighs clear the plank */
      if (sitT > 0.5) d.hipZ = 0.08 * sitT;

      const child = p.role === 'child';
      /* Distance-locked gait: stride phase from cells walked, not wall clock. */
      const phase = moving
        ? (along / STRIDE_CELLS) * Math.PI * 2 + i * 1.7
        : now * 0.0016 + i * 1.7;
      const breathe = Math.sin(now * 0.0022 + i * 0.9) * 0.012;

      if (moving && sitT < 0.5) {
        /* walk: hip swing + knee flexion on the forward (swing) leg; fades
         * as they settle onto a seat. Positive hip rx = thigh back. */
        const gait = 1 - sitT * 2;
        const stride = Math.sin(phase);
        const stride2 = Math.sin(phase * 2);
        d.legL = stride * 0.55 * gait;
        d.legR = -stride * 0.55 * gait;
        /* swing leg (forward = negative hip) bends more at the knee */
        d.kneeL = (0.12 + Math.max(0, -stride) * 0.95) * gait;
        d.kneeR = (0.12 + Math.max(0, stride) * 0.95) * gait;
        d.footL = Math.max(0, -stride) * 0.25 * gait;
        d.footR = Math.max(0, stride) * 0.25 * gait;
        d.armL = -stride * 0.72 * gait;
        d.armR = stride * 0.72 * gait;
        d.elbowL = (0.2 + Math.max(0, stride) * 0.35) * gait;
        d.elbowR = (0.2 + Math.max(0, -stride) * 0.35) * gait;
        d.bob = (0.012 + Math.max(0, stride2) * 0.014) * s * gait;
        d.leanX = 0.10 * gait;
        d.sway = stride * 0.04 * gait;
        d.torsoRy = stride * 0.06 * gait;
        d.headPitch = 0.04 * gait;
      } else if (sitT > 0.85) {
        /* seated idle: soft breathe, small look-around, one foot fidget */
        d.torsoRx = breathe;
        d.headYaw = Math.sin(now * 0.0007 + i * 2.1) * 0.18;
        d.headPitch = Math.sin(now * 0.0005 + i) * 0.05;
        d.legL = Math.sin(now * 0.0011 + i * 3.0) * 0.05;
        d.legR = Math.sin(now * 0.0009 + i * 2.4) * 0.04;
        d.kneeL = Math.sin(now * 0.0013 + i * 2.7) * 0.04;
        d.kneeR = Math.sin(now * 0.0010 + i * 1.9) * 0.04;
        d.armL = breathe * 0.4;
        d.armR = -breathe * 0.4;
        d.shadowZ = 0.06;
      } else if (atTable) {
        /* standing at a table: lean in, hands toward the top (+Z / negative rx) */
        d.leanX = 0.14 + breathe;
        d.torsoRx = 0.10;
        d.armL = -0.55;
        d.armR = -0.55;
        d.elbowL = 0.45;
        d.elbowR = 0.45;
        d.armOut = -0.06;
        d.armZ = 0.08;
        d.headPitch = 0.12;
        d.legL = 0.08;
        d.legR = -0.04;
        d.kneeL = 0.12;
        d.kneeR = 0.06;
      } else if (sitMode[i] === 2) {
        /* waiting by a full bench: weight on one hip, arms easy, watching */
        const shift = Math.sin(now * 0.0008 + i);
        d.legL = 0.12 + shift * 0.05;
        d.legR = -0.05 - shift * 0.04;
        d.kneeL = 0.18 + shift * 0.06;
        d.kneeR = 0.08;
        d.armL = 0.18;
        d.armR = 0.28;
        d.armOut = 0.06;
        d.sway = shift * 0.03;
        d.headYaw = Math.sin(now * 0.0006 + i * 1.3) * 0.22;
        d.torsoRx = breathe;
      } else {
        /* standing idle — children bounce more; adults shift weight */
        const shift = Math.sin(now * 0.0012 + i * 1.4);
        if (child) {
          d.bob = (0.01 + Math.abs(Math.sin(now * 0.004 + i)) * 0.025) * s;
          d.armL = -0.25 + shift * 0.2;
          d.armR = 0.25 - shift * 0.2;
          d.legL = shift * 0.12;
          d.legR = -shift * 0.12;
          d.kneeL = 0.15 + Math.abs(shift) * 0.2;
          d.kneeR = 0.15 + Math.abs(shift) * 0.2;
          d.headYaw = Math.sin(now * 0.0018 + i) * 0.3;
        } else {
          d.legL = 0.06 + shift * 0.05;
          d.legR = -0.03 - shift * 0.04;
          d.kneeL = 0.10 + Math.max(0, shift) * 0.12;
          d.kneeR = 0.08 + Math.max(0, -shift) * 0.12;
          d.armL = 0.08 + breathe;
          d.armR = 0.10 - breathe;
          d.sway = shift * 0.02;
          d.headYaw = Math.sin(now * 0.00055 + i * 1.7) * 0.2;
          d.torsoRx = breathe;
        }
        /* playground: a little more reach and bounce while on the frame */
        const fix = crowdFix && crowdFix[p.x + ',' + p.y];
        if (fix && fix.kind === 'playground') {
          d.bob = (d.bob || 0) + Math.abs(Math.sin(now * 0.005 + i)) * 0.03 * s;
          d.armL -= 0.35;
          d.armR -= 0.25;
          d.armOut += 0.08;
          d.kneeL += 0.25;
          d.kneeR += 0.15;
        }
      }

      drawFigure(i, x, z, rootY, facing[i], s, _pose, d);
    }
    [torsoMesh, thighLMesh, thighRMesh, shinLMesh, shinRMesh,
     footLMesh, footRMesh, armLMesh, armRMesh, forearmLMesh, forearmRMesh,
     headMesh, hairMesh, shadowMesh]
      .forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  return { syncResidents, updateResidents, spaceResidents };
}
