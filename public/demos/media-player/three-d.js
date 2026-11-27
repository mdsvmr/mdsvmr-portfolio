// Mixtape Player: 2D ↔ 3D view (button top right of the frame).
//
// Going 3D: the player as it looks right now (screen, wheel, body) is captured as an image
// and becomes the front of a 3D body drawn with three.js. Face-on, the 3D view lines up with
// the page, so the page is swapped for it without a jump; then it turns on its own, about
// the vertical axis through the body's centre. Going back: it comes round face-on and the
// live page returns.
//
// Look: kept close to the 2D design: the faces carry the design's own gradient (#F0F0F0 →
// #9EA0A2) on a satin, only lightly metallic finish, lit softly from the upper left (the
// same as the drawing) plus a faint studio reflection (HDRI "Studio Small 09", Poly Haven,
// CC0) for the highlights on the rounded edges. The speaker holes and the
// side port are real openings (cut out of the metal, with walls and a dark inside); the
// screws are domed heads with a hex socket. Shape from the Front / Back / Left / Right sketches.
//
// Sizes are the player's 347px base (sketch × 347.013 / 335); three.js works in screen px.
// three.js, html-to-image and the HDRI load on first use.

const PREVIEW = new URLSearchParams(location.search).has('preview');
const btn = document.getElementById('view-toggle');
const turnEl = document.querySelector('.turn');
const canvas = document.getElementById('body3d');
const root = document.documentElement;

const SK = 347.013 / 335;                       // sketch units → base px
const W = 347.013, H = 157.922, R = 24.935;   // body and corner radius
const T = 16;                                   // thickness (21.75 in the side sketches; slimmer on request)
const BEVEL = 0.5;                              // a fine chamfer on the front/back edges: crisp, but it catches the light
const WHEEL = { x: 99.74, y: 0, r: 57.143, raise: 1.5, edge: 0.6, drop: 1.0 }; // proud at its rim (raise), sloping down by `drop` to the centre button
// the wheel's height across the ring, t: 0 at the button's edge, 1 at the rim (0 = its rim height)
const wheelDrop = (t) => -WHEEL.drop * Math.pow(1 - Math.max(0, Math.min(1, t)), 1.4);
const wheelSlope = (t) => (WHEEL.drop * 1.4 * Math.pow(1 - Math.max(0, Math.min(1, t)), 0.4)) / (WHEEL.r - CENTER.r); // dh/dr
// the centre button sits a little below the wheel's top (.center: 49.524 across, 0.17 up-left)
const CENTER = { x: 99.74 - 0.17, y: 0.17, r: 24.762, depth: 0.4 }; // depth: below the ring's inner edge
const HOLD = { x: -122.08, w: 23.896, h: 2.078, d: 10.36 };
const PORT = { w: 4.14, h: 15, depth: 3 };     // middle of the right side (a little shorter than the sketch's 18.65)
// Speaker on the back (seen from behind it's on the right; here x is the body's own x)
const GRILLE = { x: -82 * SK, y: 0, r: 55 * SK, pitch: 3 * SK, hole: 0.5 * SK, depth: 1.4 };
const SCREWS = [[-151, 60], [-151, -60], [151, 60], [151, -60]].map(([x, y]) => [x * SK, y * SK]);
const BODY_IN_TURN = { x: 106.0035, y: 112.083 }; // the body's top left inside the 560 × 380 frame
const PERSPECTIVE = 5;                          // camera distance, in body widths: low = stronger
const TURN_SECONDS = 16;                        // one full turn
const HDRI = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr';

// Pictures laid on the body (screen, back seams) always draw over the surface under them;
// without this they flicker in stripes ("z-fighting") once it turns.
const decal = (m) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

let THREE, toCanvas, renderer, scene, camera, group, frontMat, capMat, centerMat, wheelSheen, wheelGrain, wheelGrooves, glareMat, glassWashMat, glossMat, screenShadeMat;
let on = false, busy = false, angle = 0, speed = 0, raf = 0, last = 0, mode = 'idle';

if (!PREVIEW && btn) {
  btn.hidden = false;
  btn.addEventListener('click', () => (on ? leave() : enter()));
}

// ---------- Canvas helpers ----------
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const speakerHoles = () => {
  const out = [];
  for (let row = -22; row <= 22; row++) {
    const y = GRILLE.y + row * GRILLE.pitch, off = row % 2 ? GRILLE.pitch / 2 : 0;
    for (let col = -22; col <= 22; col++) {
      const x = GRILLE.x + col * GRILLE.pitch + off;
      if (Math.hypot(x - GRILLE.x, y - GRILLE.y) <= GRILLE.r - 0.8) out.push([x, y]);
    }
  }
  return out;
};

// fine grain for the blasted metal (bump + roughness)
function grainCanvas(size) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 236 + Math.random() * 19; // near white: it multiplies the roughness, so keep it ≈ 1
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Where the faces are open (white = metal, black = opening). Left half: the back, with
// the speaker holes; right half: the front, with the centre button's opening.
function capHolesCanvas(holes) {
  const s = 10, cw = Math.round(W * s), c = makeCanvas(cw * 2, Math.round(H * s)), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  const dot = (half, x, y, r) => { g.beginPath(); g.arc(half * cw + (x / W + 0.5) * cw, (0.5 - y / H) * c.height, r * s, 0, Math.PI * 2); g.fill(); };
  for (const [x, y] of holes) dot(0, x, y, GRILLE.hole);
  dot(1, CENTER.x, CENTER.y, CENTER.r);
  return c;
}
// The front picture's opening for the centre button (it sits lower, on its own)
function frontHoleCanvas() {
  const FW = W - 2 * BEVEL, FH = H - 2 * BEVEL; // laid over the flat of the face
  const s = 6, c = makeCanvas(Math.round(FW * s), Math.round(FH * s)), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000'; g.beginPath();
  g.arc((CENTER.x / FW + 0.5) * c.width, (0.5 - CENTER.y / FH) * c.height, CENTER.r * s, 0, Math.PI * 2); g.fill();
  return c;
}

// The port's opening on the right side, in a small window around it (y across, z up)
const PORT_WIN = { y: 12, z: 6 };
function portHoleCanvas() {
  const s = 8, c = makeCanvas(PORT_WIN.y * 2 * s, PORT_WIN.z * 2 * s), g = c.getContext('2d'); // ≈ screen density
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000'; g.beginPath();
  g.roundRect((PORT_WIN.y - PORT.h / 2) * s, (PORT_WIN.z - PORT.w / 2) * s, PORT.h * s, PORT.w * s, (PORT.w / 2) * s);
  g.fill();
  return c;
}

// The wheel's grooves: its rim and the four dividing lines (the X between the buttons,
// stopping at the centre button), each a dark cut with a faint lit edge under it
function wheelGroovesCanvas() {
  const R0 = WHEEL.r + 1, s = 16, c = makeCanvas(R0 * 2 * s, R0 * 2 * s), g = c.getContext('2d');
  g.translate(R0 * s, R0 * s); g.scale(s, s);
  const groove = (draw, w = 1) => { // w: width, relative to the dividing lines
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.22 * w; g.save(); g.translate(0.12 * w, 0.18 * w); draw(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 0.25 * w; draw(); g.stroke();
  };
  groove(() => { g.beginPath(); g.arc(0, 0, WHEEL.r - 0.1, 0, Math.PI * 2); }, 0.55); // the rim's line: finer still
  const inner = 25.4, outer = WHEEL.r - 0.4;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    groove(() => { g.beginPath(); g.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); g.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); });
  }
  return c;
}

// The screen's glare: a soft diagonal band of light, like a window caught in glass
function screenGlareCanvas() {
  // a soft light from the upper-left corner fading across the glass, with a gentle band in it
  const n = 512, c = makeCanvas(n, n), g = c.getContext('2d');
  let gr = g.createRadialGradient(0, 0, 0, 0, 0, n * 1.1);
  gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  gr = g.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0.2, 'rgba(255,255,255,0)'); gr.addColorStop(0.32, 'rgba(255,255,255,0.08)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return c;
}

// The screen's gloss: a light's reflection with a crisp diagonal edge, brightest at that
// edge and fading behind it (moved across the glass in render)
function screenGlossCanvas() {
  // a soft band across a diagonal: it rises gently at its lower-right edge and fades out
  // behind it (one gradient across the band, so both sides are soft)
  const n = 1024, c = makeCanvas(n, n), g = c.getContext('2d');
  const mid = [n * 0.4, n * 0.5];                    // a point on the band's leading edge
  const len = Math.hypot(1, 0.44), nx = 1 / len, ny = 0.44 / len; // across the band, towards the lower right
  const soft = 0.09 * n, back = 0.36 * n;
  const gr = g.createLinearGradient(mid[0] + nx * soft, mid[1] + ny * soft, mid[0] - nx * back, mid[1] - ny * back);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.11)');
  gr.addColorStop(0.36, 'rgba(255,255,255,0.07)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return c;
}

// The wheel's matte plastic (like a click wheel): the ring slopes from its raised rim down
// to the centre button (as modelled, wheelDrop), lit from the upper left. Painted as light (white)
// and shade (black) over the captured wheel: the slopes facing the light brighten, the
// ones facing away darken, and the rim itself sits in a soft shadow
function wheelMatteCanvas() {
  const n = 1024, c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
  const px = n / (2 * WHEEL.r);                          // canvas px per base px
  const cx = (CENTER.x - WHEEL.x), cy = -(CENTER.y - WHEEL.y); // button centre (canvas y down)
  const L = [-0.5, -0.62, 0.6], ll = Math.hypot(...L);   // towards the light: left, up, out
  const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const tilt = 9;                                        // how strongly the slope reads
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / px - WHEEL.r, y = (j + 0.5) / px - WHEEL.r;
    const ro = Math.hypot(x, y);
    if (ro > WHEEL.r) continue;
    // across the ring: 0 at the button's edge, 1 at the rim
    const dx = x - cx, dy = y - cy, ri = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, (ri - CENTER.r) / (WHEEL.r - CENTER.r)));
    const slope = wheelSlope(t) * tilt;                    // rises from the button to the rim
    const ux = dx / (ri || 1), uy = dy / (ri || 1);
    let nx = -slope * ux, ny = -slope * uy, nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    let v = (nx * lx + ny * ly + nz * lz) - lz;           // vs. a flat face
    // a soft shadow pooling at the bottom of the slope, by the button
    const foot = Math.pow(Math.max(0, 1 - t / 0.14), 2) * 0.2;
    // a broad, faint light from the upper left over the whole wheel
    const broad = Math.max(0, 1 - Math.hypot(x / WHEEL.r + 0.45, y / WHEEL.r + 0.5) / 1.2) * 0.07;
    const k = (j * n + i) * 4;
    const a = v + broad - foot;
    if (a > 0) { img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.min(255, a * 0.55 * 255); }
    else { img.data[k + 3] = Math.min(255, -a * 0.9 * 255); }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// …and its fine grain: tiny light and dark specks, as on textured plastic
function wheelGrainCanvas() {
  const n = 1024, c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = Math.random(), light = r > 0.5;
    const v = light ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.round((light ? 22 : 34) * Math.random());
  }
  g.putImageData(img, 0, 0);
  return c;
}

// The back's gradient at a point of the body (x, y in base px, y up), for the sides
const GRAD_A = [-(259.171 - 270) * SK, -(98.6559 - 191) * SK], GRAD_B = [-(331.558 - 270) * SK, -(330.72 - 191) * SK];
function faceColorAt(x, y, out) {
  const dx = GRAD_B[0] - GRAD_A[0], dy = GRAD_B[1] - GRAD_A[1];
  const t = Math.max(0, Math.min(1, ((x - GRAD_A[0]) * dx + (y - GRAD_A[1]) * dy) / (dx * dx + dy * dy)));
  const a = [0xf0, 0xf0, 0xf0], b = [0x9e, 0xa0, 0xa2]; // mixed as drawn (sRGB), like the canvas
  return out.setRGB(...a.map((v, i) => (v + (b[i] - v) * t) / 255), THREE.SRGBColorSpace);
}

// The faces' colour: the Back sketch's gradient, #F0F0F0 at the top left to #9EA0A2 at the
// bottom right (drawn as seen from behind, then laid out in the body's own x / y)
function faceGradientCanvas() {
  const s = 4, c = makeCanvas(Math.round(W * s), Math.round(H * s)), g = c.getContext('2d');
  // sketch (back view) → body x / y → canvas
  const toCanvas = (bx, by) => {
    const x = -(bx - 270) * SK, y = -(by - 191) * SK;
    return [(x / W + 0.5) * c.width, (0.5 - y / H) * c.height];
  };
  const [x0, y0] = toCanvas(259.171, 98.6559), [x1, y1] = toCanvas(331.558, 330.72);
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#F0F0F0'); gr.addColorStop(1, '#9EA0A2');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Back seams (the Back sketch's panel lines), as fine grooves
function seamsCanvas() {
  const s = 8, BW = 335, BH = 153, c = makeCanvas(BW * s, BH * s), g = c.getContext('2d');
  g.scale(s, s);
  const seam = (draw) => {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.45; g.save(); g.translate(0.22, 0.32); draw(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(40,42,44,0.32)'; g.lineWidth = 0.4; draw(); g.stroke();
  };
  seam(() => { g.beginPath(); g.roundRect(4.25, 4.25, 326.5, 144.5, 20.25); });
  seam(() => { g.beginPath(); g.moveTo(167.75, 4.5); g.lineTo(167.75, 148.5); });
  seam(() => { g.beginPath(); g.moveTo(4.5, 76.25); g.lineTo(167.5, 76.25); });
  // a shallow ring sunk around each screw
  for (const [x, y] of [[16.5, 16.5], [16.5, 136.5], [318.5, 16.5], [318.5, 136.5]]) {
    g.strokeStyle = 'rgba(40,42,44,0.4)'; g.lineWidth = 0.35; g.beginPath(); g.arc(x, y, 2.3, 0, Math.PI * 2); g.stroke();
  }
  return c;
}

// Fallback light if the HDRI can't load: a soft white studio built from boxes
function builtStudio() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xb9bcbf);
  const box = (w, h, x, y, z, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  box(14, 14, 0, 9, 1, 3.2); box(5, 12, -9, 2, 3, 2.4); box(5, 12, 9, 1, 2, 1.4); box(14, 6, 0, 1, 10, 1.6); box(14, 8, 0, -7, 2, 0.55);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

async function load() {
  if (THREE) return;
  THREE = await import('three');
  const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  ({ toCanvas } = await import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm'));

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // drawn a little above screen resolution so the fine lines (side seam, port edge) stay
  // solid as it turns instead of shimmering
  renderer.setPixelRatio(Math.min((devicePixelRatio || 1) * 1.25, 2.5));
  renderer.toneMapping = THREE.NoToneMapping; // colours as in the design
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 100000);

  // Light: the studio photo (the built one if it can't load)
  scene.environment = builtStudio();
  try {
    const hdr = await new RGBELoader().loadAsync(HDRI);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose(); pmrem.dispose();
  } catch (err) { /* keep the built studio */ }
  // soft light from the upper left and in front, like the drawing; it stays put while the
  // body turns, so whichever side faces you is lit the same way
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-0.45, 0.6, 0.75);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xc4c6c9, 1.45));

  group = new THREE.Group();
  scene.add(group);

  // bead-blasted aluminium: light, matte, fine grain (UVs here are in base px)
  const grain = new THREE.CanvasTexture(grainCanvas(512));
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(1 / 90, 1 / 90); // ≈ one speck per screen pixel: fine, but visible
  // satin aluminium: mostly its own colour, a little sheen, a fine grain
  const metal = (extra) => new THREE.MeshStandardMaterial(Object.assign({
    color: 0xe6e7e8, metalness: 0.18, roughness: 0.5,
    roughnessMap: grain, bumpMap: grain, bumpScale: 0.3,
    envMapIntensity: 0.55,
  }, extra));

  const roundRect = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  };
  const flat = (shape, w, h, segs) => { // flat shape whose texture spans its box
    const geo = new THREE.ShapeGeometry(shape, segs);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    return geo;
  };

  // ---- Body: faces (front/back) and sides get their own metal, each with its openings ----
  const holes = speakerHoles();
  const capAlpha = new THREE.CanvasTexture(capHolesCanvas(holes));
  capAlpha.channel = 1; // the faces' second UVs pick the back or front half
  const portAlpha = new THREE.CanvasTexture(portHoleCanvas());
  portAlpha.channel = 1; // the sides get a second UV set just for the port window
  // No mipmaps: where the sides' UVs jump off the window, a shrunk copy of the opening would be
  // sampled and leave see-through lines across the sides. Drawn near screen density instead,
  // so its edge stays steady as it turns.
  portAlpha.generateMipmaps = false; portAlpha.minFilter = THREE.LinearFilter;
  const faceTex = new THREE.CanvasTexture(faceGradientCanvas());
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.repeat.set(1 / W, 1 / H); faceTex.offset.set(0.5, 0.5);
  const capMetal = metal({ color: 0xffffff, map: faceTex, alphaMap: capAlpha, alphaTest: 0.5, alphaToCoverage: true });
  // The seam round the sides, halfway through the thickness, drawn like the back's panel
  // lines: a fine dark cut with a thin lit lip beside it (its wall that faces the light,
  // towards the back). Drawn on the sides rather than modelled: a modelled groove this fine
  // flickered as it turned; a mipmapped line stays steady at every angle.
  // (canvas rows: 512 is mid-thickness, rows above it lie towards the back)
  const u = 1024 / T, seamLine = (fill) => {
    const c = makeCanvas(4, 1024), g = c.getContext('2d');
    g.fillStyle = fill.base; g.fillRect(0, 0, 4, 1024);
    fill.draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
    t.repeat.set(1, 1 / T); t.offset.set(0, (T - 1 - BEVEL) / T); // side UVs: v = 1 - z, z from -BEVEL to T - BEVEL before centring
    return t;
  };
  const seamTex = seamLine({ base: '#ffffff', draw: (g) => { g.fillStyle = '#8c8d8e'; g.fillRect(0, 512 - 0.15 * u, 4, 0.3 * u); } });
  const lipTex = seamLine({ base: '#000000', draw: (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 512 - 0.42 * u, 4, 0.27 * u); } });
  const sideMetal = metal({ color: 0xffffff, map: seamTex, emissive: 0xffffff, emissiveMap: lipTex, emissiveIntensity: 0.45, vertexColors: true, alphaMap: portAlpha, alphaTest: 0.5 });

  // the chamfer: polished, so it catches the light from the upper left as a crisp bright line
  const edgeMetal = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, metalness: 0.55, roughness: 0.2, envMapIntensity: 1.25,
  });

  // The body, in one piece
  const half = (z0, z1) => {
    const geo = new THREE.ExtrudeGeometry(roundRect(W - 2 * BEVEL, H - 2 * BEVEL, R - BEVEL), {
      depth: z1 - z0 - 2 * BEVEL, bevelEnabled: BEVEL > 0, bevelThickness: BEVEL, bevelSize: BEVEL,
      bevelSegments: 4, curveSegments: 72,
    });
    geo.translate(0, 0, z0 + BEVEL);
    // the sides take the back's colours: its gradient (#F0F0F0 → #9EA0A2) at each point
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), uv1 = new Float32Array(p.count * 2);
    const c = new THREE.Color();
    // second UVs. Faces (group 0): the back onto the left half of the openings map, the front
    // onto the right half. Sides (group 1): the right side's flat onto the port window,
    // everything else well off it (on the same side, so nothing in between sweeps across it)
    const faces = geo.groups.filter((gr) => gr.materialIndex === 0);
    const isFace = (i) => faces.some((gr) => i >= gr.start && i < gr.start + gr.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      faceColorAt(x, y, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      if (isFace(i)) { uv1[i * 2] = (x / W + 0.5) / 2 + (z > 0 ? 0.5 : 0); uv1[i * 2 + 1] = y / H + 0.5; }
      else {
        const onFlat = x > W / 2 - 0.3;
        uv1[i * 2] = onFlat ? (y + PORT_WIN.y) / (2 * PORT_WIN.y) : (y > 0 ? 5 : -5);
        uv1[i * 2 + 1] = onFlat ? 1 - (z + PORT_WIN.z) / (2 * PORT_WIN.z) : 5;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    // the chamfer gets its own polished material: pull its triangles out of the sides' group
    // (they are the side triangles that reach past the flat, |z| > T/2 - BEVEL)
    if (BEVEL > 0) {
      const side = geo.groups.find((gr) => gr.materialIndex === 1);
      const lim = (z1 - z0) / 2 - BEVEL + 1e-4, mid = (z0 + z1) / 2;
      const flatTris = [], edgeTris = [];
      for (let t = side.start; t < side.start + side.count; t += 3) {
        let edge = false;
        for (let k = 0; k < 3; k++) if (Math.abs(p.getZ(t + k) - mid) > lim) edge = true;
        (edge ? edgeTris : flatTris).push(t);
      }
      const order = [];
      for (let i = 0; i < side.start; i++) order.push(i);
      flatTris.forEach((t) => order.push(t, t + 1, t + 2));
      edgeTris.forEach((t) => order.push(t, t + 1, t + 2));
      for (let i = side.start + side.count; i < p.count; i++) order.push(i);
      for (const name of Object.keys(geo.attributes)) {
        const a = geo.attributes[name], n = a.itemSize, src = a.array, dst = new src.constructor(src.length);
        order.forEach((from, to) => { for (let k = 0; k < n; k++) dst[to * n + k] = src[from * n + k]; });
        geo.setAttribute(name, new THREE.BufferAttribute(dst, n));
      }
      geo.clearGroups();
      geo.addGroup(0, side.start, 0);
      geo.addGroup(side.start, flatTris.length * 3, 1);
      geo.addGroup(side.start + flatTris.length * 3, edgeTris.length * 3, 2);
      if (side.start + side.count < p.count) geo.addGroup(side.start + side.count, p.count - side.start - side.count, 0);
    }
    return new THREE.Mesh(geo, [capMetal, sideMetal, edgeMetal]);
  };
  group.add(half(-T / 2, T / 2));


  // Inside the speaker: a dark floor and the walls of each hole
  const inside = new THREE.MeshStandardMaterial({ color: 0x4a4b4d, roughness: 0.85, metalness: 0, side: THREE.BackSide });
  {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(GRILLE.r + 4, 96),
      new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.9 }));
    floor.rotation.y = Math.PI; // faces the back
    floor.position.set(GRILLE.x, GRILLE.y, -T / 2 + GRILLE.depth);
    group.add(floor);
    const tube = new THREE.CylinderGeometry(GRILLE.hole, GRILLE.hole, GRILLE.depth, 14, 1, true);
    tube.rotateX(Math.PI / 2);
    const walls = new THREE.InstancedMesh(tube, inside, holes.length);
    const m = new THREE.Matrix4();
    holes.forEach(([x, y], i) => walls.setMatrixAt(i, m.makeTranslation(x, y, -T / 2 + GRILLE.depth / 2)));
    group.add(walls);
  }

  // Inside the port (USB-C style): a dark rounded pocket with a light-grey tongue running
  // along its middle, set back from the opening
  {
    // the pocket's walls (open-ended, only the inside is drawn), a touch bigger than the
    // opening so no sliver of it is left uncovered
    const walls = new THREE.MeshStandardMaterial({ color: 0x2e2f31, roughness: 0.75, metalness: 0.25, side: THREE.BackSide });
    // its walls run a hair past the surface, and it is well wider than the opening, so at
    // grazing angles the opening's soft edge always shows the dark inside, never through it
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(PORT.depth + 0.1, PORT.h + 3, PORT.w + 3, 4, (PORT.w + 3) / 2 - 0.05), walls);
    pocket.position.set(W / 2 - PORT.depth / 2 + 0.05, 0, 0);
    group.add(pocket);
    const end = new THREE.Mesh(new THREE.PlaneGeometry(PORT.w + 3, PORT.h + 3), new THREE.MeshStandardMaterial({ color: 0x101011, roughness: 0.9 }));
    end.rotation.y = Math.PI / 2;
    end.position.set(W / 2 - PORT.depth + 0.05, 0, 0);
    group.add(end);
    // the tongue: a thin rounded plate along the port's length, its face ~0.9 in
    const tongueLen = PORT.h * 0.68, tongueThick = PORT.w * 0.3, tongueDepth = PORT.depth - 0.9;
    const tongue = new THREE.Mesh(
      new RoundedBoxGeometry(tongueDepth, tongueLen, tongueThick, 4, tongueThick / 2 - 0.02),
      new THREE.MeshStandardMaterial({ color: 0xb4b6b8, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.8 }));
    tongue.position.set(W / 2 - 0.9 - tongueDepth / 2, 0, 0);
    group.add(tongue);
  }

  // Front: the captured player over the whole face (edges included, as in 2D)
  frontMat = decal(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, alphaMap: new THREE.CanvasTexture(frontHoleCanvas()) }));
  const FW = W - 2 * BEVEL, FH = H - 2 * BEVEL; // the flat of the face, inside the chamfer
  const front = new THREE.Mesh(flat(roundRect(FW, FH, R - BEVEL), FW, FH, 72), frontMat);
  front.position.z = T / 2 + 0.08;
  group.add(front);

  // Screen glass: a single soft glare, as from a light up to the left. It shows when the
  // screen turns towards that light and stays faint when it turns away (see render), and it
  // is nil face-on, so the switch from 2D is clean.
  {
    const SCR = { x: -W / 2 + 12.47 + 187.013 / 2, y: H / 2 - 12.47 - 132.987 / 2, w: 187.013, h: 132.987, r: 12.468 };
    const pane = flat(roundRect(SCR.w, SCR.h, SCR.r), SCR.w, SCR.h, 48);
    const glareTex = new THREE.CanvasTexture(screenGlareCanvas());
    glareMat = decal(new THREE.MeshBasicMaterial({ map: glareTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const glare = new THREE.Mesh(pane, glareMat);
    glare.position.set(SCR.x, SCR.y, T / 2 + 0.13);
    glare.renderOrder = 11; // always over the screen picture (it writes no depth to hold its place)
    group.add(glare);
    // and the glass itself: a faint, even lift over the whole screen once it turns, as glass
    // catches a little of the room's light
    glassWashMat = decal(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const wash = new THREE.Mesh(pane, glassWashMat);
    wash.position.set(SCR.x, SCR.y, T / 2 + 0.12);
    wash.renderOrder = 10;
    group.add(wash);
    // and a faint shade when it faces away from the light
    screenShadeMat = decal(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const shade = new THREE.Mesh(pane, screenShadeMat);
    shade.position.set(SCR.x, SCR.y, T / 2 + 0.115);
    shade.renderOrder = 9;
    group.add(shade);
    // glossy reflection (moves in render)
    const glossTex = new THREE.CanvasTexture(screenGlossCanvas());
    glossMat = decal(new THREE.MeshBasicMaterial({ map: glossTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const gloss = new THREE.Mesh(pane, glossMat);
    gloss.position.set(SCR.x, SCR.y, T / 2 + 0.14);
    gloss.renderOrder = 12;
    group.add(gloss);
  }

  // Wheel: stands a hair proud with a soft rim; the centre button sits a little below
  // its top. Face-on it is exactly the page's wheel; as it turns it shows its matte,
  // finely grained click-wheel plastic (soft light, darker rim) and its rim and four
  // dividing lines show as grooves (like the back's seams). Both fade in with the angle, so the switch from 2D is clean.
  {
    // the ring has the button's opening (offset a hair: the button isn't quite centred)
    // the ring slopes from its rim down to the button's edge (wheelDrop); its texture is laid
    // straight on from the front, so face-on it is still exactly the page's wheel
    const ringGeo = (outer) => {
      const A = 192, Rn = 16, hx = CENTER.x - WHEEL.x, hy = CENTER.y - WHEEL.y;
      const pos = [], uv = [], idx = [];
      for (let a = 0; a <= A; a++) {
        const th = (a / A) * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
        for (let k = 0; k <= Rn; k++) {
          const f = k / Rn;
          const x = (hx + CENTER.r * ca) * (1 - f) + outer * ca * f, y = (hy + CENTER.r * sa) * (1 - f) + outer * sa * f;
          const t = (Math.hypot(x - hx, y - hy) - CENTER.r) / (WHEEL.r - CENTER.r);
          pos.push(x, y, wheelDrop(t));
          uv.push(x / (2 * outer) + 0.5, y / (2 * outer) + 0.5);
        }
      }
      for (let a = 0; a < A; a++) for (let k = 0; k < Rn; k++) {
        const i0 = a * (Rn + 1) + k, i1 = i0 + Rn + 1;
        idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); // facing out (+z)
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    };
    const top = T / 2 + WHEEL.raise; // the wheel's top face
    // its rim: straight up from the body, then a soft rounded edge onto the top
    {
      const r = WHEEL.r, e = WHEEL.edge, pts = [new THREE.Vector2(r, 0), new THREE.Vector2(r, WHEEL.raise - e)];
      for (let i = 1; i <= 8; i++) { const a = (Math.PI / 2) * (i / 8); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, WHEEL.raise - e + Math.sin(a) * e)); }
      const rim = new THREE.Mesh(new THREE.LatheGeometry(pts, 160),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2b, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(WHEEL.x, WHEEL.y, T / 2);
      group.add(rim);
    }
    capMat = decal(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    const cap = new THREE.Mesh(ringGeo(WHEEL.r), capMat);
    cap.position.set(WHEEL.x, WHEEL.y, top + 0.01);
    // the wheel's layers draw in a fixed order (they write no depth to hold their place)
    cap.renderOrder = 2;
    group.add(cap);
    const matteTex = new THREE.CanvasTexture(wheelMatteCanvas());
    wheelSheen = decal(new THREE.MeshBasicMaterial({ map: matteTex, transparent: true, depthWrite: false, opacity: 0 }));
    const matte = new THREE.Mesh(ringGeo(WHEEL.r), wheelSheen);
    matte.position.set(WHEEL.x, WHEEL.y, top + 0.02);
    matte.renderOrder = 3;
    group.add(matte);
    const grainTex = new THREE.CanvasTexture(wheelGrainCanvas());
    grainTex.magFilter = THREE.NearestFilter;
    wheelGrain = decal(new THREE.MeshBasicMaterial({ map: grainTex, transparent: true, depthWrite: false, opacity: 0 }));
    const grainMesh = new THREE.Mesh(ringGeo(WHEEL.r), wheelGrain);
    grainMesh.position.set(WHEEL.x, WHEEL.y, top + 0.025);
    grainMesh.renderOrder = 4;
    group.add(grainMesh);
    const gTex = new THREE.CanvasTexture(wheelGroovesCanvas());
    gTex.colorSpace = THREE.SRGBColorSpace; gTex.anisotropy = 8;
    wheelGrooves = decal(new THREE.MeshBasicMaterial({ map: gTex, transparent: true, depthWrite: false, opacity: 0 }));
    const grooves = new THREE.Mesh(ringGeo(WHEEL.r + 1), wheelGrooves);
    grooves.position.set(WHEEL.x, WHEEL.y, top + 0.03);
    grooves.renderOrder = 5;
    group.add(grooves);
    // the centre button, CENTER.depth below the wheel's top, with the opening's short wall
    centerMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const inner = top - WHEEL.drop; // the ring's inner edge
    const button = new THREE.Mesh(new THREE.CircleGeometry(CENTER.r, 96), centerMat);
    button.position.set(CENTER.x, CENTER.y, inner - CENTER.depth);
    group.add(button);
    // a dark floor just under it, as wide as the wall, so nothing shows between the two
    const under = new THREE.Mesh(new THREE.CircleGeometry(CENTER.r + 0.3, 96), new THREE.MeshBasicMaterial({ color: 0x151516 }));
    under.position.set(CENTER.x, CENTER.y, inner - CENTER.depth - 0.03);
    group.add(under);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(CENTER.r + 0.08, CENTER.r + 0.08, CENTER.depth + 0.04, 192, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.7, side: THREE.BackSide }));
    wall.rotation.x = Math.PI / 2;
    wall.position.set(CENTER.x, CENTER.y, inner - CENTER.depth / 2 - 0.01); // a touch wider than the opening and up to its edge: no slit under the ring
    group.add(wall);
  }

  // Hold switch on top, in a dark slot
  {
    // the 2D switch's colours: #C3C5C6 → #F0F0F0 → #C3C5C6 across
    const hc = makeCanvas(256, 4), hg = hc.getContext('2d'), hgr = hg.createLinearGradient(0, 0, 256, 0);
    hgr.addColorStop(0, '#C3C5C6'); hgr.addColorStop(0.5, '#F0F0F0'); hgr.addColorStop(1, '#C3C5C6');
    hg.fillStyle = hgr; hg.fillRect(0, 0, 256, 4);
    const holdTex = new THREE.CanvasTexture(hc); holdTex.colorSpace = THREE.SRGBColorSpace;
    const hold = new THREE.Mesh(new RoundedBoxGeometry(HOLD.w, HOLD.h * 2, HOLD.d, 6, 1.0),
      new THREE.MeshBasicMaterial({ map: holdTex, toneMapped: false }));
    hold.position.set(HOLD.x, H / 2, 0);
    group.add(hold);
    const slot = new THREE.Mesh(flat(roundRect(HOLD.w + 1.2, HOLD.d + 1.2, 1.4), HOLD.w + 1.2, HOLD.d + 1.2, 12),
      decal(new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.8 })));
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(HOLD.x, H / 2 + 0.08, 0);
    group.add(slot);
  }

  // Back: seams, and screws with domed heads and a hex socket
  {
    const tex = new THREE.CanvasTexture(seamsCanvas());
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const seams = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      decal(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false })));
    seams.rotation.y = Math.PI;
    seams.position.z = -T / 2 - 0.08;
    group.add(seams);
    // domed head: a lathe profile from its rim (sunk 0.3) up over the dome (0.45 proud)
    const r = 1.95 * SK, pts = [new THREE.Vector2(0, 0.45)];
    for (let i = 1; i <= 10; i++) { const a = (Math.PI / 2) * (i / 10); pts.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * 0.45)); }
    pts.push(new THREE.Vector2(r, -0.3));
    const head = new THREE.LatheGeometry(pts, 40);
    head.rotateX(-Math.PI / 2); // its axis along -z: the dome faces the back
    const headMetal = new THREE.MeshStandardMaterial({ color: 0xd4d6d8, metalness: 0.35, roughness: 0.38, envMapIntensity: 0.8, side: THREE.DoubleSide });
    const socket = new THREE.CircleGeometry(0.62 * SK, 6);
    const socketMat = decal(new THREE.MeshStandardMaterial({ color: 0x2c2d2f, roughness: 0.7 }));
    for (const [sx, sy] of SCREWS) {
      const x = -sx, y = -sy; // the Back sketch is seen from behind
      const h = new THREE.Mesh(head, headMetal);
      h.position.set(x, y, -T / 2);
      group.add(h);
      const s = new THREE.Mesh(socket, socketMat);
      s.rotation.y = Math.PI;
      s.position.set(x, y, -T / 2 - 0.47);
      group.add(s);
    }
  }

  addEventListener('resize', layout);
  addEventListener('player-fit', layout);
}

// Capture the player as it looks now (without the hold switch, which is 3D)
// Text is drawn separately: html-to-image draws the system font (SF Pro) at the enlarged
// size, so it picks SF's tighter large-size letterforms and the 3D text came out ~4%
// narrower than the page. So the page is captured without its text (from an off-screen
// copy), and each line of text is then drawn with canvas at its own CSS size, exactly where
// it sits on the page, which gives the same letterforms as the page.
async function capture() {
  const k = scale();
  const ratio = Math.min(6, k * Math.min(devicePixelRatio || 1, 2));
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-30000px;top:0;width:560px;height:380.308px;pointer-events:none;';
  const copy = turnEl.cloneNode(true);
  copy.classList.add('is-capture');
  holder.appendChild(copy);
  document.body.appendChild(holder);
  let full;
  try {
    // the copy's images (wheel icons and the like size themselves from the picture) must be
    // loaded before it's laid out and captured, or they come out empty
    await Promise.all([...copy.querySelectorAll('img')].map((im) => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})));
    await new Promise((r) => requestAnimationFrame(r));
    full = await toCanvas(copy, {
      pixelRatio: ratio,
      skipFonts: true,
      filter: (n) => !(n.classList && n.classList.contains('hold')),
    });
  } finally {
    holder.remove();
  }
  drawText(full.getContext('2d'), ratio, k);
  const cut = (x, y, w, h) => {
    const c = makeCanvas(Math.round(w * ratio), Math.round(h * ratio));
    c.getContext('2d').drawImage(full, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  if (frontMat.map) frontMat.map.dispose();
  frontMat.map = cut(BODY_IN_TURN.x + BEVEL, BODY_IN_TURN.y + BEVEL, W - 2 * BEVEL, H - 2 * BEVEL);
  frontMat.needsUpdate = true;
  const r = WHEEL.r;
  if (capMat.map) capMat.map.dispose();
  capMat.map = cut(BODY_IN_TURN.x + W / 2 + WHEEL.x - r, BODY_IN_TURN.y + H / 2 - WHEEL.y - r, 2 * r, 2 * r);
  capMat.needsUpdate = true;
  const cr = CENTER.r;
  if (centerMat.map) centerMat.map.dispose();
  centerMat.map = cut(BODY_IN_TURN.x + W / 2 + CENTER.x - cr, BODY_IN_TURN.y + H / 2 - CENTER.y - cr, 2 * cr, 2 * cr);
  centerMat.needsUpdate = true;
}

// Draw the page's text onto the capture: every text node, line by line, with its font,
// colour, opacity, letter spacing and blur, clipped like on the page
function drawText(g, ratio, k) {
  const origin = turnEl.getBoundingClientRect();
  const toBase = (r) => ({ l: (r.left - origin.left) / k, t: (r.top - origin.top) / k, r: (r.right - origin.left) / k, b: (r.bottom - origin.top) / k });
  const walker = document.createTreeWalker(turnEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text.trim()) continue;
    const el = node.parentElement;
    if (el.closest('.hold')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // opacity and blur from the element up to the frame; clip to the nearest box that clips
    let alpha = 1, blur = 0, clip = null;
    for (let a = el; a && a !== turnEl; a = a.parentElement) {
      const as = getComputedStyle(a);
      alpha *= parseFloat(as.opacity);
      const m = /blur\(([\d.]+)px\)/.exec(as.filter);
      if (m) blur += parseFloat(m[1]);
      if (!clip && a !== el && as.overflow !== 'visible') clip = toBase(a.getBoundingClientRect());
      if (!clip && a === el && as.overflow !== 'visible') clip = toBase(a.getBoundingClientRect());
    }
    if (alpha < 0.01) continue;
    // split into lines: group words by where they sit
    const lines = [];
    const re = /\S+\s*/g;
    let m;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].trimEnd().length);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - r.top) < 1) last.text += m[0];
      else lines.push({ top: r.top, left: r.left, text: m[0], rect: r });
    }
    g.save();
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (clip) { g.beginPath(); g.rect(clip.l, clip.t, clip.r - clip.l, clip.b - clip.t); g.clip(); }
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    g.fillStyle = cs.color;
    g.globalAlpha = alpha;
    g.filter = blur ? `blur(${blur * ratio}px)` : 'none';
    g.textBaseline = 'alphabetic';
    for (const line of lines) {
      const b = toBase(line.rect);
      const met = g.measureText(line.text.trimEnd());
      g.fillText(line.text.trimEnd(), b.l, b.t + met.fontBoundingBoxAscent);
    }
    g.restore();
  }
}

const scale = () => Math.min(innerWidth / 560, innerHeight / 380.308) * 1.15269; // the stage's scale

// Line the camera up with the page: same size and place face-on
function layout() {
  if (!renderer) return;
  const vw = innerWidth, vh = innerHeight, k = scale();
  const ox = vw / 2 - 0.49 * k, oy = vh / 2 + 0.89 * k;       // body centre on screen
  const P = W * k * PERSPECTIVE;                                // camera to the front face
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(vh / 2 / P));
  camera.position.set(0, 0, (T / 2) * k + P);                   // the pivot is T/2 behind the face
  camera.near = Math.max(1, P - W * k * 0.7);                   // just around the body: fine depth steps
  camera.far = P + W * k * 0.7;
  camera.lookAt(0, 0, 0);
  camera.setViewOffset(vw, vh, vw / 2 - ox, vh / 2 - oy, vw, vh); // view centred on the body
  camera.updateProjectionMatrix();
  group.scale.setScalar(k);
  render();
}

function render() {
  if (!renderer || !on) return;
  group.rotation.y = angle;
  // the wheel's material shows once it turns away from face-on
  const turned = Math.min(1, Math.abs(Math.sin(angle)) * 2.2);
  wheelGrooves.opacity = turned;
  wheelSheen.opacity = turned;
  wheelGrain.opacity = turned;
  // the glare: stronger while the screen faces the light up to the left, faint facing away
  const towardLight = Math.max(0, -Math.sin(angle)), awayFromLight = Math.max(0, Math.sin(angle));
  glareMat.opacity = Math.min(1, towardLight * 1.6) * 0.7 + Math.min(1, awayFromLight * 1.6) * 0.15;
  glareMat.map.offset.x = -Math.sin(angle) * 0.12; // drifts a little as it turns
  // the screen brightens as it turns towards the light (left), up to 20%, and dims a little
  // as it faces away (coming round from the back it goes from a bit dark back to normal)
  glassWashMat.opacity = Math.min(1, towardLight * 1.8) * (0.12 + 0.08 * towardLight);
  // darkest (60%) as the screen first comes into view at 90°, down quickly to 30% by 70°,
  // then evenly to normal face-on
  {
    const deg = (Math.asin(Math.min(1, awayFromLight)) * 180) / Math.PI; // 0 face-on … 90 edge-on
    screenShadeMat.opacity = deg > 70 ? 0.3 + ((deg - 70) / 20) * 0.3 : (deg / 70) * 0.3;
  }
  // the glossy reflection: a sharp-edged sweep that crosses the glass faster than it turns,
  // as a light's reflection does on a phone screen
  glossMat.opacity = Math.min(1, towardLight * 1.8) * 0.2 + Math.min(1, awayFromLight * 1.8) * 0.04; // subtle
  glossMat.map.offset.x = 0.2 + Math.sin(angle) * 1.3;
  renderer.render(scene, camera);
}

// ---------- Turning on its own ----------
// 'spin': eases up to a steady turn; 'home': eases round to face-on, then hands back.
const FULL = Math.PI * 2, SPEED = FULL / TURN_SECONDS;
let homeFrom = 0, homeTo = 0, homeT0 = 0, homeMs = 0, homeDone = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'spin') {
    speed += (SPEED - speed) * Math.min(1, dt * 1.2); // gentle start
    angle -= speed * dt;
  } else if (mode === 'home') {
    const t = Math.min(1, (now - homeT0) / homeMs);
    angle = homeFrom + (homeTo - homeFrom) * ease(t);
    if (t >= 1) { mode = 'idle'; render(); homeDone(); return; }
  } else return;
  render();
  raf = requestAnimationFrame(frame);
}
const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

async function enter() {
  if (busy) return;
  busy = true;
  btn.setAttribute('aria-pressed', 'true'); // the switch shows on at once
  btn.setAttribute('aria-busy', 'true');
  try {
    await load();
    await capture();
  } catch (err) {
    console.error(err);
    busy = false; btn.removeAttribute('aria-busy'); btn.setAttribute('aria-pressed', 'false');
    return;
  }
  btn.removeAttribute('aria-busy');
  on = true; angle = 0; speed = 0;
  root.classList.add('is-3d');
  layout(); // face-on: same as the page
  requestAnimationFrame(() => {
    root.classList.add('is-3d-ready'); // the page fades out over it as it starts to turn
    mode = 'spin'; run();
    busy = false;
  });
}

function leave() {
  if (busy) return;
  busy = true;
  btn.setAttribute('aria-pressed', 'false'); // the switch shows off at once
  // carry on the way it turns to the next face-on, then the live page takes over again
  homeFrom = angle;
  homeTo = Math.floor(angle / FULL) * FULL;
  homeMs = 500 + (Math.abs(homeTo - homeFrom) / FULL) * 1400;
  homeT0 = performance.now();
  homeDone = () => {
    root.classList.add('is-3d-leaving');  // (and fades out with it, so no blurred edge is left behind)
    root.classList.remove('is-3d-ready'); // the live page comes back out of a blur, the 3D view blurs away…
    setTimeout(() => {                    // …then the 3D view goes
      on = false; angle = 0;
      root.classList.remove('is-3d', 'is-3d-leaving');
      busy = false;
    }, 480); // after the 450ms blur cross-fade
  };
  mode = 'home'; run();
}
