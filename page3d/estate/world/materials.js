/* Surface helpers for the Highfield visual fork: canvas grain, triplanar
 * multiply, and a cheap sky cubemap for glass reflections. */
import * as THREE from 'three';

/* A small canvas grain used as a triplanar albedo multiply — no image
 * assets, still one draw call per material. */
export function makeGrainTexture(size, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      let v;
      if (kind === 'brick') {
        const bx = Math.floor(x / 8), by = Math.floor(y / 4);
        const odd = by & 1;
        const lx = (x + (odd ? 4 : 0)) % 8, ly = y % 4;
        const mortar = lx === 0 || ly === 0;
        const n = ((bx * 37 + by * 91) & 255) / 255;
        v = mortar ? 48 : 140 + Math.floor(n * 70);
      } else if (kind === 'asphalt') {
        const n = ((x * 13 + y * 47) ^ (x * y * 3)) & 255;
        v = 90 + (n % 50);
      } else {
        /* lawn / path / canopy: soft mottling */
        const n = ((x * 19 + y * 57) ^ ((x + y) * 13)) & 255;
        const n2 = ((x * 7 + y * 31) ^ (x * 3)) & 255;
        v = 100 + ((n + n2) % 90);
      }
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* Multiply diffuse by a world-space triplanar sample so stretched unit
 * boxes and instanced tiles keep a stable grain. */
export function applyTriplanar(mat, tex, scale) {
  const key = 'tri|' + scale;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTriMap = { value: tex };
    shader.uniforms.uTriScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;'
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n' +
        'vTriPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;\n' +
        'vTriNor = normalize( mat3( modelMatrix ) * objectNormal );'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
        'uniform sampler2D uTriMap;\n' +
        'uniform float uTriScale;\n' +
        'varying vec3 vTriPos;\n' +
        'varying vec3 vTriNor;\n' +
        'vec3 triplanarColor( sampler2D map, vec3 pos, vec3 nor, float sc ) {\n' +
        '  vec3 n = abs( normalize( nor ) );\n' +
        '  n /= ( n.x + n.y + n.z + 1e-4 );\n' +
        '  vec3 cx = texture2D( map, pos.zy * sc ).rgb;\n' +
        '  vec3 cy = texture2D( map, pos.xz * sc ).rgb;\n' +
        '  vec3 cz = texture2D( map, pos.xy * sc ).rgb;\n' +
        '  return cx * n.x + cy * n.y + cz * n.z;\n' +
        '}'
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n' +
        'vec3 tri = triplanarColor( uTriMap, vTriPos, vTriNor, uTriScale );\n' +
        'diffuseColor.rgb *= mix( vec3( 0.78 ), vec3( 1.18 ), tri.r );'
      );
  };
  mat.customProgramCacheKey = () => key;
}

export function makeSkyEnv() {
  const s = 24;
  function face(top, bot) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bot);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }
  const zenith = '#7ea8c8', horizon = '#c9d6b8', ground = '#6a7360';
  const tex = new THREE.CubeTexture([
    face(zenith, horizon), face(zenith, horizon),
    face('#a8c8e0', zenith), face(horizon, ground),
    face(zenith, horizon), face(zenith, horizon),
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
