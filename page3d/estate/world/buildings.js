/* Blocks, doors, school yard and window panes for the Highfield visual fork. */
import * as THREE from 'three';
import {
  FLOOR_H, TILE_TOP, PERSON_H, DOOR_H, SHOP_DOOR_H, BUILDING_STYLE,
  hash01, stringHash, doorFace,
} from './scale.js';
import { applyTriplanar } from './materials.js';

export function createBuildings(kit) {
  const {
    scene, ground, dummy, unitBox, cylGeo, sphereGeo,
    wallGrain, asphaltGrain, _c1, clamp01, Crowd, STEP_H,
  } = kit;

  /* --------------------------------------------------------- buildings */

  const buildingById = {};
  const unitsByBuilding = {};
  (ground.buildings || []).forEach(b => { buildingById[b.id] = b; });
  for (const uid of Object.keys(ground.units || {})) {
    const u = ground.units[uid];
    (unitsByBuilding[u.b] = unitsByBuilding[u.b] || []).push(
      { uid: Number(uid), b: u.b, f: u.f, i: u.i, n: u.n });
  }

  const wallMats = {
    block: new THREE.MeshStandardMaterial({ color: BUILDING_STYLE.block.wall,
                                            roughness: 0.88 }),
    shop: new THREE.MeshStandardMaterial({ color: BUILDING_STYLE.shop.wall,
                                           roughness: 0.8 }),
  };
  applyTriplanar(wallMats.block, wallGrain, 1.15);
  applyTriplanar(wallMats.shop, wallGrain, 1.05);
  const roofMats = {
    block: new THREE.MeshStandardMaterial({ color: BUILDING_STYLE.block.roof,
                                            roughness: 0.9 }),
    shop: new THREE.MeshStandardMaterial({ color: BUILDING_STYLE.shop.roof,
                                           roughness: 0.8 }),
  };
  applyTriplanar(roofMats.block, asphaltGrain, 0.55);
  applyTriplanar(roofMats.shop, asphaltGrain, 0.55);
  /* A kind the pack has not shown us before still gets a stable face and
   * roof of its own, derived from its name. Two unknown kinds must not
   * silently become the same block. */
  const unknownStyle = {};
  function styleFor(kind) {
    if (BUILDING_STYLE[kind]) return BUILDING_STYLE[kind];
    if (!unknownStyle[kind]) {
      const h = (stringHash(kind) % 360) / 360;
      _c1.setHSL(h, 0.2, 0.55);
      const wall = _c1.getHex();
      _c1.setHSL((h + 0.47) % 1, 0.26, 0.31);
      unknownStyle[kind] = { wall, roof: _c1.getHex(), trim: wall };
    }
    return unknownStyle[kind];
  }
  function wallFor(kind) {
    if (!wallMats[kind]) {
      wallMats[kind] = new THREE.MeshStandardMaterial({
        color: styleFor(kind).wall, roughness: 0.86 });
      applyTriplanar(wallMats[kind], wallGrain, 1.1);
    }
    return wallMats[kind];
  }
  function roofFor(kind) {
    if (!roofMats[kind]) {
      roofMats[kind] = new THREE.MeshStandardMaterial({
        color: styleFor(kind).roof, roughness: 0.9 });
      applyTriplanar(roofMats[kind], asphaltGrain, 0.55);
    }
    return roofMats[kind];
  }
  const trimMat = new THREE.MeshStandardMaterial({
    color: BUILDING_STYLE.block.trim, roughness: 0.9 });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x4b3523, roughness: 0.85 });
  const stepMat = new THREE.MeshStandardMaterial({
    color: 0x8d8a82, roughness: 0.95 });
  const detailMat = new THREE.MeshStandardMaterial({
    color: 0x7b7d80, roughness: 0.9 });
  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0x4a4234, emissive: 0xffca7a, emissiveIntensity: 0.05,
    roughness: 0.5 });
  const schoolTrimMat = new THREE.MeshStandardMaterial({
    color: BUILDING_STYLE.school.trim, roughness: 0.9 });
  const schoolSignMat = new THREE.MeshStandardMaterial({
    color: 0x24486b, roughness: 0.7 });
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x3d5a4a, roughness: 0.75 });
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xe9e4d8, roughness: 0.95 });
  const shopSignMat = new THREE.MeshStandardMaterial({
    color: 0x5a3a24, emissive: 0xffb45c, emissiveIntensity: 0.1,
    roughness: 0.7 });

  const buildingBodies = [];
  const windowSlots = [];

  function addBox(group, mat, sx, sy, sz, px, py, pz) {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function addWindow(px, py, pz, ry, unit, shop, sx, sy) {
    windowSlots.push({ px, py, pz, ry, unit, shop: !!shop,
                       sx: sx || 1, sy: sy || 1 });
  }

  /* The school: a two-storey brick building with a row of tall classroom
   * windows on every floor, its name board over the door, and its yard
   * fenced on the three sides the building does not close, with a gap at
   * the gate (the gate's pillars are the `school` fixture). Pupils inside
   * the fence are at school; the fence is what makes that visible. */
  function buildSchool(g, b, face, along) {
    /* the name board, white-edged navy, above the door canopy */
    if (face.axis === 'z') {
      addBox(g, schoolSignMat, 2.0, 0.32, 0.08, along,
             TILE_TOP + 1.3, face.at + face.sign * 0.06);
      addBox(g, schoolTrimMat, 2.12, 0.42, 0.04, along,
             TILE_TOP + 1.3, face.at + face.sign * 0.025);
    } else {
      addBox(g, schoolSignMat, 0.08, 0.32, 2.0,
             face.at + face.sign * 0.06, TILE_TOP + 1.3, along);
      addBox(g, schoolTrimMat, 0.04, 0.42, 2.12,
             face.at + face.sign * 0.025, TILE_TOP + 1.3, along);
    }
    /* classroom windows: tall, many, evenly along both long faces; the
     * ground floor leaves the door and its board clear */
    const longX = b.w >= b.h;
    const len = longX ? b.w : b.h;
    const start = longX ? b.x : b.y;
    const n = Math.max(2, Math.floor((len - 0.6) / 1.05));
    for (let f = 1; f <= b.floors; f++) {
      const y = TILE_TOP + (f - 1) * FLOOR_H + FLOOR_H * 0.52;
      for (let i = 0; i < n; i++) {
        const pos = start + 0.3 + (i + 0.5) * (len - 0.6) / n;
        [-1, 1].forEach(side => {
          const onDoor = f === 1 && face.sign === side &&
            ((longX && face.axis === 'z') || (!longX && face.axis !== 'z')) &&
            Math.abs(pos - along) < 1.1;
          if (onDoor) return;
          if (longX) {
            addWindow(pos, y, side < 0 ? b.y - 0.02 : b.y + b.h + 0.02,
                      side < 0 ? Math.PI : 0, null, false, 0.7, 1.3);
          } else {
            addWindow(side < 0 ? b.x - 0.02 : b.x + b.w + 0.02, y, pos,
                      side < 0 ? -Math.PI / 2 : Math.PI / 2, null, false,
                      0.7, 1.3);
          }
        });
      }
    }
    /* the yard's fence: posts every cell, two rails, and the gap at the
     * gate */
    if (!b.yard) return;
    const [yx, yy, yw, yh] = b.yard.map(Number);
    const gx = b.gate ? Number(b.gate[0]) : -99;
    const postH = PERSON_H * 1.15;
    function rail(x0, z0, x1, z1) {
      const lx = Math.abs(x1 - x0), lz = Math.abs(z1 - z0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      [0.38, 0.86].forEach(h => {
        addBox(g, fenceMat, Math.max(0.05, lx), 0.05, Math.max(0.05, lz),
               mx, TILE_TOP + h, mz).castShadow = false;
      });
      /* thin palings between the rails, a few per cell */
      const len = Math.max(lx, lz);
      for (let t = 0.25; t < len; t += 0.25) {
        const px = lx ? Math.min(x0, x1) + t : x0;
        const pz = lz ? Math.min(z0, z1) + t : z0;
        addBox(g, fenceMat, 0.03, PERSON_H * 0.9, 0.03, px,
               TILE_TOP + PERSON_H * 0.5, pz).castShadow = false;
      }
    }
    function post(x, z) {
      addBox(g, fenceMat, 0.08, postH, 0.08, x, TILE_TOP + postH / 2, z);
    }
    /* north side, either side of the gate's gap */
    const north = yy;
    if (gx > yx) rail(yx, north, gx, north);
    const after = gx >= yx && gx < yx + yw ? gx + 1 : yx;
    if (after < yx + yw) rail(after, north, yx + yw, north);
    rail(yx + yw, yy, yx + yw, yy + yh);              // east
    rail(yx, yy + yh, yx + yw, yy + yh);              // south
    for (let x = yx; x <= yx + yw; x++) {
      if (x !== gx && x !== gx + 1) post(x, north);
      post(x, yy + yh);
    }
    for (let z = yy + 1; z < yy + yh; z++) post(yx + yw, z);
    /* the yard's markings: a painted court, so it reads as a playground
     * from above rather than a car park */
    const cx0 = yx + 0.7, cx1 = yx + yw - 0.7;
    const cz0 = yy + 0.7, cz1 = yy + yh - 0.7;
    const ly = TILE_TOP + 0.012;
    [[cx0, cz0, cx1, cz0], [cx0, cz1, cx1, cz1],
     [cx0, cz0, cx0, cz1], [cx1, cz0, cx1, cz1],
     [(cx0 + cx1) / 2, cz0, (cx0 + cx1) / 2, cz1]].forEach(l => {
      const m = addBox(g, lineMat, Math.max(0.05, Math.abs(l[2] - l[0])),
                       0.012, Math.max(0.05, Math.abs(l[3] - l[1])),
                       (l[0] + l[2]) / 2, ly, (l[1] + l[3]) / 2);
      m.castShadow = false;
    });
  }

  (ground.buildings || []).forEach(b => {
    const wallMat = wallFor(b.kind);
    const roofMat = roofFor(b.kind);
    const g = new THREE.Group();
    scene.add(g);

    /* Shop is one storey in the plan; keep it on FLOOR_H like a single
     * block floor so the door sits with the flat entrances. */
    const wallH = Math.max(1, b.floors) * FLOOR_H;
    const cx = b.x + b.w / 2, cz = b.y + b.h / 2;

    const body = addBox(g, wallMat, b.w, wallH, b.h,
                        cx, TILE_TOP + wallH / 2, cz);
    body.userData.pick = { kind: 'building', id: b.id };
    buildingBodies.push(body);

    const roof = addBox(g, roofMat, b.w + 0.32, 0.2, b.h + 0.32,
                        cx, TILE_TOP + wallH + 0.1, cz);
    /* the roof is most of what a click from above can land on */
    roof.userData.pick = body.userData.pick;
    buildingBodies.push(roof);

    if (b.kind !== 'shop') {
      for (let f = 1; f < b.floors; f++) {
        addBox(g, b.kind === 'school' ? schoolTrimMat : trimMat,
               b.w + 0.06, 0.055, b.h + 0.06,
               cx, TILE_TOP + f * FLOOR_H, cz);
      }
      /* a stair housing and a water tank, so a roof reads as a roof */
      const hx = b.x + 0.9 + hash01(b.id, 1) * Math.max(0.1, b.w - 2.6);
      const hz = b.y + 0.9 + hash01(b.id, 2) * Math.max(0.1, b.h - 2.6);
      addBox(g, detailMat, 1.0, 0.7, 0.9,
             hx, TILE_TOP + wallH + 0.55, hz);
      const tank = new THREE.Mesh(cylGeo, detailMat);
      tank.scale.set(0.28, 0.45, 0.28);
      tank.position.set(b.x + b.w - 1.1, TILE_TOP + wallH + 0.58,
                        b.y + 1.0);
      tank.castShadow = true;
      tank.receiveShadow = true;
      g.add(tank);
    } else {
      addBox(g, trimMat, b.w + 0.08, 0.12, b.h + 0.08,
             cx, TILE_TOP + wallH - 0.05, cz);
    }

    /* Door on the cell the engine named, with a step and a canopy. */
    const face = doorFace(b);
    const doorW = b.kind === 'shop' || b.kind === 'school' ? 0.8 : 0.55;
    const doorH = b.kind === 'shop' ? SHOP_DOOR_H : DOOR_H;
    const along = face.axis === 'z'
      ? Math.max(b.x + 0.55, Math.min(b.x + b.w - 0.55, b.door[0] + 0.5))
      : Math.max(b.y + 0.55, Math.min(b.y + b.h - 0.55, b.door[1] + 0.5));
    const out = face.at + face.sign * 0.045;
    if (face.axis === 'z') {
      addBox(g, doorMat, doorW, doorH, 0.08,
             along, TILE_TOP + doorH / 2, out).castShadow = false;
      addBox(g, roofMat, doorW + 0.34, 0.06, 0.36,
             along, TILE_TOP + doorH + 0.2, face.at + face.sign * 0.16);
    } else {
      addBox(g, doorMat, 0.08, doorH, doorW,
             out, TILE_TOP + doorH / 2, along).castShadow = false;

      addBox(g, roofMat, 0.36, 0.06, doorW + 0.34,
             face.at + face.sign * 0.16, TILE_TOP + doorH + 0.2, along);
    }

    /* the step is the one people are lifted onto (Crowd.steps), drawn
     * from the same rectangle so the two cannot drift apart */
    const st = Crowd ? Crowd.doorStep(b) : null;
    if (st) {
      addBox(g, stepMat, st.x1 - st.x0, STEP_H, st.z1 - st.z0,
             (st.x0 + st.x1) / 2, TILE_TOP + STEP_H / 2, (st.z0 + st.z1) / 2);
    }

    /* a small lamp over the door, part of the same night as the street */
    const bulb = new THREE.Mesh(sphereGeo, lampBulbMat);
    bulb.scale.setScalar(0.09);
    if (face.axis === 'z') {
      bulb.position.set(along, TILE_TOP + doorH + 0.34,
                        face.at + face.sign * 0.12);
    } else {
      bulb.position.set(face.at + face.sign * 0.12,
                        TILE_TOP + doorH + 0.34, along);
    }
    g.add(bulb);

    if (b.kind === 'shop') {
      /* the sign and the shopfront: the one place on the estate that is
       * always awake after dark, because somebody is still serving */
      if (face.axis === 'z') {
        addBox(g, shopSignMat, 1.7, 0.36, 0.1, along,
               TILE_TOP + wallH - 0.34, face.at + face.sign * 0.12);
      } else {
        addBox(g, shopSignMat, 0.1, 0.36, 1.7,
               face.at + face.sign * 0.12, TILE_TOP + wallH - 0.34, along);
      }
      /* Panes flank the door — never sit on the leaf itself. */
      const paneY = TILE_TOP + wallH * 0.58;
      [along - 1.15, along + 1.15].forEach(px => {
        if (face.axis === 'z') {
          addWindow(px, paneY, face.at + face.sign * 0.05,
                    face.sign > 0 ? 0 : Math.PI, null, true, 1.2, 1.05);
        } else {
          addWindow(face.at + face.sign * 0.05, paneY, px,
                    face.sign > 0 ? Math.PI / 2 : -Math.PI / 2,
                    null, true, 1.2, 1.05);
        }
      });
    }

    if (b.kind === 'school') buildSchool(g, b, face, along);

    /* Windows: one pane per flat on each long face, at its own fraction of
     * the face, so the pane belongs to the flat it is drawn for. */
    const units = unitsByBuilding[b.id] || [];
    const longX = b.w >= b.h;
    const len = longX ? b.w : b.h;
    const start = longX ? b.x : b.y;
    const margin = 0.72;
    const span = Math.max(0.1, len - 2 * margin);

    units.forEach(u => {
      const t = (u.i + 0.5) / Math.max(1, u.n);
      const pos = start + margin + t * span;
      const y = TILE_TOP + (u.f - 1) * FLOOR_H + FLOOR_H * 0.58;
      if (longX) {
        addWindow(pos, y, b.y - 0.02, Math.PI, u.uid, false);
        addWindow(pos, y, b.y + b.h + 0.02, 0, u.uid, false);
      } else {
        addWindow(b.x - 0.02, y, pos, -Math.PI / 2, u.uid, false);
        addWindow(b.x + b.w + 0.02, y, pos, Math.PI / 2, u.uid, false);
      }
    });

    /* narrow dark windows on the short faces: architecture, not flats */
    if (units.length) {
      for (let f = 1; f <= b.floors; f++) {
        const y = TILE_TOP + (f - 1) * FLOOR_H + FLOOR_H * 0.58;
        [0.34, 0.66].forEach(t => {
          if (longX) {
            const pz = b.y + t * b.h;
            addWindow(b.x - 0.02, y, pz, -Math.PI / 2, null, false, 0.8, 0.9);
            addWindow(b.x + b.w + 0.02, y, pz, Math.PI / 2, null, false,
                      0.8, 0.9);
          } else {
            const px = b.x + t * b.w;
            addWindow(px, y, b.y - 0.02, Math.PI, null, false, 0.8, 0.9);
            addWindow(px, y, b.y + b.h + 0.02, 0, null, false, 0.8, 0.9);
          }
        });
      }
    }
  });

  /* One instanced pane mesh for every window on the estate. The colour is
   * the whole state of a window: cold glass by day and warm lamplight at
   * night if — and only if — the flat it belongs to is lived in. Lit so
   * it picks up the sky env rather than reading as unlit cardboard. */
  /* Window panes ~45% of a person tall — a flat's window, not a door. */
  const paneGeo = new THREE.PlaneGeometry(PERSON_H * 0.42, PERSON_H * 0.48);
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, side: THREE.DoubleSide, roughness: 0.18, metalness: 0.55,
    envMapIntensity: 1.1 });
  const frameGeo = new THREE.PlaneGeometry(PERSON_H * 0.50, PERSON_H * 0.56);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x14181e, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.05 });
  const slotCount = Math.max(1, windowSlots.length);
  const windowMesh = new THREE.InstancedMesh(paneGeo, paneMat, slotCount);
  const frameMesh = new THREE.InstancedMesh(frameGeo, frameMat, slotCount);
  windowMesh.frustumCulled = false;
  frameMesh.frustumCulled = false;
  scene.add(windowMesh);
  scene.add(frameMesh);

  for (let i = 0; i < windowSlots.length; i++) {
    const s = windowSlots[i];
    dummy.position.set(s.px, s.py, s.pz);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.set(s.sx, s.sy, 1);
    dummy.updateMatrix();
    windowMesh.setMatrixAt(i, dummy.matrix);
    const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
    dummy.position.set(s.px - nx * 0.014, s.py, s.pz - nz * 0.014);
    dummy.scale.set(s.sx * 1.22, s.sy * 1.16, 1);
    dummy.updateMatrix();
    frameMesh.setMatrixAt(i, dummy.matrix);
  }
  windowMesh.count = windowSlots.length;
  frameMesh.count = windowSlots.length;
  windowMesh.instanceMatrix.needsUpdate = true;
  frameMesh.instanceMatrix.needsUpdate = true;

  /* --------------------------------------------------------- windows lit */

  const occupied = new Set();
  kit.occupancyDirty = true;
  /* A window's colour is the whole state of it: cold glass by day, warm
   * lamplight in a lived-in flat at night. It is mixed by `dark` rather
   * than switched at a threshold, so the estate lights up room by room
   * through the dusk and goes out the same way through the dawn. The
   * instance colours are rewritten in `WINDOW_STEPS` small steps: that is
   * finer than the eye reads as a step and, unlike a per-frame rewrite,
   * uploads the buffer only while the light is actually moving. */
  const WINDOW_STEPS = 24;
  const WIN_DAY = {
    lived: new THREE.Color(0x51616f), shop: new THREE.Color(0x6b5a44),
    pane: new THREE.Color(0x263039),
  };
  const WIN_NIGHT = {
    lived: new THREE.Color(0xffca7a), shop: new THREE.Color(0xffb45c),
    pane: new THREE.Color(0x0f1419),
  };
  kit.windowDark = 0;

  function paintWindows(dark) {
    if (!windowSlots.length) return;
    const windowDark = clamp01(dark);
    kit.windowDark = windowDark;
    for (let i = 0; i < windowSlots.length; i++) {
      const s = windowSlots[i];
      const key = s.unit != null && occupied.has(s.unit) ? 'lived'
                : s.shop ? 'shop' : 'pane';
      _c1.lerpColors(WIN_DAY[key], WIN_NIGHT[key], windowDark);
      windowMesh.setColorAt(i, _c1);
    }
    if (windowMesh.instanceColor) windowMesh.instanceColor.needsUpdate = true;
  }

  kit.buildingById = buildingById;
  kit.buildingBodies = buildingBodies;
  kit.addBox = addBox;
  kit.lampBulbMat = lampBulbMat;
  kit.shopSignMat = shopSignMat;
  kit.paneMat = paneMat;
  kit.occupied = occupied;
  kit.WINDOW_STEPS = WINDOW_STEPS;
  return { paintWindows };
}
