/* Scroll-reveal + progress bar. Plain JS, served as a static same-origin module so
   the strict CSP (script-src 'self') allows it with no inline script. */
(function () {
  function init() {
    var bar = document.querySelector('.scrollbar');
    if (bar) {
      var update = function () {
        var scrolled = window.scrollY;
        var total = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = total > 0 ? (scrolled / total) * 100 + '%' : '0%';
      };
      window.addEventListener('scroll', update, { passive: true });
      update();
    }

    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach(function (el) { observer.observe(el); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
