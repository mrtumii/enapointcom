// Founding 50 reservation page: prices, counter, plan picker and checkout.
(async function () {
  const $ = (s) => document.querySelector(s);
  let cfg;
  try { cfg = await (await fetch('/api/founding50', { cache: 'no-store' })).json(); }
  catch (e) { $('#err').textContent = 'Could not load prices. Please refresh the page.'; $('#err').style.display = 'block'; return; }

  const fmt = (n, cur) => {
    if (n == null) return 'Price on request';
    const sym = { NGN: '₦', USD: '$', GBP: '£' }[cur];
    return sym + Number(n).toLocaleString('en-US', { maximumFractionDigits: cur === 'NGN' ? 0 : 2, minimumFractionDigits: cur === 'NGN' ? 0 : 0 });
  };

  // counter
  const total = cfg.totalSystems, taken = Math.min(cfg.reserved, total), left = total - taken;
  $('#total').textContent = total; $('#left').textContent = left; $('#taken').textContent = taken;
  requestAnimationFrame(() => { $('#barfill').style.width = (taken / total * 100) + '%'; });
  $('#dots').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < taken ? 'on' : ''}"></i>`).join('');
  if (left <= 0) { $('#paybtn').disabled = true; $('#paybtn').textContent = 'Founding 50 is full: join the waitlist on WhatsApp'; }

  // static text from config
  $('#window').textContent = 'Target: ' + cfg.installWindow;
  $('#refund').textContent = cfg.refundPolicy;
  $('#refund2').textContent = cfg.refundPolicy + ' Before installation, contact us and we will talk you through your options.';
  $('#addr').textContent = cfg.contact.address + '. Call ' + cfg.contact.phone + '.';
  $('#faddr').textContent = cfg.contact.address;
  $('#fcontact').innerHTML = `${cfg.contact.phone}<br>${cfg.contact.phoneUS} (US)<br><a href="mailto:${cfg.contact.email}">${cfg.contact.email}</a>`;
  $('#yr').textContent = new Date().getFullYear();
  const waLink = 'https://wa.me/' + cfg.contact.whatsapp + '?text=' + encodeURIComponent('Hello ENA, I am interested in the Founding 50.');
  $('#wa').href = waLink; $('#bm-wa').href = waLink; $('#bm-mail').href = 'mailto:' + cfg.contact.email + '?subject=Founding%2050%20transfer%20receipt';

  // state
  let mode = 'ng', cur = 'NGN', plan = cfg.nairaPlans[0].id;

  function amountFor(p) {
    if (mode === 'ng') return Math.round(cfg.nairaPrice * p.percent / 100);
    const full = cfg.diasporaPrice[cur];
    return full == null ? null : Math.round(full * p.percent) / 100;
  }

  function render() {
    const plans = mode === 'ng' ? cfg.nairaPlans : cfg.diasporaPlans;
    if (!plans.find((p) => p.id === plan)) plan = plans[0].id;
    $('#curbox').hidden = mode === 'ng';
    $('#tabintro').textContent = mode === 'ng'
      ? 'Pay in naira by card, bank transfer or USSD. Full system price: ' + fmt(cfg.nairaPrice, 'NGN') + '.'
      : 'Living in the US, UK or elsewhere? Pay here and we install at your family’s home in Nigeria. Full system price: ' + fmt(cfg.diasporaPrice[cur], cur) + '.';
    $('#addrlabel').textContent = mode === 'ng' ? 'Installation address' : 'Your family’s address in Nigeria (where we install)';
    $('#plans').innerHTML = plans.map((p) => `
      <label class="plan"><input type="radio" name="planpick" value="${p.id}" ${p.id === plan ? 'checked' : ''}>
        <div class="pn">${p.name}</div>
        <div class="pa">${fmt(amountFor(p), cur)}<span style="font-size:14px;color:var(--muted);font-weight:700"> ${p.percent < 100 ? 'today (' + p.percent + '%)' : 'today'}</span></div>
        <p class="pnote">${p.note}</p></label>`).join('');
    document.querySelectorAll('input[name=planpick]').forEach((r) => r.addEventListener('change', (e) => { plan = e.target.value; summary(); }));
    summary();
  }

  function summary() {
    const plans = mode === 'ng' ? cfg.nairaPlans : cfg.diasporaPlans;
    const p = plans.find((x) => x.id === plan);
    const a = amountFor(p);
    $('#paytotal').textContent = fmt(a, cur);
    $('#f-plan').value = p.id; $('#f-cur').value = cur; $('#f-amount').value = a == null ? '' : a;
    const off = a == null;
    $('#paybtn').disabled = left <= 0;
    $('#paybtn').textContent = left <= 0 ? 'Founding 50 is full' : off ? 'Price coming soon: message us on WhatsApp' : (mode === 'ng' ? 'Reserve and pay in naira' : 'Reserve and pay with card');
  }

  function setTab(t) {
    mode = t; cur = t === 'ng' ? 'NGN' : (document.querySelector('#curbox [aria-pressed=true]').dataset.cur);
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    render();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', () => setTab(a.dataset.goto)));
  document.querySelectorAll('#curbox button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#curbox button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    cur = b.dataset.cur; render();
  }));
  if (location.hash === '#abroad' || new URLSearchParams(location.search).get('tab') === 'abroad') setTab('abroad'); else render();

  // submit
  const form = $('#f50form'), err = $('#err');
  const showErr = (m) => { err.textContent = m; err.style.display = 'block'; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.style.display = 'none';
    if ($('#f-amount').value === '') { window.open(waLink, '_blank'); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.phone || !data.address) return showErr('Please fill in your name, phone and installation address.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) return showErr('Please enter a valid email address.');
    const btn = $('#paybtn'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';

    // 1) Record the reservation in Netlify Forms, so no lead is lost even if payment is abandoned.
    try {
      await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() });
    } catch (_) { /* continue to payment */ }

    // 2) Start payment.
    const endpoint = '/api/founding50/checkout';
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, plan, currency: cur }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Payment could not start.');
      if (d.url) { location.href = d.url; return; }
      if (d.mode === 'bank') {
        $('#bankbox').innerHTML = `
          <div><span>Bank</span><b>${d.bank.bankName}</b></div>
          <div><span>Account name</span><b>${d.bank.accountName}</b></div>
          <div><span>Account number</span><b>${d.bank.accountNumber}</b></div>
          <div><span>Amount</span><b>${fmt(d.amount, 'NGN')}</b></div>
          <div><span>Reference</span><b>${d.reference}</b></div>
          <div><span>Plan</span><b>${d.plan}</b></div>`;
        $('#bankmodal').classList.add('open');
      }
    } catch (ex) {
      showErr(ex.message + ' You can also reach us on WhatsApp.');
    } finally { btn.disabled = false; btn.textContent = label; }
  });
  $('#bm-close').addEventListener('click', () => $('#bankmodal').classList.remove('open'));
})();
