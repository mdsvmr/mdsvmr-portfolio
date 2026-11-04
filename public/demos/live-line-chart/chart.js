// Live price chart: new ticks stream in from the right, the line scrolls left,
// the y-scale eases to fit, the live dot pulses and the clock labels scroll
// along with the data. Loops forever.
(() => {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Timing tuned to the reference recording
  const WINDOW_SEC = 18;        // seconds across the plot (5s labels ~97px apart, as in Figma)
  const TICK_MS = 250;          // a new price every 250ms
  const HEAD_EASE_SEC = 0.12;   // tip glides to each new price
  const SCALE_EASE_SEC = 0.35;  // y-axis rescale smoothing
  const PULSE_EVERY = 1.5;      // seconds between dot pulses
  const PULSE_DURATION = 0.9;   // ring grows and fades over this long
  const POINTS = Math.round((WINDOW_SEC * 1000) / TICK_MS);

  // Geometry from the Figma chart (canvas px)
  const RIGHT_INSET = 23;       // plot ends where the live dot sits
  const FILL_BOTTOM = 151;
  const GUIDE_INSET = 20;       // matches the baseline's side gutters
  const LABEL_EVERY_MS = 5000;  // a clock label every 5 seconds
  const LABEL_Y = 167;          // centre of the 18px label row under the baseline
  const LABEL_FADE = 24;        // px over which labels fade in/out at the gutters
  const SVG_W = 352.438, SVG_Y_OFFSET = 3 - 0.61;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let plotTop = 3.6, plotBottom = 131.6;
  let points = [];              // committed ticks: { t, v }
  let head = { v: 0, target: 0 };
  let range = { min: 0, max: 1 };
  let R = 1;                    // typical price range, drives volatility
  let mean = 0;
  let lastTick = 0, last = 0;

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1) * 2; // extra density: phone frame may be scaled
    W = canvas.offsetWidth; H = canvas.offsetHeight; // layout size, ignores the phone's scale()
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  // Seed with the exact line from the design so the first frame matches it
  async function seedFromDesign() {
    const src = canvas.dataset.seed;
    const text = await fetch(src).then((res) => res.text());
    const d = /\sd="([^"]+)"/.exec(text)[1];
    const svgNS = 'http://www.w3.org/2000/svg';
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    svg.appendChild(path);
    document.body.appendChild(svg);
    const len = path.getTotalLength();
    const raw = [];
    for (let i = 0; i <= 800; i++) {
      const p = path.getPointAtLength((len * i) / 800);
      raw.push({ u: 1 - p.x / SVG_W, y: SVG_Y_OFFSET + p.y }); // drawn mirrored in the design
    }
    svg.remove();
    raw.sort((a, b) => a.u - b.u);
    const ys = [];
    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      let j = raw.findIndex((p) => p.u >= u);
      if (j <= 0) j = j === 0 ? 1 : raw.length - 1;
      const a = raw[j - 1], b = raw[j];
      const k = b.u === a.u ? 0 : (u - a.u) / (b.u - a.u);
      ys.push(a.y + (b.y - a.y) * k);
    }
    return ys;
  }

  function seedRandom() {
    const ys = [];
    let y = 110;
    for (let i = 0; i < POINTS; i++) {
      y += (Math.random() - 0.55) * 6;
      ys.push(Math.min(128, Math.max(6, y)));
    }
    return ys;
  }

  function init(ys, now) {
    plotTop = Math.min(...ys);
    plotBottom = Math.max(...ys);
    const vals = ys.map((y) => -y); // higher price = higher on screen
    points = vals.slice(0, -1).map((v, i) => ({ t: now - (POINTS - 1 - i) * TICK_MS, v }));
    head.v = head.target = vals[vals.length - 1];
    range.min = Math.min(...vals);
    range.max = Math.max(...vals);
    R = range.max - range.min;
    mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    buildMoves(vals);
    priceAnchor = head.v;
    lastTick = now;
  }

  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Replays the design's own moves (trend removed) so the texture matches and
  // each cycle joins seamlessly; every pass gets its own scale, direction and noise.
  let moves = [], moveIdx = 0, cycleScale = 1, cycleSign = 1;
  function buildMoves(vals) {
    const d = vals.slice(1).map((v, i) => v - vals[i]);
    const avg = d.reduce((s, x) => s + x, 0) / d.length;
    moves = d.map((x) => x - avg);
  }
  function nextPrice(prev) {
    if (moveIdx >= moves.length) {
      moveIdx = 0;
      cycleScale = 0.6 + Math.random() * 0.4;
      cycleSign = Math.random() < 0.5 ? -1 : 1;
    }
    const step = moves[moveIdx++] * cycleScale * cycleSign;
    return prev + step + gauss() * R * 0.003 + (mean - prev) * 0.006;
  }

  function tick(now) {
    while (now - lastTick >= TICK_MS) {
      lastTick += TICK_MS;
      points.push({ t: lastTick, v: head.target });
      head.target = nextPrice(head.target);
    }
    const oldest = now - (WINDOW_SEC + 2) * 1000;
    while (points.length > 2 && points[1].t < oldest) points.shift();
  }

  function draw(now, dt) {
    const plotRight = W - RIGHT_INSET;
    const pxPerMs = plotRight / (WINDOW_SEC * 1000);

    // Ease the tip and the y-range
    head.v += (head.target - head.v) * (1 - Math.exp(-dt / HEAD_EASE_SEC));
    let lo = head.v, hi = head.v;
    for (const p of points) {
      if (now - p.t > WINDOW_SEC * 1000) continue;
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    const k = 1 - Math.exp(-dt / SCALE_EASE_SEC);
    range.min += (lo - range.min) * k;
    range.max += (hi - range.max) * k;
    const span = Math.max(range.max - range.min, R * 0.2);
    const yOf = (v) => plotBottom - ((v - range.min) / span) * (plotBottom - plotTop);

    const pts = points.map((p) => ({ x: plotRight - (now - p.t) * pxPerMs, y: yOf(p.v) }));
    pts.push({ x: plotRight, y: yOf(head.v) });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const trace = () => {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const end = pts[pts.length - 1];
      ctx.lineTo(end.x, end.y);
    };

    // Area fill, fading out toward the left like the design
    ctx.save();
    ctx.beginPath();
    trace();
    ctx.lineTo(plotRight, FILL_BOTTOM);
    ctx.lineTo(pts[0].x, FILL_BOTTOM);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, plotTop, 0, FILL_BOTTOM);
    fill.addColorStop(0, 'rgba(66, 208, 161, 0.16)');
    fill.addColorStop(1, 'rgba(66, 208, 161, 0)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, 0, plotRight, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.55, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Current-price guide
    const hy = yOf(head.v);
    ctx.save();
    ctx.setLineDash([4, 4]);
    // Ends fade to 0% so the guide melts into the chart, like the reference
    const guide = ctx.createLinearGradient(GUIDE_INSET, 0, W - GUIDE_INSET, 0);
    guide.addColorStop(0, 'rgba(66, 208, 161, 0)');
    guide.addColorStop(0.35, 'rgba(66, 208, 161, 0.35)');
    guide.addColorStop(0.9, 'rgba(66, 208, 161, 0.35)');
    guide.addColorStop(1, 'rgba(66, 208, 161, 0)');
    ctx.strokeStyle = guide;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Same span as the dashed baseline under the chart (20px gutters)
    ctx.moveTo(GUIDE_INSET, Math.round(hy) + 0.5);
    ctx.lineTo(W - GUIDE_INSET, Math.round(hy) + 0.5);
    ctx.stroke();
    ctx.restore();

    // Line: mint at the tip, green through the middle, fading to 0% at the left
    const stroke = ctx.createLinearGradient(0, 0, plotRight, 0);
    stroke.addColorStop(0, 'rgba(66, 208, 161, 0)');
    stroke.addColorStop(0.3, 'rgba(66, 208, 161, 0.55)');
    stroke.addColorStop(1 - 0.394231, '#42d0a1');
    stroke.addColorStop(1, '#8efad6');
    ctx.beginPath();
    trace();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    drawLabels(now, plotRight, pxPerMs);
    updatePrice(now, dt);

    // Pulse ring
    const phase = ((now / 1000) % PULSE_EVERY) / PULSE_DURATION;
    if (!reduceMotion && phase < 1) {
      const e = 1 - Math.pow(1 - phase, 3);
      ctx.beginPath();
      ctx.arc(plotRight, hy, 3 + e * 11, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(66, 208, 161, ${0.12 * (1 - phase)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(142, 250, 214, ${0.55 * (1 - phase)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Live dot (matches the design's dot + soft halo)
    ctx.beginPath();
    ctx.arc(plotRight, hy, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(plotRight, hy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#8efad6';
    ctx.fill();
  }

  // Header price follows the chart tip. Over 5s the move is small, so the price
  // is mapped to a ~$40 swing and held inside $3,600–$3,699.99: only the last
  // two whole digits and the cents ever change.
  const priceEl = document.getElementById('livePrice');
  const priceWhole = priceEl && priceEl.querySelector('[data-part="whole"]');
  const priceCents = priceEl && priceEl.querySelector('[data-part="cents"]');
  const PRICE_BASE = priceEl ? parseFloat(priceEl.dataset.base) : 0;
  const PRICE_SWING = 40;
  const PRICE_FLOOR = 3600, PRICE_CEIL = 3699.99;
  const PRICE_EASE_SEC = 0.25;  // shown price trails the tip a little
  const PRICE_UPDATE_MS = 150;  // and the digits change ~6-7x a second
  let priceAnchor = 0, lastTail = '', shownPrice = null, lastPriceUpdate = 0;
  function updatePrice(now, dt) {
    if (!priceWhole || !priceCents) return;
    let target = PRICE_BASE + ((head.v - priceAnchor) / R) * PRICE_SWING;
    target = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, target));
    if (shownPrice === null) shownPrice = target;
    shownPrice += (target - shownPrice) * (1 - Math.exp(-dt / PRICE_EASE_SEC));
    if (now - lastPriceUpdate < PRICE_UPDATE_MS) return;
    lastPriceUpdate = now;
    const tail = (shownPrice - PRICE_FLOOR).toFixed(2).padStart(5, '0');
    if (tail !== lastTail) {
      priceWhole.textContent = tail.slice(0, 2);
      priceCents.textContent = tail.slice(3);
      lastTail = tail;
    }
  }

  // Wall-clock labels (HH:MM:SS) pinned to their moment on the time axis
  const clockOffset = Date.now() - performance.now();
  const pad = (n) => String(n).padStart(2, '0');
  const LABEL_HOUR = '07'; // hour is pinned for the mockup; minutes/seconds stay live
  const fmt = (ms) => {
    const d = new Date(ms);
    return `${LABEL_HOUR}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  function drawLabels(now, plotRight, pxPerMs) {
    const wallNow = now + clockOffset;
    ctx.save();
    ctx.font = '12px "Helvetica Now Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const left = GUIDE_INSET, right = W - GUIDE_INSET;
    let t = Math.floor(wallNow / LABEL_EVERY_MS) * LABEL_EVERY_MS;
    for (; ; t -= LABEL_EVERY_MS) {
      const x = plotRight - (wallNow - t) * pxPerMs;
      const text = fmt(t);
      const half = ctx.measureText(text).width / 2;
      if (x + half < left - LABEL_FADE) break;
      // Fade in past the right gutter, fade out past the left one
      const aRight = Math.min(1, Math.max(0, 1 - (x + half - right) / LABEL_FADE));
      const aLeft = Math.min(1, Math.max(0, 1 - (left - (x - half)) / LABEL_FADE));
      const a = Math.min(aRight, aLeft);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#677489';
      ctx.fillText(text, x, LABEL_Y);
    }
    ctx.restore();
  }

  function frame(ts) {
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    // Tab was hidden: shift history forward instead of fast-forwarding
    if (dt > 0.5) {
      const gap = (dt - 1 / 60) * 1000;
      points.forEach((p) => (p.t += gap));
      lastTick += gap;
      dt = 1 / 60;
    }
    tick(now);
    draw(now, dt);
    requestAnimationFrame(frame);
  }

  async function start() {
    resize();
    let ys;
    try { ys = await seedFromDesign(); } catch { ys = seedRandom(); }
    const now = performance.now();
    init(ys, now);
    last = now;
    if (reduceMotion) { draw(now, 1); return; }
    requestAnimationFrame(frame);
  }

  // Lock the coin's 3s float to the same clock as the 1.5s dot pulse
  const coin = document.querySelector('.coin');
  if (coin) coin.style.animationDelay = `${-(performance.now() % (PULSE_EVERY * 2000))}ms`;

  window.addEventListener('resize', resize);
  start();
})();
