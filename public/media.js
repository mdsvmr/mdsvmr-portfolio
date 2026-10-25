// Videos only load and play when they are near the screen, and pause once they scroll away.
// Keeps the page light: off-screen videos are neither downloaded nor decoded.
//
// iOS Safari can refuse to start videos from script (e.g. in Low Power Mode). So each video
// shows its first frame as soon as it loads, and if play() is refused, the on-screen videos
// start on the next tap.
(function () {
  var videos = Array.prototype.slice.call(document.querySelectorAll("video[data-src]"));
  if (!videos.length) return;

  var EAGER_COUNT = 2; // how many of the top videos load immediately
  var nearScreen = new Set();
  var retryArmed = false;

  function attach(video) {
    if (video.getAttribute("src")) return;
    // iOS only autoplays muted, inline videos; set the properties as well as the attributes.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    // "#t=0.001" makes iOS paint the first frame even before (or without) playback.
    video.src = video.getAttribute("data-src") + "#t=0.001";
  }

  function play(video) {
    attach(video);
    var p = video.play();
    if (p && p.catch) p.catch(armRetry);
  }

  // Autoplay was refused: start the videos that are on screen on the next user interaction.
  function armRetry() {
    if (retryArmed) return;
    retryArmed = true;
    var retry = function () {
      retryArmed = false;
      ["touchend", "click", "keydown"].forEach(function (type) {
        document.removeEventListener(type, retry, true);
      });
      nearScreen.forEach(play);
    };
    ["touchend", "click", "keydown"].forEach(function (type) {
      document.addEventListener(type, retry, true);
    });
  }

  if (!("IntersectionObserver" in window)) {
    videos.forEach(play);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;
      if (entry.isIntersecting) {
        nearScreen.add(video);
        play(video);
      } else {
        nearScreen.delete(video);
        if (!video.paused) video.pause();
      }
    });
  }, { rootMargin: "100px 0px" }); // start just before the video scrolls into view

  videos.forEach(function (video, i) {
    // The first videos on the page (newest work sits on top) start right away;
    // the rest wait until they are scrolled near.
    if (i < EAGER_COUNT) {
      nearScreen.add(video);
      play(video);
    }
    observer.observe(video);
  });
})();
