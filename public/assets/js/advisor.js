/* AI energy advisor (/advisor): a five-step survey that sizes a system live and
   sends the lead to /api/leads (and the advisor-lead inbox via Netlify Forms). */
(function () {
  "use strict";
  var root = document.querySelector("[data-advisor]");
  if (!root) return;

  var APPLIANCES = [
    { id: "ac", label: "Air conditioners (1.5HP)", w: 1100, em: "❄️" },
    { id: "fridge", label: "Fridge / freezer", w: 220, em: "🧊" },
    { id: "tv", label: "TVs", w: 120, em: "📺" },
    { id: "fan", label: "Fans", w: 70, em: "🌀" },
    { id: "light", label: "Light points", w: 15, em: "💡" },
    { id: "pump", label: "Water pump / borehole", w: 750, em: "🚰" },
  ];
  var PLACE_LABEL = { home: "a home", shop: "a shop", office: "an office", estate: "an estate" };
  var STEPS = ["place", "load", "backup", "result", "lead"];
  var state = { step: 0, place: null, counts: { ac: 1, fridge: 1, tv: 2, fan: 4, light: 8, pump: 0 }, backup: 6, pay: "monthly" };
  var plan = new URLSearchParams(location.search).get("plan") || "";

  var naira = function (n) { return "₦" + Math.round(n).toLocaleString("en-NG"); };
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var set = function (sel, v) { $$(sel).forEach(function (el) { el.textContent = v; }); };
  var toast = function (m) { if (window.ENA && ENA.toast) ENA.toast(m); };

  function size() {
    var load = APPLIANCES.reduce(function (s, a) { return s + (state.counts[a.id] || 0) * a.w; }, 0);
    var kva = load / 0.8 / 1000;
    var inv = [3, 5, 10, 15].find(function (x) { return x >= kva * 1.15; }) || 15;
    var need = (load * state.backup) / 1000;
    var batt = [5, 10, 15, 25, 30].find(function (x) { return x >= need; }) || 30;
    var kwp = Math.max(2.5, batt * 0.42);
    var panels = Math.max(4, Math.round(kwp / 0.62));
    var price = { 5: 1500000, 10: 2700000, 15: 3860000, 25: 5350000, 30: 6100000 }[batt] +
      { 3: 1100000, 5: 1500000, 10: 2200000, 15: 3300000 }[inv] + panels * 150000 + 300000 + panels * 35000 + 400000;
    price = Math.round(price / 50000) * 50000;
    return { load: load, kva: inv, batt: batt, panels: panels, kwp: Math.round(kwp * 100) / 100, price: price, monthly: (price * 0.6) / 24 };
  }

  // Appliance counters
  $("[data-appliances]").innerHTML = APPLIANCES.map(function (a) {
    return '<div class="appl-row"><span class="nm"><span class="em" aria-hidden="true">' + a.em + "</span>" + a.label + "</span>" +
      '<span class="counter"><button type="button" data-id="' + a.id + '" data-dir="-1" aria-label="Fewer ' + a.label + '">−</button>' +
      '<output data-count="' + a.id + '" aria-live="polite">' + state.counts[a.id] + "</output>" +
      '<button type="button" data-id="' + a.id + '" data-dir="1" aria-label="More ' + a.label + '">+</button></span></div>';
  }).join("");
  $$("[data-appliances] button").forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-id");
      state.counts[id] = Math.min(50, Math.max(0, (state.counts[id] || 0) + Number(b.getAttribute("data-dir"))));
      set('[data-count="' + id + '"]', state.counts[id]);
      live();
    });
  });

  function pressGroup(sel, apply) {
    var bs = $$(sel + " button");
    bs.forEach(function (b) {
      b.addEventListener("click", function () {
        bs.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        apply(b.getAttribute("data-v"));
        live();
      });
    });
  }
  pressGroup("[data-place]", function (v) { state.place = v; });
  pressGroup("[data-pay]", function (v) { state.pay = v; });
  var range = $("[data-backup]");
  range.addEventListener("input", function () { state.backup = Number(range.value); set("[data-backup-label]", range.value + "h"); live(); });

  function live() {
    if (!state.place && state.step === 0) {
      set('[data-live="name"]', "Let's begin"); set('[data-live="hint"]', "Pick what you're powering to start sizing.");
      $('[data-live="spec"]').hidden = true; return;
    }
    var r = size();
    set('[data-live="name"]', r.batt + " kWh · " + r.kva + " kVA");
    set('[data-live="hint"]', (state.place ? "For " + PLACE_LABEL[state.place] + " · " : "") + Math.round(r.load).toLocaleString("en-NG") + " W assessed load");
    set('[data-live="panels"]', r.panels + " panels"); set('[data-live="kwp"]', r.kwp + " kWp");
    set('[data-live="price"]', naira(r.price)); set('[data-live="monthly"]', naira(r.monthly) + "/mo");
    $('[data-live="spec"]').hidden = false;
    set('[data-r="size"]', r.batt + " kWh · " + r.kva + " kVA");
    set('[data-r="batt"]', r.batt + " kWh"); set('[data-r="kva"]', r.kva + " kVA");
    set('[data-r="panels"]', r.panels + " × 620 W"); set('[data-r="kwp"]', r.kwp + " kWp solar");
    set('[data-r="load"]', Math.round(r.load).toLocaleString("en-NG") + " W");
    set('[data-r="price"]', naira(r.price)); set('[data-r="monthly"]', naira(r.monthly) + "/mo");
  }

  function show(step) {
    state.step = step;
    var name = STEPS[step] || "done";
    $$("[data-step]").forEach(function (el) { el.hidden = el.getAttribute("data-step") !== name; });
    $$("[data-steps] i").forEach(function (i, n) { i.className = n <= step ? "done" : ""; });
    set("[data-step-label]", name === "done" ? "Done" : "Step " + (step + 1) + " of " + STEPS.length);
    $("[data-back]").hidden = step === 0 || name === "done";
    $("[data-nav]").hidden = name === "done";
    $("[data-next]").hidden = name === "lead";
    $("[data-next]").textContent = name === "result" ? "Looks good — continue" : "Continue";
    live();
  }

  $("[data-next]").addEventListener("click", function () {
    if (STEPS[state.step] === "place" && !state.place) { toast("Pick what you're powering first."); return; }
    show(Math.min(STEPS.length - 1, state.step + 1));
    var first = root.querySelector("[data-step]:not([hidden]) button, [data-step]:not([hidden]) input:not([type=hidden])");
    if (first) first.focus({ preventScroll: true });
  });
  $("[data-back]").addEventListener("click", function () { show(Math.max(0, state.step - 1)); });
  $("[data-restart]").addEventListener("click", function () { show(0); });

  var opened = Date.now();
  var form = $('form[data-step="lead"]');
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = form.querySelector("[data-msg]");
    var name = form.elements.name.value.trim(), email = form.elements.email.value.trim();
    if (!name || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      ENA.setMessage(msg, "Please add your name and a valid email for the quote.", "bad"); return;
    }
    var r = size();
    form.elements.summary.value = [
      "Powering: " + (state.place || "—"),
      "Appliances: " + APPLIANCES.map(function (a) { return a.label + " ×" + state.counts[a.id]; }).join(", "),
      "Backup: " + state.backup + "h · Pay: " + state.pay,
      "System: " + r.batt + " kWh, " + r.kva + " kVA, " + r.panels + " × 620 W (" + r.kwp + " kWp), " + Math.round(r.load) + " W load",
      "Indicative price: " + naira(r.price) + " · " + naira(r.monthly) + "/mo",
    ].join("\n");
    form.elements.plan.value = plan;
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      var res = await ENA.api("/api/leads", {
        method: "POST",
        body: {
          name: name, email: email, phone: form.elements.phone.value.trim(), place: state.place, appliances: state.counts,
          backupHours: state.backup, pay: state.pay, marketingOk: form.elements.marketingOk.checked,
          system: { batteryKwh: r.batt, inverterKva: r.kva, panels: r.panels, kwp: r.kwp, loadW: r.load, priceNaira: r.price },
          _hp: form.elements["bot-field"].value, _t: Date.now() - opened,
        },
      });
      ENA.sendToInbox(form, { "form-name": "advisor-lead" });
      set("[data-done-text]", "Thanks " + name.split(" ")[0] + " — your tailored quote is on its way (reference " + res.reference + "). We'll be in touch within one working day.");
      form.reset(); msg.hidden = true;
      show(STEPS.length);
    } catch (err) {
      ENA.setMessage(msg, err.message, "bad");
    } finally {
      button.disabled = false;
    }
  });

  show(0);
})();
