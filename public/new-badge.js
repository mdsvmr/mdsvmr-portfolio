// "New" badge: once the project has finished fading in (page intro) and is on screen,
// fade the word in and draw the pen scribble under it. Runs once per page view.
(function () {
  var badges = Array.prototype.slice.call(document.querySelectorAll(".new-badge"));
  if (!badges.length) return;

  var DELAY_MS = 500; // pause after the project is on screen before "New" shows

  // The intro fades each block in with an inline opacity / Web Animation; wait for it
  function settled(el) {
    var block = el.closest(".built__item") || el;
    return block.style.opacity !== "0" && !(block.getAnimations && block.getAnimations().length);
  }

  function draw(el) {
    (function wait() {
      if (!settled(el)) { setTimeout(wait, 100); return; }
      setTimeout(function () {
        el.classList.add("is-shown"); // the word fades in from a blur…
        setTimeout(function () { el.classList.add("is-drawn"); }, 450); // …then the pen scribble
      }, DELAY_MS);
    })();
  }

  if (!("IntersectionObserver" in window)) { badges.forEach(draw); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      draw(e.target);
    });
  }, { threshold: 0.6 });
  badges.forEach(function (el) { io.observe(el); });
})();
