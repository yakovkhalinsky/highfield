/* Ground tiles and the fading apron for the Highfield visual fork. */
import * as THREE from 'three';
import { SEASONS, SITE_COLOUR } from './scale.js';
import { applyTriplanar } from './materials.js';

export function createGround(kit) {
  const { scene, ground, W, H, dummy, groundGrain, _c1, _haze, clamp01 } = kit;

  /* -------------------------------------------------------------- ground */

  const siteColourCache = {};
  function fallbackSiteColour(site) {
    if (siteColourCache[site] !== undefined) return siteColourCache[site];
    let h = 0;
    for (let i = 0; i < site.length; i++) h = (h * 31 + site.charCodeAt(i)) | 0;
    _c1.setHSL((h >>> 0) % 360 / 360, 0.26, 0.42);
    siteColourCache[site] = _c1.getHex();
    return siteColourCache[site];
  }

  /* The ground outside the estate. It is an apron that fades to nothing —
   * and therefore to the sky behind it — a little way past the last tile,
   * rather than a plane large enough to fill the frame. It takes no
   * shadows: a building's shadow belongs on the estate's paving, and a
   * shadow stretched across this apron was the dark rectangle the low sun
   * used to throw into the background. The alpha is computed once from the
   * estate rectangle, so the fade has a constant width on every side. */
  const baseW = W + 120, baseH = H + 120;
  const FADE_IN = 1.5, FADE_OUT = 21, FADE_TEX = 256;
  const fadeCanvas = document.createElement('canvas');
  fadeCanvas.width = fadeCanvas.height = FADE_TEX;
  const fadeCtx = fadeCanvas.getContext('2d');
  const fadeImg = fadeCtx.createImageData(FADE_TEX, FADE_TEX);
  for (let py = 0; py < FADE_TEX; py++) {
    for (let px = 0; px < FADE_TEX; px++) {
      const wx = ((px + 0.5) / FADE_TEX - 0.5) * baseW + W / 2;
      const wz = ((py + 0.5) / FADE_TEX - 0.5) * baseH + H / 2;
      const dx = Math.max(0, -wx, wx - W);
      const dz = Math.max(0, -wz, wz - H);
      const t = clamp01((Math.hypot(dx, dz) - FADE_IN) /
                        (FADE_OUT - FADE_IN));
      const a = 1 - t * t * (3 - 2 * t);
      const o = (py * FADE_TEX + px) * 4;
      fadeImg.data[o] = 255;
      fadeImg.data[o + 1] = Math.round(a * 255);
      fadeImg.data[o + 2] = 255;
      fadeImg.data[o + 3] = 255;
    }
  }
  fadeCtx.putImageData(fadeImg, 0, 0);
  const fadeTex = new THREE.CanvasTexture(fadeCanvas);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x66735c, roughness: 1, transparent: true,
    alphaMap: fadeTex, depthWrite: false });
  const base = new THREE.Mesh(new THREE.PlaneGeometry(baseW, baseH), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.set(W / 2, -0.03, H / 2);
  base.receiveShadow = false;
  scene.add(base);

  const tileGeo = new THREE.BoxGeometry(1, 0.14, 1);
  const tileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.96, metalness: 0.0,
  });
  applyTriplanar(tileMat, groundGrain, 0.85);
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, W * H);
  tiles.receiveShadow = true;
  tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  scene.add(tiles);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const site = ground.codes[ground.rows[y][x]];
      dummy.position.set(x + 0.5, site === 'water' ? -0.01 : 0.05, y + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
    }
  }

  function paintGround(st) {
    const season = Math.max(0, Math.min(3, (st && st.season) || 0));
    const pal = SEASONS[season];
    const shade = (st && st.shade) || null;
    const wear = (st && st.wear) || null;
    const puddle = (st && st.puddle) || null;
    const frost = (st && st.weather) === 'frost';
    const heat = (st && st.weather) === 'heat';
    /* the apron is the same living ground, muted and hazed so it reads as
     * distance rather than as a second, flatter estate */
    _c1.setHex(pal.lawn).lerp(_haze, 0.38).multiplyScalar(0.84);
    if (frost) _c1.lerp(new THREE.Color(0xe8eef2), 0.55);
    if (heat) _c1.lerp(new THREE.Color(0xe8cfa0), 0.22);
    baseMat.color.copy(_c1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const site = ground.codes[ground.rows[y][x]];
        let hex = SITE_COLOUR[site];
        if (hex === undefined) hex = fallbackSiteColour(site);
        if (site === 'lawn') hex = pal.lawn;
        else if (site === 'play') hex = pal.play;
        else if (site === 'path') hex = pal.path;
        else if (site === 'water') hex = pal.water;
        let f = 1;
        if (shade) f -= Math.min(0.45, (shade[i] || 0) * 0.05);
        if (site === 'building') f = 1.08;
        _c1.setHex(hex).multiplyScalar(f);
        /* Frost: the estate wakes white — whiten living ground, leave water. */
        if (frost && site !== 'water' && site !== 'building' && site !== 'road') {
          _c1.lerp(new THREE.Color(0xe8eef2), site === 'lawn' || site === 'play' ? 0.72 : 0.4);
        }
        if (heat && site !== 'water' && site !== 'building') {
          _c1.lerp(new THREE.Color(0xe0c080), 0.18);
        }
        /* Wear darkens paths; puddles cool and darken paving. */
        if (wear && (site === 'path' || site === 'road')) {
          _c1.multiplyScalar(1 - Math.min(0.35, (wear[i] || 0) * 0.04));
        }
        if (puddle && (puddle[i] || 0) > 0 && site !== 'water' && site !== 'building') {
          _c1.lerp(new THREE.Color(0x4a6a7a), Math.min(0.55, (puddle[i] || 0) * 0.07));
        }
        tiles.setColorAt(i, _c1);
      }
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  }

  paintGround(null);

  kit.tiles = tiles;
  kit.tileMat = tileMat;
  kit.fallbackSiteColour = fallbackSiteColour;
  return { paintGround };
}
