/* In-world event tags (V2). Words on a plaque above the cell the fact
 * belongs to. The snapshot owns the list; this file only draws it, and
 * fades a plaque across one phase of the pace clock. Reduced motion keeps
 * the plaque fully readable instead of animating it. */
import * as THREE from 'three';
import { TILE_TOP } from './scale.js';

function reducedMotion() {
  return typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function plaque(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(16, 20, 26, 0.92)';
  g.fillRect(4, 8, 376, 80);
  g.strokeStyle = '#ffca7a';
  g.lineWidth = 3;
  g.strokeRect(4, 8, 376, 80);
  g.fillStyle = '#f4efe4';
  g.font = '600 36px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 192, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTags(kit) {
  const group = new THREE.Group();
  kit.scene.add(group);
  const sprites = new Map();
  const born = new Map();
  const reduce = reducedMotion();

  function syncTags(st, now) {
    if (typeof document === 'undefined') return;
    const tags = (st && st.tags) || [];
    const live = new Set();
    tags.forEach((t) => {
      if (!t || t.id == null) return;
      live.add(t.id);
      let sprite = sprites.get(t.id);
      if (!sprite) {
        const mat = new THREE.SpriteMaterial({
          map: plaque(String(t.label || '')),
          transparent: true,
          depthTest: false,
        });
        sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.4, 0.6, 1);
        sprite.position.set(Number(t.x) + 0.5, TILE_TOP + 2.6, Number(t.y) + 0.5);
        sprite.renderOrder = 10;
        group.add(sprite);
        sprites.set(t.id, sprite);
        born.set(t.id, now);
      }
    });
    for (const [id, sprite] of sprites) {
      if (live.has(id)) continue;
      group.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
      sprites.delete(id);
      born.delete(id);
    }
    fadeTags(st, now);
  }

  function fadeTags(st, now) {
    const phaseMs = Math.max(800, ((Number(st && st.tick_seconds) || 20) / 5) * 1000);
    for (const [id, sprite] of sprites) {
      if (reduce) { sprite.material.opacity = 1; continue; }
      const age = Math.max(0, now - (born.get(id) || now));
      sprite.material.opacity = Math.max(0.55, 1 - age / phaseMs);
    }
  }

  return { syncTags, fadeTags };
}
