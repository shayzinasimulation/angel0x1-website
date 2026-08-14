/* Waitlist form handler. Plain JS static module (CSP script-src 'self').
   No secrets client-side — all sensitive work is server-side in /api/waitlist. */
(function () {
  var form   = document.getElementById('waitlist-form');
  var input  = document.getElementById('email');
  var submit = document.getElementById('waitlist-submit');
  var msg    = document.getElementById('form-msg');
  if (!form || !input || !submit || !msg) return;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Hydrate the "X / 5000 remaining" counter if the endpoint is live.
  fetch('/api/waitlist/count')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      var counter = document.getElementById('counter');
      if (counter && typeof d.count === 'number' && typeof d.cap === 'number') {
        var remaining = Math.max(0, d.cap - d.count);
        counter.textContent = remaining > 0
          ? remaining.toLocaleString() + ' free lifetime spots remaining'
          : 'Free lifetime cohort is full — general waitlist still open';
      }
    })
    .catch(function () {});

  function setLoading(on) {
    var label = submit.querySelector('.btn-label');
    if (label) label.textContent = on ? 'Sending…' : 'Reserve my spot';
    submit.disabled = on;
    input.disabled = on;
  }

  function showSuccess() {
    form.style.display = 'none';
    msg.textContent = "You're in. We'll reach out before launch.";
    msg.className = 'form-msg eyebrow ok';
    msg.style.display = 'block';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    msg.className = 'form-msg eyebrow';
    input.classList.remove('error');

    var hp = (form.elements.namedItem('website') || {}).value || '';
    if (hp) { showSuccess(); return; }

    var email = input.value.trim();
    if (!email || !EMAIL_RE.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className = 'form-msg eyebrow err';
      input.classList.add('error');
      input.focus();
      return;
    }

    setLoading(true);
    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, _hp: hp }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok || !r.d.ok) throw new Error((r.d && r.d.error) || 'error');
        showSuccess();
      })
      .catch(function (err) {
        var txt = (err && err.message ? err.message : '').toLowerCase();
        if (txt.indexOf('already') !== -1) {
          msg.textContent = "You're already on the list.";
          msg.className = 'form-msg eyebrow ok';
        } else {
          msg.textContent = 'Something went wrong — please try again.';
          msg.className = 'form-msg eyebrow err';
        }
      })
      .finally(function () { setLoading(false); });
  });
})();
