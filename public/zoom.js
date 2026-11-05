// Click-to-zoom for images, videos and live demos (an iframe inside .showcase).
// The clicked media is cloned at its final (centered) size and animated from its
// on-page position with a FLIP transform, so it stays crisp once open.
// While zoomed, the left/right half of the media (or the arrow keys) steps to the
// previous/next media on the page, looping at either end. A zoomed live demo is used
// instead (its clicks and arrow keys stay with it); Escape or a click outside closes it.
(function () {
  var SELECTOR = ".showcase, .work__image, .moments__image";
  var MAX_HEIGHT = 600;
  var OPEN_MS = 520;
  var CLOSE_MS = 440;
  var EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var SWAP_MS = 220;

  var state = null; // { source, clone, overlay, caption, closing }

  // Desktop demos show a short hint 16px under the zoomed media (Figma 1059:1111)
  var CAPTION_GAP = 16;
  var CAPTION_SPACE = 52; // gap + one 13px line + breathing room, kept clear below the media

  // Space kept around the zoomed media. On the mobile layout it goes edge to edge;
  // from 1440px wide it fills the screen height with 80px above and below (no height cap).
  function gutter() {
    if (window.matchMedia("(max-width: 1000px)").matches) return { x: 0, y: 16, max: MAX_HEIGHT };
    if (window.matchMedia("(min-width: 1440px)").matches) return { x: 40, y: 80, max: Infinity };
    return { x: 40, y: 40, max: MAX_HEIGHT };
  }

  // withCaption: keep room under the media for the hint (only needed where the gutter is
  // smaller than that room; the media then sits that much higher).
  function targetRect(aspect, withCaption) {
    var g = gutter();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var reserve = withCaption ? Math.max(0, CAPTION_SPACE - g.y) : 0;
    var h = Math.min(g.max, vh - g.y * 2 - reserve);
    var w = h * aspect;
    if (w > vw - g.x * 2) {
      w = vw - g.x * 2;
      h = w / aspect;
    }
    return { left: (vw - w) / 2, top: (vh - h - reserve) / 2, width: w, height: h };
  }

  // The hint for a zoomed demo, from hidden text on the page (so it is translated with it):
  // on desktop its own .zoom-hint under the media, on mobile one shared .zoom-hint-mobile
  // pinned 32px above the bottom of the screen.
  function zoomHint(source) {
    if (!demoFrame(source)) return null;
    if (!demosUsable()) {
      var shared = document.querySelector(".zoom-hint-mobile");
      return shared ? { text: shared.textContent.trim(), mobile: true } : null;
    }
    var figure = source.closest("figure");
    var hint = figure && figure.querySelector(".zoom-hint");
    return hint ? { text: hint.textContent.trim(), mobile: false } : null;
  }

  function placeCaption(caption, rect) {
    caption.style.top = rect.top + rect.height + CAPTION_GAP + "px";
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

  function demoFrame(el) {
    return el.querySelector("iframe");
  }

  // On the mobile layout a zoomed demo is just shown larger (its on-page preview, not usable)
  function demosUsable() {
    return !window.matchMedia("(max-width: 1000px)").matches;
  }

  function prepareClone(source, rect) {
    var clone = source.cloneNode(true);
    clone.removeAttribute("loading");
    clone.removeAttribute("tabindex");
    clone.removeAttribute("role");
    clone.classList.add("zoom-media");
    var frame = demoFrame(clone);
    if (frame) {
      frame.removeAttribute("loading");
      frame.removeAttribute("tabindex");
      // The page shows the demo's preview mode; zoomed in on desktop it opens its own,
      // usable version, on mobile the same preview stays (bigger) and can't be used
      if (demosUsable()) {
        if (frame.dataset.zoomSrc) frame.src = frame.dataset.zoomSrc;
      } else {
        clone.classList.add("is-preview");
      }
    }
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
  // Images wait (briefly) to be decoded, so a not-yet-loaded one never shows up blank.
  function ready(clone) {
    var frame = demoFrame(clone);
    if (frame) return demoReady(frame);
    var video = sourceVideo(clone);
    if (!video) {
      if (clone.tagName !== "IMG" || !clone.decode) return Promise.resolve();
      return Promise.race([
        clone.decode().catch(function () {}),
        new Promise(function (resolve) { setTimeout(resolve, 600); })
      ]);
    }
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

  // A zoomed demo starts fresh: wait (briefly) for it to load, and pass its Escape key on
  // to the zoom, since key presses inside it never reach this page.
  function demoReady(frame) {
    return new Promise(function (resolve) {
      var finished = false;
      var done = function () {
        if (finished) return;
        finished = true;
        try { frame.contentDocument.addEventListener("keydown", onKey); } catch (e) {}
        resolve();
      };
      frame.addEventListener("load", done, { once: true });
      setTimeout(done, 1000);
    });
  }

  // Leaving the zoom starts every on-page demo over from the beginning (frames that haven't
  // loaded yet are left to load on their own). Each frame is hidden while it reloads and
  // fades back in once loaded, so the jump back to the start is never seen.
  function restartDemos() {
    items().forEach(function (el) {
      var frame = demoFrame(el);
      if (!frame) return;
      try {
        if (frame.contentWindow.location.href === "about:blank") return;
      } catch (e) {}
      frame.style.transition = "none";
      frame.style.opacity = "0";
      frame.addEventListener("load", function () {
        requestAnimationFrame(function () {
          frame.style.transition = "";
          frame.style.opacity = "";
        });
      }, { once: true });
      try {
        frame.contentWindow.location.reload();
      } catch (e) {
        frame.src = frame.getAttribute("src");
      }
    });
  }

  function items() {
    return Array.prototype.slice.call(document.querySelectorAll(SELECTOR)).filter(function (el) {
      return !el.classList.contains("zoom-media");
    });
  }

  // Which half of the zoomed media the pointer is over: -1 left (previous), 1 right (next).
  function side(clone, clientX) {
    var r = clone.getBoundingClientRect();
    return clientX < r.left + r.width / 2 ? -1 : 1;
  }

  function trackSide(clone) {
    if (demoFrame(clone)) return; // the demo uses its own clicks
    clone.addEventListener("mousemove", function (e) {
      var dir = side(clone, e.clientX);
      clone.classList.toggle("is-prev", dir < 0);
      clone.classList.toggle("is-next", dir > 0);
    });
  }

  // Swap the zoomed media for the previous (-1) or next (1) one, cross-fading in place.
  function step(dir) {
    if (!state || state.closing) return;
    var list = items();
    if (list.length < 2) return;
    var index = list.indexOf(state.source);
    var next = list[(index + dir + list.length) % list.length];
    var s = state;
    var old = s.clone;

    // Bring the new source into view behind the overlay, so closing flies back to it.
    next.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    var r = next.getBoundingClientRect();
    var clone = prepareClone(next, targetRect(r.width / r.height));
    if (s.caption) {
      s.caption.remove();
      s.caption = null;
    }
    if (old.classList.contains("is-prev")) clone.classList.add("is-prev");
    if (old.classList.contains("is-next")) clone.classList.add("is-next");
    trackSide(clone);
    clone.style.opacity = "0";
    document.body.appendChild(clone);

    s.source.style.visibility = "";
    next.style.visibility = "hidden";
    s.source = next;
    s.clone = clone;

    var oldVideo = sourceVideo(old);
    if (oldVideo) oldVideo.pause();

    ready(clone).then(function () {
      if (state !== s || s.clone !== clone) {
        clone.remove();
        return;
      }
      var duration = reduceMotion.matches ? 1 : SWAP_MS;
      old.getAnimations().forEach(function (a) { a.cancel(); });
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration, easing: "ease-out", fill: "forwards" });
      clone.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration, easing: "ease-out", fill: "forwards" });
      clone.style.opacity = "";
      setTimeout(function () { old.remove(); }, duration + 50);
    });
  }

  function open(source) {
    if (state) return;
    // Hide the page scrollbar first, so both rects are measured in the final layout.
    document.documentElement.classList.add("is-zoomed");
    var from = source.getBoundingClientRect();
    var hint = zoomHint(source);
    var to = targetRect(from.width / from.height, Boolean(hint && !hint.mobile));

    var overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    var clone = prepareClone(source, to);
    clone.style.transform = invert(from, to);
    trackSide(clone);
    overlay.style.opacity = "0";

    document.body.appendChild(overlay);
    document.body.appendChild(clone);

    var caption = null;
    if (hint) {
      caption = document.createElement("p");
      caption.className = hint.mobile ? "zoom-caption zoom-caption--mobile" : "zoom-caption";
      caption.textContent = hint.text;
      caption.style.opacity = "0";
      if (!hint.mobile) placeCaption(caption, to);
      document.body.appendChild(caption);
    }

    state = { source: source, clone: clone, overlay: overlay, caption: caption, closing: false };

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
      if (caption) {
        caption.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: reduceMotion.matches ? 200 : OPEN_MS * 0.6,
          delay: reduceMotion.matches ? 0 : OPEN_MS * 0.4,
          easing: "ease-out",
          fill: "backwards"
        });
        caption.style.opacity = "";
      }
    });
  }

  function close() {
    if (!state || state.closing) return;
    state.closing = true;
    var s = state;
    restartDemos();
    // Bring the scrollbar back before measuring where the media returns to.
    document.documentElement.classList.remove("is-zoomed");

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
    if (s.caption) {
      s.caption.getAnimations().forEach(function (a) { a.cancel(); });
      s.caption.animate([{ opacity: getComputedStyle(s.caption).opacity }, { opacity: 0 }], {
        duration: 150, easing: "ease-out", fill: "forwards"
      });
    }

    var cleaned = false;
    var cleanup = function () {
      if (cleaned) return;
      cleaned = true;
      s.source.style.visibility = "";
      document.querySelectorAll(".zoom-media").forEach(function (el) {
        if (!demoFrame(el) || reduceMotion.matches) return el.remove();
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
        setTimeout(function () { el.remove(); }, 250);
      });
      s.overlay.remove();
      if (s.caption) s.caption.remove();
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
    el.setAttribute("aria-label", (el.getAttribute("alt") || el.querySelector("video")?.getAttribute("aria-label") || el.querySelector("iframe")?.getAttribute("title") || "Media") + " — open larger view");
    el.addEventListener("click", function () { open(el); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(el);
      }
    });
  });

  // Click the left/right half of the zoomed media to step; anywhere outside closes.
  document.addEventListener("click", function (e) {
    if (!state) return;
    var media = e.target.closest(".zoom-media");
    if (media) {
      if (media === state.clone && !demoFrame(media)) step(side(media, e.clientX));
      return;
    }
    if (e.target.closest(SELECTOR)) return;
    close();
  });

  function onKey(e) {
    if (!state) return;
    if (e.key === "Escape") close();
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !demoFrame(state.clone)) {
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    }
  }

  document.addEventListener("keydown", onKey);

  // Keep the page still while zoomed.
  ["wheel", "touchmove"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (state) e.preventDefault();
    }, { passive: false });
  });

  window.addEventListener("resize", function () {
    if (!state || state.closing) return;
    var r = state.source.getBoundingClientRect();
    var under = state.caption && !state.caption.classList.contains("zoom-caption--mobile");
    var to = targetRect(r.width / r.height, Boolean(under));
    var c = state.clone.style;
    c.left = to.left + "px";
    c.top = to.top + "px";
    c.width = to.width + "px";
    c.height = to.height + "px";
    if (under) placeCaption(state.caption, to);
  });
})();
