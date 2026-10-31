/* Picking and the screenshot cameras. Highfield visual fork of world.js. */
import * as THREE from 'three';
import { TILE_TOP } from './scale.js';

export function createFocus(kit) {
  const {
    controls, camera, ground, W, H, raycaster, ndc, clock,
    buildingBodies, buildingById, fixtureGroup, tiles,
    personAt, sitMode, routes, routeT0, routeDur,
  } = kit;

  /* -------------------------------------------------------------- pick */

  /* `withGround` is the click's privilege: a hover asks only what is on
   * top of the ground, while a click may also name the cell that was hit.
   * Raycasting every tile on every pointer move would be wasted work. */
  function pick(clientX, clientY, rect, withGround) {
    const torsoMesh = kit.torsoMesh, headMesh = kit.headMesh;
    const thighLMesh = kit.thighLMesh, thighRMesh = kit.thighRMesh;
    const shinLMesh = kit.shinLMesh, shinRMesh = kit.shinRMesh;
    const armLMesh = kit.armLMesh, armRMesh = kit.armRMesh;
    const fixtureById = kit.fixtureById;
    if (!clock.haveState) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    /* Whatever is nearest is what was clicked. A fixture standing in front
     * of a block must win over the block behind it, so the three pickable
     * layers are compared by distance rather than checked in an order. */
    let best = null;
    if (torsoMesh) {
      /* any part of a figure is a person: without the head (and limbs) a
       * click on the most visible piece fell through to whatever stood
       * behind */
      const hits = raycaster.intersectObjects(
        [torsoMesh, headMesh, thighLMesh, thighRMesh, shinLMesh, shinRMesh,
         armLMesh, armRMesh], false);
      if (hits.length) {
        const p = personAt[hits[0].instanceId];
        if (p) best = { d: hits[0].distance,
                        hit: { kind: 'resident', person: p } };
      }
    }
    const bh = raycaster.intersectObjects(buildingBodies, false);
    if (bh.length && (!best || bh[0].distance < best.d)) {
      const id = bh[0].object.userData.pick.id;
      best = { d: bh[0].distance,
               hit: { kind: 'building', id, building: buildingById[id] } };
    }
    /* a fixture's own group carries the id; the ray lands on a mesh inside
     * it, so walk back up to the group that owns the pick */
    const fh = raycaster.intersectObjects(fixtureGroup.children, true);
    if (fh.length) {
      let o = fh[0].object;
      while (o && !o.userData.pick) o = o.parent;
      const mark = o && o.userData.pick;
      if (mark && (!best || fh[0].distance < best.d)) {
        best = { d: fh[0].distance,
                 hit: { kind: 'fixture', id: mark.id,
                        fixture: fixtureById[mark.id] ||
                                 { id: mark.id, kind: 'a place' } } };
      }
    }
    if (best) return best.hit;
    /* the ground itself: an instanced tile knows its own cell, so a click
     * on a lawn or the water can say which one it was */
    if (withGround) {
      const th = raycaster.intersectObject(tiles, false);
      if (th.length && th[0].instanceId !== undefined) {
        const i = th[0].instanceId;
        const x = i % W, y = (i - x) / W;
        return { kind: 'cell', x, y,
                 cell: { x, y, site: ground.codes[ground.rows[y][x]] } };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- focus */

  /* A close camera on one spot, for a screenshot that can be read. The
   * offset is longer than `controls.minDistance`, so the controls do not
   * pull the camera back out again the moment it is placed. */
  function focusAt(x, y, z) {
    controls.target.set(x, y, z);
    camera.position.set(x + 5.2, y + 5.4, z + 5.4);
    controls.update();
  }

  /* Is the ground clear for six cells in this direction? A camera put too
   * close behind a bench stands inside the block the bench is against. */
  function clearAhead(b, fx, fz) {
    for (let d = 1; d <= 6; d++) {
      const x = b.cx + fx * d, y = b.cy + fz * d;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      if (ground.codes[ground.rows[y][x]] === 'building') return false;
    }
    return true;
  }

  /* A bench is framed from the side it faces. That side is the path, which
   * is open ground by definition; the courtyard's own benches have no path,
   * so they take the first open side instead. */
  function focusBenchAt(b) {
    let { fx, fz } = b;
    if (!clearAhead(b, fx, fz)) {
      [fx, fz] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        .filter(d => d[0] !== b.fx || d[1] !== b.fz)
        .find(d => clearAhead(b, d[0], d[1])) || [fx, fz];
    }
    const y = TILE_TOP + 0.9;
    controls.target.set(b.x, y, b.z);
    /* Framed from the path the bench faces; distance stays above
     * minDistance so the controls do not shove the camera back out. */
    camera.position.set(b.x + fx * 5.2, y + 3.6, b.z + fz * 5.2);
    controls.update();
  }

  /* The busiest occupied bench, so `?focus=bench` lands on people rather
   * than on an empty seat; any bench if the estate is indoors. */
  function focusBench() {
    const benchByCell = kit.benchByCell;
    const people = kit.people;
    const keys = Object.keys(benchByCell).sort();
    if (!keys.length) return false;
    const counts = {};
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in) continue;
      const k = p.x + ',' + p.y;
      if (benchByCell[k]) counts[k] = (counts[k] || 0) + 1;
    }
    let best = keys[0], bestN = -1;
    keys.forEach(k => {
      const n = counts[k] || 0;
      if (n > bestN) { bestN = n; best = k; }
    });
    focusBenchAt(benchByCell[best]);
    return true;
  }

  function focusCell(x, y) {
    focusAt(x + 0.5, TILE_TOP + 0.6, y + 0.5);
    return true;
  }

  /* A stretch of the outer path, framed from the road side. The busiest
   * perimeter bench is the target (any perimeter bench if nobody is out),
   * and the camera stands further back on the bench's outward side, off to
   * one side along the path, so the shot holds the path and its
   * neighbouring seats rather than a block's roof. The bench faces the
   * estate, so this view is over its shoulder; the road side is the one
   * side with no building between the camera and the seat. */
  function focusPerimeter() {
    const benchByCell = kit.benchByCell;
    const people = kit.people;
    const keys = Object.keys(benchByCell)
      .filter(k => benchByCell[k].perimeter).sort();
    if (!keys.length) return false;
    const counts = {};
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in) continue;
      const k = p.x + ',' + p.y;
      if (benchByCell[k] && benchByCell[k].perimeter) {
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    let best = keys[0], bestN = -1;
    keys.forEach(k => {
      const n = counts[k] || 0;
      if (n > bestN) { bestN = n; best = k; }
    });
    const b = benchByCell[best];
    const { fx, fz } = b;
    const sx = fz, sz = -fx;          // along the path, across the view
    const ox = -fx, oz = -fz;         // away from the estate, to the road
    const y = TILE_TOP + 0.9;
    controls.target.set(b.x + sx * 2.0, y, b.z + sz * 2.0);
    camera.position.set(b.x + ox * 6.0 + sx * 3.0,
                        y + 6.2,
                        b.z + oz * 6.0 + sz * 3.0);
    controls.update();
    return true;
  }

  /* What the route machinery is doing, for the page's debug hook: how many
   * walks are in flight, the longest one's waypoints, and how many positions
   * ever had to fall back to a straight line. */
  function routeStats() {
    const people = kit.people;
    const routeMaxPoints = kit.routeMaxPoints;
    const routeFallbacks = kit.routeFallbacks;
    const now = performance.now();
    let active = 0;
    for (let i = 0; i < people.length; i++) {
      const r = routes[i];
      if (r && r.total > 1e-6 && now - routeT0[i] < routeDur[i]) active++;
    }
    return { active, maxWaypoints: routeMaxPoints,
             fallbacks: routeFallbacks };
  }

  /* Where seated parts sit relative to their bench (facing-local z), for
   * a headless check that a sit clears the backrest and puts the thighs
   * toward the path. */
  function sitProbe() {
    const torsoMesh = kit.torsoMesh;
    const people = kit.people;
    const thighLMesh = kit.thighLMesh, shinLMesh = kit.shinLMesh, headMesh = kit.headMesh;
    const benchByCell = kit.benchByCell;
    if (!torsoMesh) return [];
    const out = [];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < people.length; i++) {
      if (sitMode[i] !== 1) continue;
      const row = { id: people[i].id, parts: {} };
      [['torso', torsoMesh], ['thighL', thighLMesh], ['shinL', shinLMesh],
       ['head', headMesh]].forEach(([name, mesh]) => {
        mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        row.parts[name] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
      });
      const key = people[i].x + ',' + people[i].y;
      const b = benchByCell[key];
      if (b) {
        row.bench = { x: b.x, z: b.z, fx: b.fx, fz: b.fz, yaw: b.yaw };
        /* local z along facing: positive = toward path */
        const dx = row.parts.torso.x - b.x, dz = row.parts.torso.z - b.z;
        row.torsoLocalZ = +(dx * b.fx + dz * b.fz).toFixed(3);
        const tdx = row.parts.thighL.x - b.x, tdz = row.parts.thighL.z - b.z;
        row.thighLocalZ = +(tdx * b.fx + tdz * b.fz).toFixed(3);
        const sdx = row.parts.shinL.x - b.x, sdz = row.parts.shinL.z - b.z;
        row.shinLocalZ = +(sdx * b.fx + sdz * b.fz).toFixed(3);
        row.shinY = row.parts.shinL.y;
      }
      out.push(row);
    }
    return out;
  }

  /* Three-quarter framing for checking the knee bend on a sit. */
  function focusBenchSide() {
    const benchByCell = kit.benchByCell;
    const people = kit.people;
    const keys = Object.keys(benchByCell).sort();
    let best = keys[0], bestN = -1;
    const counts = {};
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in) continue;
      const k = p.x + ',' + p.y;
      if (benchByCell[k]) counts[k] = (counts[k] || 0) + 1;
    }
    keys.forEach(k => {
      const n = counts[k] || 0;
      if (n > bestN) { bestN = n; best = k; }
    });
    const b = benchByCell[best];
    if (!b) return false;
    const y = TILE_TOP + 0.55;
    const ax = Math.cos(b.yaw), az = -Math.sin(b.yaw);
    /* from the path, a little along the seat — stays clear of walls */
    controls.target.set(b.x, y, b.z);
    camera.position.set(
      b.x + b.fx * 2.8 + ax * 2.0,
      y + 1.4,
      b.z + b.fz * 2.8 + az * 2.0);
    controls.update();
    return true;
  }

  return {
    pick, focusBench, focusPerimeter, focusCell, focusBenchSide,
    routeStats, sitProbe,
  };
}
