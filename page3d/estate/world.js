/* world — the estate in three dimensions.
 *
 * Highfield visual fork of llm-world's page3d world.js: same facts and
 * layout, denser people (limbs, clothing, gait, contact discs) and
 * surfaces (triplanar grain, glass env, fuller trees). Listed in
 * PAGE3D_VISUAL_FORK so sync leaves this file alone.
 *
 * The estate is drawn in three dimensions because a block's height is the
 * fact the whole interior model rests on. A real camera makes it solid: the
 * light moves across the blocks, and a person walks from a door to a bench
 * on the ground rather than sliding across a picture.
 *
 * Nothing here is decided. The ground, the blocks, the flats, the people and
 * their positions all arrive from the server; this file only gives them a
 * body. Where a fact is missing it draws nothing rather than inventing one,
 * because a guess in a renderer is a second copy of a fact the engine owns.
 *
 * The five phases of the day are dawn, morning, afternoon, evening and
 * night — equal fifths of one continuous clock. `dayFraction` turns the wall
 * time since the day's turn into a fraction of the day; the light table is
 * keyed by that
 * fraction and eased between its keys, so the sun crosses the sky and the
 * lamps, windows and fog arrive and leave over a long dawn and dusk rather
 * than stepping when the server's `day` changes. The clock's wrap from 1
 * to 0 lands on the same night at both ends.
 */

import * as THREE from 'three';
import { OrbitControls } from '/3d/vendor/OrbitControls.js';
import { makeGrainTexture, makeSkyEnv } from './world/materials.js';
import { createGround } from './world/ground.js';
import { createBuildings } from './world/buildings.js';
import { createSky } from './world/sky.js';
import { createFigures } from './world/figures.js';
import { createResidents } from './world/residents.js';
import { createFixtures } from './world/fixtures.js';
import { createWeather } from './world/weather.js';
import { createFocus } from './world/focus.js';
import { phaseByName, phaseView } from './world/phase.js';

/* The router is a classic script (`/3d/walk.js`) loaded before this module;
 * see walk.js beside it. If it ever fails to load, the page still draws
 * everyone — as a straight line, which is what it used to do always. */
const Walk = (typeof globalThis !== 'undefined' && globalThis.EstateWalk) ||
             null;

/* Who stands where on a shared tile (`/3d/crowd.js`, a classic script
 * like the router): one figure per seat, the rest spread over the tile. */
const Crowd = (typeof globalThis !== 'undefined' && globalThis.EstateCrowd) ||
              null;

/* The day's clock and the light table are `clock.js`, loaded as a classic
 * script before this module: pure functions with no THREE, so the property
 * that matters — the light never jumps at the turn — is testable in Node
 * (`tools/clock_check.js`) rather than only by a replica that ships
 * nowhere. */
const Clock = (typeof globalThis !== 'undefined' && globalThis.EstateClock) ||
              null;

/* The light field's painter (`/3d/field.js`, shared with the grove), a
 * classic script before this module like the clock. */
const Field = (typeof globalThis !== 'undefined' && globalThis.Page3DField) ||
              null;

/* A door's step and the shop's stall are one step high (crowd.js), and a
 * figure over either stands on it, never in it. */
const STEP_H = Crowd ? Crowd.STEP_H : 0.06;

const _c1 = new THREE.Color();
const _haze = new THREE.Color(0x8a9184);

/* the clock's own helper; the fallback only keeps unrelated geometry code
 * running if clock.js failed to load, and `createWorld` refuses to start
 * without the light table anyway */
const clamp01 = (Clock && Clock.clamp01) ||
                (v => Math.max(0, Math.min(1, v)));

export function createWorld(ground, canvas, opts) {
  opts = opts || {};
  if (!Clock) throw new Error('the day clock (clock.js) did not load');
  if (!Field) throw new Error('the light field (field.js) did not load');
  const forcedPhase = Number.isFinite(opts.forcedPhase) ? opts.forcedPhase
                                                          : -1;
  /* `?clock=0.15` pins the day's fraction for screenshots of mid-dawn or
   * mid-dusk; it is finer than a phase and wins if both are given. The
   * clock owns both pins and the day's own anchoring. */
  const clock = Clock.makeClock({ clockPin: opts.clockFrac,
                                  forcedPhase: forcedPhase });
  const staticMode = !!opts.staticMode;
  const W = ground.width, H = ground.height;
  const centre = new THREE.Vector3(W / 2, 1.4, H / 2);
  /* the plan's walkable ground, searched once and never rebuilt unless the
   * fixture list changes */
  const grid = Walk ? Walk.buildGrid(ground) : null;

  /* The outer band of the estate: walkable ground inside the ring road
   * within three cells of it. The plan is the source — the road's own
   * cells say where the ring is, so a wider plan or a different road
   * width moves the band with it. The `perimeter` count uses this, and
   * `?focus=perimeter` uses the bench marks the server sends; neither
   * invents a second copy of the geometry. */
  const perimeterCells = (() => {
    const roads = [];
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (ground.codes[ground.rows[y][x]] === 'road') {
          roads.push([x, y]);
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const cells = new Set();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const code = ground.codes[ground.rows[y][x]];
        if (code === 'road' || code === 'building' || code === 'water') {
          continue;
        }
        let near = false;
        for (let i = 0; i < roads.length && !near; i++) {
          near = Math.abs(x - roads[i][0]) + Math.abs(y - roads[i][1]) <= 3;
        }
        if (near) cells.add(x + ',' + y);
      }
    }
    return cells;
  })();

  /* ------------------------------------------------------------ renderer */

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  /* set every frame from the clock (lightAt's exposure) */
  renderer.toneMappingExposure = Clock.EXPOSURE_DAY;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const maxDim = Math.max(W, H);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(Clock.LIGHT[3].sky);
  /* A tiny generated cube is enough for glass and wet-looking paths; no
   * HDR file to fetch. */
  const skyEnv = makeSkyEnv();
  scene.environment = skyEnv;
  scene.environmentIntensity = 0.55;

  const wallGrain = makeGrainTexture(64, 'brick');
  const groundGrain = makeGrainTexture(64, 'grass');
  const asphaltGrain = makeGrainTexture(64, 'asphalt');
  /* Fog turns the ground past the estate into sky. It starts at 0.8
   * of the estate's size and is whole by 2.2, so the apron is gone into
   * the sky before it reaches the frame's corners (further out, it showed
   * through as a grey-green blotch, a hard world edge), while the blocks
   * themselves — well inside the near distance from the camera's usual
   * framing — stay crisp. Its colour is the sky's every frame, leaned a little toward
   * the ground by day (see updateSky). */
  scene.fog = new THREE.Fog(Clock.LIGHT[3].sky, maxDim * 0.8, maxDim * 2.2);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  /* from the south-east, where both views look in, and high enough to
   * hold the north block row and the open courtyard in front of it, still
   * oblique enough that a block reads as a block and not as a plan */
  camera.position.set(centre.x + 20, centre.y + 38, centre.z + 24);

  const controls = new OrbitControls(camera, canvas);
  if (opts.topView) {
    /* a plan-like view for checking that everything is actually drawn:
     * from ground level a front block legitimately hides the courtyard */
    camera.position.set(centre.x, centre.y + 58, centre.z + 0.01);
  }
  controls.target.copy(centre);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 130;
  controls.minPolarAngle = 0.08;
  /* the camera may look down at the estate but never from below it */
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  /* OrbitControls implements arrow-key panning but only wires the listener
   * when it is asked; connect() installs the pointer and the wheel only. */
  controls.listenToKeyEvents(window);
  controls.update();

  /* -------------------------------------------------------------- lights */

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  /* Tight to the estate: half its diagonal, plus enough for the tallest
   * block's top to fall inside the frustum at a low-ish sun. Everything
   * past the estate is outside the shadow camera, so no shadow can be
   * stretched across the ground behind it. */
  const shadowSpan = Math.hypot(W, H) * 0.5 + 8;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.copy(centre);

  /* shared geometry, so a bench and a roof are the same box */
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const taperGeo = new THREE.CylinderGeometry(0.68, 1, 1, 7);
  const icoGeo = new THREE.IcosahedronGeometry(1, 0);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);

  const dummy = new THREE.Object3D();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* Shared picture state. Domain factories close over `kit` and publish the
   * slots the others read (meshes, benches, the day's weather). */
  const kit = {
    THREE, Walk, Crowd, Clock, Field,
    STEP_H, _c1, _haze, clamp01,
    ground, canvas, opts,
    forcedPhase, clock, staticMode, W, H, centre, grid, perimeterCells,
    renderer, scene, camera, controls,
    hemi, sun,
    wallGrain, groundGrain, asphaltGrain,
    unitBox, cylGeo, taperGeo, icoGeo, sphereGeo,
    dummy, raycaster, ndc,
  };
  Object.assign(kit, createGround(kit));
  Object.assign(kit, createBuildings(kit));
  Object.assign(kit, createSky(kit));
  Object.assign(kit, createFigures(kit));
  Object.assign(kit, createFixtures(kit));
  Object.assign(kit, createResidents(kit));
  Object.assign(kit, createWeather(kit));
  Object.assign(kit, createFocus(kit));

  const {
    paintGround, paintWindows, buildGlow, updateSky,
    buildFixtures, syncFixtures, syncResidents, updateResidents,
    syncWeather, updateWeather,
    pick, focusBench, focusPerimeter, focusCell, routeStats,
    clothMat, pantsMat, headMat, hairMat, lampBulbMat, shopSignMat,
    glowMat, glow,
  } = kit;

  let groundKey = '';
  let lastNow = 0;
  /* Live polls arrive as the night snapshot. Keep that as baseState; when
   * the scrubber is off, the scene follows the clock phase so morning
   * shows the yard and afternoon the courtyard. */
  let baseState = null;
  let scrubIndex = -1;
  let livePhaseName = '';

  function drawState(now) {
    if (!baseState) return null;
    if (scrubIndex >= 0) return phaseView(baseState, scrubIndex);
    const name = Clock.phaseAt(Clock.fraction(clock, now || performance.now())).name;
    livePhaseName = name;
    return phaseByName(baseState, name);
  }

  function paintState(st) {
    if (!st) return;
    kit.weather = st.weather || 'clear';
    const key = st.day + ':' + st.season + ':' + (st.weather || '');
    if (key !== groundKey) {
      groundKey = key;
      paintGround(st);
      buildGlow(st);
    }
    if (!kit.fixturesBuilt) buildFixtures(st);
    syncFixtures(st);
    syncResidents(st);
    syncWeather(st);
    /* who is at home may have changed; the windows are painted here at
     * the hour the last frame drew, and the next frame moves them on if
     * the light has moved a step */
    paintWindows(kit.windowDark);
    kit.occupancyDirty = false;
    lastNow = performance.now();
  }

  function setState(st) {
    clock.haveState = true;
    /* Scrubber overlays arrive with viewPhase; keep the last unframed poll
     * so returning to live can still follow the clock. */
    if (!st.viewPhase) baseState = st;
    else if (!baseState) baseState = st;
    paintState(drawState(performance.now()) || st);
  }

  /* -------------------------------------------------------------- frame */

  const phaseInfo = { phase: 2, index: 2, name: 'afternoon', darkness: 0,
                      dayFrac: 0.5 };
  let windowStep = -1;

  /* Where the day is, 0..1 (clock.js): a frozen phase is shown at its
   * midpoint, which is also its key in the light table (dawn 0.2, morning
   * 0.4, afternoon 0.6, evening 0.8, night 0.0); `?clock=` pins the clock
   * outright; a paused day does not keep turning its light. */
  function dayFraction(now) {
    return Clock.fraction(clock, now);
  }

  function frame(now) {
    const dt = Math.min(0.05, lastNow ? Math.max(0, (now - lastNow) / 1000)
                                      : 0.016);
    lastNow = now;
    const f = dayFraction(now);
    const info = Clock.phaseAt(f);
    /* When live, restage people as the clock crosses a phase boundary so
     * the yard and the courtyard match the light without the scrubber. */
    if (baseState && scrubIndex < 0 && info.name !== livePhaseName) {
      paintState(drawState(now));
    }
    updateSky(f);
    const dark = kit.darkNow;
    /* repaint the windows when the darkness has moved a step, or when who
     * is at home has changed; not once a frame */
    const step = Math.round(dark * kit.WINDOW_STEPS);
    if (step !== windowStep || kit.occupancyDirty) {
      windowStep = step;
      kit.occupancyDirty = false;
      paintWindows(step / kit.WINDOW_STEPS);
    }
    /* people do not become part of the scenery after dark: the same small
     * warm emissive keeps an outside figure legible at night */
    clothMat.emissiveIntensity = 0.08 + dark * 0.38;
    pantsMat.emissiveIntensity = 0.06 + dark * 0.32;
    headMat.emissiveIntensity = 0.05 + dark * 0.30;
    hairMat.emissiveIntensity = 0.04 + dark * 0.22;
    /* Street-lamp bulbs follow each fixture's condition; door bulbs use
     * the shared material and only track darkness. */
    lampBulbMat.emissiveIntensity = 0.05 + dark * 2.6;
    if (typeof kit.tuneLampBulbs === 'function') kit.tuneLampBulbs(dark);
    shopSignMat.emissiveIntensity = 0.1 + dark * 1.8;
    glowMat.opacity = dark * 1.1;
    glow.visible = kit.glowCount > 0 && dark > 0.02;

    updateResidents(now);
    updateWeather(dt, now);
    controls.update();
    renderer.render(scene, camera);
    phaseInfo.phase = info.phase;
    phaseInfo.index = info.index;
    phaseInfo.name = info.name;
    phaseInfo.darkness = dark;
    phaseInfo.dayFrac = f;
    return phaseInfo;
  }

  /* ------------------------------------------------------------- resize */

  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function stateSummary() {
    const people = kit.people;
    /* Who is outdoors, who is between cells (the page glides them, so a
     * changed cell is a person visibly walking this tick), and who is out
     * on the estate's edge. `outside` is everyone not in a flat; the two
     * narrower counts are the ones a screenshot of the perimeter is about. */
    let outside = 0, walking = 0, onPerimeter = 0;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.in) continue;
      outside++;
      if ((p.px != null && p.x !== p.px) ||
          (p.py != null && p.y !== p.py)) walking++;
      if (perimeterCells.has(p.x + ',' + p.y)) onPerimeter++;
    }
    return { residents: people.length,
             buildings: (ground.buildings || []).length,
             benches: kit.benchCount, seated: kit.seatedCount,
             outside, walking, perimeter: onPerimeter };
  }

  /* Which of today's phases the page is showing (-1: the live frame). The
   * light follows it unless the page pinned an hour of its own; the
   * frame itself is the caller's (hud.js `phaseView`). */
  function setPhaseView(i) {
    scrubIndex = i;
    clock.forcedPhase = i >= 0 ? i : forcedPhase;
    if (baseState) paintState(drawState(performance.now()));
  }

  return {
    scene, camera, renderer, controls,
    setState, frame, resize, pick, stateSummary, focusBench, focusPerimeter,
    focusCell, routeStats, setPhaseView,
    phaseIndex: () => phaseInfo.index,
    phaseName: () => phaseInfo.name,
    dayFraction: () => phaseInfo.dayFrac,
    hasState: () => clock.haveState,
    staticMode,
  };
}
