/* Live meter lookup on /meter: reads GET /api/meters/:number/live. */
(function () {
  var host = document.querySelector("[data-live]");
  if (!host) return;
  var form = host.querySelector("[data-live-form]");
  var out = host.querySelector("[data-live-out]");

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, digits) {
    return typeof n === "number" ? n.toLocaleString("en-NG", { maximumFractionDigits: digits }) : "—";
  }
  function row(k, v) {
    return '<div class="spec-row"><span class="k">' + esc(k) + '</span><span class="v">' + v + "</span></div>";
  }
  function ago(iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return "—";
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
  }

  function render(live) {
    var remaining = live.remainingKwh;
    // The bar is relative to a 200 kWh reference so typical balances read at a glance.
    var pct = typeof remaining === "number" ? Math.max(2, Math.min(100, (remaining / 200) * 100)) : 0;
    out.innerHTML =
      '<div class="readout"><b>' + fmt(remaining, 1) + "</b><span>kWh on the meter</span></div>" +
      '<div class="bar" style="margin-top:12px"><i></i></div>' +
      '<div style="margin:14px 0 0">' +
      row("Status", live.online ? "Online" : "Offline") +
      row("Last report", esc(ago(live.updatedAt))) +
      row("Load now", fmt(live.powerKw, 2) + " kW") +
      row("Energy used", fmt(live.energyKwh, 1) + " kWh") +
      "</div>" +
      '<p class="note">' + (live.online ? "Reported by the meter over the Acrel network" : "Offline meters queue any purchase until they reconnect") + "</p>";
    out.querySelector(".bar > i").style.width = pct + "%";
  }

  function message(text) {
    out.innerHTML = '<div class="readout"><b>&mdash;</b><span>kWh on the meter</span></div><p class="note">' + esc(text) + "</p>";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var meter = form.querySelector('[name="meter"]').value.replace(/[\s-]/g, "");
    if (!/^[A-Za-z0-9_.]{4,64}$/.test(meter)) return message("Check the meter number and try again.");
    message("Reading the meter…");
    fetch("/api/meters/" + encodeURIComponent(meter) + "/live", { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (r) {
        if (r.ok && r.body.live) return render(r.body.live);
        message(r.body.error || "Couldn't read that meter right now.");
      })
      .catch(function () { message("Couldn't reach the meter service. Try again shortly."); });
  });

  // Prefill from the top-up form so one number serves both.
  var topup = document.getElementById("tu-meter");
  if (topup) topup.addEventListener("change", function () {
    var f = form.querySelector('[name="meter"]');
    if (!f.value) f.value = topup.value;
  });
})();
