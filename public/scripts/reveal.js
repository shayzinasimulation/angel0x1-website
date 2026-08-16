/* Scroll-reveal + progress bar + smooth parallax. Plain JS, served as a static
   same-origin module so the strict CSP (script-src 'self') allows it, no inline code. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    var bar = document.querySelector('.scrollbar');
    var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));

    // Momentum scroll (Lenis, self-hosted). Disabled under reduced-motion.
    var lenis = null;
    if (!reduce && typeof window.Lenis === 'function') {
      lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    }

    function frame() {
      var y = window.scrollY;
      if (bar) {
        var total = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = total > 0 ? (y / total) * 100 + '%' : '0%';
      }
      if (!reduce) {
        for (var i = 0; i < parallax.length; i++) {
          var el = parallax[i];
          var f = parseFloat(el.getAttribute('data-parallax')) || 0;
          // translate relative to the element's own position for a natural drift
          var rect = el.getBoundingClientRect();
          var mid = rect.top + rect.height / 2 - window.innerHeight / 2;
          el.style.transform = 'translate3d(0,' + (-mid * f).toFixed(2) + 'px,0)';
        }
      }
    }

    // Single rAF loop drives Lenis + the progress bar + parallax.
    function raf(time) {
      if (lenis) lenis.raf(time);
      frame();
      window.requestAnimationFrame(raf);
    }
    window.requestAnimationFrame(raf);
    window.addEventListener('resize', frame, { passive: true });

    // Reveal on enter
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
