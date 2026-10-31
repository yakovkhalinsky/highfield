/* Instanced people: two-bone legs, sit and stand poses.
 * Highfield visual fork of world.js. */
import * as THREE from 'three';
import { TILE_TOP, BENCH_SEAT, FIGURE_SCALE } from './scale.js';

/* Capsule half-length = radius + length/2; thigh/shin hang from hip/knee. */
export const THIGH_HALF = 0.125;
export const SHIN_HALF = 0.118;
export const SEAT_TOP = TILE_TOP + BENCH_SEAT;
/* Slide sitters from the bench centre toward the path (bench fx,fz).
 * Seat plank centres at local +0.06; root near the plank centre keeps
 * the torso clear of the board. */
export const SIT_FORWARD = 0.10;
export const SIT_IN_MS = 580;
export const SIT_OUT_MS = 420;

/* Joint poses as plain numbers, lerped for sit/stand and layered with
 * walk / idle / table offsets. Units: local metres and radians.
 * Limb sign: positive rx swings a hanging bone toward local -Z (behind);
 * negative rx toward +Z (the path). Knee bend is always ≥0 (flexion
 * relative to the thigh): standing nearly straight, sitting ~90°. */
export const POSE_STAND = {
  leanX: 0,
  torsoY: 0.50, torsoZ: 0, torsoRx: 0,
  hipY: 0.48, legRx: 0.04, kneeRx: 0.08, legSpread: 0.04,
  armY: 0.58, armRx: 0.12, armOut: 0.18,
  headY: 0.74, hairY: 0.82, hairZ: -0.01,
};
export const POSE_SIT = {
  /* Tip into the backrest; thighs nearly level toward the path; knee at
   * ~90° so the shin drops (kneeRx ≈ π/2). Hands rest on the thighs. */
  leanX: -0.06,
  torsoY: 0.30, torsoZ: -0.04, torsoRx: -0.06,
  hipY: 0.12, legRx: -1.35, kneeRx: 1.55, legSpread: 0.09,
  armY: 0.28, armRx: -1.00, armOut: 0.04,
  headY: 0.52, hairY: 0.60, hairZ: -0.02,
};
export function lerpPose(a, b, t, out) {
  out.leanX = a.leanX + (b.leanX - a.leanX) * t;
  out.torsoY = a.torsoY + (b.torsoY - a.torsoY) * t;
  out.torsoZ = a.torsoZ + (b.torsoZ - a.torsoZ) * t;
  out.torsoRx = a.torsoRx + (b.torsoRx - a.torsoRx) * t;
  out.hipY = a.hipY + (b.hipY - a.hipY) * t;
  out.legRx = a.legRx + (b.legRx - a.legRx) * t;
  out.kneeRx = a.kneeRx + (b.kneeRx - a.kneeRx) * t;
  out.legSpread = a.legSpread + (b.legSpread - a.legSpread) * t;
  out.armY = a.armY + (b.armY - a.armY) * t;
  out.armRx = a.armRx + (b.armRx - a.armRx) * t;
  out.armOut = a.armOut + (b.armOut - a.armOut) * t;
  out.headY = a.headY + (b.headY - a.headY) * t;
  out.hairY = a.hairY + (b.hairY - a.hairY) * t;
  out.hairZ = a.hairZ + (b.hairZ - a.hairZ) * t;
  return out;
}

export function easeSmooth(t) {
  return t * t * (3 - 2 * t);
}

export function createFigures(kit) {
  const { scene } = kit;

  /* A figure is about a door's height — small enough that a block dwarfs
   * it, large enough that a person is visible from the far side of
   * the estate without a label. Parts stay instanced (torso, legs, arms,
   * head, hair, contact disc) so a hundred residents are still a handful
   * of draw calls. Warm emissive keeps them readable at dusk. */
  const torsoGeo = new THREE.CapsuleGeometry(0.12, 0.22, 4, 8);
  /* Limbs are a little thick for the body's true proportion so they still
   * read from the usual estate camera; collision keeps Crowd.R. Legs are
   * two bones (thigh + shin) so a sit and a stride can bend at the knee. */
  const thighGeo = new THREE.CapsuleGeometry(0.055, 0.14, 3, 6);
  const shinGeo = new THREE.CapsuleGeometry(0.048, 0.14, 3, 6);
  const armGeo = new THREE.CapsuleGeometry(0.042, 0.18, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.125, 10, 8);
  const hairGeo = new THREE.SphereGeometry(0.132, 8, 6);
  const shadowGeo = new THREE.CircleGeometry(0.24, 16);
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffe0b0, emissiveIntensity: 0.08,
    roughness: 0.82, metalness: 0.0 });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffe0b0, emissiveIntensity: 0.06,
    roughness: 0.88, metalness: 0.0 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffd0a0, emissiveIntensity: 0.05,
    roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffe0b0, emissiveIntensity: 0.04,
    roughness: 0.92 });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28,
    depthWrite: false });

  let torsoMesh = null;
  let thighLMesh = null, thighRMesh = null, shinLMesh = null, shinRMesh = null;
  let armLMesh = null, armRMesh = null, headMesh = null, hairMesh = null;
  let shadowMesh = null, capacity = 0;
  let bodyMesh = null; /* alias of torso for pick / older checks */
  const _root = new THREE.Object3D();
  const _part = new THREE.Object3D();
  const _combined = new THREE.Matrix4();

  const ARM_HALF = 0.132;

  const _drop = new THREE.Matrix4();
  const _hipM = new THREE.Matrix4();
  const _kneeM = new THREE.Matrix4();
  const _rot = new THREE.Matrix4();
  function setPartMatrix(mesh, i, px, py, pz, rx, ry, rz, sx, sy, sz) {
    _part.position.set(px, py, pz);
    _part.rotation.set(rx, ry, rz);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _combined.multiplyMatrices(_root.matrix, _part.matrix);
    mesh.setMatrixAt(i, _combined);
  }
  /* Pivot a limb at (hx,hy,hz) then hang its centre `drop` down local Y,
   * so a swing rotates at the hip or shoulder rather than mid-capsule. */
  function setLimbMatrix(mesh, i, hx, hy, hz, rx, ry, rz, drop, sx, sy, sz) {
    _part.position.set(hx, hy, hz);
    _part.rotation.set(rx, ry, rz);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _combined.multiplyMatrices(_root.matrix, _part.matrix);
    _drop.makeTranslation(0, drop, 0);
    _combined.multiply(_drop);
    mesh.setMatrixAt(i, _combined);
  }
  /* Two-bone leg: thigh from the hip, shin from the knee. `kneeRx` is
   * flexion in the thigh's frame (0 straight, ~π/2 for a sit). */
  function setLegMatrices(thighMesh, shinMesh, i, hx, hy, hz,
                          hipRx, hipRz, kneeRx, sx, sy, sz) {
    _part.position.set(hx, hy, hz);
    _part.rotation.set(hipRx, 0, hipRz);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _hipM.multiplyMatrices(_root.matrix, _part.matrix);
    _combined.copy(_hipM);
    _drop.makeTranslation(0, -THIGH_HALF, 0);
    _combined.multiply(_drop);
    thighMesh.setMatrixAt(i, _combined);
    _kneeM.copy(_hipM);
    _drop.makeTranslation(0, -2 * THIGH_HALF, 0);
    _kneeM.multiply(_drop);
    _rot.makeRotationX(kneeRx);
    _kneeM.multiply(_rot);
    _combined.copy(_kneeM);
    _drop.makeTranslation(0, -SHIN_HALF, 0);
    _combined.multiply(_drop);
    shinMesh.setMatrixAt(i, _combined);
  }

  function hideFigure(i) {
    _root.position.set(0, -50, 0);
    _root.rotation.set(0, 0, 0);
    _root.scale.set(0, 0, 0);
    _root.updateMatrix();
    setPartMatrix(torsoMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(thighLMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(thighRMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(shinLMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(shinRMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(armLMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(armRMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(headMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(hairMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    setPartMatrix(shadowMesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  /* Draw one figure from a pose plus per-limb walk/idle deltas.
   * `rootY` is world height of the feet/seat pivot; the contact disc is
   * always pinned near the ground so a sitter does not cast a disc mid-air.
   * Sitters pass world (x,z) already shifted onto the plank. */
  function drawFigure(i, x, z, rootY, yaw, s, pose, d) {
    _root.position.set(x, rootY + (d.bob || 0), z);
    /* yaw only on the root — lean lives on the torso so a sit tip does not
     * swing the hips back into the bench board. FIGURE_SCALE fits the
     * authored pose under the estate's doors. */
    _root.rotation.set(0, yaw, d.sway || 0);
    const fs = s * FIGURE_SCALE;
    _root.scale.set(fs, fs, fs);
    _root.updateMatrix();
    setPartMatrix(torsoMesh, i, 0, pose.torsoY, pose.torsoZ,
                  pose.torsoRx + pose.leanX + (d.leanX || 0) + (d.torsoRx || 0),
                  d.torsoRy || 0, 0, 1, 1, 1);
    const kneeL = Math.max(0, pose.kneeRx + (d.kneeL || 0));
    const kneeR = Math.max(0, pose.kneeRx + (d.kneeR || 0));
    setLegMatrices(thighLMesh, shinLMesh, i, -0.065, pose.hipY, d.hipZ || 0,
                   pose.legRx + (d.legL || 0), pose.legSpread, kneeL, 1, 1, 1);
    setLegMatrices(thighRMesh, shinRMesh, i, 0.065, pose.hipY, d.hipZ || 0,
                   pose.legRx + (d.legR || 0), -pose.legSpread, kneeR, 1, 1, 1);
    setLimbMatrix(armLMesh, i, -0.175, pose.armY, d.armZ || 0,
                  pose.armRx + (d.armL || 0), 0, pose.armOut + (d.armOut || 0),
                  -ARM_HALF, 1, 1, 1);
    setLimbMatrix(armRMesh, i, 0.175, pose.armY, d.armZ || 0,
                  pose.armRx + (d.armR || 0), 0, -(pose.armOut + (d.armOut || 0)),
                  -ARM_HALF, 1, 1, 1);
    setPartMatrix(headMesh, i, 0, pose.headY, 0,
                  d.headPitch || 0, d.headYaw || 0, 0, 1, 1, 1);
    setPartMatrix(hairMesh, i, 0, pose.hairY, pose.hairZ,
                  d.headPitch || 0, d.headYaw || 0, 0, 1.05, 0.55, 1.05);
    const sh = 1 - 0.2 * (d.sit || 0);
    setPartMatrix(shadowMesh, i, 0, d.shadowY != null ? d.shadowY : 0.008,
                  d.shadowZ || 0, -Math.PI / 2, 0, 0, sh, sh, sh);
  }

  function publishFigureMeshes() {
    kit.torsoMesh = torsoMesh;
    kit.thighLMesh = thighLMesh;
    kit.thighRMesh = thighRMesh;
    kit.shinLMesh = shinLMesh;
    kit.shinRMesh = shinRMesh;
    kit.armLMesh = armLMesh;
    kit.armRMesh = armRMesh;
    kit.headMesh = headMesh;
    kit.hairMesh = hairMesh;
    kit.shadowMesh = shadowMesh;
    kit.capacity = capacity;
    kit.bodyMesh = bodyMesh;
  }

  function makeFigureMesh(geo, mat, cast) {
    const m = new THREE.InstancedMesh(geo, mat, capacity);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!cast;
    m.receiveShadow = false;
    scene.add(m);
    return m;
  }

  function ensureResidents(n) {
    if (torsoMesh && n <= capacity) return;
    const old = [torsoMesh, thighLMesh, thighRMesh, shinLMesh, shinRMesh,
                 armLMesh, armRMesh, headMesh, hairMesh, shadowMesh];
    old.forEach(m => {
      if (!m) return;
      scene.remove(m);
      m.dispose();
    });
    capacity = Math.max(64, n + 32);
    torsoMesh = makeFigureMesh(torsoGeo, clothMat, true);
    thighLMesh = makeFigureMesh(thighGeo, pantsMat, true);
    thighRMesh = makeFigureMesh(thighGeo, pantsMat, true);
    shinLMesh = makeFigureMesh(shinGeo, pantsMat, true);
    shinRMesh = makeFigureMesh(shinGeo, pantsMat, true);
    armLMesh = makeFigureMesh(armGeo, clothMat, true);
    armRMesh = makeFigureMesh(armGeo, clothMat, true);
    headMesh = makeFigureMesh(headGeo, headMat, true);
    hairMesh = makeFigureMesh(hairGeo, hairMat, true);
    shadowMesh = makeFigureMesh(shadowGeo, shadowMat, false);
    shadowMesh.renderOrder = 1;
    bodyMesh = torsoMesh;
    publishFigureMeshes();
  }

  kit.clothMat = clothMat;
  kit.pantsMat = pantsMat;
  kit.headMat = headMat;
  kit.hairMat = hairMat;
  publishFigureMeshes();
  return { ensureResidents, drawFigure, hideFigure, setLegMatrices, lerpPose };
}
