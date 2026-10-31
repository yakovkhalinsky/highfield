/**
 * Highfield's visual fork of world.js: people have two-bone legs, and
 * furniture is scaled to the body. These checks read the drawing itself
 * (as crowd_check reads fixture sizes from world.js) so a drift in the
 * fork fails here rather than only in a screenshot.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "../page3d/shared/vendor/three.module.min.js";
import { PAGE3D_VISUAL_FORK } from "../scripts/reference.ts";

const WORLD = resolve(import.meta.dirname, "../page3d/estate/world.js");
const SCALE = resolve(import.meta.dirname, "../page3d/estate/world/scale.js");
const FIGURES = resolve(import.meta.dirname, "../page3d/estate/world/figures.js");
const worldSrc = readFileSync(WORLD, "utf8");
const scaleSrc = readFileSync(SCALE, "utf8");
const figuresSrc = readFileSync(FIGURES, "utf8");
/** Drawing source: the façade plus the modules the fork was split into. */
const src = [
  worldSrc,
  scaleSrc,
  figuresSrc,
  readFileSync(resolve(import.meta.dirname, "../page3d/estate/world/buildings.js"), "utf8"),
  readFileSync(resolve(import.meta.dirname, "../page3d/estate/world/fixtures.js"), "utf8"),
  readFileSync(resolve(import.meta.dirname, "../page3d/estate/world/residents.js"), "utf8"),
].join("\n");

/** Evaluate scale consts (exported from world/scale.js) in dependency order. */
function loadConsts(names: string[]): Record<string, number> {
  const lines: string[] = [];
  for (const name of names) {
    const m = new RegExp(`^(?:export )?const ${name} = ([^;]+);`, "m").exec(scaleSrc);
    expect(m, `const ${name}`).toBeTruthy();
    lines.push(`const ${name} = ${m![1]};`);
  }
  return new Function(`${lines.join("\n")}; return { ${names.join(", ")} };`)();
}

function loadPose(name: "POSE_STAND" | "POSE_SIT"): Record<string, number> {
  const m = new RegExp(`(?:export )?const ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(figuresSrc);
  expect(m, name).toBeTruthy();
  const body = m![1]!
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  return new Function(`return { ${body} };`)();
}

function half(name: string): number {
  const m = new RegExp(`(?:export )?const ${name} = ([0-9.]+)`).exec(figuresSrc);
  expect(m, name).toBeTruthy();
  return Number(m![1]);
}

/** Same chain world.js's setLegMatrices builds: hip → thigh → knee → shin/foot. */
function legChain(
  rootY: number,
  rootZ: number,
  hipY: number,
  hipZ: number,
  hipRx: number,
  kneeRx: number,
  thighHalf: number,
  shinHalf: number,
) {
  const root = new THREE.Object3D();
  root.position.set(0, rootY, rootZ);
  root.updateMatrix();
  const part = new THREE.Object3D();
  part.position.set(0.065, hipY, hipZ);
  part.rotation.set(hipRx, 0, 0);
  part.updateMatrix();
  const hipM = new THREE.Matrix4().multiplyMatrices(root.matrix, part.matrix);
  const thigh = new THREE.Vector3().setFromMatrixPosition(
    hipM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -thighHalf, 0)),
  );
  const knee = new THREE.Vector3().setFromMatrixPosition(
    hipM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -2 * thighHalf, 0)),
  );
  const kneeM = hipM.clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, -2 * thighHalf, 0))
    .multiply(new THREE.Matrix4().makeRotationX(kneeRx));
  const shin = new THREE.Vector3().setFromMatrixPosition(
    kneeM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -shinHalf, 0)),
  );
  const foot = new THREE.Vector3().setFromMatrixPosition(
    kneeM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -2 * shinHalf, 0)),
  );
  const thighDir = knee.clone().sub(
    new THREE.Vector3().setFromMatrixPosition(hipM),
  ).normalize();
  const shinDir = foot.clone().sub(knee).normalize();
  const bendDeg = Math.acos(Math.min(1, Math.max(-1, thighDir.dot(shinDir)))) * (180 / Math.PI);
  const shinFromDown = Math.acos(Math.min(1, Math.max(-1, -shinDir.y))) * (180 / Math.PI);
  return { thigh, knee, shin, foot, bendDeg, shinFromDown };
}

describe("the visual fork", () => {
  it("is the world.js Highfield keeps (sync leaves it alone)", () => {
    expect(PAGE3D_VISUAL_FORK.has("world.js")).toBe(true);
    expect(worldSrc).toMatch(/PAGE3D_VISUAL_FORK/);
    expect(worldSrc).toMatch(/Highfield visual fork/);
  });

  it("draws two-bone legs with a knee, not a single capsule", () => {
    expect(src).toMatch(/thighGeo/);
    expect(src).toMatch(/shinGeo/);
    expect(src).toMatch(/setLegMatrices/);
    expect(src).toMatch(/shinLMesh/);
    expect(src).toMatch(/shinRMesh/);
    expect(src).toMatch(/kneeRx/);
    expect(src).not.toMatch(/CapsuleGeometry\(0\.055, 0\.22/); // old one-bone leg
  });
});

describe("human scale", () => {
  const c = loadConsts([
    "PERSON_H", "FIGURE_REF_H", "FIGURE_SCALE", "DOOR_H", "SHOP_DOOR_H", "BENCH_SEAT",
  ]);

  it("fits a standing adult under the door with real doorway clearance", () => {
    expect(c.PERSON_H).toBeGreaterThan(0.7);
    expect(c.PERSON_H).toBeLessThan(1.0);
    expect(c.DOOR_H / c.PERSON_H).toBeGreaterThan(1.12);
    expect(c.DOOR_H / c.PERSON_H).toBeLessThan(1.3);
    expect(c.SHOP_DOOR_H).toBeGreaterThan(c.DOOR_H);
    expect(c.FIGURE_SCALE).toBeCloseTo(c.PERSON_H / c.FIGURE_REF_H, 6);
  });

  it("puts the bench seat near a third of standing height", () => {
    const frac = c.BENCH_SEAT / c.PERSON_H;
    expect(frac).toBeGreaterThan(0.26);
    expect(frac).toBeLessThan(0.38);
  });

  it("sizes furniture from PERSON_H, not free-floating magic heights", () => {
    expect(src).toMatch(/tableH = PERSON_H \* 0\.47/);
    expect(src).toMatch(/lampH = PERSON_H \* 2\.4/);
    expect(src).toMatch(/frameH = PERSON_H \* 1\.45/);
    expect(src).toMatch(/shelterH = PERSON_H \* 1\.45/);
    expect(src).toMatch(/gateH = PERSON_H \* 1\.25/);
    expect(src).toMatch(/doorH = b\.kind === 'shop' \? SHOP_DOOR_H : DOOR_H/);
    expect(src).toMatch(/SEAT_TOP = TILE_TOP \+ BENCH_SEAT/);
  });

  it("keeps windows smaller than a person (a pane, not a door)", () => {
    expect(src).toMatch(/PlaneGeometry\(PERSON_H \* 0\.42, PERSON_H \* 0\.48\)/);
  });
});

describe("the sit pose", () => {
  const stand = loadPose("POSE_STAND");
  const sit = loadPose("POSE_SIT");
  const thighHalf = half("THIGH_HALF");
  const shinHalf = half("SHIN_HALF");
  const c = loadConsts(["PERSON_H", "BENCH_SEAT"]);
  const TILE_TOP = 0.12;
  const SEAT_TOP = TILE_TOP + c.BENCH_SEAT;

  it("folds the knee ~90° with thighs toward the path (+Z)", () => {
    expect(sit.legRx).toBeLessThan(0);       // thighs toward +Z / path
    expect(sit.kneeRx).toBeGreaterThan(1.2); // flexion, not straight
    expect(sit.armRx).toBeLessThan(0);       // hands toward thighs / path
    expect(stand.kneeRx).toBeGreaterThanOrEqual(0);
    expect(stand.kneeRx).toBeLessThan(0.3);

    const g = legChain(SEAT_TOP, 0.10, sit.hipY, 0.08, sit.legRx, sit.kneeRx,
                       thighHalf, shinHalf);
    expect(g.bendDeg).toBeGreaterThan(80);
    expect(g.bendDeg).toBeLessThan(100);
    expect(g.shinFromDown).toBeLessThan(25);
    expect(g.knee.z).toBeGreaterThan(g.thigh.z); // thigh reaches forward
    expect(g.foot.y).toBeLessThan(g.knee.y);     // shin drops
  });

  it("keeps the seated torso clear of the backrest (local z ≳ −0.05)", () => {
    /* Root at SIT_FORWARD 0.10; torso at pose.torsoZ. Backrest front ≈ −0.13. */
    const SIT_FORWARD = 0.10;
    const rootZ = SIT_FORWARD;
    const torsoZ = rootZ + sit.torsoZ;
    const backApprox = torsoZ - 0.12; // capsule radius
    expect(torsoZ).toBeGreaterThan(-0.02);
    expect(backApprox).toBeGreaterThan(-0.11);
  });

  it("lerps every joint the sit uses, including the knee", () => {
    expect(src).toMatch(/out\.kneeRx = a\.kneeRx \+ \(b\.kneeRx - a\.kneeRx\) \* t/);
  });
});

describe("the walk gait", () => {
  it("bends the swing-leg knee and keeps hip swing opposite the arms", () => {
    expect(src).toMatch(/d\.kneeL = \(0\.12 \+ Math\.max\(0, -stride\)/);
    expect(src).toMatch(/d\.kneeR = \(0\.12 \+ Math\.max\(0, stride\)/);
    expect(src).toMatch(/d\.legL = stride \* 0\.55/);
    expect(src).toMatch(/d\.armL = -stride \* 0\.72/);
  });
});

describe("standing feet", () => {
  it("lands near the ground with a nearly straight knee", () => {
    const stand = loadPose("POSE_STAND");
    const thighHalf = half("THIGH_HALF");
    const shinHalf = half("SHIN_HALF");
    const TILE_TOP = 0.12;
    const g = legChain(TILE_TOP + 0.005, 0, stand.hipY, 0, stand.legRx, stand.kneeRx,
                       thighHalf, shinHalf);
    expect(g.foot.y).toBeGreaterThan(TILE_TOP - 0.04);
    expect(g.foot.y).toBeLessThan(TILE_TOP + 0.08);
    expect(g.bendDeg).toBeLessThan(25);
  });
});

describe("draw scale", () => {
  it("applies FIGURE_SCALE on the figure root so poses fit the door", () => {
    expect(src).toMatch(/const fs = s \* FIGURE_SCALE/);
    expect(src).toMatch(/_root\.scale\.set\(fs, fs, fs\)/);
  });
});
