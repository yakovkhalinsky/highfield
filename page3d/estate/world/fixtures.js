/* Benches, trees, lamps and the other site furniture.
 * Highfield visual fork of world.js. */
import * as THREE from 'three';
import {
  TILE_TOP, PERSON_H, BENCH_SEAT, SEASONS, BUILDING_STYLE, hash01,
} from './scale.js';
import { applyTriplanar } from './materials.js';

export function createFixtures(kit) {
  const {
    scene, ground, _c1, clamp01, STEP_H, Crowd,
    cylGeo, taperGeo, icoGeo, sphereGeo, groundGrain,
    lampBulbMat, addBox, fallbackSiteColour,
  } = kit;

  /* ----------------------------------------------------------- fixtures */

  const fixtureGroup = new THREE.Group();
  scene.add(fixtureGroup);
  let fixtureKey = '';
  let fixturesBuilt = false;
  let fixtureEntries = [];
  let treeEntries = [];
  /* the frame's own fixtures by id, so a click on a bench can return the
   * fact the server sent rather than a second copy kept by the page */
  let fixtureById = {};
  /* The benches, by cell, with the way each one faces. A resident on a
   * bench's cell is seated on it (up to its capacity), and `focus=bench`
   * needs to know where the benches are without inventing a second copy of
   * the fixture list. Both are derived from the state the server sends. */
  let benchByCell = {};
  let benchCount = 0;
  kit.seatedCount = 0;

  function clearFixtures() {
    fixtureEntries.forEach(fx => {
      fx.mats.forEach(m => m.mat.dispose());
    });
    while (fixtureGroup.children.length) {
      fixtureGroup.remove(fixtureGroup.children[0]);
    }
    fixtureEntries = [];
    treeEntries = [];
  }

  function fixtureMaterial(hex, rough) {
    const mat = new THREE.MeshStandardMaterial({
      color: hex, roughness: rough === undefined ? 0.85 : rough });
    return { mat, base: hex };
  }

  function treeMesh(group, mats, season, id) {
    const trunk = fixtureMaterial(0x5a4630, 0.95);
    const canopyColour = SEASONS[season].canopy[
      Math.floor(hash01(id, 21) * SEASONS[season].canopy.length) %
      SEASONS[season].canopy.length];
    const canopy = fixtureMaterial(canopyColour, 0.9);
    mats.push(trunk, canopy);
    applyTriplanar(canopy.mat, groundGrain, 2.4);
    const t = new THREE.Mesh(taperGeo, trunk.mat);
    /* Courtyard trees ~3× a person, still under a two-storey eave. */
    const trunkH = 1.55 + hash01(id, 41) * 0.45;
    t.scale.set(0.14 + hash01(id, 42) * 0.05, trunkH, 0.14);
    t.position.set(0, trunkH * 0.5, 0);
    t.castShadow = true;
    group.add(t);
    /* several overlapping blobs read as a crown from the usual camera,
     * without a leaf texture atlas */
    const lift = trunkH - 1.55;
    const blobs = [
      [-0.28, 1.85, 0.03, 0.52], [0.30, 1.72, -0.08, 0.48],
      [0.0, 2.25, 0.09, 0.58], [-0.18, 2.08, -0.22, 0.40],
      [0.20, 2.15, 0.20, 0.38], [0.05, 2.55, -0.05, 0.36],
      [-0.10, 2.38, 0.18, 0.34], [0.15, 1.95, 0.24, 0.32],
    ];
    const yaw = hash01(id, 43) * Math.PI * 2;
    blobs.forEach((bl, k) => {
      const m = new THREE.Mesh(icoGeo, canopy.mat);
      const jitter = 0.92 + hash01(id, 50 + k) * 0.2;
      m.scale.setScalar(bl[3] * jitter);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      m.position.set(bl[0] * c - bl[2] * s, bl[1] + lift,
                     bl[0] * s + bl[2] * c);
      m.rotation.set(hash01(id, 60 + k) * 0.6,
                     hash01(id, 70 + k) * Math.PI,
                     hash01(id, 80 + k) * 0.6);
      m.castShadow = true;
      group.add(m);
    });
    treeEntries.push({ id, canopy, trunk });
  }

  /* Which way a bench faces. A bench beside a path turns its back to the
   * walkway's far side and looks at the path, its seat running along it, so
   * whoever sits watches the estate go past. The path is a fact already in
   * the ground (`codes` and `rows`), never a second map in the page. A bench
   * with no path beside it — the courtyard's own — keeps the default pose,
   * which is the one both views have always drawn. */
  function buildFixture(f, season) {
    const g = new THREE.Group();
    g.position.set(f.x + 0.5, TILE_TOP, f.y + 0.5);
    g.userData.pick = { kind: 'fixture', id: f.id };
    const mats = [];

    let bench = null;
    if (f.kind === 'tree') {
      treeMesh(g, mats, season, f.id);
    } else if (f.kind === 'bench') {
      bench = Crowd ? Crowd.bench(ground, f)
                    : { key: f.x + ',' + f.y, id: Number(f.id), cx: f.x,
                        cy: f.y, x: f.x + 0.5, z: f.y + 0.5, fx: 0, fz: 1,
                        yaw: 0, perimeter: !!f.perimeter,
                        cap: Math.max(0, Number(f.cap) || 0) };
      const face = bench;
      g.rotation.y = face.yaw;
      const wood = fixtureMaterial(0x8a6a3f, 0.9);
      const metal = fixtureMaterial(0x454c54, 0.7);
      mats.push(wood, metal);
      /* local +z = facing (path); backrest on -z. Seat ~32% of a standing
       * adult; plank deep enough for the thigh, board up to mid-back. */
      const seatY = BENCH_SEAT - 0.03;
      const backH = PERSON_H * 0.38;
      addBox(g, wood.mat, 0.9, 0.06, 0.36, 0, seatY, 0.08);
      addBox(g, wood.mat, 0.9, backH, 0.05, 0, BENCH_SEAT + backH / 2, -0.13);
      addBox(g, metal.mat, 0.06, BENCH_SEAT - 0.02, 0.30, -0.34,
             (BENCH_SEAT - 0.02) / 2, 0.04);
      addBox(g, metal.mat, 0.06, BENCH_SEAT - 0.02, 0.30, 0.34,
             (BENCH_SEAT - 0.02) / 2, 0.04);
    } else if (f.kind === 'table') {
      const wood = fixtureMaterial(0x9c7f52, 0.9);
      const metal = fixtureMaterial(0x454c54, 0.7);
      mats.push(wood, metal);
      /* Table top ~waist height (~47% of PERSON_H) so a lean reaches it. */
      const tableH = PERSON_H * 0.47;
      addBox(g, wood.mat, 0.82, 0.06, 0.82, 0, tableH - 0.03, 0);
      [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]
        .forEach(p => addBox(g, metal.mat, 0.06, tableH - 0.03, 0.06,
                             p[0], (tableH - 0.03) / 2, p[1]));
    } else if (f.kind === 'lamp') {
      const metal = fixtureMaterial(0x4a5158, 0.65);
      mats.push(metal);
      /* Street lamp ~2.4× a person — tall enough to clear a crowd. */
      const lampH = PERSON_H * 2.4;
      const pole = new THREE.Mesh(cylGeo, metal.mat);
      pole.scale.set(0.04, lampH, 0.04);
      pole.position.set(0, lampH * 0.5, 0);
      pole.castShadow = true;
      g.add(pole);
      const arm = addBox(g, metal.mat, 0.32, 0.045, 0.045, 0.13, lampH - 0.02, 0);
      arm.castShadow = false;
      /* Own material so a dead lamp's bulb can dim with condition. */
      const bulbMat = lampBulbMat.clone();
      const bulb = new THREE.Mesh(sphereGeo, bulbMat);
      bulb.scale.setScalar(0.12);
      bulb.position.set(0.28, lampH - 0.08, 0);
      g.add(bulb);
      mats.push({ mat: bulbMat, base: 0xfff0c8, lampBulb: true });
    } else if (f.kind === 'playground') {
      const red = fixtureMaterial(0xd8574f, 0.8);
      const yellow = fixtureMaterial(0xe6b84f, 0.8);
      const metal = fixtureMaterial(0x4a5158, 0.7);
      mats.push(red, yellow, metal);
      /* Frame clears an adult; slide at chest height; swing seats child-wide. */
      const frameH = PERSON_H * 1.45;
      addBox(g, red.mat, 0.07, frameH, 0.07, -0.4, frameH / 2, -0.3);
      addBox(g, red.mat, 0.07, frameH, 0.07, -0.4, frameH / 2, 0.3);
      addBox(g, red.mat, 0.07, 0.07, 0.68, -0.4, frameH - 0.04, 0);
      addBox(g, yellow.mat, 0.55, 0.07, 0.34, -0.05, PERSON_H * 0.78, 0.28);
      addBox(g, yellow.mat, 0.07, PERSON_H * 0.78, 0.07, 0.22,
             PERSON_H * 0.39, 0.28);
      addBox(g, metal.mat, 0.55, 0.05, 0.05, 0.28, frameH - 0.08, -0.28);
      addBox(g, metal.mat, 0.05, frameH - 0.08, 0.05, 0.03,
             (frameH - 0.08) / 2, -0.28);
      addBox(g, metal.mat, 0.05, frameH - 0.08, 0.05, 0.53,
             (frameH - 0.08) / 2, -0.28);
      addBox(g, red.mat, 0.22, 0.04, 0.14, 0.16, PERSON_H * 0.48, -0.28);
      addBox(g, red.mat, 0.22, 0.04, 0.14, 0.40, PERSON_H * 0.48, -0.28);
    } else if (f.kind === 'school') {
      /* the school gate: two brick pillars with caps in the gap of the
       * yard's fence (the fence line is the cell's south edge) and an
       * open green leaf folded back against the fence */
      const brick = fixtureMaterial(BUILDING_STYLE.school.wall, 0.9);
      const cap = fixtureMaterial(BUILDING_STYLE.school.trim, 0.9);
      const leaf = fixtureMaterial(0x3d5a4a, 0.75);
      mats.push(brick, cap, leaf);
      const gateH = PERSON_H * 1.25;
      [-0.46, 0.46].forEach(px => {
        addBox(g, brick.mat, 0.2, gateH, 0.2, px, gateH / 2, 0.5);
        addBox(g, cap.mat, 0.26, 0.07, 0.26, px, gateH + 0.04, 0.5);
      });
      addBox(g, leaf.mat, 0.04, PERSON_H * 0.85, 0.6, 0.38,
             PERSON_H * 0.45, 0.82);
    } else if (f.kind === 'bus_stop') {
      /* a bus shelter: two posts, a roof, a glass back, a perch seat, and
       * the stop's own pole with its round sign. Every piece stands inside
       * the 0.86 square about the cell's middle — crowd.js's BODY and KEEP
       * for the stop, the shelter's solid cell in walk.js — so nobody
       * walks through the pole (it stood in the next cell, with no
       * keep-out) or the posts. crowd_check's oracle reads these numbers
       * from here. */
      const metal = fixtureMaterial(0x4a5158, 0.65);
      const glass = fixtureMaterial(0x9fb7c4, 0.3);
      const sign = fixtureMaterial(0xc8453c, 0.6);
      const roofM = fixtureMaterial(0x30363d, 0.8);
      mats.push(metal, glass, sign, roofM);
      glass.mat.transparent = true;
      glass.mat.opacity = 0.55;
      /* Shelter roof clears a standing adult; perch matches the bench seat. */
      const shelterH = PERSON_H * 1.45;
      addBox(g, metal.mat, 0.06, shelterH, 0.06, -0.4, shelterH / 2, -0.3);
      addBox(g, metal.mat, 0.06, shelterH, 0.06, 0.4, shelterH / 2, -0.3);
      addBox(g, roofM.mat, 0.86, 0.06, 0.55, 0, shelterH + 0.02, -0.12);
      addBox(g, glass.mat, 0.8, PERSON_H * 1.05, 0.03, 0,
             PERSON_H * 0.55, -0.32).castShadow = false;
      addBox(g, metal.mat, 0.7, 0.05, 0.16, 0, BENCH_SEAT, -0.22);
      const pole = new THREE.Mesh(cylGeo, metal.mat);
      const poleH = PERSON_H * 1.75;
      pole.scale.set(0.032, poleH, 0.032);
      pole.position.set(0.25, poleH * 0.5, 0.25);
      pole.castShadow = true;
      g.add(pole);
      const disc = new THREE.Mesh(cylGeo, sign.mat);
      disc.scale.set(0.15, 0.03, 0.15);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0.25, poleH - 0.05, 0.25);
      g.add(disc);
    } else if (f.kind === 'shop') {
      const wood = fixtureMaterial(0xcf9f60, 0.8);
      mats.push(wood);
      /* the shop's front: a low wooden plinth before its door, one step
       * high, that its customers step up onto (it was a waist-high
       * counter they walked through) */
      addBox(g, wood.mat, 0.9, STEP_H, 0.9, 0, STEP_H / 2, 0);
    } else {
      /* a kind the page has never seen: a small plinth in its own colour,
       * so the estate still shows that something is there */
      const hex = fallbackSiteColour(f.kind);
      const mat = fixtureMaterial(hex, 0.85);
      mats.push(mat);
      addBox(g, mat.mat, 0.5, 0.3, 0.5, 0, 0.15, 0);
    }

    fixtureGroup.add(g);
    return { id: f.id, kind: f.kind, group: g, mats, bench };
  }

  function buildFixtures(st) {
    clearFixtures();
    const season = Math.max(0, Math.min(3, st.season || 0));
    benchByCell = {};
    benchCount = 0;
    (st.fixtures || []).forEach(f => {
      const entry = buildFixture(f, season);
      fixtureEntries.push(entry);
      if (entry.bench) {
        benchByCell[entry.bench.key] = entry.bench;
        benchCount++;
      }
    });
    fixtureKey = (st.fixtures || []).map(f => f.id + ':' + f.kind).join(',');
    fixturesBuilt = true;
    kit.fixturesBuilt = true;
    kit.benchByCell = benchByCell;
    kit.benchCount = benchCount;
    syncFixtureSeason(st.season || 0);
  }

  function syncFixtureSeason(season) {
    season = Math.max(0, Math.min(3, season || 0));
    treeEntries.forEach(t => {
      const pal = SEASONS[season].canopy;
      const hex = pal[Math.floor(hash01(t.id, 21) * pal.length) % pal.length];
      t.canopy.base = hex;
      t.trunk.base = 0x5a4630;
    });
  }

  function syncFixtures(st) {
    const key = (st.fixtures || []).map(f => f.id + ':' + f.kind).join(',');
    if (!fixturesBuilt || key !== fixtureKey) buildFixtures(st);
    syncFixtureSeason(st.season || 0);
    fixtureById = {};
    kit.fixtureById = fixtureById;
    (st.fixtures || []).forEach(f => { fixtureById[f.id] = f; });
    fixtureEntries.forEach(fx => {
      const f = fixtureById[fx.id];
      const c = f ? clamp01(f.c == null ? 1 : f.c) : 1;
      fx.condition = c;
      const k = 0.55 + 0.45 * c;
      fx.mats.forEach(m => {
        if (m.lampBulb) return;
        _c1.setHex(m.base).multiplyScalar(k);
        m.mat.color.copy(_c1);
      });
      const tilt = (1 - c);
      fx.group.rotation.z = (hash01(fx.id, 31) - 0.5) * 0.24 * tilt;
      fx.group.rotation.x = (hash01(fx.id, 32) - 0.5) * 0.2 * tilt;
    });
  }

  /* Street-lamp bulbs track fixture condition × night darkness. */
  function tuneLampBulbs(dark) {
    const d = clamp01(dark);
    fixtureEntries.forEach(fx => {
      if (fx.kind !== 'lamp') return;
      const c = fx.condition == null ? 1 : fx.condition;
      fx.mats.forEach(m => {
        if (!m.lampBulb) return;
        m.mat.emissiveIntensity = c > 0.02 ? (0.05 + d * 2.6) * c : 0.02;
      });
    });
  }

  kit.fixtureGroup = fixtureGroup;
  kit.benchByCell = benchByCell;
  kit.benchCount = benchCount;
  kit.fixturesBuilt = fixturesBuilt;
  kit.fixtureById = fixtureById;
  kit.tuneLampBulbs = tuneLampBulbs;
  return { buildFixtures, syncFixtures };
}
