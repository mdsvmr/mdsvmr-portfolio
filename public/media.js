// Videos only load and play when they are near the screen, and pause once they scroll away.
// Keeps the page light: off-screen videos are neither downloaded nor decoded.
(function () {
  var videos = Array.prototype.slice.call(document.querySelectorAll("video[data-src]"));
  if (!videos.length) return;

  function play(video) {
    if (!video.getAttribute("src")) video.src = video.getAttribute("data-src");
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  if (!("IntersectionObserver" in window)) {
    videos.forEach(play);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;
      if (entry.isIntersecting) play(video);
      else if (!video.paused) video.pause();
    });
  }, { rootMargin: "200px 0px" }); // start a little before the video scrolls into view

  videos.forEach(function (video) { observer.observe(video); });
})();
