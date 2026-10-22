// Effets magiques : étincelles (pool sur CPU), sort « aurore », éclosion d'une plantation
import * as THREE from 'three';
import { groundY } from './world.js';

const SPARK_VS = /* glsl */`
attribute float aSize, aLife;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vC; varying float vL;
void main(){
  vC = aColor; vL = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aLife > 0.0 ? aSize * uScale / -mv.z : 0.0;
}`;
const SPARK_FS = /* glsl */`
varying vec3 vC; varying float vL;
void main(){
  vec2 p = gl_PointCoord*2.0-1.0; float d = length(p);
  float a = smoothstep(1.0, 0.0, d); a = a*a;
  float star = max(0.0, 1.0 - abs(p.x)*6.0) * max(0.0, 1.0 - abs(p.y)*1.2) + max(0.0, 1.0 - abs(p.y)*6.0) * max(0.0, 1.0 - abs(p.x)*1.2);
  a = max(a, star*0.8) * clamp(vL*1.5, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC*1.5, a);
  #include <colorspace_fragment>
}`;

export class FX {
  constructor(scene, max = 2500) {
    this.scene = scene; this.max = max; this.next = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.size = new Float32Array(max); this.col = new Float32Array(max * 3); this.grav = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    scene.add(this.points);
    this.live = [];
  }

  emit(x, y, z, vx, vy, vz, color, life = 1, size = 0.15, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.size[i] = size; this.grav[i] = grav;
    const c = color.isColor ? color : new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
  }

  burst(x, y, z, color, n = 40, speed = 1.5, life = 1.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2, s = speed * (0.4 + Math.random());
      this.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * 1.4, Math.sin(a) * Math.cos(e) * s, color, life * (0.6 + Math.random() * 0.6), 0.12 + Math.random() * 0.12, -1.2);
    }
  }

  // Sort « aurore » (E) : colonne de lumière, anneau au sol et spirale d'étincelles
  aurora(x, z, color) {
    const y = groundY(x, z), c = new THREE.Color(color);
    for (let i = 0; i < 160; i++) {
      const a = i * 0.39, r = 0.4 + (i % 20) * 0.03;
      this.emit(x + Math.cos(a) * r, y + 0.1 + i * 0.012, z + Math.sin(a) * r, -Math.sin(a) * 1.2, 1.6 + Math.random() * 1.5, Math.cos(a) * 1.2, i % 3 ? c : new THREE.Color('#ffffff'), 1.6 + Math.random() * 0.8, 0.14 + Math.random() * 0.14, -0.2);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.06, z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 24, 1, true), new THREE.ShaderMaterial({
      uniforms: { uC: { value: c }, uA: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec2 vUv; void main(){ float a = (1.0-vUv.y)*(1.0-vUv.y)*uA*0.55; gl_FragColor = vec4(uC*1.4, a); }',
    }));
    col.position.set(x, y + 3.5, z);
    this.scene.add(ring, col);
    this.live.push({ t: 0, dur: 2.2, tick: (k) => {
      const s = 1 + k * 5; ring.scale.set(s, s, 1); ring.material.opacity = 0.9 * (1 - k);
      col.material.uniforms.uA.value = Math.sin(Math.min(1, k * 1.4) * Math.PI);
    }, end: () => { this.scene.remove(ring, col); ring.geometry.dispose(); ring.material.dispose(); col.geometry.dispose(); col.material.dispose(); } });
  }

  plantPuff(x, y, z, color) {
    this.burst(x, y + 0.3, z, color, 50, 1.2, 1.3);
    this.burst(x, y + 0.3, z, '#fff6c8', 20, 0.8, 1.0);
  }

  update(dt, viewportH, pixelRatio) {
    this.mat.uniforms.uScale.value = viewportH * pixelRatio * 0.5;
    const p = this.pos, v = this.vel, L = this.life;
    for (let i = 0; i < this.max; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      v[i * 3 + 1] += this.grav[i] * dt;
      v[i * 3] *= 0.985; v[i * 3 + 1] *= 0.985; v[i * 3 + 2] *= 0.985;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]; e.t += dt; const k = Math.min(1, e.t / e.dur);
      e.tick(k); if (k >= 1) { e.end(); this.live.splice(i, 1); }
    }
  }
}
