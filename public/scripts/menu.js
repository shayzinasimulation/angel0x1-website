/* Mobile menu overlay toggle. Static module, CSP script-src 'self'. */
(function () {
  var btn = document.getElementById('menu-btn');
  var overlay = document.getElementById('menu-overlay');
  if (!btn || !overlay) return;
  function set(open) {
    overlay.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  btn.addEventListener('click', function () { set(!overlay.classList.contains('is-open')); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.closest('[data-close]') || e.target.tagName === 'A') set(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
})();
