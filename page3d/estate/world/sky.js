/* Daylight, weather tint and the lamp-light field for the Highfield visual fork. */
import * as THREE from 'three';
import { TILE_TOP, WEATHER_SKY, SUN_MIN_Y } from './scale.js';

export function createSky(kit) {
  const { scene, W, H, Field, Clock, sun, hemi, renderer, centre, _c1 } = kit;

  /* ---------------------------------------------------------- lamplight */

  /* The lamps' light is a field, not a set of objects: the engine sends a
   * value per cell (0-9) and that is what is drawn. It used to be drawn as
   * a flat disc stamped on every lit cell at one opacity, which read as a
   * grid of hard-edged circles rather than pools of light. Now the field is
   * baked into one texture: a cell per pixel, scaled up with smoothing and
   * blurred, so the light is brightest under the lamp, fades to nothing at
   * its reach, and two lamps' pools merge where they overlap. It lies on
   * the ground as one plane, added to whatever is under it, and `dark`
   * scales it, so it comes up through the dusk with the windows. */
  const GLOW_PX = 16;                 // texture pixels per tile
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = W * GLOW_PX;
  glowCanvas.height = H * GLOW_PX;
  const glowCells = document.createElement('canvas');
  glowCells.width = W;
  glowCells.height = H;
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.NoColorSpace;  // an amount of light, not a colour
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.generateMipmaps = false;
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffbf66, map: glowTex, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glowGeo = new THREE.PlaneGeometry(W, H);
  glowGeo.rotateX(-Math.PI / 2);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(W / 2, TILE_TOP + 0.02, H / 2);
  glow.renderOrder = 2;
  glow.visible = false;
  scene.add(glow);

  /* the painting itself is `field.js`, shared with the grove's view */
  const glowPainter = Field.makePainter(W, H, GLOW_PX, glowCanvas, glowCells);
  kit.glowCount = 0;
  function buildGlow(st) {
    const r = glowPainter.paint((st && st.light) || []);
    if (!r.changed) return;            // the field changes when a lamp does
    glowTex.needsUpdate = true;
    kit.glowCount = r.lit;
  }

  /* ------------------------------------------------------------ the sky */

  const skyColour = new THREE.Color();
  const sunColour = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  kit.weather = 'clear';
  kit.darkNow = 0;

  /* The whole sky from one number: the day's fraction. The keyframes and
   * the easing are `clock.js`; this only writes the result into the light
   * objects and the sky. Nothing here allocates: the colours and the light
   * objects are the ones made above. */
  function updateSky(dayFrac) {
    const l = Clock.lightAt(dayFrac);

    sun.intensity = l.sunI;
    hemi.intensity = l.hemiI;
    sunColour.setRGB(l.sun[0], l.sun[1], l.sun[2]);
    sun.color.copy(sunColour);
    skyColour.setRGB(l.sky[0], l.sky[1], l.sky[2]);
    hemiSky.setRGB(l.hemiSky[0], l.hemiSky[1], l.hemiSky[2]);
    hemiGround.setRGB(l.hemiGround[0], l.hemiGround[1], l.hemiGround[2]);
    const darkNow = l.dark;
    kit.darkNow = darkNow;

    /* the weather is a property of the sky, so it greys the sky itself
     * (and the fog, which is the same colour) rather than only dimming
     * the ground. It fades out at night, where every sky is dark anyway. */
    const wt = WEATHER_SKY[kit.weather];
    if (wt) {
      _c1.setHex(wt.hex);
      skyColour.lerp(_c1, wt.mix * (1 - darkNow));
      sun.intensity *= wt.sun;
    }

    hemi.color.copy(hemiSky);
    hemi.groundColor.copy(hemiGround);
    scene.background.copy(skyColour);
    /* the horizon a little below the sky's value by day, so the estate
     * sits on the ground rather than floating; at night the fog is the
     * night sky's own colour (clock.js fogGroundMix) */
    scene.fog.color.copy(skyColour)
      .lerp(hemiGround, Clock.fogGroundMix(darkNow));
    renderer.toneMappingExposure = l.exposure;

    /* the sun's arc: east and high at dawn, overhead by morning, west and
     * low by evening, then the moon's blue from the north. The floor on
     * the elevation is the shadow camera's, not the sky's — see SUN_MIN_Y */
    sun.position.set(
      centre.x + l.offset[0],
      Math.max(SUN_MIN_Y, l.offset[1]),
      centre.z + l.offset[2]);
  }

  kit.glow = glow;
  kit.glowMat = glowMat;
  return { updateSky, buildGlow };
}
