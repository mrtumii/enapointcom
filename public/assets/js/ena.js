/* Enapoint — shared front-end behaviour.
   Plain ES modules-free script: every page includes it and calls what it needs. */

(function () {
  "use strict";

  /* ------------------------------------------------------------------- theme */

  var STORAGE_KEY = "ena-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var icon = theme === "night" ? "☾" : "☀";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (el) {
      el.textContent = icon;
      el.setAttribute("aria-label", theme === "night" ? "Switch to day theme" : "Switch to night theme");
    });
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(stored || (prefersDark ? "night" : "day"));

    document.querySelectorAll("[data-theme-toggle]").forEach(function (el) {
      el.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "night" ? "day" : "night";
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
        applyTheme(next);
      });
    });
  }

  /* ------------------------------------------------------------ mobile menu */

  function initNav() {
    var header = document.querySelector(".site-header");
    var toggle = document.querySelector("[data-nav-toggle]");
    if (!header || !toggle) return;
    function set(open) {
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    toggle.addEventListener("click", function () { set(!header.classList.contains("nav-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    header.querySelectorAll(".site-nav a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  /* --------------------------------------------------------------------- api */

  // Visitors never see raw server or network failures; 4xx messages are written
  // for people and are shown as they are.
  var FRIENDLY_ERROR = "We couldn't complete that just now. Please try again in a moment, or email info@enapoint.com.";

  async function api(path, options) {
    options = options || {};
    var init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (options.raw) { init.body = options.raw; delete init.headers["content-type"]; }
    var res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      var offline = new Error("You appear to be offline. Check your connection and try again.");
      offline.status = 0;
      throw offline;
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      var readable = res.status < 500 && data && data.error;
      var err = new Error(readable ? data.error : FRIENDLY_ERROR);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ------------------------------------------------------------- formatting */

  function naira(kobo) {
    if (kobo === null || kobo === undefined) return "—";
    var value = kobo / 100;
    return "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: value % 1 ? 2 : 0 });
  }

  function kwh(milli) {
    return ((milli || 0) / 1000).toFixed(1) + " kWh";
  }

  function when(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * Posts a form to Netlify Forms, which emails each submission to the inbox set
   * for that form (enquiries → info@, registrations → signup@). Resolves true/false,
   * never throws, so it can run alongside the database write.
   */
  function sendToInbox(form, extra) {
    if (!form || !form.getAttribute("name")) return Promise.resolve(false);
    var data = new FormData(form);
    Object.keys(extra || {}).forEach(function (k) { data.set(k, extra[k]); });
    return fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(),
    })
      .then(function (res) { return res.ok; })
      .catch(function () { return false; });
  }

  // Anti-bot signals for the API: the honeypot's value and how long the page was
  // open. People leave the honeypot empty and take more than a couple of seconds.
  var PAGE_OPENED = Date.now();

  function jsonFromForm(form) {
    var body = {};
    new FormData(form).forEach(function (value, key) {
      if (key === "form-name" || key === "subject") return;
      if (key === "bot-field") { body._hp = value; return; }
      var field = form.querySelector('[name="' + key + '"]');
      body[key] = field && field.dataset.number !== undefined ? Number(value) : value;
    });
    body._t = Date.now() - PAGE_OPENED;
    return body;
  }

  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "msg " + (kind || "");
    el.hidden = !text;
  }

  /* ------------------------------------------------------- live status panel */

  function initStatus() {
    var host = document.querySelector("[data-status-panel]");
    if (!host) return;
    api("/api/status")
      .then(function (data) {
        var head = host.querySelector("[data-status-headline]");
        if (head) head.textContent = data.headline;
        var list = host.querySelector("[data-status-list]");
        if (!list) return;
        list.innerHTML = data.checks
          .map(function (c) {
            var cls = c.state === "operational" ? "ok" : "warn";
            return (
              '<div class="spec-row"><span class="k">' + escapeHtml(c.name) + "</span>" +
              '<span class="v"><span class="tag ' + cls + '">' + escapeHtml(c.state) + "</span> " +
              '<span class="small">' + escapeHtml(c.detail) + "</span></span></div>"
            );
          })
          .join("");
      })
      .catch(function () {
        var head = host.querySelector("[data-status-headline]");
        if (head) head.textContent = "Status unavailable";
      });
  }

  /* ---------------------------------------------------------- product lists */

  function productCard(p) {
    var price = p.priceKobo ? naira(p.priceKobo) : "On application";
    var specs = (p.specs || []).slice(0, 3).map(function (s) {
      return '<div class="spec-row"><span class="k">' + escapeHtml(s.k) + '</span><span class="v">' + escapeHtml(s.v) + "</span></div>";
    }).join("");
    return (
      '<article class="card product-card">' +
      '<div class="between"><span class="tag">' + escapeHtml(p.category) + "</span>" +
      (p.status !== "available" ? '<span class="tag warn">' + escapeHtml(p.status) + "</span>" : "") +
      "</div>" +
      "<h3 style=\"margin-top:14px\">" + escapeHtml(p.name) + "</h3>" +
      '<p class="small product-summary">' + escapeHtml(p.tagline) + "</p>" +
      '<div style="margin:14px 0">' + specs + "</div>" +
      '<div class="between"><b class="product-price">' + price + '</b><span class="small">' + escapeHtml(p.priceNote) + "</span></div>" +
      '<div class="product-actions"><span class="tiny">Sales support included</span><a class="cta" href="/contact?product=' + encodeURIComponent(p.name) + '">Request a quote</a></div>' +
      "</article>"
    );
  }

  function initProducts() {
    var host = document.querySelector("[data-products]");
    if (!host) return;
    var category = host.getAttribute("data-products");
    api("/api/products" + (category ? "?category=" + encodeURIComponent(category) : ""))
      .then(function (data) {
        if (!data.products.length) { host.innerHTML = '<p class="small">No products published yet.</p>'; return; }
        host.innerHTML = data.products.map(productCard).join("");
      })
      .catch(function () {
        host.innerHTML = '<div class="card"><h3>Pricing on request</h3><p class="small">Our sales team will send current pricing and availability.</p><a class="cta" href="/contact?topic=sales">Request a quote</a></div>';
      });
  }

  function initSalesEnquiry() {
    var form = document.querySelector('[data-api-form="/api/contact"]');
    if (!form) return;
    var params = new URLSearchParams(window.location.search);
    var product = params.get("product");
    var wanted = params.get("topic");
    var topicSelect = form.querySelector('[name="topic"]');
    if (wanted && topicSelect && topicSelect.querySelector('option[value="' + wanted.replace(/[^a-z-]/g, "") + '"]')) {
      topicSelect.value = wanted;
    }
    if (!product) return;
    var topic = topicSelect;
    var message = form.querySelector('[name="message"]');
    if (topic) topic.value = "sales";
    if (message && !message.value) message.value = "I would like pricing and availability for " + product + ".";
    var heading = form.closest("div").querySelector("h2");
    if (heading) heading.textContent = "Request a quote for " + product;
  }

  function initUpdates() {
    var host = document.querySelector("[data-updates]");
    if (!host) return;
    var slug = host.getAttribute("data-updates");
    api("/api/updates" + (slug ? "?product=" + encodeURIComponent(slug) : "?limit=8"))
      .then(function (data) {
        if (!data.updates.length) { host.innerHTML = '<p class="small">No product updates yet.</p>'; return; }
        host.innerHTML = data.updates
          .map(function (u) {
            return (
              '<article class="card"><div class="between"><span class="tag">' + escapeHtml(u.kind) + "</span>" +
              '<span class="tiny">' + when(u.publishedAt) + "</span></div>" +
              '<h3 style="margin-top:12px">' + escapeHtml(u.title) + "</h3>" +
              (u.productName ? '<p class="tiny">' + escapeHtml(u.productName) + "</p>" : "") +
              "<p>" + escapeHtml(u.body) + "</p></article>"
            );
          })
          .join("");
      })
      .catch(function () { host.innerHTML = '<p class="small">No product updates right now.</p>'; });
  }

  /* ------------------------------------------------------------ top-up form */

  function initTopup() {
    var form = document.querySelector("[data-topup]");
    if (!form) return;
    var msg = form.querySelector("[data-msg]");
    var quoteBox = form.querySelector("[data-quote]");
    var amountInput = form.querySelector('[name="amount"]');

    form.querySelectorAll("[data-amount-chip]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        amountInput.value = chip.getAttribute("data-amount-chip");
        form.querySelectorAll("[data-amount-chip]").forEach(function (c) { c.classList.remove("on"); });
        chip.classList.add("on");
        refreshQuote();
      });
    });

    var timer = null;
    function refreshQuote() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var amount = Number(amountInput.value);
        if (!amount || amount < 100) { if (quoteBox) quoteBox.textContent = ""; return; }
        api("/api/payments/quote", {
          method: "POST",
          body: { amountNaira: amount, meterNumber: (form.querySelector('[name="meterNumber"]') || {}).value },
        })
          .then(function (q) {
            if (quoteBox) {
              quoteBox.innerHTML =
                '<div class="spec-row"><span class="k">Units</span><span class="v">' + kwh(q.unitsKwhMilli) + "</span></div>" +
                '<div class="spec-row"><span class="k">Service charge</span><span class="v">' + naira(q.serviceChargeKobo) + "</span></div>" +
                '<div class="spec-row"><span class="k">Tariff</span><span class="v">' + naira(q.tariffKoboPerKwh) + "/kWh</span></div>";
            }
          })
          .catch(function () {});
      }, 260);
    }

    amountInput.addEventListener("input", refreshQuote);
    var meterField = form.querySelector('[name="meterNumber"]');
    if (meterField) meterField.addEventListener("input", refreshQuote);
    refreshQuote();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector('[type="submit"]');
      var data = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      setMessage(msg, "Creating the transaction…", "");
      api("/api/payments/initialize", {
        method: "POST",
        body: {
          email: data.email,
          phone: data.phone,
          meterNumber: data.meterNumber,
          amountNaira: Number(data.amount),
          purpose: "meter-topup",
        },
      })
        .then(function (result) {
          setMessage(msg, "Redirecting to checkout…", "good");
          window.location.href = result.authorizationUrl;
        })
        .catch(function (err) {
          button.disabled = false;
          setMessage(msg, err.message, "bad");
        });
    });
  }

  /* ------------------------------------------------------- generic API form */

  function initApiForms() {
    document.querySelectorAll("[data-api-form]").forEach(function (form) {
      var endpoint = form.getAttribute("data-api-form");
      var msg = form.querySelector("[data-msg]");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        var button = form.querySelector('[type="submit"]');
        button.disabled = true;
        setMessage(msg, "Sending…", "");
        // The database keeps the record; the inbox copy is what the team reads. A
        // message counts as delivered when either one accepts it.
        var saved = api(endpoint, { method: "POST", body: jsonFromForm(form) });
        var mailed = sendToInbox(form);
        Promise.allSettled([saved, mailed]).then(function (r) {
          var dbOk = r[0].status === "fulfilled";
          var mailOk = r[1].status === "fulfilled" && r[1].value === true;
          var clientError = !dbOk && r[0].reason && r[0].reason.status >= 400 && r[0].reason.status < 500;
          if (clientError) {
            setMessage(msg, r[0].reason.message, "bad");
          } else if (dbOk || mailOk) {
            setMessage(msg, (dbOk && r[0].value.reply) || "Thank you — your message has been sent. We reply within one working day.", "good");
            form.reset();
          } else {
            setMessage(msg, r[0].reason ? r[0].reason.message : FRIENDLY_ERROR, "bad");
          }
          button.disabled = false;
        });
      });
    });
  }

  /* ----------------------------------------------------- grid load estimator */

  function initGridEstimator() {
    var host = document.querySelector("[data-grid-estimator]");
    if (!host) return;
    var load = host.querySelector('[name="peakLoadKw"]');
    var out = host.querySelector("[data-estimate]");
    function render() {
      var kw = Number(load.value);
      var pv = Math.round(kw * 1.45);
      var storage = Math.round(kw * 3.2);
      var meterCount = Math.max(1, Math.round(kw / 1.8));
      var months = kw < 150 ? "8–12 weeks" : kw < 800 ? "4–6 months" : "7–10 months";
      host.querySelector("[data-load-label]").textContent = kw.toLocaleString("en-NG") + " kW";
      out.innerHTML =
        '<div class="spec-row"><span class="k">PV array</span><span class="v">' + pv.toLocaleString("en-NG") + " kWp</span></div>" +
        '<div class="spec-row"><span class="k">Storage</span><span class="v">' + storage.toLocaleString("en-NG") + " kWh</span></div>" +
        '<div class="spec-row"><span class="k">Prepaid meters</span><span class="v">' + meterCount.toLocaleString("en-NG") + "</span></div>" +
        '<div class="spec-row"><span class="k">Build window</span><span class="v">' + months + "</span></div>";
      var hidden = host.querySelector('[name="storageKwh"]');
      if (hidden) hidden.value = storage;
      var meters = host.querySelector('[name="meterCount"]');
      if (meters) meters.value = meterCount;
      var window_ = host.querySelector('[name="buildWindow"]');
      if (window_) window_.value = months;
      // The slider and the request form share the peakLoadKw name, so mirror
      // the slider value onto the hidden field the form actually submits.
      host.querySelectorAll('input[type="hidden"][name="peakLoadKw"]').forEach(function (f) { f.value = kw; });
    }
    load.addEventListener("input", render);
    host.querySelectorAll("[data-chip-group] .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var group = chip.closest("[data-chip-group]");
        group.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        var target = host.querySelector('[name="' + group.getAttribute("data-chip-group") + '"]');
        if (target) target.value = chip.getAttribute("data-value");
      });
    });
    render();
  }

  /* ------------------------------------------------------ meter registration */

  function initRegister() {
    var form = document.querySelector("[data-register-form]");
    if (!form) return;
    var msg = form.querySelector("[data-msg]");
    var done = document.querySelector("[data-register-done]");

    function invalid(field, text) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
      setMessage(msg, text, "bad");
      return false;
    }

    function check() {
      form.querySelectorAll("[aria-invalid]").forEach(function (f) { f.removeAttribute("aria-invalid"); });
      var fields = form.querySelectorAll("[required]");
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.type === "checkbox" ? !f.checked : !String(f.value).trim()) {
          var label = form.querySelector('label[for="' + f.id + '"]');
          return invalid(f, f.type === "checkbox" ? "Please confirm the details and consent to continue." : "Please fill in " + (label ? label.textContent.toLowerCase() : "all required fields") + ".");
        }
      }
      var meter = form.querySelector('[name="meterNumber"]');
      if (!/^\d{6,20}$/.test(meter.value.replace(/[\s-]/g, ""))) return invalid(meter, "The meter number should be 6 to 20 digits.");
      var email = form.querySelector('[name="email"]');
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.value.trim())) return invalid(email, "Please enter a valid email address.");
      var phone = form.querySelector('[name="phone"]');
      if (phone.value.replace(/\D/g, "").length < 7) return invalid(phone, "Please enter a valid phone number.");
      return true;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!check()) return;
      var button = form.querySelector('[type="submit"]');
      var body = jsonFromForm(form);
      delete body.consent;
      button.disabled = true;
      setMessage(msg, "Registering your meter…", "");

      api("/api/meters/register", { method: "POST", body: body })
        .then(function (result) {
          // Only a registration the database accepted is emailed, so the signup
          // inbox never holds a meter that is not in the register.
          return sendToInbox(form, { reference: result.reference }).then(function () { return result; });
        })
        .then(function (result) {
          done.querySelector("[data-register-reply]").textContent = result.reply;
          done.querySelector("[data-register-ref]").textContent = result.reference;
          done.querySelector("[data-register-meter]").textContent = result.meter.meterNumber;
          form.hidden = true;
          done.hidden = false;
          done.focus();
          window.scrollTo({ top: done.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
        })
        .catch(function (err) {
          button.disabled = false;
          setMessage(msg, err.message, "bad");
        });
    });
  }

  /* ---------------------------------------------------------- payment pages */

  function initPaymentReturn() {
    var host = document.querySelector("[data-payment-return]");
    if (!host) return;
    var reference = new URLSearchParams(window.location.search).get("reference");
    var out = host.querySelector("[data-result]");
    if (!reference) { out.innerHTML = '<p class="small">No payment reference in the link.</p>'; return; }

    function render(data) {
      if (data.status !== "paid") {
        out.innerHTML =
          '<p class="tiny">Reference</p><p class="mono">' + escapeHtml(reference) + "</p>" +
          '<div class="msg">Payment is still pending. This page refreshes itself every few seconds.</div>';
        setTimeout(poll, 4000);
        return;
      }
      var token = data.token;
      out.innerHTML =
        '<div class="badge"><span class="dot"></span>Payment confirmed</div>' +
        '<div class="readout" style="margin:18px 0 10px"><b>' + kwh(data.order.unitsKwhMilli) + "</b><span>credited</span></div>" +
        '<div class="spec-row"><span class="k">Reference</span><span class="v mono">' + escapeHtml(data.order.reference) + "</span></div>" +
        '<div class="spec-row"><span class="k">Amount</span><span class="v">' + naira(data.order.amountKobo) + "</span></div>" +
        '<div class="spec-row"><span class="k">Meter</span><span class="v mono">' + escapeHtml(data.order.meterNumber || "—") + "</span></div>" +
        (token
          ? '<div class="spec-row"><span class="k">Backup token</span><span class="v mono">' + escapeHtml(token.token) + "</span></div>" +
            '<div class="spec-row"><span class="k">Delivery</span><span class="v"><span class="tag ' +
            (token.status === "delivered" ? "ok" : "warn") + '">' + escapeHtml(token.status) + "</span></span></div>"
          : "") +
        '<p class="note">Token issued as backup · queues if the meter is offline</p>';
    }

    function poll() {
      api("/api/payments/verify/" + encodeURIComponent(reference)).then(render).catch(function (err) {
        out.innerHTML = '<div class="msg bad">' + escapeHtml(err.status === 404
          ? "We couldn't find that payment reference. Check the link, or contact info@enapoint.com."
          : err.message) + "</div>";
      });
    }
    out.innerHTML = '<p class="small"><span class="spinner"></span> Verifying the payment…</p>';
    poll();
  }

  function initPaymentSimulator() {
    var host = document.querySelector("[data-payment-simulate]");
    if (!host) return;
    var reference = new URLSearchParams(window.location.search).get("reference");
    var out = host.querySelector("[data-result]");
    var button = host.querySelector("[data-confirm-payment]");
    var refEl = host.querySelector("[data-reference]");
    if (refEl) refEl.textContent = reference || "—";
    if (!reference) { button.disabled = true; return; }

    button.addEventListener("click", function () {
      button.disabled = true;
      setMessage(out, "Settling…", "");
      api("/api/payments/simulate", { method: "POST", body: { reference: reference } })
        .then(function () { window.location.href = "/pay/return.html?reference=" + encodeURIComponent(reference); })
        .catch(function (err) {
          // Settling a simulated order is an operator action; say so plainly instead
          // of leaving a visitor with a bare "Authentication required".
          if (err.status === 401 || err.status === 403) {
            setMessage(out, "Only signed-in Enapoint staff can settle orders. Your order is saved under the reference above.", "");
            return;
          }
          button.disabled = false;
          setMessage(out, err.message, "bad");
        });
    });
  }

  /* -------------------------------------------------------------- bootstrap */

  window.ENA = { api: api, naira: naira, kwh: kwh, when: when, escapeHtml: escapeHtml, setMessage: setMessage };

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initNav();
    initStatus();
    initProducts();
    initSalesEnquiry();
    initUpdates();
    initTopup();
    initApiForms();
    initGridEstimator();
    initRegister();
    initPaymentReturn();
    initPaymentSimulator();
  });
})();
