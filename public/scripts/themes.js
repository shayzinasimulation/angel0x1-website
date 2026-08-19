/* The four themes as one tactile switch. Static module, CSP script-src 'self'.
   Swapping a theme recolors the whole section (cold material → warm ritual) and
   changes the mood line. Slow, held-breath transitions live in CSS. */
(function () {
  var stage = document.querySelector('.theme-stage');
  if (!stage) return;
  var plate = stage.querySelector('[data-theme-plate]');
  var mood = stage.querySelector('[data-mood]');
  var tabs = Array.prototype.slice.call(stage.querySelectorAll('.sw'));

  var COPY = {
    bone:     'Dry, quiet, close to the bone. For the nights you want it plain.',
    obsidian: 'The room goes dark and it just listens. Nothing performs for you here.',
    paper:    'Warm grain, soft ink. It feels like writing by hand, because that was the point.',
    glass:    'Cool and clear. You see straight through to what you actually meant.',
  };

  function select(name) {
    plate.setAttribute('data-theme-plate', name);
    if (mood && COPY[name]) mood.textContent = COPY[name];
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-theme') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { select(t.getAttribute('data-theme')); });
  });

  // arrow-key navigation across the swatches (a11y)
  stage.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    var next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    tabs[next].focus();
    select(tabs[next].getAttribute('data-theme'));
  });
})();
