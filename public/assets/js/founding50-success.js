// Confirms the payment with the server (which asks Paystack or Stripe directly) before celebrating.
(async function () {
  const ref = new URLSearchParams(location.search).get('reference') || new URLSearchParams(location.search).get('trxref');
  const h = document.getElementById('s-h'), p = document.getElementById('s-p');
  if (!ref) return;
  const show = (title, body) => { h.textContent = title; p.textContent = body; };
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch('/api/founding50/verify/' + encodeURIComponent(ref), { cache: 'no-store' });
      const d = await r.json();
      if (d.status === 'paid') {
        return show("Thank you. You're one of the Founding 50", 'Payment confirmed (reference ' + ref + '). You will get a receipt by email, and the ENA team will call you within two working days to book your site survey.');
      }
      if (d.status === 'failed') {
        return show('Payment not completed', 'No payment was confirmed for reference ' + ref + '. If money left your account, contact us with this reference and we will sort it out.');
      }
    } catch (_) { /* retry */ }
    show('Confirming your payment…', 'Reference ' + ref + '. This usually takes a few seconds.');
    await new Promise((res) => setTimeout(res, 2500));
  }
  show('Payment received, confirmation pending', 'Reference ' + ref + '. Your bank has not confirmed yet; we will email you as soon as it does.');
})();
