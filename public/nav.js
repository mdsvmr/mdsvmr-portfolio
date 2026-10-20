// Mobile header menu: the toggle expands the header to show the menu (Figma "Active").
(function () {
  var header = document.querySelector(".left__content");
  var toggle = document.querySelector(".menu-toggle");
  if (!header || !toggle) return;

  function setOpen(open) {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  toggle.addEventListener("click", function () {
    setOpen(!header.classList.contains("is-open"));
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Back to desktop layout: the menu is always visible there, so reset the state.
  window.matchMedia("(min-width: 1001px)").addEventListener("change", function (e) {
    if (e.matches) setOpen(false);
  });

  // Coming back via the back button (bfcache) should show the menu closed.
  window.addEventListener("pageshow", function () { setOpen(false); });

  // Mobile: hide the header while scrolling down, bring it back when scrolling up.
  var bar = document.querySelector(".left");
  var mobile = window.matchMedia("(max-width: 1000px)");
  var lastY = window.scrollY;
  var ticking = false;
  var THRESHOLD = 6; // ignore tiny scroll jitters

  function setHidden(hidden) {
    bar.classList.toggle("is-hidden", hidden);
  }

  function update() {
    ticking = false;
    var y = window.scrollY;
    var maxY = document.documentElement.scrollHeight - window.innerHeight;

    if (!mobile.matches || header.classList.contains("is-open") || y <= header.offsetHeight) {
      setHidden(false);
      lastY = y;
      return;
    }
    // iOS rubber-band at the bottom scrolls "up" on its own; don't react to it.
    if (y >= maxY) {
      lastY = Math.min(lastY, maxY);
      return;
    }

    var delta = y - lastY;
    if (Math.abs(delta) < THRESHOLD) return;
    setHidden(delta > 0);
    lastY = y;
  }

  if (bar) {
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    mobile.addEventListener("change", function () { setHidden(false); });
    // Keyboard users tabbing into the header should always see it.
    bar.addEventListener("focusin", function () { setHidden(false); });
  }
})();
