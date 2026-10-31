/* Instanced people: two-bone legs and arms, feet, sit and stand poses.
 * Highfield visual fork of world.js. */
import * as THREE from 'three';
import { TILE_TOP, BENCH_SEAT, FIGURE_SCALE } from './scale.js';

/* Capsule half-length = radius + length/2; thigh/shin hang from hip/knee. */
export const THIGH_HALF = 0.125;
export const SHIN_HALF = 0.118;
export const UPPER_ARM_HALF = 0.085;
export const FOREARM_HALF = 0.078;
export const FOOT_LEN = 0.11;
export const SEAT_TOP = TILE_TOP + BENCH_SEAT;
/* Slide sitters from the bench centre toward the path (bench fx,fz).
 * Seat plank centres at local +0.06; root near the plank centre keeps
 * the torso clear of the board. */
export const SIT_FORWARD = 0.10;
export const SIT_IN_MS = 580;
export const SIT_OUT_MS = 420;
/* Cells of travel per full left-right stride cycle (distance-locked gait). */
export const STRIDE_CELLS = 0.72;

/* Joint poses as plain numbers, lerped for sit/stand and layered with
 * walk / idle / table offsets. Units: local metres and radians.
 * Limb sign: positive rx swings a hanging bone toward local -Z (behind);
 * negative rx toward +Z (the path). Knee/elbow bend is always ≥0. */
export const POSE_STAND = {
  leanX: 0,
  torsoY: 0.50, torsoZ: 0, torsoRx: 0,
  hipY: 0.48, legRx: 0.04, kneeRx: 0.08, legSpread: 0.04,
  armY: 0.58, armRx: 0.12, elbowRx: 0.15, armOut: 0.18,
  headY: 0.74, hairY: 0.82, hairZ: -0.01,
  footRx: 0.05,
};
export const POSE_SIT = {
  /* Tip into the backrest; thighs nearly level toward the path; knee at
   * ~90° so the shin drops (kneeRx ≈ π/2). Hands rest on the thighs. */
  leanX: -0.06,
  torsoY: 0.30, torsoZ: -0.04, torsoRx: -0.06,
  hipY: 0.12, legRx: -1.35, kneeRx: 1.55, legSpread: 0.09,
  armY: 0.28, armRx: -1.00, elbowRx: 0.55, armOut: 0.04,
  headY: 0.52, hairY: 0.60, hairZ: -0.02,
  footRx: 0.35,
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
  out.elbowRx = a.elbowRx + (b.elbowRx - a.elbowRx) * t;
  out.armOut = a.armOut + (b.armOut - a.armOut) * t;
  out.headY = a.headY + (b.headY - a.headY) * t;
  out.hairY = a.hairY + (b.hairY - a.hairY) * t;
  out.hairZ = a.hairZ + (b.hairZ - a.hairZ) * t;
  out.footRx = a.footRx + (b.footRx - a.footRx) * t;
  return out;
}

export function easeSmooth(t) {
  return t * t * (3 - 2 * t);
}

/** Shortest-path blend of yaw angles (radians). */
export function slerpYaw(from, to, t) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, Math.max(0, t));
}

export function createFigures(kit) {
  const { scene } = kit;

  /* A figure is about a door's height — small enough that a block dwarfs
   * it, large enough that a person is visible from the far side of
   * the estate without a label. Parts stay instanced so a hundred
   * residents are still a handful of draw calls. */
  const torsoGeo = new THREE.CapsuleGeometry(0.12, 0.22, 4, 8);
  const thighGeo = new THREE.CapsuleGeometry(0.055, 0.14, 3, 6);
  const shinGeo = new THREE.CapsuleGeometry(0.048, 0.14, 3, 6);
  const footGeo = new THREE.BoxGeometry(0.07, 0.045, FOOT_LEN);
  const upperArmGeo = new THREE.CapsuleGeometry(0.042, 0.10, 3, 6);
  const forearmGeo = new THREE.CapsuleGeometry(0.036, 0.09, 3, 6);
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
  let footLMesh = null, footRMesh = null;
  let armLMesh = null, armRMesh = null, forearmLMesh = null, forearmRMesh = null;
  let headMesh = null, hairMesh = null;
  let shadowMesh = null, capacity = 0;
  let bodyMesh = null;
  const _root = new THREE.Object3D();
  const _part = new THREE.Object3D();
  const _combined = new THREE.Matrix4();
  const _drop = new THREE.Matrix4();
  const _hipM = new THREE.Matrix4();
  const _kneeM = new THREE.Matrix4();
  const _rot = new THREE.Matrix4();
  const _torsoM = new THREE.Matrix4();
  const _shoulderM = new THREE.Matrix4();
  const _elbowM = new THREE.Matrix4();

  function setPartMatrix(mesh, i, px, py, pz, rx, ry, rz, sx, sy, sz) {
    _part.position.set(px, py, pz);
    _part.rotation.set(rx, ry, rz);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _combined.multiplyMatrices(_root.matrix, _part.matrix);
    mesh.setMatrixAt(i, _combined);
  }

  function setPartOnParent(mesh, i, parentM, px, py, pz, rx, ry, rz, sx, sy, sz) {
    _part.position.set(px, py, pz);
    _part.rotation.set(rx, ry, rz);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _combined.multiplyMatrices(parentM, _part.matrix);
    mesh.setMatrixAt(i, _combined);
  }

  /* Two-bone leg + foot: thigh from the hip, shin from the knee, foot from
   * the ankle tip. `kneeRx` / `footRx` are flexion in the parent frame. */
  function setLegMatrices(thighMesh, shinMesh, footMesh, i, hx, hy, hz,
                          hipRx, hipRz, kneeRx, footRx, sx, sy, sz) {
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
    /* ankle at shin tip; foot box extends +Z (toward toes / path) */
    _combined.copy(_kneeM);
    _drop.makeTranslation(0, -2 * SHIN_HALF, 0);
    _combined.multiply(_drop);
    _rot.makeRotationX(footRx);
    _combined.multiply(_rot);
    _drop.makeTranslation(0, -0.02, FOOT_LEN * 0.35);
    _combined.multiply(_drop);
    footMesh.setMatrixAt(i, _combined);
  }

  /* Two-bone arm: upper from the shoulder, forearm from the elbow. */
  function setArmMatrices(upperMesh, foreMesh, i, hx, hy, hz,
                          armRx, armOut, elbowRx, sx, sy, sz) {
    _part.position.set(hx, hy, hz);
    _part.rotation.set(armRx, 0, armOut);
    _part.scale.set(sx, sy, sz);
    _part.updateMatrix();
    _shoulderM.multiplyMatrices(_root.matrix, _part.matrix);
    _combined.copy(_shoulderM);
    _drop.makeTranslation(0, -UPPER_ARM_HALF, 0);
    _combined.multiply(_drop);
    upperMesh.setMatrixAt(i, _combined);
    _elbowM.copy(_shoulderM);
    _drop.makeTranslation(0, -2 * UPPER_ARM_HALF, 0);
    _elbowM.multiply(_drop);
    _rot.makeRotationX(elbowRx);
    _elbowM.multiply(_rot);
    _combined.copy(_elbowM);
    _drop.makeTranslation(0, -FOREARM_HALF, 0);
    _combined.multiply(_drop);
    foreMesh.setMatrixAt(i, _combined);
  }

  function hideFigure(i) {
    _root.position.set(0, -50, 0);
    _root.rotation.set(0, 0, 0);
    _root.scale.set(0, 0, 0);
    _root.updateMatrix();
    const zero = (mesh) => setPartMatrix(mesh, i, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    [torsoMesh, thighLMesh, thighRMesh, shinLMesh, shinRMesh,
     footLMesh, footRMesh, armLMesh, armRMesh, forearmLMesh, forearmRMesh,
     headMesh, hairMesh, shadowMesh].forEach(zero);
  }

  /* Draw one figure from a pose plus per-limb walk/idle deltas.
   * Head and hair follow the torso lean so a walk tip carries the neck. */
  function drawFigure(i, x, z, rootY, yaw, s, pose, d) {
    _root.position.set(x, rootY + (d.bob || 0), z);
    _root.rotation.set(0, yaw, d.sway || 0);
    const fs = s * FIGURE_SCALE;
    _root.scale.set(fs, fs, fs);
    _root.updateMatrix();

    const torsoRx = pose.torsoRx + pose.leanX + (d.leanX || 0) + (d.torsoRx || 0);
    const torsoRy = d.torsoRy || 0;
    _part.position.set(0, pose.torsoY, pose.torsoZ);
    _part.rotation.set(torsoRx, torsoRy, 0);
    _part.scale.set(1, 1, 1);
    _part.updateMatrix();
    _torsoM.multiplyMatrices(_root.matrix, _part.matrix);
    torsoMesh.setMatrixAt(i, _torsoM);

    const kneeL = Math.max(0, pose.kneeRx + (d.kneeL || 0));
    const kneeR = Math.max(0, pose.kneeRx + (d.kneeR || 0));
    const footL = pose.footRx + (d.footL || 0);
    const footR = pose.footRx + (d.footR || 0);
    setLegMatrices(thighLMesh, shinLMesh, footLMesh, i,
                   -0.065, pose.hipY, d.hipZ || 0,
                   pose.legRx + (d.legL || 0), pose.legSpread, kneeL, footL, 1, 1, 1);
    setLegMatrices(thighRMesh, shinRMesh, footRMesh, i,
                   0.065, pose.hipY, d.hipZ || 0,
                   pose.legRx + (d.legR || 0), -pose.legSpread, kneeR, footR, 1, 1, 1);

    const elbowL = Math.max(0, pose.elbowRx + (d.elbowL || 0));
    const elbowR = Math.max(0, pose.elbowRx + (d.elbowR || 0));
    setArmMatrices(armLMesh, forearmLMesh, i, -0.175, pose.armY, d.armZ || 0,
                   pose.armRx + (d.armL || 0), pose.armOut + (d.armOut || 0),
                   elbowL, 1, 1, 1);
    setArmMatrices(armRMesh, forearmRMesh, i, 0.175, pose.armY, d.armZ || 0,
                   pose.armRx + (d.armR || 0), -(pose.armOut + (d.armOut || 0)),
                   elbowR, 1, 1, 1);

    /* Neck sits on the torso: head Y is relative to the torso centre. */
    const neckY = pose.headY - pose.torsoY;
    const hairOffY = pose.hairY - pose.torsoY;
    setPartOnParent(headMesh, i, _torsoM, 0, neckY, -pose.torsoZ,
                    d.headPitch || 0, d.headYaw || 0, 0, 1, 1, 1);
    setPartOnParent(hairMesh, i, _torsoM, 0, hairOffY, pose.hairZ - pose.torsoZ,
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
    kit.footLMesh = footLMesh;
    kit.footRMesh = footRMesh;
    kit.armLMesh = armLMesh;
    kit.armRMesh = armRMesh;
    kit.forearmLMesh = forearmLMesh;
    kit.forearmRMesh = forearmRMesh;
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
                 footLMesh, footRMesh, armLMesh, armRMesh, forearmLMesh,
                 forearmRMesh, headMesh, hairMesh, shadowMesh];
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
    footLMesh = makeFigureMesh(footGeo, pantsMat, true);
    footRMesh = makeFigureMesh(footGeo, pantsMat, true);
    armLMesh = makeFigureMesh(upperArmGeo, clothMat, true);
    armRMesh = makeFigureMesh(upperArmGeo, clothMat, true);
    forearmLMesh = makeFigureMesh(forearmGeo, clothMat, true);
    forearmRMesh = makeFigureMesh(forearmGeo, clothMat, true);
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
