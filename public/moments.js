// Frames: reading order of the two-column photo grid.
// The photos stay in the columns they are placed in (that is the desktop layout). The order
// they are read in goes from the top: left to right, then on to whichever photo starts
// highest next (on a tie, the left one first), e.g. 1 → 4 → 7 → 5.
// That order is worked out from each photo's width/height attributes, so a new photo only
// needs to be added to a column with its real width and height. It is used for:
// - the mobile layout (one column), through CSS `order`
// - stepping to the next/previous photo in the zoom (zoom.js reads data-seq)
(function () {
  var grid = document.querySelector(".moments");
  if (!grid) return;

  var GAP = 8 / 276; // desktop gap between photos (8px), in column widths (276px)

  var placed = [];
  Array.prototype.forEach.call(grid.querySelectorAll(".moments__col"), function (col, c) {
    var top = 0;
    Array.prototype.forEach.call(col.querySelectorAll(".moments__image"), function (img) {
      var w = Number(img.getAttribute("width")) || 1;
      var h = Number(img.getAttribute("height")) || w;
      placed.push({ img: img, top: top, col: c });
      top += h / w + GAP;
    });
  });

  placed.sort(function (a, b) {
    return Math.abs(a.top - b.top) > 1e-6 ? a.top - b.top : a.col - b.col;
  });
  placed.forEach(function (p, i) {
    p.img.style.order = i;
    p.img.setAttribute("data-seq", i);
  });
})();
