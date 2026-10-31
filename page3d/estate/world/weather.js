/* Rain streaks and snow for the Highfield visual fork. */
import * as THREE from 'three';

export function createWeather(kit) {
  const { scene, W, H, tileMat, paneMat } = kit;

  /* ------------------------------------------------------------- weather */

  /* Rain is drawn as short vertical line segments rather than points. A
   * point sprite the size of a raindrop is a star, and a night sky full of
   * stars on a rainy day is a lie about the weather. One LineSegments is
   * still one draw call. Snow keeps the points, because a flake is a
   * point. */
  const RAIN_MAX = 1500, SNOW_MAX = 700;
  const rainPos = new Float32Array(RAIN_MAX * 6);
  for (let i = 0; i < RAIN_MAX; i++) {
    const x = Math.random() * (W + 4) - 2;
    const y = Math.random() * 16;
    const z = Math.random() * (H + 4) - 2;
    const j = i * 6;
    rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z;
    rainPos[j + 3] = x; rainPos[j + 4] = y - 0.55; rainPos[j + 5] = z;
  }
  const rainGeo = new THREE.BufferGeometry();
  const rainAttr = new THREE.BufferAttribute(rainPos, 3);
  rainGeo.setAttribute('position', rainAttr);
  rainGeo.setDrawRange(0, 0);
  const rainMat = new THREE.LineBasicMaterial({
    color: 0x9fd0ff, transparent: true, opacity: 0.48, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  const snowPos = new Float32Array(SNOW_MAX * 3);
  for (let i = 0; i < SNOW_MAX; i++) {
    snowPos[i * 3] = Math.random() * (W + 4) - 2;
    snowPos[i * 3 + 1] = Math.random() * 16;
    snowPos[i * 3 + 2] = Math.random() * (H + 4) - 2;
  }
  const snowGeo = new THREE.BufferGeometry();
  const snowAttr = new THREE.BufferAttribute(snowPos, 3);
  snowGeo.setAttribute('position', snowAttr);
  snowGeo.setDrawRange(0, 0);
  const snowMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.115, transparent: true, opacity: 0.85,
    depthWrite: false, sizeAttenuation: true });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.visible = false;
  scene.add(snow);

  let rainAmount = 0, snowAmount = 0;

  function syncWeather(st) {
    const weather = st.weather || 'clear';
    rainAmount = weather === 'rain' ? 800 : weather === 'storm' ? RAIN_MAX : 0;
    /* Frost is mainly white ground; a light flake accent, not a blizzard. */
    snowAmount = weather === 'frost' ? Math.min(180, SNOW_MAX) : 0;
    rainGeo.setDrawRange(0, rainAmount * 2);
    snowGeo.setDrawRange(0, snowAmount);
    rain.visible = rainAmount > 0;
    snow.visible = snowAmount > 0;
    /* wet paving picks up the sky env; frost stays matte */
    const wet = weather === 'rain' || weather === 'storm';
    tileMat.roughness = wet ? 0.42 : weather === 'frost' ? 0.98 : 0.96;
    tileMat.metalness = wet ? 0.12 : 0.0;
    paneMat.roughness = wet ? 0.08 : 0.18;
  }

  function updateWeather(dt, now) {
    if (rainAmount) {
      const fall = 12 * dt;
      for (let i = 0; i < rainAmount; i++) {
        const j = i * 6;
        rainPos[j + 1] -= fall;
        rainPos[j + 4] = rainPos[j + 1] - 0.55;
        if (rainPos[j + 1] < 0) {
          const x = Math.random() * (W + 4) - 2;
          const z = Math.random() * (H + 4) - 2;
          rainPos[j] = x; rainPos[j + 1] = 16; rainPos[j + 2] = z;
          rainPos[j + 3] = x; rainPos[j + 4] = 15.45; rainPos[j + 5] = z;
        }
      }
      rainAttr.needsUpdate = true;
    }
    if (snowAmount) {
      for (let i = 0; i < snowAmount; i++) {
        const j = i * 3;
        snowPos[j + 1] -= 1.3 * dt;
        snowPos[j] += Math.sin(now * 0.001 + i * 0.7) * 0.006;
        if (snowPos[j + 1] < 0) {
          snowPos[j] = Math.random() * (W + 4) - 2;
          snowPos[j + 1] = 16;
          snowPos[j + 2] = Math.random() * (H + 4) - 2;
        }
      }
      snowAttr.needsUpdate = true;
    }
  }

  return { syncWeather, updateWeather };
}
