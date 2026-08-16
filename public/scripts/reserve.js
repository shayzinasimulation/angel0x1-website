/* Reserve flow (two-step, OTP). Plain static module — CSP script-src 'self'.
   No secrets client-side; all sensitive work is server-side in /api/reserve/*. */
(function () {
  var form = document.getElementById('reserve-form');
  if (!form) return;
  var email = document.getElementById('reserve-email');
  var codeRow = document.getElementById('reserve-code-row');
  var code = document.getElementById('reserve-code');
  var submit = document.getElementById('reserve-submit');
  var msg = document.getElementById('reserve-msg');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var step = 1;

  function setCounter(reserved, cap) {
    var remaining = Math.max(0, cap - reserved);
    var els = document.querySelectorAll('[data-counter]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = remaining > 0
        ? remaining.toLocaleString() + ' of ' + cap.toLocaleString() + ' spots left'
        : 'All ' + cap.toLocaleString() + ' spots reserved — general list soon';
    }
  }
  fetch('/api/waitlist/count')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && typeof d.reserved === 'number') setCounter(d.reserved, d.cap); })
    .catch(function () {});

  function setLoading(on, label) {
    var l = submit.querySelector('.btn-label');
    if (l) l.textContent = label;
    submit.disabled = on;
    email.disabled = on && step === 1;
    if (code) code.disabled = on;
  }
  function show(text, kind) { msg.textContent = text; msg.className = 'reserve-msg eyebrow ' + (kind || ''); }
  function fail(text) { show(text, 'err'); }

  function toStep2() {
    step = 2;
    codeRow.hidden = false;
    email.setAttribute('readonly', 'readonly');
    code.focus();
    var l = submit.querySelector('.btn-label');
    if (l) l.textContent = 'Verify & reserve';
    show('We emailed you a 6-digit code. Enter it to lock in your spot.', 'ok');
  }
  function done(remaining) {
    form.replaceChildren(); // safe clear (no innerHTML); success text lives in #reserve-msg outside the form
    show("You're in. Your launch code arrives when we ship — follow along below.", 'ok');
    if (typeof remaining === 'number') {
      var els = document.querySelectorAll('[data-counter]');
      for (var i = 0; i < els.length; i++) els[i].textContent = remaining.toLocaleString() + ' spots left';
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var hp = (form.elements.namedItem('website') || {}).value || '';
    if (hp) { done(); return; }

    if (step === 1) {
      var val = email.value.trim().toLowerCase();
      if (!EMAIL_RE.test(val)) { fail('Please enter a valid email.'); email.focus(); return; }
      setLoading(true, 'Sending code…');
      fetch('/api/reserve/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val, _hp: hp }),
      })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (r) {
          if (r.d && r.d.error === 'full') { fail('All spots are reserved right now.'); return; }
          if (r.s === 429) { fail('Too many requests — wait a moment.'); return; }
          if (!r.d || !r.d.ok) { fail('Could not send a code — try again.'); return; }
          if (r.d.devCode && code) code.value = r.d.devCode; // dev/preview only
          toStep2();
        })
        .catch(function () { fail('Something went wrong — try again.'); })
        .finally(function () { setLoading(false, 'Verify & reserve'); });
    } else {
      var c = (code.value || '').trim();
      if (!/^[0-9]{6}$/.test(c)) { fail('Enter the 6-digit code.'); code.focus(); return; }
      setLoading(true, 'Verifying…');
      fetch('/api/reserve/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim().toLowerCase(), code: c }),
      })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (r) {
          if (r.d && r.d.ok) { done(r.d.remaining); return; }
          var err = r.d && r.d.error;
          if (err === 'expired') fail('That code expired — start again.');
          else if (err === 'full') fail('The last spot just went. So close!');
          else if (err === 'ip_capped') fail('Reservation limit reached for this network.');
          else fail('That code is not right — try again.');
        })
        .catch(function () { fail('Something went wrong — try again.'); })
        .finally(function () { setLoading(false, 'Verify & reserve'); });
    }
  });
})();
