/* Custom cursor + reactive winged-eye. Static module, CSP script-src 'self'.
   - A small dot follows the pointer with mix-blend-mode:difference (inverts over ink).
   - The hero eye drifts subtly toward the pointer ("it sees you") and leans toward the
     focused email/code field. The eye keeps its own idle blink/glance (from Mark.astro);
     here we only parallax the whole mark, so nothing fights those animations.
   Gated behind prefers-reduced-motion; cursor dot only on (pointer:fine). */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
  var dot = document.querySelector('.cursor');
  var eye = document.querySelector('[data-eye]');

  var cx = window.innerWidth / 2, cy = window.innerHeight / 2, dx = cx, dy = cy;

  if (fine && dot) {
    document.documentElement.classList.add('has-cursor');
    window.addEventListener('pointermove', function (e) { cx = e.clientX; cy = e.clientY; }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest('a,button,input,.swap,[data-cursor]')) dot.classList.add('is-lg');
    });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest('a,button,input,.swap,[data-cursor]')) dot.classList.remove('is-lg');
    });
  }

  var ecx = 0, ecy = 0;
  function measure() {
    if (!eye) return;
    var r = eye.getBoundingClientRect();
    ecx = r.left + r.width / 2; ecy = r.top + r.height / 2;
  }
  measure();
  window.addEventListener('resize', measure, { passive: true });

  var forced = null;
  function pt(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  ['reserve-email', 'reserve-code'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', function () { forced = pt(el); });
    el.addEventListener('blur', function () { forced = null; });
  });

  var ex = 0, ey = 0;
  function frame() {
    if (fine && dot) {
      dx += (cx - dx) * 0.2; dy += (cy - dy) * 0.2;
      dot.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) translate(-50%,-50%)';
    }
    if (eye) {
      var tx = forced ? forced.x : (fine ? cx : ecx);
      var ty = forced ? forced.y : (fine ? cy : ecy);
      var ax = Math.max(-1, Math.min(1, (tx - ecx) / (window.innerWidth / 2)));
      var ay = Math.max(-1, Math.min(1, (ty - ecy) / (window.innerHeight / 2)));
      ex += (ax * 16 - ex) * 0.06;
      ey += (ay * 10 - ey) * 0.06;
      eye.style.transform = 'translate3d(' + ex.toFixed(1) + 'px,' + ey.toFixed(1) + 'px,0)';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
