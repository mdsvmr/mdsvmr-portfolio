// Click-to-zoom for images and videos.
// The clicked media is cloned at its final (centered) size and animated from its
// on-page position with a FLIP transform, so it stays crisp once open.
(function () {
  var SELECTOR = ".showcase, .work__image, .moments__image";
  var MAX_HEIGHT = 600;
  var OPEN_MS = 520;
  var CLOSE_MS = 440;
  var EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var state = null; // { source, clone, overlay, closing }

  // Space kept around the zoomed media. On the mobile layout it goes edge to edge.
  function gutter() {
    var mobile = window.matchMedia("(max-width: 1000px)").matches;
    return mobile ? { x: 0, y: 16 } : { x: 40, y: 40 };
  }

  function targetRect(aspect) {
    var g = gutter();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var h = Math.min(MAX_HEIGHT, vh - g.y * 2);
    var w = h * aspect;
    if (w > vw - g.x * 2) {
      w = vw - g.x * 2;
      h = w / aspect;
    }
    return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
  }

  function invert(from, to) {
    return (
      "translate(" + (from.left - to.left) + "px, " + (from.top - to.top) + "px) " +
      "scale(" + from.width / to.width + ", " + from.height / to.height + ")"
    );
  }

  function sourceVideo(el) {
    return el.tagName === "VIDEO" ? el : el.querySelector("video");
  }

  function prepareClone(source, rect) {
    var clone = source.cloneNode(true);
    clone.removeAttribute("loading");
    clone.removeAttribute("tabindex");
    clone.removeAttribute("role");
    clone.classList.add("zoom-media");
    clone.style.left = rect.left + "px";
    clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";

    var srcVideo = sourceVideo(source);
    var video = sourceVideo(clone);
    if (srcVideo && video) {
      // Lazy-loaded videos (media.js) may not have their source attached yet.
      if (!video.getAttribute("src") && video.getAttribute("data-src")) {
        video.src = video.getAttribute("data-src");
      }
      video.muted = true;
      video.preload = "auto";
      clone._syncTime = srcVideo.currentTime;
    }
    return clone;
  }

  // Seek the cloned video to the source's time and wait (briefly) for that frame,
  // so the zoomed video continues exactly where it was and never flashes empty.
  function ready(clone) {
    var video = sourceVideo(clone);
    if (!video) return Promise.resolve();
    return new Promise(function (resolve) {
      var finished = false;
      var done = function () {
        if (finished) return;
        finished = true;
        video.play().catch(function () {});
        resolve();
      };
      var seek = function () {
        video.addEventListener("seeked", done, { once: true });
        video.currentTime = clone._syncTime || 0;
      };
      if (video.readyState >= 1) seek();
      else video.addEventListener("loadedmetadata", seek, { once: true });
      setTimeout(done, 300);
    });
  }

  function open(source) {
    if (state) return;
    var from = source.getBoundingClientRect();
    var to = targetRect(from.width / from.height);

    var overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    var clone = prepareClone(source, to);
    clone.style.transform = invert(from, to);
    overlay.style.opacity = "0";

    document.body.appendChild(overlay);
    document.body.appendChild(clone);
    document.documentElement.classList.add("is-zoomed");

    state = { source: source, clone: clone, overlay: overlay, closing: false };

    ready(clone).then(function () {
      if (!state || state.clone !== clone) return;
      source.style.visibility = "hidden";
      var duration = reduceMotion.matches ? 1 : OPEN_MS;
      overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: reduceMotion.matches ? 200 : OPEN_MS * 0.7,
        easing: "ease-out",
        fill: "forwards"
      });
      clone.animate([{ transform: invert(from, to) }, { transform: "none" }], {
        duration: duration,
        easing: EASE,
        fill: "forwards"
      });
      clone.style.transform = "none";
      overlay.style.opacity = "1";
    });
  }

  function close() {
    if (!state || state.closing) return;
    state.closing = true;
    var s = state;

    var current = s.clone.getBoundingClientRect();
    var base = {
      left: parseFloat(s.clone.style.left),
      top: parseFloat(s.clone.style.top),
      width: parseFloat(s.clone.style.width),
      height: parseFloat(s.clone.style.height)
    };
    var back = s.source.getBoundingClientRect();
    var currentOpacity = getComputedStyle(s.overlay).opacity;

    s.clone.getAnimations().forEach(function (a) { a.cancel(); });
    s.overlay.getAnimations().forEach(function (a) { a.cancel(); });

    // Keep the source video in sync with what was playing in the zoomed view.
    var srcVideo = sourceVideo(s.source);
    var cloneVideo = sourceVideo(s.clone);
    if (srcVideo && cloneVideo) srcVideo.currentTime = cloneVideo.currentTime;

    var duration = reduceMotion.matches ? 1 : CLOSE_MS;
    var anim = s.clone.animate(
      [{ transform: invert(current, base) }, { transform: invert(back, base) }],
      { duration: duration, easing: EASE, fill: "forwards" }
    );
    s.overlay.animate([{ opacity: currentOpacity }, { opacity: 0 }], {
      duration: reduceMotion.matches ? 200 : CLOSE_MS * 0.8,
      easing: "ease-in-out",
      fill: "forwards"
    });

    var cleaned = false;
    var cleanup = function () {
      if (cleaned) return;
      cleaned = true;
      s.source.style.visibility = "";
      s.clone.remove();
      s.overlay.remove();
      document.documentElement.classList.remove("is-zoomed");
      if (state === s) state = null;
      if (s.source.focus) s.source.focus({ preventScroll: true });
    };
    anim.finished.then(cleanup, cleanup);
    // Fallback in case the animation timeline is paused (e.g. background tab).
    setTimeout(cleanup, duration + 150);
  }

  document.querySelectorAll(SELECTOR).forEach(function (el) {
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", (el.getAttribute("alt") || el.querySelector("video")?.getAttribute("aria-label") || "Media") + " — open larger view");
    el.addEventListener("click", function () { open(el); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(el);
      }
    });
  });

  // Close by clicking anywhere outside the zoomed media, or with Escape.
  document.addEventListener("click", function (e) {
    if (!state) return;
    if (e.target.closest(".zoom-media")) return;
    if (e.target.closest(SELECTOR)) return;
    close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  // Keep the page still while zoomed.
  ["wheel", "touchmove"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (state) e.preventDefault();
    }, { passive: false });
  });

  window.addEventListener("resize", function () {
    if (!state || state.closing) return;
    var r = state.source.getBoundingClientRect();
    var to = targetRect(r.width / r.height);
    var c = state.clone.style;
    c.left = to.left + "px";
    c.top = to.top + "px";
    c.width = to.width + "px";
    c.height = to.height + "px";
  });
})();
