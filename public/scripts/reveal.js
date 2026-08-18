/* Scroll choreography: momentum scroll (Lenis) + progress bar + scroll-linked
   parallax/drift. Plain JS, same-origin module (CSP script-src 'self'), no inline code.

   Perf: element positions are measured ONCE on load/resize and cached. The per-frame
   loop only reads Lenis's already-smoothed scroll value and writes transforms — no
   getBoundingClientRect / layout reads per frame (that was the source of scroll jank). */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    // Mark that JS is live (CSS gates its hidden-until-revealed states on html.js so a
    // script failure still shows all content) and play the one-shot load reveal.
    document.documentElement.classList.add('js');
    var loadEl = document.querySelector('[data-load]');
    if (loadEl) window.requestAnimationFrame(function () { loadEl.classList.add('is-in'); });

    var bar = document.querySelector('.scrollbar');
    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));

    // Momentum scroll (Lenis). Tuned for cinematic weight: a longer glide (lower lerp)
    // and a slightly damped wheel so the page feels heavy and smooth, not twitchy.
    var lenis = null;
    if (!reduce && typeof window.Lenis === 'function') {
      lenis = new window.Lenis({ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false });
    }

    // Cached layout: viewport height, scrollable total, each parallax node's factor +
    // document-space center. Recomputed only on resize / load, never per frame.
    var vh = window.innerHeight;
    var total = 1;
    var items = nodes.map(function (el) {
      return { el: el, factor: parseFloat(el.getAttribute('data-parallax')) || 0, center: 0 };
    });

    function measure() {
      vh = window.innerHeight;
      total = Math.max(1, document.documentElement.scrollHeight - vh);
      var y = lenis ? lenis.scroll : window.scrollY;
      for (var i = 0; i < items.length; i++) {
        var el = items[i].el;
        el.style.transform = ''; // clear so the rect is the true layout position
        var r = el.getBoundingClientRect();
        items[i].center = r.top + y + r.height / 2;
      }
    }

    function render(scroll) {
      if (bar) bar.style.width = (scroll / total) * 100 + '%';
      if (reduce) return;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var mid = it.center - scroll - vh / 2; // distance of node center from viewport center
        it.el.style.transform = 'translate3d(0,' + (-mid * it.factor).toFixed(2) + 'px,0)';
      }
    }

    if (lenis) {
      // Single rAF loop drives Lenis; render off its smoothed scroll value.
      function raf(time) {
        lenis.raf(time);
        render(lenis.scroll);
        window.requestAnimationFrame(raf);
      }
      window.requestAnimationFrame(raf);
    } else {
      // Reduced-motion / no-Lenis: native scroll, rAF-throttled progress bar only.
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () { render(window.scrollY); ticking = false; });
      }, { passive: true });
    }

    measure();
    render(lenis ? lenis.scroll : window.scrollY);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);

    // Scroll-triggered reveals (IntersectionObserver — efficient, not part of the rAF loop).
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
    }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
