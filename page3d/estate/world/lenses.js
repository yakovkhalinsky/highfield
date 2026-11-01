/* A transparent tint over the ground, one cell per tile, for the field
 * named in `?lens=` (wear, puddle, shade, light). Observation only: the
 * colour comes from lens.js and the snapshot arrays, never from the sim
 * RNG, and nothing here writes sim state. The tint is static for a given
 * snapshot — it does not pulse — so reduced motion has nothing to turn off.
 * L cycles the lens. The label is injected here so hud.js and style.css
 * stay vendored. */
import * as THREE from 'three';
import { TILE_TOP } from './scale.js';
import { LENSES, lensColor, lensFromSearch, nextLens, prevLens } from './lens.js';

const LABEL_STYLE = `
#hf-lens {
  position: fixed;
  z-index: 40;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  pointer-events: none;
  user-select: none;
  font: 12px/1.2 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.04em;
  color: #e9e5dc;
  background: rgba(16, 20, 26, 0.82);
  border: 1px solid rgba(233, 229, 220, 0.14);
  border-radius: 999px;
  padding: 4px 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}
@media (max-width: 760px) {
  #hf-lens { top: auto; bottom: 38vh; }
}
`;

function elementOf(target) {
  let el = target;
  if (el && el.nodeType === 3) el = el.parentElement;
  if (!el || !el.tagName) return null;
  return el;
}

/* L must not leave the seed row or any field the page is typing into. */
function typingTarget(target) {
  const el = elementOf(target);
  if (!el) return false;
  if (typeof el.closest === 'function' && el.closest('#seedIn, .seedrow')) return true;
  const tag = String(el.tagName).toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

function fieldArray(st, kind) {
  if (!st || kind === 'off') return null;
  const field = st[kind];
  if (field == null || typeof field === 'string' || typeof field.length !== 'number') return null;
  return field;
}

function announce(kind) {
  if (typeof document === 'undefined' || !document.body) return;
  let style = document.getElementById('hf-lens-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'hf-lens-style';
    style.textContent = LABEL_STYLE;
    document.body.appendChild(style);
  }
  let label = document.getElementById('hf-lens');
  if (!label) {
    label = document.createElement('div');
    label.id = 'hf-lens';
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    document.body.appendChild(label);
  }
  label.textContent = 'lens ' + kind;
}

export function createLenses(kit) {
  const { scene, W, H } = kit;
  const count = Math.max(0, (W | 0) * (H | 0));
  const group = new THREE.Group();
  group.name = 'lenses';
  group.visible = false;
  scene.add(group);

  const geo = new THREE.PlaneGeometry(1, 1);
  const opacity = new Float32Array(count);
  const opacityAttr = new THREE.InstancedBufferAttribute(opacity, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('lensOpacity', opacityAttr);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    /* The ramp is a measurement, so filmic tone mapping must not squash it. */
    toneMapped: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float lensOpacity;\nvarying float vLensOpacity;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLensOpacity = lensOpacity;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vLensOpacity;',
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vLensOpacity );',
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.raycast = function () {};
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  group.add(mesh);

  if (count > 0) {
    const dummy = new THREE.Object3D();
    const y = TILE_TOP + 0.05;
    const clear = new THREE.Color(0, 0, 0);
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const i = row * W + col;
        dummy.position.set(col + 0.5, y, row + 0.5);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, clear);
        opacity[i] = 0;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    opacityAttr.needsUpdate = true;
  }

  let active = lensFromSearch(typeof location !== 'undefined' ? location.search : '');
  if (LENSES.indexOf(active) < 0) active = 'off';
  let last = null;
  const color = new THREE.Color();

  function paint(st) {
    const field = fieldArray(st, active);
    group.visible = !!field;
    if (!field) return;
    for (let i = 0; i < count; i++) {
      const c = lensColor(active, field[i] || 0);
      color.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
      mesh.setColorAt(i, color);
      opacity[i] = c.a;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    opacityAttr.needsUpdate = true;
  }

  function syncLens(st) {
    last = st || null;
    paint(last);
    /* createWorld runs after the page exists; if the body was not ready
     * yet, the first snapshot still puts the label up. */
    if (typeof document !== 'undefined' && document.body && !document.getElementById('hf-lens')) {
      announce(active);
    }
  }

  function setActive(next) {
    active = LENSES.indexOf(next) >= 0 ? next : 'off';
    announce(active);
    if (last) paint(last);
  }

  if (typeof document !== 'undefined') {
    announce(active);
    document.addEventListener('keydown', (ev) => {
      if (!ev || ev.repeat || ev.isComposing) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.code !== 'KeyL' && ev.key !== 'l' && ev.key !== 'L') return;
      if (typingTarget(ev.target)) return;
      setActive(ev.shiftKey ? prevLens(active) : nextLens(active));
    });
  }

  return { syncLens };
}
