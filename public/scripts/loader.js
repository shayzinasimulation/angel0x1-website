/* Cinematic entrance: a single spiral line draws itself on the warm-paper field, a red
   iris-dot settling at its center, then the veil lifts to reveal the hero. Canvas keeps
   it buttery (one path, no layout). CSP script-src 'self' — external module, no inline.
   prefers-reduced-motion: skip straight to the site. */
(function () {
  var veil = document.getElementById('veil');
  if (!veil) return;

  function reveal() {
    document.documentElement.classList.add('loaded');
    // fully remove after the fade so it never traps clicks
    setTimeout(function () { if (veil && veil.parentNode) veil.parentNode.removeChild(veil); }, 1100);
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { reveal(); return; }

  var canvas = veil.querySelector('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) { reveal(); return; }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W, H, cx, cy, R;
  function size() {
    W = canvas.width = innerWidth * dpr; H = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.30;
  }
  size();
  addEventListener('resize', size, { passive: true });

  var INK = '#1A1714', RED = '#B33A2B';
  var TURNS = 3.2, START = performance.now(), DRAW = 2000, HOLD = 420;
  // easeInOutCubic
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function frame(now) {
    var raw = Math.min((now - START) / DRAW, 1);
    var p = ease(raw);
    ctx.clearRect(0, 0, W, H);

    // spiral: r grows with angle; draw progressively to angle = p * total
    var total = TURNS * Math.PI * 2;
    var steps = Math.max(2, Math.floor(total / 0.05 * p));
    ctx.beginPath();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.55;
    var lastx = cx, lasty = cy;
    for (var i = 0; i <= steps; i++) {
      var a = (i / (total / 0.05)) * total;
      var r = (a / total) * R;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      lastx = x; lasty = y;
    }
    ctx.stroke();

    // leading iris dot
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.fillStyle = RED;
    ctx.arc(lastx, lasty, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

    if (raw < 1) { requestAnimationFrame(frame); }
    else { setTimeout(reveal, HOLD); }
  }
  requestAnimationFrame(frame);

  // safety: never trap the user if something stalls
  setTimeout(reveal, 4000);
})();
