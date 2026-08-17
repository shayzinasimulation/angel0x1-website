/* Mobile menu overlay toggle. Static module, CSP script-src 'self'. */
(function () {
  var btn = document.getElementById('menu-btn');
  var overlay = document.getElementById('menu-overlay');
  if (!btn || !overlay) return;
  function focusable() {
    return Array.prototype.slice.call(
      overlay.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) { return el.offsetParent !== null; });
  }
  function set(open) {
    overlay.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    // Move focus into the overlay when it opens, and back to the button when it closes,
    // so keyboard/screen-reader users aren't left tabbing behind the modal.
    if (open) { var f = focusable(); if (f.length) f[0].focus(); }
    else { btn.focus(); }
  }
  btn.addEventListener('click', function () { set(!overlay.classList.contains('is-open')); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.closest('[data-close]') || e.target.tagName === 'A') set(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { set(false); return; }
    // Trap Tab within the overlay while it's open.
    if (e.key !== 'Tab' || !overlay.classList.contains('is-open')) return;
    var f = focusable();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();

