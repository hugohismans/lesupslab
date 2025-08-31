// hall_of_fame.iife.js — IIFE (aucun import). Utilise THREE global + expose HallOfFame sur window.
// Prérequis : <script src="./libs/three.min.js"></script>

(function () {
  class HallOfFame {
    constructor(
      scene,
      camera,
      domEl,
      {
        jsonUrl = 'hof.json',

        // ----- Grille -----
        gridCols = 4,
        spacingX = 2.0,
        spacingY = 2.4,
        anchor = new THREE.Vector3(0, 40, 40), // centre de la 1ère rangée (haut)

        rowDir = new THREE.Vector3(1, 0, 0), // X→ droite
        colDir = new THREE.Vector3(0, -1, 0), // Y→ bas

        // ----- Mur de galerie -----
        enableWall = true,
        wallWidth = 12,
        wallHeight = 4,
        wallThickness = 0.2,     // assez épais pour être bien opaque de dos
        wallColor = 0x402200,    // blanc cassé
        wallZBack = -0.06,       // le mur est légèrement derrière les cadres
        wallRoughness = 0.9,
        wallMetalness = 0.0,

        // ----- Titre mural -----
        showTitle = true,
        titleText = 'HALL OF FAME',
        titleMarginTop = 0.25,   // marge sous le bord supérieur du mur
        titleMaxWidth = 0.65,    // proportion de largeur du mur (0..1)

        // ----- Éclairage galerie -----
        enableGalleryLights = true,
        ambientIntensity = 0.25,
        spotIntensity = 1.2,
        spotAngleDeg = 28,
        spotPenumbra = 0.6,
        spotY = 3.4,
        spotOffsetX = 3.4,
        spotWarm = 0xfff2de,
        spotCool = 0xdee9ff
      } = {}
    ) {
      this.scene = scene;
      this.camera = camera;
      this.domEl = domEl;
      this.jsonUrl = jsonUrl;

      // grille
      this.gridCols = Math.max(1, gridCols | 0);
      this.spacingX = spacingX;
      this.spacingY = spacingY;
      this.anchor = anchor.clone();
      this.rowDir = rowDir.clone().normalize();
      this.colDir = colDir.clone().normalize();

      // mur / lights / titre
      this.enableWall = enableWall;
      this.wallWidth = wallWidth;
      this.wallHeight = wallHeight;
      this.wallThickness = wallThickness;
      this.wallColor = wallColor;
      this.wallZBack = wallZBack;
      this.wallRoughness = wallRoughness;
      this.wallMetalness = wallMetalness;

      this.showTitle = showTitle;
      this.titleText = titleText;
      this.titleMarginTop = titleMarginTop;
      this.titleMaxWidth = titleMaxWidth;

      this.enableGalleryLights = enableGalleryLights;
      this.ambientIntensity = ambientIntensity;
      this.spotIntensity = spotIntensity;
      this.spotAngleDeg = spotAngleDeg;
      this.spotPenumbra = spotPenumbra;
      this.spotY = spotY;
      this.spotOffsetX = spotOffsetX;
      this.spotWarm = spotWarm;
      this.spotCool = spotCool;

      // groupe principal
      this.group = new THREE.Group();
      this.group.name = 'HallOfFame';
      scene.add(this.group);

      // sous-groupes
      this.wallGroup = new THREE.Group();
      this.wallGroup.name = 'HOF_Wall';
      this.framesGroup = new THREE.Group();
      this.framesGroup.name = 'HOF_Frames';
      this.lightsGroup = new THREE.Group();
      this.lightsGroup.name = 'HOF_Lights';

      this.group.add(this.wallGroup, this.framesGroup, this.lightsGroup);

      this.items = [];
      this.raycaster = new THREE.Raycaster();
      this.mouseNdc = new THREE.Vector2();
      this.hovered = null;

      this._onPointerMove = this._onPointerMove.bind(this);
      domEl.addEventListener('pointermove', this._onPointerMove);
      this.domEl = domEl;

      // génère le mur + lumières + titre
      if (this.enableWall) this._buildWall();
      if (this.enableGalleryLights) this._buildLights();
      if (this.enableWall && this.showTitle) this._buildTitle();
    }

    async load() {
      const res = await fetch(this.jsonUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Impossible de charger ${this.jsonUrl}`);
      const data = await res.json();
      let idx = 0;

      for (const it of data) {
        const card = await this._createFrame(it);
        const pos = this._gridPosition(idx);
        // place légèrement devant le mur
        card.root.position.copy(pos).add(new THREE.Vector3(0, 0, 0.02));
        this.framesGroup.add(card.root);
        this.items.push(card);
        idx++;
      }
    }

    dispose() {
      this.domEl.removeEventListener('pointermove', this._onPointerMove);

      // cleanup cadres
      for (const c of this.items) {
        c.texture?.dispose?.();
        c.imageMesh?.material?.map?.dispose?.();
        c.imageMesh?.material?.dispose?.();
        c.glass?.material?.dispose?.();
        c.passe?.material?.dispose?.();
        c.frameMeshes?.forEach(m => {
          m.material?.dispose?.();
          m.geometry?.dispose?.();
        });
        c.imageMesh?.geometry?.dispose?.();
        c.passe?.geometry?.dispose?.();
        c.glass?.geometry?.dispose?.();
        if (c.label) {
          c.label.material?.map?.dispose?.();
          c.label.material?.dispose?.();
          c.label.geometry?.dispose?.();
        }
      }

      // cleanup mur + titre
      this.wallGroup.traverse(obj => {
        if (obj.isMesh) {
          obj.material?.dispose?.();
          obj.geometry?.dispose?.();
        }
      });

      // cleanup lumières
      this.lightsGroup.traverse(obj => {
        if (obj.isLight && obj.dispose) obj.dispose();
      });

      this.scene.remove(this.group);
    }

    // ---------- Mur de galerie (opaque des deux côtés grâce à BoxGeometry) ----------
    _buildWall() {
      const wallGeo = new THREE.BoxGeometry(this.wallWidth, this.wallHeight, this.wallThickness);
      const wallMat = new THREE.MeshStandardMaterial({
        color: this.wallColor,
        roughness: this.wallRoughness,
        metalness: this.wallMetalness,
        side: THREE.FrontSide   // box → faces internes/externes, opaque de dos naturellement
      });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.name = 'HOF_WallBox';
      wall.position.set(this.anchor.x, this.anchor.y, this.anchor.z + this.wallZBack - this.wallThickness * 0.5);
      wall.castShadow = false;
      wall.receiveShadow = false;

      this.wallGroup.add(wall);
    }

    // ---------- Grand titre mural ----------
    _buildTitle() {
      const titleMesh = this._makeTitleMesh(
        this.titleText,
        this.wallWidth * this.titleMaxWidth, // largeur max en mètres
        this.wallWidth,                      // pour l’échelle finale
        this.wallHeight
      );
      if (!titleMesh) return;

      // position : centré en X, près du bord haut du mur
      const topY = this.anchor.y + this.wallHeight / 2 - this.titleMarginTop;
      titleMesh.position.set(this.anchor.x, topY, this.anchor.z + this.wallZBack + 0.01);
      this.wallGroup.add(titleMesh);
    }

    // Titre élégant via canvas → texture sur un plan (ne suit pas la caméra)
    _makeTitleMesh(text, maxWidthWorld, wallW, wallH) {
      if (!text?.trim()) return null;

      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');

      // grande taille pour netteté, on redimensionnera
      const PX_W = 2000, PX_H = 400;
      c.width = PX_W; c.height = PX_H;

      // fond transparent
      ctx.clearRect(0, 0, PX_W, PX_H);

      // style élégant (serif) — changeable si tu as une webfont
      const titleFont = '700 220px Georgia, Times New Roman, Times, serif';
      ctx.font = titleFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Ombre légère + doré discret
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#caa84a'; // doré doux
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;

      const cx = PX_W / 2, cy = PX_H / 2 + 10;

      // stroke puis fill pour un relief lisible
      ctx.strokeText(text, cx, cy);
      ctx.fillText(text, cx, cy);

      // texture & mesh
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      const aspect = PX_W / PX_H;
      const w = maxWidthWorld;
      const h = w / aspect;

      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'HOF_Title';
      return mesh;
    }

    // ---------- Éclairage galerie ----------
    _buildLights() {
      const ambient = new THREE.AmbientLight(0xffffff, this.ambientIntensity);
      ambient.name = 'HOF_Ambient';

      const spotAngle = THREE.MathUtils.degToRad(this.spotAngleDeg);
      const spotL = new THREE.SpotLight(this.spotWarm, this.spotIntensity, Math.max(12, this.wallWidth * 2), spotAngle, this.spotPenumbra, 1.0);
      const spotR = new THREE.SpotLight(this.spotCool, this.spotIntensity, Math.max(12, this.wallWidth * 2), spotAngle, this.spotPenumbra, 1.0);
      spotL.castShadow = false; spotR.castShadow = false;

      const target = new THREE.Object3D();
      target.position.set(this.anchor.x, this.anchor.y, this.anchor.z + this.wallZBack);
      this.lightsGroup.add(target);

      spotL.position.set(this.anchor.x - this.spotOffsetX, this.spotY, this.anchor.z + this.wallZBack + 1.2);
      spotR.position.set(this.anchor.x + this.spotOffsetX, this.spotY, this.anchor.z + this.wallZBack + 1.2);
      spotL.target = target;
      spotR.target = target;

      this.lightsGroup.add(ambient, spotL, spotR);
    }

    // ---------- Placement en grille ----------
    _gridPosition(i) {
      const col = i % this.gridCols;
      const row = (i / this.gridCols) | 0;
      const offsetX = (col - (this.gridCols - 1) / 2) * this.spacingX;
      const offsetY = row * this.spacingY;

      const pos = new THREE.Vector3();
      pos.copy(this.anchor)
        .addScaledVector(this.rowDir, offsetX)
        .addScaledVector(this.colDir, offsetY);
      return pos;
    }

    // ---------- Création d’un cadre (labels collés au mur, pas de sprites) ----------
    async _createFrame(cfg) {
      const { id, titre = '', description = '', image, size = 1.2 } = cfg;

      // charge texture
      const texture = await new Promise((ok, ko) => {
        new THREE.TextureLoader().load(
          image,
          t => ok(t),
          undefined,
          () => ko(new Error(`Texture load failed: ${image}`))
        );
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;

      const imgW = texture.image?.naturalWidth || texture.image?.width || 1024;
      const imgH = texture.image?.naturalHeight || texture.image?.height || 768;
      const aspect = imgW / Math.max(1, imgH);

      // dimension cadre : size = plus grand côté
      let w, h;
      if (aspect >= 1.0) { // paysage
        w = size;
        h = size / aspect;
      } else {             // portrait
        h = size;
        w = size * aspect;
      }

      // épaisseurs
      const depth = 0.08;                                // profondeur du cadre
      const frameThickness = Math.min(w, h) * 0.08;      // largeur de baguette
      const passeMargin = Math.min(w, h) * 0.06;         // marge passe-partout

      // géos 2D (image, passe, vitre)
      const imgGeo = new THREE.PlaneGeometry(w, h);
      const passeGeo = new THREE.PlaneGeometry(w + passeMargin * 2, h + passeMargin * 2);
      const glassGeo = new THREE.PlaneGeometry(
        w + passeMargin * 2 + frameThickness * 0.5,
        h + passeMargin * 2 + frameThickness * 0.5
      );

      // matériaux
      const imgMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      const passeMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.85, metalness: 0.0 });

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.15,
        metalness: 0.0,
        transmission: 0.45,
        thickness: 0.02,
        depthWrite: false
      });

      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        roughness: 0.35,
        metalness: 0.85
      });

      // meshes
      const passe = new THREE.Mesh(passeGeo, passeMat);
      passe.position.z = 0.0;

      const imageMesh = new THREE.Mesh(imgGeo, imgMat);
      imageMesh.position.z = 0.001; // devant le passe

      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.z = 0.015; // devant l'image

      // baguettes (4 barres)
      const frameMeshes = [];
      const frameDepth = depth;
      const outW = glassGeo.parameters.width + frameThickness;
      const outH = glassGeo.parameters.height + frameThickness;

      const barGeomH = new THREE.BoxGeometry(outW, frameThickness, frameDepth); // horizontales
      const barGeomV = new THREE.BoxGeometry(frameThickness, outH, frameDepth); // verticales

      const topBar = new THREE.Mesh(barGeomH, goldMat);
      const botBar = new THREE.Mesh(barGeomH, goldMat);
      const lefBar = new THREE.Mesh(barGeomV, goldMat);
      const rigBar = new THREE.Mesh(barGeomV, goldMat);

      topBar.position.set(0,  outH / 2 + frameThickness / 2,  -frameDepth / 2);
      botBar.position.set(0, -outH / 2 - frameThickness / 2,  -frameDepth / 2);
      lefBar.position.set(-outW / 2 - frameThickness / 2, 0, -frameDepth / 2);
      rigBar.position.set( outW / 2 + frameThickness / 2, 0, -frameDepth / 2);

      frameMeshes.push(topBar, botBar, lefBar, rigBar);

      // label (titre + description) FIXE AU MUR (Mesh plan, pas Sprite)
      const label = this._makeLabelMesh(titre, description, Math.max(w, 0.8));
      // on le place légèrement devant le mur (comme les cadres), sous le cadre
      label.position.set(0, -(outH / 2 + frameThickness + 0.25), 0.02);

      // group
      const root = new THREE.Group();
      root.name = `HOF:${id || THREE.MathUtils.generateUUID()}`;
      root.add(passe, imageMesh, glass);
      frameMeshes.forEach(m => root.add(m));
      root.add(label);

      // interactions (hover doux)
      root.userData = { imageMesh };
      root.traverse(obj => { obj.userData._hofClickable = true; });

      return {
        id, root, imageMesh, passe, glass, frameMeshes, label, texture,
        width: w, height: h, outW, outH
      };
    }

    // ===== Label Mesh (plan texturé) — NE SUIT PAS LA CAMÉRA =====
    _makeLabelMesh(titre, description, maxWidthWorld = 1.2) {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');

      // Canvas grand pour netteté, redimensionné ensuite
      const MAX_W = 1600, PADDING = 24;
      const TITLE = { size: 46, weight: 600 };
      const DESC  = { size: 26, weight: 400 };

      const wrap = (text, fontPx, weight, maxPx) => {
        if (!text) return [];
        ctx.font = `${weight} ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const words = text.split(/\s+/); const lines = []; let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxPx && line) { lines.push(line); line = w; }
          else line = test;
        }
        if (line) lines.push(line);
        return lines;
      };

      const titleLines = wrap(titre || '', TITLE.size, TITLE.weight, MAX_W - PADDING*2);
      const descLines  = wrap(description || '', DESC.size, DESC.weight, MAX_W - PADDING*2);

      const measureBlock = (lines, size, weight) => {
        ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const w = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
        const h = lines.length ? lines.length * (size + 8) - 8 : 0;
        return { w, h };
      };

      const mTitle = measureBlock(titleLines, TITLE.size, TITLE.weight);
      const mDesc  = measureBlock(descLines,  DESC.size,  DESC.weight);

      const contentW = Math.max(mTitle.w, mDesc.w, 1);
      const contentH = mTitle.h + (mTitle.h && mDesc.h ? 10 : 0) + mDesc.h;

      c.width  = Math.ceil(contentW + PADDING * 2);
      c.height = Math.ceil(contentH + PADDING * 2);

      const ctx2 = c.getContext('2d');
      // fond arrondi sombre
      ctx2.fillStyle = 'rgba(0,0,0,0.55)';
      const r = 14, w = c.width, h = c.height;
      ctx2.beginPath();
      ctx2.moveTo(r, 0); ctx2.lineTo(w - r, 0); ctx2.quadraticCurveTo(w, 0, w, r);
      ctx2.lineTo(w, h - r); ctx2.quadraticCurveTo(w, h, w - r, h);
      ctx2.lineTo(r, h); ctx2.quadraticCurveTo(0, h, 0, h - r);
      ctx2.lineTo(0, r); ctx2.quadraticCurveTo(0, 0, r, 0); ctx2.closePath();
      ctx2.fill();

      let y = PADDING;
      if (titleLines.length) {
        ctx2.font = `${TITLE.weight} ${TITLE.size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx2.fillStyle = '#ffffff'; ctx2.textBaseline = 'top';
        for (const line of titleLines) { ctx2.fillText(line, PADDING, y); y += TITLE.size + 8; }
        y += 10;
      }
      if (descLines.length) {
        ctx2.font = `${DESC.weight} ${DESC.size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx2.fillStyle = '#e7e7e7'; ctx2.textBaseline = 'top';
        for (const line of descLines) { ctx2.fillText(line, PADDING, y); y += DESC.size + 6; }
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      const aspect = c.width / c.height;
      const planeW = maxWidthWorld;
      const planeH = planeW / aspect;

      const geo = new THREE.PlaneGeometry(planeW, planeH);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'HOF_Label';
      return mesh;
    }

    // ---------- Interaction (hover) ----------
    _onPointerMove(e) {
      const rect = this.domEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.mouseNdc.set(x, y);

      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const meshes = [];
      for (const it of this.items) {
        meshes.push(it.glass, it.imageMesh, ...it.frameMeshes);
      }
      const hits = this.raycaster.intersectObjects(meshes.filter(Boolean), true);
      const hit = hits[0]?.object || null;

      let found = null;
      if (hit) {
        found = this.items.find(it => (hit === it.glass || hit === it.imageMesh || it.frameMeshes.includes(hit)));
      }
      if (this.hovered !== found) {
        if (this.hovered) this._setHover(this.hovered, false);
        if (found) this._setHover(found, true);
        this.hovered = found;
      }
      this.domEl.style.cursor = found ? 'pointer' : 'auto';
    }

    _setHover(card, on) {
      const scale = on ? 1.02 : 1.0;
      card.root.scale.setScalar(scale);
      if (card.glass?.material) {
        card.glass.material.opacity = on ? 0.14 : 0.08;
      }
      card.frameMeshes?.forEach(m => m.material.emissive ? m.material.emissive.setHex(on ? 0x222200 : 0x000000) : null);
    }
  }

  window.HallOfFame = HallOfFame;
})();
