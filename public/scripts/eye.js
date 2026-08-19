/* The winged eye watches. Static module, CSP script-src 'self'.
   The iris/gaze follows the pointer across the page — present, unblinking, never
   performing. Leans toward the email field on focus (it notices you reaching for it).
   Gated on prefers-reduced-motion; on touch it drifts on a slow idle path. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var eye = document.querySelector('[data-eye]');       // the whole mark (subtle lean)
  var gaze = document.querySelector('[data-eye] .gaze'); // iris+pupil group (tracks)
  if (!eye) return;
  if (reduce) return;

  var fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
  var cx = innerWidth / 2, cy = innerHeight / 3;
  var ec = { x: 0, y: 0 };
  function measure() { var r = eye.getBoundingClientRect(); ec.x = r.left + r.width / 2; ec.y = r.top + r.height / 2; }
  measure();
  addEventListener('resize', measure, { passive: true });
  addEventListener('scroll', measure, { passive: true });

  if (fine) addEventListener('pointermove', function (e) { cx = e.clientX; cy = e.clientY; }, { passive: true });

  var forced = null;
  ['reserve-email', 'reserve-code'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', function () { var r = el.getBoundingClientRect(); forced = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    el.addEventListener('blur', function () { forced = null; });
  });

  var gx = 0, gy = 0, lx = 0, ly = 0, t = 0;
  function frame() {
    t += 0.008;
    var tx, ty;
    if (forced) { tx = forced.x; ty = forced.y; }
    else if (fine) { tx = cx; ty = cy; }
    else { tx = ec.x + Math.cos(t) * innerWidth * 0.28; ty = ec.y + Math.sin(t * 1.3) * 120; } // touch idle drift
    var ax = Math.max(-1, Math.min(1, (tx - ec.x) / (innerWidth / 2)));
    var ay = Math.max(-1, Math.min(1, (ty - ec.y) / (innerHeight / 2)));
    // iris travel (SVG units) + a whole-mark lean (px)
    if (gaze) { gx += (ax * 34 - gx) * 0.06; gy += (ay * 20 - gy) * 0.06; gaze.style.transform = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px)'; }
    lx += (ax * 6 - lx) * 0.05; ly += (ay * 4 - ly) * 0.05;
    eye.style.transform = 'translate3d(' + lx.toFixed(2) + 'px,' + ly.toFixed(2) + 'px,0)';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
