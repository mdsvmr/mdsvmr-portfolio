// Page reveal.
// - Intro (first visit and every refresh): logo holds in the center, glides into the
//   sidebar, then the main blocks rise + fade in one by one, followed by the menu.
// - Page enter (navigating between pages): the main blocks rise + fade in one by one.
(function () {
  var root = document.documentElement;
  if (window.__introRedirect) return; // a refresh is redirecting to Index

  var logo = document.querySelector(".left__content .logo");
  var main = document.querySelector(".main");
  var menu = document.querySelector(".menu");

  var HOLD_MS = 1000;
  var MOVE_MS = 1100;
  var EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  var FADE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  var MAIN_DELAY = 550; // first main item starts while the logo is settling
  var MAIN_STEP = 110; // gap between main items
  var MENU_GAP = 120; // pause between the last main item and the first menu item
  var MENU_STEP = 70; // gap between menu items
  var ITEM_MS = 800;
  var RISE = "translateY(6px)";

  var ENTER_DELAY = 120; // lets the previous page's content fade out first

  // Main blocks in reading order. Wrappers are expanded so each block appears on its own:
  // the Index/About intro into its paragraphs, the Moments grid into its photos.
  function mainItems() {
    var items = [];
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.classList.contains("intro")) {
        items.push.apply(items, el.children);
      } else if (el.classList.contains("moments")) {
        var photos = Array.prototype.slice.call(el.querySelectorAll(".moments__image"));
        photos.sort(function (a, b) {
          var ra = a.getBoundingClientRect();
          var rb = b.getBoundingClientRect();
          return ra.top - rb.top || ra.left - rb.left;
        });
        items.push.apply(items, photos);
      } else {
        items.push(el);
      }
    });
    // Only stagger what is on screen; anything off screen is simply shown.
    var limit = window.innerHeight;
    return items.filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.top < limit && r.bottom > 0;
    });
  }

  function rise(el, delay) {
    return el.animate(
      [{ opacity: 0, transform: RISE }, { opacity: 1, transform: "none" }],
      { duration: ITEM_MS, delay: delay, easing: FADE_EASE, fill: "both" }
    );
  }

  function settle(anims, total, cb) {
    var done = false;
    var end = function () {
      if (done) return;
      done = true;
      cb();
    };
    Promise.all(anims.map(function (a) { return a.finished; })).then(end, end);
    // Fallback in case the animation timeline is paused (e.g. background tab).
    setTimeout(end, total + 300);
  }

  function clear(els) {
    els.forEach(function (el) {
      el.getAnimations().forEach(function (a) { a.cancel(); });
      el.style.transform = "";
      el.style.opacity = "";
    });
  }

  // ---- Page enter -------------------------------------------------------
  if (root.classList.contains("is-enter")) {
    if (!main) {
      root.classList.remove("is-enter", "is-enter-ready");
      return;
    }
    var entering = mainItems();
    entering.forEach(function (el) { el.style.opacity = "0"; });
    root.classList.add("is-enter-ready");
    var enterAnims = entering.map(function (el, i) {
      var a = rise(el, ENTER_DELAY + i * MAIN_STEP);
      el.style.opacity = "";
      return a;
    });
    settle(enterAnims, ENTER_DELAY + Math.max(entering.length - 1, 0) * MAIN_STEP + ITEM_MS, function () {
      root.classList.remove("is-enter", "is-enter-ready");
      clear(entering);
    });
    return;
  }

  // ---- Intro ------------------------------------------------------------
  if (!root.classList.contains("is-intro")) return;
  if (!logo || !main || !menu) {
    root.classList.remove("is-intro", "is-intro-ready");
    return;
  }

  try { sessionStorage.setItem("intro-seen", "1"); } catch (e) {}
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // Keep the page still while the intro plays.
  var block = function (e) { e.preventDefault(); };
  window.addEventListener("wheel", block, { passive: false });
  window.addEventListener("touchmove", block, { passive: false });

  var staged = [];

  function finish() {
    root.classList.remove("is-intro", "is-intro-ready");
    clear([logo].concat(staged));
    window.removeEventListener("wheel", block);
    window.removeEventListener("touchmove", block);
  }

  function run() {
    window.scrollTo(0, 0);

    var items = mainItems();
    // Desktop: the sidebar menu items. Mobile: the menu is collapsed, so the
    // header's toggle and divider appear instead.
    var mobile = window.matchMedia("(max-width: 1000px)").matches;
    var links = mobile
      ? [".menu-toggle", ".left__divider"].map(function (q) { return document.querySelector(q); }).filter(Boolean)
      : Array.prototype.slice.call(menu.children);
    staged = items.concat(links);
    // Hide each item individually before the containers are revealed (same frame, no flash).
    staged.forEach(function (el) { el.style.opacity = "0"; });

    // Place the real logo exactly where the centered placeholder is.
    var r = logo.getBoundingClientRect();
    var dx = window.innerWidth / 2 - (r.left + r.width / 2);
    var dy = window.innerHeight / 2 - (r.top + r.height / 2);
    var start = "translate(" + dx + "px, " + dy + "px)";
    logo.style.transform = start;
    root.classList.add("is-intro-ready");

    setTimeout(function () {
      var anims = [];
      anims.push(logo.animate(
        [{ transform: start }, { transform: "translate(0px, 0px)" }],
        { duration: MOVE_MS, easing: EASE, fill: "forwards" }
      ));
      logo.style.transform = "";

      var reveal = function (el, delay) {
        anims.push(rise(el, delay));
        el.style.opacity = "";
      };

      items.forEach(function (el, i) { reveal(el, MAIN_DELAY + i * MAIN_STEP); });
      var menuStart = MAIN_DELAY + Math.max(items.length - 1, 0) * MAIN_STEP + MENU_GAP;
      links.forEach(function (el, i) { reveal(el, menuStart + i * MENU_STEP); });

      var total = Math.max(MOVE_MS, menuStart + Math.max(links.length - 1, 0) * MENU_STEP + ITEM_MS);
      settle(anims, total, finish);
    }, HOLD_MS);
  }

  var img = logo.querySelector("img");
  var started = false;
  var go = function () {
    var once = function () {
      if (started) return;
      started = true;
      run();
    };
    requestAnimationFrame(once);
    setTimeout(once, 100); // in case frames are throttled
  };
  if (img && !img.complete) {
    img.addEventListener("load", go, { once: true });
    img.addEventListener("error", go, { once: true });
  } else {
    go();
  }
})();
