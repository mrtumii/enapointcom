/* Pay-monthly planner (/pay-monthly). Pure client-side arithmetic. */
(function () {
  "use strict";
  var root = document.querySelector("[data-planner]");
  if (!root) return;

  var SYSTEMS = [
    { id: "pw5", name: "ENA Powerwall 5 — starter backup (5 kWh)", price: 3200000 },
    { id: "pw10", name: "Home 10 — 10 kWh + 5 kVA + solar", price: 6000000 },
    { id: "pw15", name: "Home+ 15 — 15 kWh + 10 kVA + solar", price: 8600000 },
    { id: "pw25", name: "Max 25 — 25 kWh + 10 kVA + solar", price: 12800000 },
    { id: "pw30", name: "Estate 30 — 30 kWh + 15 kVA + solar", price: 15200000 },
  ];
  var FULL_SPREAD_FEE = 0.035;
  var naira = function (n) { return "₦" + Math.round(n).toLocaleString("en-NG"); };
  var $ = function (s) { return root.querySelector(s); };
  var out = function (k, v) { var el = root.querySelector('[data-out="' + k + '"]'); if (el) el.textContent = v; };

  var params = new URLSearchParams(location.search);
  var start = SYSTEMS.findIndex(function (s) { return s.id === params.get("system"); });
  var state = { sys: start >= 0 ? start : 1, mode: "deposit", deposit: 0.4, tenor: 24 };

  var select = $("[data-pay-system]");
  select.innerHTML = SYSTEMS.map(function (s, i) { return '<option value="' + i + '">' + s.name + " — " + naira(s.price) + "</option>"; }).join("");
  select.value = String(state.sys);
  select.addEventListener("change", function () { state.sys = Number(select.value); calc(); });

  function group(selector, attr, apply) {
    var buttons = root.querySelectorAll(selector + " button");
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        apply(b.getAttribute(attr));
        calc();
      });
    });
  }
  group("[data-pay-mode]", "data-mode", function (v) { state.mode = v; $("[data-deposit-field]").hidden = v !== "deposit"; });
  group("[data-pay-deposit]", "data-d", function (v) { state.deposit = parseFloat(v); });

  var tenor = $("[data-pay-tenor]");
  tenor.addEventListener("input", function () { state.tenor = Number(tenor.value); $("[data-tenor-label]").textContent = tenor.value; calc(); });

  function calc() {
    var sys = SYSTEMS[state.sys], price = sys.price, t = state.tenor, deposit, balance, total;
    if (state.mode === "full") {
      total = Math.round(price * (1 + FULL_SPREAD_FEE)); deposit = 0; balance = total;
      out("note", "Full amount spread at +3.5% financing over " + t + " months");
      out("depLabel", "Deposit"); out("totLabel", "Total (incl. 3.5%)");
    } else {
      deposit = Math.round(price * state.deposit); balance = price - deposit; total = price;
      out("note", naira(deposit) + " deposit, balance over " + t + " months");
      out("depLabel", "Deposit (" + Math.round(state.deposit * 100) + "%)"); out("totLabel", "Total payable");
    }
    out("monthly", naira(balance / t) + "/mo");
    out("price", naira(price)); out("deposit", naira(deposit)); out("balance", naira(balance)); out("total", naira(total));
    var apply = $("[data-apply]");
    if (apply) apply.href = "/advisor?plan=" + encodeURIComponent(sys.id + "-" + (state.mode === "full" ? "full" : Math.round(state.deposit * 100)) + "-" + t);
  }
  calc();
})();
