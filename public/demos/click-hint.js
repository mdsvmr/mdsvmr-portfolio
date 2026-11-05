// Portfolio zoom: shows that a demo can be used. 1s after load a pointing-hand cursor glides
// onto the first thing to click, presses it with a small blue ripple and fades out, once.
// Not in the on-page / mobile preview (?preview); stops at the first click.
// Usage: <script src="/demos/click-hint.js" data-target="CSS selector"></script>
(function () {
  if (new URLSearchParams(location.search).has("preview")) return;
  var target = document.querySelector(document.currentScript.dataset.target);
  if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  var FROM = { x: 56, y: 44 }; // where the cursor glides in from, relative to the click point
  var SIZE = 40; // cursor box, on-screen px (pointing-hand.svg is drawn on a 32×32 grid)
  var TIP = { x: 12.4 * SIZE / 32, y: 8.2 * SIZE / 32 }; // fingertip, the click point
  var RIPPLE = 44; // ripple size at its widest, on-screen px
  var stopped = false;

  var layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;z-index:1000;pointer-events:none;overflow:hidden";

  var cursor = document.createElement("div");
  cursor.style.cssText = "position:absolute;width:" + SIZE + "px;height:" + SIZE + "px;opacity:0;" +
    "transform-origin:" + TIP.x + "px " + TIP.y + "px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.3))";
  cursor.innerHTML = '<img src="/demos/pointing-hand.svg" width="' + SIZE + '" height="' + SIZE + '" alt="" style="display:block">';

  layer.appendChild(cursor);
  document.body.appendChild(layer);

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var settle = function (a) { return a.finished.catch(function () {}); };

  // The click point: the target's centre, measured on screen (works at any demo scale)
  function clickPoint() {
    var r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function ripple(p) {
    var ring = document.createElement("div");
    ring.style.cssText = "position:absolute;width:" + RIPPLE + "px;height:" + RIPPLE + "px;" +
      "left:" + (p.x - RIPPLE / 2) + "px;top:" + (p.y - RIPPLE / 2) + "px;border-radius:50%;" +
      "border:1.5px solid #3c82f6;background:rgba(60,130,246,0.12)";
    layer.appendChild(ring);
    var a = ring.animate(
      [{ transform: "scale(0.2)", opacity: 0.9 }, { transform: "scale(1)", opacity: 0 }],
      { duration: 520, easing: "ease-out", fill: "forwards" }
    );
    settle(a).then(function () { ring.remove(); });
  }

  async function tap() {
    cursor.getAnimations().forEach(function (a) { a.cancel(); }); // drop the last fade-out
    var p = clickPoint();
    cursor.style.left = p.x - TIP.x + "px";
    cursor.style.top = p.y - TIP.y + "px";

    // Glide in and land on the target
    var glide = cursor.animate(
      [
        { opacity: 0, transform: "translate(" + FROM.x + "px," + FROM.y + "px)" },
        { opacity: 1, transform: "translate(" + FROM.x * 0.7 + "px," + FROM.y * 0.7 + "px)", offset: 0.25 },
        { opacity: 1, transform: "translate(0,0)" }
      ],
      { duration: 650, easing: EASE, fill: "forwards" }
    );
    await settle(glide);
    if (stopped) return;

    // Press, with the ripple at the fingertip
    ripple(p);
    await settle(cursor.animate(
      [{ transform: "scale(1)" }, { transform: "scale(0.84)", offset: 0.4 }, { transform: "scale(1)" }],
      { duration: 240, easing: "ease-out" }
    ));
    if (stopped) return;

    await wait(380);
    if (stopped) return;
    await settle(cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" }));
  }

  function stop() {
    stopped = true;
    layer.remove();
  }
  addEventListener("pointerdown", stop, { once: true });

  (async function () {
    await wait(1000);
    if (!stopped) await tap();
    stop();
  })();
})();
