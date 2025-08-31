// portals.iife.js — IIFE (aucun import). Utilise THREE global + expose PortalManager sur window.
// Prérequis dans index.html (IIFE uniquement) :
// <script src="./libs/three.min.js"></script>
// <script src="./libs/examples/js/controls/PointerLockControls.js"></script>
// <script src="./scripts/portals.iife.js"></script>

(function () {
  class PortalManager {
    constructor(scene, camera, domEl, { jsonUrl = 'portals.json', basePath = null } = {}) {
      this.scene = scene;
      this.camera = camera;
      this.domEl = domEl;
      this.jsonUrl = jsonUrl;
      this.basePath = basePath; // si null, auto-détection

      this.group = new THREE.Group();
      this.group.name = 'PortalsRoot';
      scene.add(this.group);

      this.raycaster = new THREE.Raycaster();
      this.mouseNdc = new THREE.Vector2();
      this.portals = [];
      this.hovered = null;

      this._onPointerMove = this._onPointerMove.bind(this);
      this._onClick = this._onClick.bind(this);
      domEl.addEventListener('pointermove', this._onPointerMove);
      domEl.addEventListener('click', this._onClick);

      this.domEl.style.cursor = 'auto';
    }

    async load() {
      const res = await fetch(this.jsonUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Impossible de charger ${this.jsonUrl}`);
      const items = await res.json();
      for (const item of items) {
        const portal = await this._createPortal(item);
        this.group.add(portal.root);
        this.portals.push(portal);
      }
    }

    dispose() {
      this.domEl.removeEventListener('pointermove', this._onPointerMove);
      this.domEl.removeEventListener('click', this._onClick);
      for (const p of this.portals) {
        p.texture && p.texture.dispose?.();
        if (p.sphere) {
          p.sphere.material?.map?.dispose?.();
          p.sphere.material?.dispose?.();
          p.sphere.geometry?.dispose?.();
        }
        p.ring?.material?.dispose?.();
        p.ring?.geometry?.dispose?.();
        if (p.label) {
          p.label.material?.map?.dispose?.();
          p.label.material?.dispose?.();
        }
      }
      this.scene.remove(this.group);
    }

    async _createPortal(cfg) {
      const {
        id,
        title = '',
        description = '',
        image,                 // texture mappée sur la sphère
        url,
        position = [0, 0, 0],
        radius = 1.2,
        particleColor = '#66ccff',
        autoElevate = true,
        clearance = 0.3,       // espace entre sol et bas de sphère
        spin = 0.25,           // rotation lente (rad/s)
        // Ondulation (vaguelettes)
        waveAmp = Math.max(0.02, 0.04 * radius), // amplitude (unités monde)
        waveFreq = 3.0,        // fréquence spatiale
        waveSpeed = 1.2,       // vitesse temporelle
        sphereOpacity = 0.85   // transparence de la sphère
      } = cfg;

      // Texture SRGB + anisotropy
      const texture = await new Promise((ok, ko) => {
        new THREE.TextureLoader().load(image, ok, undefined, () => ko(new Error(`Texture load failed: ${image}`)));
      });
      texture.anisotropy = 8;
      texture.colorSpace = THREE.SRGBColorSpace;

      // === ShaderMaterial pour vaguelettes === (Lambert-ish simple)
      const uniforms = {
        uTime:      { value: 0 },
        uMap:       { value: texture },
        uOpacity:   { value: sphereOpacity },
        uWaveAmp:   { value: waveAmp },
        uWaveFreq:  { value: waveFreq },
        uWaveSpeed: { value: waveSpeed },
        uLightDir:  { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
        uAmbient:   { value: 0.35 }
      };

      const vertexShader = `
        uniform float uTime, uWaveAmp, uWaveFreq, uWaveSpeed;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vPosW;

        float wave(vec3 p) {
          float w1 = sin((p.y + p.x) * uWaveFreq + uTime * uWaveSpeed);
          float w2 = sin((p.y + p.z) * (uWaveFreq * 1.21) - uTime * (uWaveSpeed * 0.83));
          return (w1 * 0.6 + w2 * 0.4);
        }

        void main() {
          vUv = uv;
          vec3 pos = position;
          float w = wave(normalize(position));
          pos += normal * (uWaveAmp * w);

          vPosW = (modelMatrix * vec4(pos, 1.0)).xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `;

      const fragmentShader = `
        uniform sampler2D uMap;
        uniform float uOpacity, uAmbient;
        uniform vec3 uLightDir;
        varying vec2 vUv;
        varying vec3 vNormalW;

        void main() {
          vec3 base = texture2D(uMap, vUv).rgb;
          float ndl = max(dot(normalize(vNormalW), normalize(uLightDir)), 0.0);
          float light = clamp(uAmbient + ndl, 0.0, 1.0);
          gl_FragColor = vec4(base * light, uOpacity);
        }
      `;

      const sphereMat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,   // évite conflits avec ring/label
        depthTest: true
      });

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 64, 48),
        sphereMat
      );
      sphere.name = `PortalSphere:${id}`;
      sphere.renderOrder = 1; // derrière ring/label

      // Anneau de particules (glow au-dessus)
      const ring = this._makeParticleRing(radius * 1.15, particleColor);
      ring.renderOrder = 2;
      ring.material.transparent = true;
      ring.material.blending = THREE.AdditiveBlending;
      ring.material.depthWrite = false;
      ring.material.depthTest = false;

      // Label (toujours lisible)
      const label = this._makeRichLabel({ title, description, maxWidthPx: 520 });
      if (label) {
        label.material.depthTest = false;
        label.material.depthWrite = false;
        label.renderOrder = 3;
        label.position.set(0, radius + 0.55, 0);
      }

      // Racine + position hors sol
      const root = new THREE.Group();
      root.name = `Portal:${id}`;
      const [px, py = 0, pz] = position;
      const desiredY = radius + clearance;      // bas de sphère à y = clearance
      const yFinal = autoElevate ? Math.max(py, desiredY) : py;
      root.position.set(px, yFinal, pz);

      root.add(sphere);
      root.add(ring);
      if (label) root.add(label);

      return {
        id, url, title, description,
        root, sphere, ring, label,
        texture, radius,
        spinSpeed: spin,
        uniforms,
        urlRaw: url // stock brut pour résolution au clic
      };
    }

    // ----- Helpers -----
    _makeParticleRing(r, colorHex, count = 250) {
      const inner = r * 0.9, outer = r * 1.15;
      const positions = new Float32Array(count * 3);
      const angles = new Float32Array(count);
      const radii = new Float32Array(count);
      const yspread = r * 0.15;

      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = inner + Math.random() * (outer - inner);
        positions[i * 3 + 0] = Math.cos(a) * rr;
        positions[i * 3 + 1] = (Math.random() - 0.5) * yspread;
        positions[i * 3 + 2] = Math.sin(a) * rr;
        angles[i] = a;
        radii[i] = rr;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
      geo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));

      const mat = new THREE.PointsMaterial({
        size: 0.06,
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.9
      });

      const points = new THREE.Points(geo, mat);
      points.userData = { spin: (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? 1 : -1) };
      return points;
    }

    _wrapText(ctx, text, maxWidth) {
      const words = (text || '').split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      return lines;
    }

    _makeRichLabel({ title = '', description = '', maxWidthPx = 520 }) {
      const hasTitle = !!title.trim(), hasDesc = !!description.trim();
      if (!hasTitle && !hasDesc) return null;

      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      const padX = 18, padY = 14, titleSize = 36, descSize = 22, lineGap = 6, blockGap = hasTitle && hasDesc ? 8 : 0;

      ctx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const titleLines = hasTitle ? this._wrapText(ctx, title, maxWidthPx) : [];
      ctx.font = `400 ${descSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const descLines = hasDesc ? this._wrapText(ctx, description, maxWidthPx) : [];

      const measure = (font, lines) => { ctx.font = font; return Math.max(...lines.map(l => ctx.measureText(l).width), 0); };
      const contentW = Math.max(
        hasTitle ? measure(`700 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`, titleLines) : 0,
        hasDesc ? measure(`400 ${descSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`, descLines) : 0,
        1
      );
      const titleH = hasTitle ? titleLines.length * (titleSize + lineGap) - lineGap : 0;
      const descH = hasDesc ? descLines.length * (descSize + lineGap) - lineGap : 0;

      c.width = Math.ceil(contentW + padX * 2);
      c.height = Math.ceil(titleH + descH + blockGap + padY * 2);

      const ctx2 = c.getContext('2d');
      const r = 16;
      ctx2.fillStyle = 'rgba(0,0,0,0.55)';
      ctx2.beginPath();
      ctx2.moveTo(r, 0);
      ctx2.lineTo(c.width - r, 0);
      ctx2.quadraticCurveTo(c.width, 0, c.width, r);
      ctx2.lineTo(c.width, c.height - r);
      ctx2.quadraticCurveTo(c.width, c.height, c.width - r, c.height);
      ctx2.lineTo(r, c.height);
      ctx2.quadraticCurveTo(0, c.height, 0, c.height - r);
      ctx2.lineTo(0, r);
      ctx2.quadraticCurveTo(0, 0, r, 0);
      ctx2.closePath();
      ctx2.fill();

      let y = padY;
      if (hasTitle) {
        ctx2.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx2.fillStyle = '#fff';
        ctx2.textBaseline = 'top';
        for (const line of titleLines) { ctx2.fillText(line, padX, y); y += titleSize + lineGap; }
        y += blockGap;
      }
      if (hasDesc) {
        ctx2.font = `400 ${descSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx2.fillStyle = '#e7e7e7';
        ctx2.textBaseline = 'top';
        for (const line of descLines) { ctx2.fillText(line, padX, y); y += descSize + lineGap; }
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      spr.scale.set(c.width * 0.0032, c.height * 0.0032, 1);
      spr.userData.isLabel = true;
      return spr;
    }

    _detectBasePath() {
      // 1) <base href="...">
      const baseEl = document.querySelector('base[href]');
      if (baseEl) {
        try {
          const p = new URL(baseEl.getAttribute('href'), location.origin).pathname;
          return p.endsWith('/') ? p : p + '/';
        } catch {}
      }
      // 2) GitHub Pages project site: origin + '/<repo>/...'
      const segs = location.pathname.split('/').filter(Boolean);
      if (segs.length > 0) return '/' + segs[0] + '/';
      // 3) user/org site ou racine locale
      return '/';
    }

    _resolveUrl(url) {
      if (!url) return location.href;
      if (/^https?:\/\//i.test(url)) return url;          // absolue
      if (url.startsWith('/')) return location.origin + url; // absolue depuis racine
      const base = (this.basePath ?? this._detectBasePath());
      const normalized = base.endsWith('/') ? base : base + '/';
      return location.origin + normalized + url.replace(/^\/+/, '');
    }

    update(dt) {
      for (const p of this.portals) {
        // label face caméra
        if (p.label) p.label.quaternion.copy(this.camera.quaternion);

        // temps shader (vagues)
        if (p.uniforms) p.uniforms.uTime.value += dt;

        // rotation décorative
        if (p.sphere && p.spinSpeed) p.sphere.rotation.y += p.spinSpeed * dt;

        // orbite des particules
        if (p.ring?.geometry) {
          const pos = p.ring.geometry.attributes.position.array;
          const a = p.ring.geometry.attributes.aAngle.array;
          const rad = p.ring.geometry.attributes.aRadius.array;
          const count = a.length;
          const speed = (p.ring.userData.spin || 1) * dt * 0.8;
          for (let i = 0; i < count; i++) {
            a[i] += speed * (0.6 + (i % 7) * 0.03);
            pos[i * 3 + 0] = Math.cos(a[i]) * rad[i];
            pos[i * 3 + 2] = Math.sin(a[i]) * rad[i];
          }
          p.ring.geometry.attributes.position.needsUpdate = true;
          p.ring.rotation.y += speed * 0.3;
        }
      }
    }

    _screenToNdc(e) {
      const rect = this.domEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.mouseNdc.set(x, y);
    }

    _intersectPortals() {
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const meshes = this.portals.map(p => p.sphere).filter(Boolean);
      const hits = this.raycaster.intersectObjects(meshes, true);
      if (!hits.length) return null;
      const sphere = hits[0].object;
      return this.portals.find(p => p.sphere === sphere) || null;
    }

    _onPointerMove(e) {
      this._screenToNdc(e);
      const hit = this._intersectPortals();
      this.hovered = hit;
      this.domEl.style.cursor = hit ? 'pointer' : 'auto';
    }

    _onClick(e) {
      this._screenToNdc(e);
      const hit = this._intersectPortals();
      if (hit && hit.urlRaw) {
        const to = this._resolveUrl(hit.urlRaw);
        window.location.href = to;
      }
    }
  }

  window.PortalManager = PortalManager;
})();

