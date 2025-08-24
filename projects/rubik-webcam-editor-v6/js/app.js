
/* ===== util UI/log ===== */
const log = (m)=>{ const el=document.getElementById('logs'); el.textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + el.textContent; };

/* ========= Config & storage ========= */
const ConfigDefault = {
  whiteSatMax: 35,
  whiteValMin: 55,
  whiteValHi: 82,
  greenHueMin: 65,
  greenHueMax: 170,
  greenSatMin: 18,
  greenValMin: 25,
  stableN: 8,
  stabilityEps: 5.0,
  showDebug: true
};
let Config = {...ConfigDefault};
try{ const s=localStorage.getItem('rubikCfg'); if(s){ const o=JSON.parse(s); Config={...Config, ...o}; } }catch(_){}
function saveCfg(){ try{ localStorage.setItem('rubikCfg', JSON.stringify(Config)); }catch(_){} }
/* ========= Constantes capture ========= */
let STABLE_N = 8, STABILITY_EPS = 5.0;
document.getElementById('stabilityMax').textContent = STABLE_N;

/* ========= État & UI ========= */
const facesOrder = ['F','R','B','L','U','D'];
let currentFaceIdx = 0;
const faceData = {F:null,R:null,B:null,L:null,U:null,D:null};
const palette  = {}; // sera rempli avec le centre de chaque face capturée (lab/hex)

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d', { willReadFrequently: true });

let mirror=false, showOverlay=true, armed=false;
document.getElementById('btnStart').onclick = async ()=>{
  try{ const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}, audio:false}); video.srcObject = stream; }
  catch(e){ alert('Caméra inaccessible: '+e.message); }
};
document.getElementById('btnMirror').onclick = ()=>{ mirror=!mirror; };
document.getElementById('chkOverlay').onchange = (e)=>{ showOverlay = e.target.checked; };
document.getElementById('btnArm').onclick = ()=> toggleArm();
document.addEventListener('keydown', (e)=>{ if(e.key==='a'||e.key==='A') toggleArm(); if(e.key==='c'||e.key==='C') captureNow(); });
document.getElementById('btnCapture').onclick = ()=> captureNow();
document.getElementById('btnBack').onclick = ()=> goBack();

const armedBadge = document.getElementById('armed');
function toggleArm(v){
  armed = (typeof v==='boolean')? v : !armed;
  document.getElementById('btnArm').textContent = armed? '🛡️ ARMÉ — (A pour désarmer)' : '🛡️ Armer (A)';
  armedBadge.textContent = armed? 'ON':'OFF';
  armedBadge.style.borderColor = armed? 'var(--ok)' : '#333';
  armedBadge.style.color = armed? 'var(--ok)' : '#999';
}

/* ========= Panneau captures ========= */
function initFacesPanel(){
  const p = document.getElementById('facesPanel'); p.innerHTML='';
  for(const f of facesOrder){
    const div = document.createElement('div');
    div.className='face'; div.id='face-'+f;
    div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <strong>Face ${f}</strong><span id="faceStat-${f}" class="muted">—</span></div>
      <div class="grid">${'<div class="tile"></div>'.repeat(9)}</div>`;
    p.appendChild(div);
  }
}
function renderFacesPanel(){
  for(const f of facesOrder){
    const d = faceData[f];
    const tiles = document.querySelectorAll(`#face-${f} .tile`);
    const stat = document.getElementById(`faceStat-${f}`);
    if(!d){ tiles.forEach(t=>t.style.background='#111'); stat.textContent='vide'; continue; }
    tiles.forEach((t,i)=>{ t.style.background = rgbToHex(d.rgb[i]); });
    stat.textContent='ok';
  }
  document.getElementById('curFace').textContent = facesOrder[currentFaceIdx];
  renderHint();
initTuner();
}
initFacesPanel();

/* ========= Couleurs utils ========= */
function rgbToHex([r,g,b]){ return '#'+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join(''); }
function s2l(c){ c/=255; return c<=0.04045? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function rgbToLab([r,g,b]){ r=s2l(r); g=s2l(g); b=s2l(b);
  const x=r*0.4124+g*0.3576+b*0.1805, y=r*0.2126+g*0.7152+b*0.0722, z=r*0.0193+g*0.1192+b*0.9505;
  const xn=0.95047, yn=1.0000, zn=1.08883;
  const f=t=>t>Math.pow(6/29,3)? Math.cbrt(t) : (t/(3*Math.pow(6/29,2))+4/29);
  const fx=f(x/xn), fy=f(y/yn), fz=f(z/zn);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}
function deltaE(a,b){ const dl=a[0]-b[0], da=a[1]-b[1], db=a[2]-b[2]; return Math.hypot(dl,da,db); }
function rgbToHSV([r,g,b]){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  const d=max-min; let h=0;
  if(d===0) h=0;
  else if(max===r) h=((g-b)/d)%6;
  else if(max===g) h=(b-r)/d+2;
  else h=(r-g)/d+4;
  h=Math.round(h*60); if(h<0) h+=360;
  const s = max===0?0:d/max;
  const v = max;
  return [h,s*100,v*100];
}

/* ========= Classification canonique pour le centre ========= */
function classifyCanonical(rgb){
  const [h,s,v] = rgbToHSV(rgb);
  // white: saturation faible, valeur haute
  if(s<22 && v>65) return 'U';
  // yellow
  if(h>=42 && h<=75 && s>30 && v>50) return 'D';
  // green
  if(h>=70 && h<=170 && s>25) return 'F';
  // blue
  if(h>=170 && h<=260 && s>25) return 'B';
  // orange
  if(h>=15 && h<=40 && s>25) return 'L';
  // red
  if((h>=0 && h<=14) || (h>=340 && h<=360)) return 'R';
  // fallback: canal dominant
  const maxc = Math.max(rgb[0],rgb[1],rgb[2]);
  if(maxc===rgb[1]) return 'F'; if(maxc===rgb[2]) return 'B'; return 'R';
}

/* ========= Instructions overlay ========= */
function renderHint(){
  const f = facesOrder[currentFaceIdx];
  const hint = document.getElementById('hint');
  const map = {
    F: "Scannez la face au centre VERT. Orientez la face BLANC vers le HAUT.",
    R: "Scannez la face au centre ROUGE. Orientez la face BLANC vers le HAUT.",
    B: "Scannez la face au centre BLEU. Orientez la face BLANC vers le HAUT.",
    L: "Scannez la face au centre ORANGE. Orientez la face BLANC vers le HAUT.",
    U: "Scannez la face au centre BLANC. Orientez la face VERT vers le HAUT.",
    D: "Scannez la face au centre JAUNE. Orientez la face VERT vers le BAS."
  };
  hint.textContent = map[f];
}

/* ========= Canvas & boucle vidéo ========= */
function fitCanvas(){ const r=document.getElementById('stage').getBoundingClientRect(); overlay.width=r.width; overlay.height=r.height; }
addEventListener('resize', fitCanvas); fitCanvas();
const off = document.createElement('canvas');
const offctx = off.getContext('2d', { willReadFrequently: true });

let lastLabs = null, stableFrames=0;
let captureLockUntil = 0;

function loop(){
  if(video.readyState>=2){
    const W = overlay.width, H = overlay.height;
    off.width=W; off.height=H;
    offctx.save(); if(mirror){ offctx.translate(W,0); offctx.scale(-1,1); }
    offctx.drawImage(video,0,0,W,H); offctx.restore();

    // ROI 3×3
    const s = Math.min(W,H)*0.7, x=(W-s)/2, y=(H-s)/2, cell = s/3;
    const block = Math.floor(cell*0.64), pad = Math.floor((cell-block)/2);

    const rgb9=[], lab9=[];
    for(let r=0;r<3;r++){
      for(let c=0;c<3;c++){
        const sx = Math.floor(x+c*cell+pad), sy = Math.floor(y+r*cell+pad), w=block, h=block;
        const data = offctx.getImageData(sx,sy,w,h).data;
        let R=0,G=0,B=0,n=data.length/4;
        for(let i=0;i<data.length;i+=4){ R+=data[i]; G+=data[i+1]; B+=data[i+2]; }
        const rgb=[R/n,G/n,B/n]; rgb9.push(rgb); lab9.push(rgbToLab(rgb));
      }
    }

    // Overlay
    ctx.clearRect(0,0,W,H);
    if(showOverlay){
      ctx.save(); if(mirror){ ctx.translate(W,0); ctx.scale(-1,1); }
      ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(x,y,s,s);
      for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(x+i*cell,y); ctx.lineTo(x+i*cell,y+s); ctx.moveTo(x,y+i*cell); ctx.lineTo(x+s,y+i*cell); ctx.stroke(); }
      ctx.restore();
      const px=12, py=12, size=20, gap=4;
      ctx.save(); ctx.globalAlpha=0.9;
      for(let i=0;i<9;i++){ const col=i%3, row=(i/3|0); ctx.fillStyle=rgbToHex(rgb9[i]); ctx.fillRect(px+col*(size+gap), py+row*(size+gap), size, size); }
      // Debug HSV overlay (top-left)
      if(Config.showDebug){
        const cHSV = rgbToHSV(rgb9[4]);
        const tHSV = rgbToHSV(rgb9[1]);
        const bHSV = rgbToHSV(rgb9[7]);
        ctx.font = '12px monospace'; ctx.textBaseline='top';
        const okW = isWhiteLike(rgb9[1]); const okGTop = isGreenLike(rgb9[1]); const okGBot = isGreenLike(rgb9[7]);
        const lines = [
          `Center H:${cHSV[0]|0} S:${cHSV[1]|0} V:${cHSV[2]|0} → ${classifyCanonical(rgb9[4])}`,
          `Top    H:${tHSV[0]|0} S:${tHSV[1]|0} V:${tHSV[2]|0} ${okW?'✔white':''} ${okGTop?'✔green':''}`,
          `Bottom H:${bHSV[0]|0} S:${bHSV[1]|0} V:${bHSV[2]|0} ${okGBot?'✔green':''}`
        ];
        let y0 = py + 3*size + 10;
        lines.forEach((L,i)=>{ ctx.fillStyle='#000c'; ctx.fillRect(px, y0+18*i, 280, 16); ctx.fillStyle='#fff'; ctx.fillText(L, px+4, y0+18*i+1); });
      }
      ctx.restore();
      ctx.restore();
    }

    // Stabilité simple (DeltaE)
    if(!lastLabs){ lastLabs = lab9; stableFrames=0; }
    const diffs = lab9.map((l,i)=>deltaE(l,lastLabs[i]));
    const stableNow = diffs.every(d=>d<=STABILITY_EPS);
    if(stableNow){ stableFrames++; } else { stableFrames=0; lastLabs = lab9; }

    document.getElementById('stabilityVal').textContent = stableFrames;
    document.getElementById('stabilityMeter').style.width = Math.min(100, Math.round(stableFrames/STABLE_N*100))+'%';

    const ready = checkReady(rgb9);
    const readyEl=document.getElementById('ready');
    readyEl.textContent=ready?'PRÊT':'…'; readyEl.style.borderColor=ready?'var(--ok)':'#333'; readyEl.style.color=ready?'var(--ok)':'#999';

    if(armed && ready && performance.now() >= captureLockUntil){ performCapture(rgb9.map(v=>v.map(Math.round))); }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ========= Conditions de capture : centre conforme + orientation pour U/D ========= */
function isWhiteLike(rgb){
  const [h,s,v]=rgbToHSV(rgb);
  return (s<Config.whiteSatMax && v>Config.whiteValMin) || (v>Config.whiteValHi);
}
function isGreenLike(rgb){
  const [h,s,v]=rgbToHSV(rgb);
  return (h>=Config.greenHueMin && h<=Config.greenHueMax && s>Config.greenSatMin && v>Config.greenValMin);
}

function checkReady(rgb9){
  if(stableFrames<STABLE_N) return false;
  const f = facesOrder[currentFaceIdx];
  const centerL = classifyCanonical(rgb9[4]);
  const expectedCenter = {F:'F',R:'R',B:'B',L:'L',U:'U',D:'D'}[f];
  if(centerL!==expectedCenter) return false;

  const topMidRGB = rgb9[1];
  const botMidRGB = rgb9[7];

  if('FRBL'.includes(f)){ if(!isWhiteLike(topMidRGB)) return false; }
  if(f==='U'){ if(!isGreenLike(topMidRGB)) return false; }
  if(f==='D'){ if(!isGreenLike(botMidRGB)) return false; }

  return true;
}

/* ========= Capture ========= */
function performCapture(rgb9){
  const f = facesOrder[currentFaceIdx];
  faceData[f] = { rgb: rgb9 };
  const center = rgb9[4];
  palette[f] = { lab: rgbToLab(center), hex: rgbToHex(center) };
  renderFacesPanel(); renderNet();
  if(currentFaceIdx<facesOrder.length-1) currentFaceIdx++;
  captureLockUntil = performance.now() + 1200; // 1.2s anti double-capture
  // reset stabilisation pour la face suivante
  stableFrames = 0; lastLabs = null;
  renderFacesPanel();
  // Auto-proposer si on a les 6
  if(Object.values(faceData).every(Boolean)) { buildEditorFromWebcam(); }
}

// Capture forcée (bouton C)
function captureNow(){
  if(!video || video.readyState<2) return;
  const W = overlay.width, H = overlay.height;
  const s = Math.min(W,H)*0.7, x=(W-s)/2, y=(H-s)/2, cell=s/3;
  const block = Math.floor(cell*0.64), pad = Math.floor((cell-block)/2);
  const rgb9=[];
  for(let r=0;r<3;r++){
    for(let c=0;c<3;c++){
      const sx = Math.floor(x+c*cell+pad), sy = Math.floor(y+r*cell+pad), w=block, h=block;
      const data = offctx.getImageData(sx,sy,w,h).data; let R=0,G=0,B=0,n=data.length/4;
      for(let i=0;i<data.length;i+=4){ R+=data[i]; G+=data[i+1]; B+=data[i+2]; }
      rgb9.push([Math.round(R/n), Math.round(G/n), Math.round(B/n)]);
    }
  }
  performCapture(rgb9);
}

function goBack(){
  // Efface la face courante si elle existe, sinon recule
  const f = facesOrder[currentFaceIdx];
  if(faceData[f]){
    faceData[f]=null;
  }else if(currentFaceIdx>0){
    currentFaceIdx--;
    faceData[facesOrder[currentFaceIdx]] = null;
  }
  renderFacesPanel();
}

/* ========= Mapping couleurs -> lettres via palette apprise ========= */
function nearestFace(rgb){
  if(Object.keys(palette).length<1) return '?';
  const lab = rgbToLab(rgb);
  let best='?', bestD=1e9;
  for(const k of Object.keys(palette)){
    const d = deltaE(lab, palette[k].lab);
    if(d<bestD){ bestD=d; best=k; }
  }
  return best;
}

/* ========= ÉDITEUR ========= */
const letterOrder = ['U','R','F','D','L','B'];
const letterHex = {U:'#FFFFFF',R:'#FF0000',F:'#00AA00',D:'#FFFF00',L:'#FF6B00',B:'#0000FF'};
const edit = { U:Array(9).fill('U'), R:Array(9).fill('R'), F:Array(9).fill('F'), D:Array(9).fill('D'), L:Array(9).fill('L'), B:Array(9).fill('B') };

function lockCenter(face){ edit[face][4]=face; }

document.getElementById('btnPropose').onclick = ()=> buildEditorFromWebcam();
document.getElementById('btnClearEdit').onclick  = ()=>{ for(const f of ['U','R','F','D','L','B']) edit[f]=Array(9).fill(f); renderEditor(); renderNet(); };
document.getElementById('btnSolveEdit').onclick  = ()=> solveFrom('editor');

function buildEditorFromWebcam(){
  const need = ['U','R','F','D','L','B']; for(const k of need){ if(!faceData[k]){ alert(`Face ${k} manquante.`); return; } }
  for(const f of need){ const letters = faceData[f].rgb.map(rgb=>nearestFace(rgb)); letters[4]=f; edit[f] = letters; }
  renderEditor(); renderNet();
}

function renderEditor(){
  const root = document.getElementById('editorFaces'); root.innerHTML='';
  const facesLayout = ['U','L','F','R','B','D'];
  for(const f of facesLayout){
    const wrap = document.createElement('div'); wrap.className='edFace'; wrap.id='ed-'+f;
    const title = document.createElement('div'); title.className='edTitle';
    title.innerHTML = `<strong>${f}</strong><span class="row"><button class="rotL">⟲</button><button class="rotR">⟳</button></span>`;
    wrap.appendChild(title);
    const grid = document.createElement('div'); grid.className='edGrid';
    const letters = edit[f];
    letters.forEach((L,idx)=>{
      const tile = document.createElement('div'); tile.className='edTile'; if(idx===4) tile.classList.add('lock');
      const setVisual = ()=>{ const hex=letterHex[edit[f][idx]]||'#222'; tile.style.background=hex; tile.style.color = (hex==='#FFFFFF')?'#000':'#fff'; tile.textContent=edit[f][idx]; };
      setVisual();
      tile.onclick = ()=>{ if(idx===4) return; const i=letterOrder.indexOf(edit[f][idx]); edit[f][idx]=letterOrder[(i+1)%letterOrder.length]; setVisual(); renderCounts(); renderNet(); };
      grid.appendChild(tile);
    });
    wrap.appendChild(grid);
    wrap.querySelector('.rotL').onclick = ()=>{ edit[f]=rotateLetters(edit[f], -1); renderEditor(); renderNet(); };
    wrap.querySelector('.rotR').onclick = ()=>{ edit[f]=rotateLetters(edit[f], +1); renderEditor(); renderNet(); };
    root.appendChild(wrap);
  }
  for(const f of ['U','R','F','D','L','B']) lockCenter(f);
  renderCounts();
}
function rotateLetters(arr, dir){ const cw=[6,3,0,7,4,1,8,5,2], ccw=[2,5,8,1,4,7,0,3,6]; const map=dir>0?cw:ccw; const out=Array(9); for(let i=0;i<9;i++) out[i]=arr[map[i]]; out[4]=arr[4]; return out; }
function renderCounts(){
  const cnt = {U:0,R:0,F:0,D:0,L:0,B:0};
  for(const f of ['U','R','F','D','L','B']) for(const L of edit[f]) if(cnt[L]!=null) cnt[L]++;
  const bar = document.getElementById('countBar'); bar.innerHTML='';
  for(const L of ['U','R','F','D','L','B']){
    const v = cnt[L];
    const span = document.createElement('span'); span.className='count';
    span.style.borderColor = (v===9)? 'var(--ok)' : (v<9?'var(--warn)':'var(--bad)');
    span.style.color = span.style.borderColor;
    span.textContent = `${L}:${v}`;
    bar.appendChild(span);
  }
}
renderEditor();

/* ========= NET ========= */
document.getElementById('chkNetMirrorB').onchange = renderNet;
function renderNet(){
  const mirrorB = document.getElementById('chkNetMirrorB').checked;
  const faces = ['U','L','F','R','B','D'];
  for(const f of faces){
    const host = document.getElementById('net-'+f); if(!host) continue;
    host.innerHTML='';
    const arr = edit[f]||Array(9).fill(f);
    const shown = (f==='B' && mirrorB) ? mirrorHoriz(arr) : arr;
    for(let i=0;i<9;i++){ const d=document.createElement('div'); d.className='netTile'; d.style.background = letterHex[shown[i]]||'#222'; host.appendChild(d); }
  }
}
function mirrorHoriz(a){ const m=a.slice(); [m[0],m[2]]=[m[2],m[0]]; [m[3],m[5]]=[m[5],m[3]]; [m[6],m[8]]=[m[8],m[6]]; return m; }
renderNet();

/* ========= Solveur (worker embarqué) ========= */
function moveCount(sol){ if(!sol || typeof sol !== 'string') return 0; const m = sol.match(/[URFDLB](?:2|'|)?/g); return m ? m.length : 0; }

async function fetchFirstOK(urls, mode='same-origin'){
  for(const u of urls){
    try{ const r = await fetch(u, {cache:'no-cache', mode}); if(r.ok) return await r.text(); }catch(_){}
  }
  return null;
}
let BUNDLED_WORKER_URL = null;
async function makeBundledWorker(){
  if (BUNDLED_WORKER_URL) { try{ return new Worker(BUNDLED_WORKER_URL); }catch(_){} }
  const base = new URL('./', location.href).href;
  const cubeCode =
    await fetchFirstOK([ base+'lib/cube.min.js', base+'lib/cube.js' ], 'same-origin') ||
    await fetchFirstOK([
      'https://raw.githubusercontent.com/ldez/cubejs/master/lib/cube.min.js',
      'https://cdn.jsdelivr.net/gh/ldez/cubejs@master/lib/cube.min.js',
      'https://cdn.jsdelivr.net/npm/cubejs@1.2.0/lib/cube.min.js'
    ], 'cors');
  const solveCode =
    await fetchFirstOK([ base+'lib/solve.min.js', base+'lib/solve.js' ], 'same-origin') ||
    await fetchFirstOK([
      'https://raw.githubusercontent.com/ldez/cubejs/master/lib/solve.min.js',
      'https://cdn.jsdelivr.net/gh/ldez/cubejs@master/lib/solve.min.js',
      'https://cdn.jsdelivr.net/npm/cubejs@1.2.0/lib/solve.min.js'
    ], 'cors');
  if(!cubeCode || !solveCode) throw new Error("libs 'cube'/'solve' introuvables");
  const cubeTXT  = JSON.stringify(cubeCode  + "\n//# sourceURL=cube.embedded.js");
  const solveTXT = JSON.stringify(solveCode + "\n//# sourceURL=solve.embedded.js");

  const workerSrc = `
    function postStatus(m){ try{ postMessage({type:'status', msg:m}); }catch(_){ } }
    try{ postStatus('alive'); }catch(_){}
    const __CUBE_TXT__  = ${cubeTXT};
    const __SOLVE_TXT__ = ${solveTXT};
    try{ (0,eval)(__CUBE_TXT__); postStatus('cube eval ok'); }catch(e){ postMessage({type:'error', msg:'cube eval: '+(e&&e.message||e)}); }
    try{ (0,eval)(__SOLVE_TXT__); postStatus('solve eval ok'); }catch(e){ postMessage({type:'error', msg:'solve eval: '+(e&&e.message||e)}); }
    let inited=false;
    function ensureInit(){ if(!inited){ postStatus('initSolver start'); Cube.initSolver(); inited=true; postStatus('initSolver done'); } }
    function solveOnce(state){
      const sol = Cube.fromString(state).solve();
      const tokens = sol.trim().split(/\\s+/).filter(Boolean);
      const valid  = tokens.filter(t=>/^[URFDLB](2|'|)?$/.test(t));
      return valid.join(' ');
    }
    self.onmessage = function(e){
      try{
        const { state } = e.data || {};
        ensureInit();
        if (typeof state === 'string'){
          try{
            const sol = solveOnce(state);
            postMessage({type:'result', best:{rot:null, sol}});
          }catch(err){
            postMessage({type:'error', msg:String(err&&err.message||err)});
          }
          return;
        }
        postMessage({type:'error', msg:'input manquant (state)'});
      }catch(err){
        postMessage({type:'error', msg:'top-level: '+String(err&&err.message||err)});
      }
    };
  `;
  BUNDLED_WORKER_URL = URL.createObjectURL(new Blob([workerSrc], {type:'application/javascript'}));
  return new Worker(BUNDLED_WORKER_URL);
}

/* ===== Build state 54 lettres (course strict/compat) ===== */
function rotCW(a){ return [a[6],a[3],a[0], a[7],a[4],a[1], a[8],a[5],a[2]]; }
function rotCCW(a){ return [a[2],a[5],a[8], a[1],a[4],a[7], a[0],a[3],a[6]]; }
function rot180(a){ return [a[8],a[7],a[6], a[5],a[4],a[3], a[2],a[1],a[0]]; }
function assertCountsAndCenters(){
  const order = ['U','R','F','D','L','B'];
  for(const f of order){ if(edit[f][4]!==f) throw new Error('Centre '+f+' invalide'); }
  const cnt={U:0,R:0,F:0,D:0,L:0,B:0};
  for(const f of order) for(const L of edit[f]) if(cnt[L]!=null) cnt[L]++;
  for(const k in cnt){ if(cnt[k]!==9) throw new Error(`Comptage ${k}=${cnt[k]} (attendu 9)`); }
}
function buildStateStrict(){
  assertCountsAndCenters();
  const mapFaceForSolver = (face, arr)=>{
    switch(face){
      case 'U': return arr;
      case 'R': return rotCW(arr);
      case 'F': return arr;
      case 'D': return rot180(arr);
      case 'L': return rotCCW(arr);
      case 'B': return rot180(arr);
      default:  return arr;
    }
  };
  const order = ['U','R','F','D','L','B'];
  return order.map(f => mapFaceForSolver(f, edit[f]).join('')).join('');
}
function buildStateCompat(){
  assertCountsAndCenters();
  const order = ['U','R','F','D','L','B'];
  return order.map(f => edit[f].join('')).join('');
}

/* ========= Résolution depuis éditeur (course 2 mappages) ========= */
async function solveFrom(source){
  const solBox = document.getElementById('solution');
  if(source!=='editor'){ solBox.textContent='On passe uniquement par l’éditeur.'; return; }
  try{
    // déjà résolu ?
    let already=true; for(const f of ['U','R','F','D','L','B']) for(let i=0;i<9;i++){ if(edit[f][i]!==f){ already=false; break; } }
    if(already){ solBox.textContent='Cube déjà résolu (éditeur) : 0 mouvement.'; loadSolution3D(''); return; }

    let stateStrict, stateCompat;
    try{ stateStrict = buildStateStrict(); }catch(e){ solBox.textContent='Erreur état (strict) : '+e.message; return; }
    try{ stateCompat = buildStateCompat(); }catch(e){ solBox.textContent='Erreur état (compat) : '+e.message; return; }

    solBox.textContent = 'Préchargement du solveur…';
    const run = async (state, label)=>{
      const w = await makeBundledWorker();
      return new Promise((resolve)=>{
        const start = performance.now();
        const timer = setTimeout(()=>{ try{ w.terminate(); }catch(_){ } resolve({label, error:'timeout'}); }, 8000);
        w.onmessage = (ev)=>{
          const msg = ev.data||{};
          if(msg.type==='status'){ solBox.textContent = `Calcul… ${label}: ${msg.msg}`; }
          else if(msg.type==='error'){ clearTimeout(timer); try{ w.terminate(); }catch(_){ } resolve({label, error:msg.msg}); }
          else if(msg.type==='result'){ clearTimeout(timer); try{ w.terminate(); }catch(_){ } resolve({label, sol: msg.best && msg.best.sol || '', ms: Math.round(performance.now()-start)}); }
        };
        w.onerror = (e)=>{ clearTimeout(timer); try{ w.terminate(); }catch(_){ } resolve({label, error:e.message||'worker error'}); };
        w.postMessage({ state });
      });
    };

    const first = await Promise.race([ run(stateStrict,'strict'), run(stateCompat,'compat') ]);
    const winner = (first && !first.error) ? first : await (first.label==='strict'? run(stateCompat,'compat'): run(stateStrict,'strict'));
    if(winner.error){ solBox.textContent = `Solveur en échec (${first.label}: ${first.error})`; return; }

    const sol = winner.sol||'';
    solBox.textContent = `Solution (${moveCount(sol)} mouvements) : ${sol || '(déjà résolu)'} [${winner.label}, ${winner.ms||'?'} ms]`;
    loadSolution3D(sol||'');
  }catch(e){
    document.getElementById('solution').textContent = 'Erreur: '+(e && e.message || e);
  }
}

/* ========= Three.js viewer ========= */
const threeDiv = document.getElementById('three');
let scene, camera, renderer, cubeGroup;
let moves=[], moveIdx=0, playing=false, animSpeed=1.0, rotating=false;
let CUBE_STEP = 1.0;

document.getElementById('speed').oninput = (e)=> animSpeed = parseFloat(e.target.value);
document.getElementById('btnPlay').onclick = ()=>{ playing=true; playLoop(); };
document.getElementById('btnPause').onclick = ()=>{ playing=false; };
document.getElementById('btnNext').onclick = ()=>{ if(!rotating) stepMove(1); };
document.getElementById('btnPrev').onclick = ()=>{ if(!rotating) stepMove(-1); };

async function ensureThree(){
  if (window.THREE) return true;

  // Prefer ESM locally (three.module.js or three.min.js that is actually ESM)
  const tryESM = async (rel)=>{
    try{
      const mod = await import(rel);
      if (mod && (mod.WebGLRenderer || mod.Scene)){
        window.THREE = mod; // expose as namespace
        return true;
      }
    }catch(_){}
    return false;
  };

  // NOTE: app.js is in /js/, libs are in /lib/
  if (await tryESM('../lib/three.module.js')) return true;
  if (await tryESM('../lib/three.min.js')) return true; // some bundles ship ESM under this name

  // UMD fallback via classic <script>
  const ok = await loadScriptSeq(['../lib/three.min.js','../lib/three.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r152/three.min.js',
    'https://unpkg.com/three@0.152.2/build/three.min.js'
  ]);
  return ok && !!window.THREE;
}

function loadScriptSeq(urls){
  return new Promise((resolve)=>{
    let i=0;
    (function next(){
      if(i>=urls.length) return resolve(false);
      const s=document.createElement('script');
      s.src=urls[i++];
      s.async=true;
      s.onload=()=> resolve(true);
      s.onerror=()=> next();
      document.head.appendChild(s);
    })();
  });
}

async function loadSolution3D(solStr){
  const ok = await ensureThree();
  if(!ok){ threeDiv.innerHTML = '<div style="padding:8px;color:#f88">3D désactivé : Three.js introuvable.</div>'; return; }
  initThree();
  moves = parseMoves(solStr);
  moveIdx = 0; playing=false;
  // scramble (inverse) instantané pour démarrer mélangé
  const scramble = invertSequence(moves);
  await applyMoves(scramble, { animate:false });
  document.getElementById('moveNow').textContent = moves[0] || '—';
  // auto-play
  playing = true; playLoop();
}

function initThree(){
  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(threeDiv.clientWidth, threeDiv.clientHeight);
  threeDiv.innerHTML=''; threeDiv.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(50, threeDiv.clientWidth/threeDiv.clientHeight, 0.1, 100);
  camera.position.set(4,4,6); camera.lookAt(0,0,0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(5,8,5); scene.add(dir);
  const colors = {U:0xFFFFFF,R:0xFF0000,F:0x00AA00,D:0xFFFF00,L:0xFF6B00,B:0x0000FF};
  cubeGroup = buildRubiks(colors); scene.add(cubeGroup);
  window.addEventListener('resize', ()=>{ renderer.setSize(threeDiv.clientWidth, threeDiv.clientHeight); camera.aspect = threeDiv.clientWidth/threeDiv.clientHeight; camera.updateProjectionMatrix(); });
  (function anim(){ requestAnimationFrame(anim); renderer.render(scene,camera); })();
}
function buildRubiks(colors){
  const g = new THREE.Group(), size = 0.98, gap = 0.02;
  CUBE_STEP = size + gap;
  const geo = new THREE.BoxGeometry(size,size,size);
  const black = new THREE.MeshLambertMaterial({ color:0x111111 });
  const faceMat = (color)=> new THREE.MeshLambertMaterial({ color });
  for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++){
    const mats = [
      x=== 1 ? faceMat(colors.R) : black,
      x===-1 ? faceMat(colors.L) : black,
      y=== 1 ? faceMat(colors.U) : black,
      y===-1 ? faceMat(colors.D) : black,
      z=== 1 ? faceMat(colors.F) : black,
      z===-1 ? faceMat(colors.B) : black
    ];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(CUBE_STEP*x, CUBE_STEP*y, CUBE_STEP*z);
    mesh.userData = {x,y,z};
    g.add(mesh);
  }
  return g;
}

/* ===== Moves utils ===== */
function parseMoves(solStr){ return (solStr||'').trim().split(/\s+/).filter(Boolean); }
function invertMove(m){ if(m.endsWith("2")) return m; if(m.endsWith("'")) return m.slice(0,-1); return m+"'"; }
function invertSequence(arr){ return arr.slice().reverse().map(invertMove); }
async function applyMoves(arr, {animate=false, speed=1.0}={}){
  const dur = animate ? 260/speed : 0;
  for(const m of arr){ await doMove(m, dur); }
}

async function playLoop(){ while(playing && moveIdx<moves.length){ await doMove(moves[moveIdx], null); moveIdx++; document.getElementById('moveNow').textContent = moves[moveIdx]||'—'; } playing=false; }
function stepMove(dir){
  if(dir>0 && moveIdx<moves.length){ doMove(moves[moveIdx]).then(()=>{ moveIdx++; document.getElementById('moveNow').textContent = moves[moveIdx]||'—'; }); }
  else if(dir<0 && moveIdx>0){ doMove(invertMove(moves[moveIdx-1])).then(()=>{ moveIdx--; document.getElementById('moveNow').textContent = moves[moveIdx-1]||'—'; }); }
}

/* ===== doMove avec sens de rotation correct + instant option ===== */
function doMove(mv, durationOverride=null){
  if(!window.THREE) return Promise.resolve();
  rotating = true;

  const face = mv[0];
  const suf  = mv.slice(1);
  const turns = (suf==='2') ? 2 : 1;

  // signe de base par face (notation standard, vue de l'extérieur)
  const baseSign = (face==='U' || face==='R' || face==='F') ? -1 : +1;
  const turnSign = (suf==="'" ? -1 : +1);
  const angle = (Math.PI/2) * baseSign * turnSign;

  const axis  = (face==='U'||face==='D') ? 'y' : (face==='L'||face==='R') ? 'x' : 'z';
  const layer = (face==='U'||face==='R'||face==='F') ? 1 : -1;

  const sel = cubeGroup.children.filter(c=>{
    const v = (axis==='x') ? c.userData.x : (axis==='y') ? c.userData.y : c.userData.z;
    return v === layer;
  });

  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  sel.forEach(c => pivot.add(c));

  const duration = (durationOverride===0) ? 0 : (durationOverride!=null ? durationOverride : 260/animSpeed);

  let p = Promise.resolve();
  for(let i=0;i<turns;i++){
    if(duration<=0){ pivot.rotation[axis] += angle; }
    else { p = p.then(()=> tweenRotate(pivot, axis, angle, duration)); }
  }

  return p.then(()=>{
    pivot.updateMatrix();
    const step = CUBE_STEP || 1.0;
    sel.forEach(c=>{
      c.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(pivot.matrix, c.matrix);
      m.decompose(c.position, c.quaternion, c.scale);
      cubeGroup.add(c);
      c.userData.x = Math.round(c.position.x / step);
      c.userData.y = Math.round(c.position.y / step);
      c.userData.z = Math.round(c.position.z / step);
    });
    cubeGroup.remove(pivot);
    rotating = false;
  });
}

function tweenRotate(obj, axis, angle, duration){
  return new Promise(res=>{
    const start = performance.now(), startRot = obj.rotation[axis];
    (function tick(now){
      let t=(now-start)/duration; if(t>1) t=1; obj.rotation[axis]=startRot+angle*t;
      if(t<1) requestAnimationFrame(tick); else res();
    })(performance.now());
  });
}


/* ========= Tuner (sliders) ========= */
function setVal(id, v){ const el=document.getElementById(id); if(el){ el.textContent = String(v); } }
function bindRange(id, key){
  const r = document.getElementById(id);
  if(!r) return;
  r.value = Config[key];
  setVal(id+'Val', r.value);
  r.oninput = ()=>{
    const val = r.step && r.step.indexOf('.')>=0 ? parseFloat(r.value) : parseInt(r.value,10);
    Config[key] = val; saveCfg();
    setVal(id+'Val', val);
    if(key==='stableN'){ STABLE_N = val; document.getElementById('stabilityMax').textContent = STABLE_N; stableFrames=0; }
    if(key==='stabilityEps'){ STABILITY_EPS = val; stableFrames=0; }
  };
}
function initTuner(){
  // Set current to Config
  STABLE_N = Config.stableN; STABILITY_EPS = Config.stabilityEps;
  document.getElementById('stabilityMax').textContent = STABLE_N;

  bindRange('wSatMax','whiteSatMax');
  bindRange('wValMin','whiteValMin');
  bindRange('wValHi','whiteValHi');
  bindRange('gHueMin','greenHueMin');
  bindRange('gHueMax','greenHueMax');
  bindRange('gSatMin','greenSatMin');
  bindRange('gValMin','greenValMin');
  bindRange('stableN','stableN');
  bindRange('stabEps','stabilityEps');

  const chk = document.getElementById('chkShowDebug');
  if(chk){ chk.checked = !!Config.showDebug; chk.onchange = ()=>{ Config.showDebug = chk.checked; saveCfg(); }; }
  const btnR = document.getElementById('btnResetCfg');
  if(btnR){ btnR.onclick = ()=>{ Config={...ConfigDefault}; saveCfg(); initTuner(); }; }
}

/* ========= Init ========= */
renderHint();
initTuner();
