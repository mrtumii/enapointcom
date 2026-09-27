/* Enapoint console — product updates, stock uploads, devices, payments and API keys. */

(function () {
  "use strict";

  var api = window.ENA.api;
  var naira = window.ENA.naira;
  var kwh = window.ENA.kwh;
  var when = window.ENA.when;
  var esc = window.ENA.escapeHtml;
  var setMessage = window.ENA.setMessage;

  var gate = document.querySelector("[data-gate]");
  var app = document.querySelector("[data-app]");
  if (!gate || !app) return;

  var PANELS = ["overview", "meters", "enquiries", "partners", "products", "updates", "stock", "devices", "apis", "keys"];
  var cache = {};

  /* --------------------------------------------------------------- session */

  function showApp() {
    gate.hidden = true;
    app.hidden = false;
    var target = (window.location.hash || "#overview").slice(1);
    select(PANELS.indexOf(target) >= 0 ? target : "overview");
  }

  // With no password configured there is no credential that can work, so the form is
  // replaced by an explanation rather than left there to fail on every attempt.
  function showGate(configured) {
    gate.hidden = false;
    app.hidden = true;
    var form = gate.querySelector("form");
    var notice = gate.querySelector("[data-unconfigured]");
    if (form) form.hidden = configured === false;
    if (notice) notice.hidden = configured !== false;
  }

  api("/api/admin/session")
    .then(function (s) { if (s.authenticated) showApp(); else showGate(s.configured); })
    .catch(function () { showGate(true); });

  var loginForm = gate.querySelector("form");
  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var msg = gate.querySelector("[data-msg]");
    var password = gate.querySelector('[name="password"]').value;
    setMessage(msg, "Signing in…", "");
    api("/api/admin/session", { method: "POST", body: { password: password } })
      .then(function () { setMessage(msg, "", ""); showApp(); })
      .catch(function (err) { setMessage(msg, err.message, "bad"); });
  });

  var signOut = document.querySelector("[data-sign-out]");
  if (signOut) {
    signOut.addEventListener("click", function () {
      api("/api/admin/session", { method: "DELETE" }).finally(function () { window.location.reload(); });
    });
  }

  /* ------------------------------------------------------------------- tabs */

  function select(name) {
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== name;
    });
    document.querySelectorAll("[data-tab]").forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-tab") === name));
    });
    if (history.replaceState) history.replaceState(null, "", "#" + name);
    load(name);
  }

  document.querySelectorAll("[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () { select(tab.getAttribute("data-tab")); });
  });

  function load(name, force) {
    if (cache[name] && !force) return;
    cache[name] = true;
    if (name === "overview") loadOverview();
    if (name === "meters") loadMeters();
    if (name === "enquiries") loadEnquiries();
    if (name === "partners") loadPartners();
    if (name === "products") loadProducts();
    if (name === "updates") loadUpdates();
    if (name === "stock") loadStock();
    if (name === "devices") loadDevices();
    if (name === "keys") loadKeys();
    if (name === "apis") loadApis();
  }

  function busy(selector) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = '<p class="small"><span class="spinner"></span> Loading…</p>';
  }

  function oops(selector, err) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = '<div class="msg bad">' + esc(err.message) + "</div>";
  }

  /* --------------------------------------------------------------- overview */

  function loadOverview() {
    busy("[data-kpis]");
    api("/api/overview")
      .then(function (d) {
        var s = d.stats;
        var kpis = [
          [naira(s.grossKobo), "gross settled"],
          [kwh(s.unitsKwhMilli), "units vended"],
          [String(s.ordersPending), "orders pending"],
          [s.devicesOnline + "/" + s.devicesTotal, "devices online"],
          [String(s.stockSkus), "stock SKUs"],
          [s.stockUnits.toLocaleString("en-NG"), "units in stock"],
          [String(s.stockBelowReorder), "below reorder"],
          [String(s.metersLinked), "meters linked"],
        ];
        document.querySelector("[data-kpis]").innerHTML = kpis
          .map(function (k) { return '<div class="card kpi"><b>' + esc(k[0]) + "</b><span>" + esc(k[1]) + "</span></div>"; })
          .join("");

        var providerTag = document.querySelector("[data-provider]");
        if (providerTag) {
          providerTag.innerHTML = d.provider === "paystack"
            ? '<span class="tag ok">live provider</span>'
            : '<span class="tag warn">simulation mode</span>';
        }

        var max = Math.max.apply(null, d.traffic.concat([1]));
        document.querySelector("[data-traffic]").innerHTML = d.traffic
          .map(function (v) { return '<i style="height:' + Math.round((v / max) * 100) + '%"></i>'; })
          .join("");

        document.querySelector("[data-recent-orders]").innerHTML = d.recentOrders.length
          ? d.recentOrders.map(function (o) {
              return (
                "<tr><td class=\"mono\">" + esc(o.reference) + "</td><td>" + esc(o.meterNumber || "—") +
                '</td><td class="num">' + naira(o.amountKobo) + '</td><td class="num">' + kwh(o.unitsKwhMilli) +
                '</td><td><span class="tag ' + (o.status === "paid" ? "ok" : "warn") + '">' + esc(o.status) +
                "</span></td><td>" + when(o.createdAt) + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="6" class="small">No payments yet.</td></tr>';

        document.querySelector("[data-recent-vends]").innerHTML = d.recentVends.length
          ? d.recentVends.map(function (v) {
              return (
                '<tr><td class="mono">' + esc(v.meterNumber) + '</td><td class="num">' + kwh(v.unitsKwhMilli) +
                '</td><td><span class="tag ' + (v.status === "delivered" ? "ok" : "warn") + '">' + esc(v.status) +
                "</span></td><td>" + when(v.createdAt) + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="4" class="small">No vending events yet.</td></tr>';

        document.querySelector("[data-low-stock]").innerHTML = d.lowStock.length
          ? d.lowStock.map(function (s2) {
              return '<div class="spec-row"><span class="k mono">' + esc(s2.sku) + '</span><span class="v">' +
                s2.quantity + " / " + s2.reorderLevel + "</span></div>";
            }).join("")
          : '<p class="small">Every SKU is above its reorder level.</p>';
      })
      .catch(function (err) { oops("[data-kpis]", err); });
  }

  /* --------------------------------------------------------------- products */

  function loadProducts() {
    busy("[data-product-list]");
    api("/api/products")
      .then(function (d) {
        var rows = d.products.map(function (p) {
          return (
            '<tr><td><b>' + esc(p.name) + '</b><br><span class="tiny">' + esc(p.slug) + "</span></td>" +
            "<td>" + esc(p.category) + '</td><td class="num">' + (p.priceKobo ? naira(p.priceKobo) : "—") + "</td>" +
            '<td><span class="tag ' + (p.status === "available" ? "ok" : "warn") + '">' + esc(p.status) + "</span></td>" +
            '<td><div class="flex">' +
            '<button class="btn ghost tiny-btn" data-edit-product="' + esc(p.slug) + '">Edit</button>' +
            '<button class="btn ghost tiny-btn" data-post-update="' + esc(p.slug) + '">Post update</button>' +
            "</div></td></tr>"
          );
        }).join("");
        document.querySelector("[data-product-list]").innerHTML = rows || '<tr><td colspan="5" class="small">No products.</td></tr>';
        var select_ = document.querySelector('[data-update-form] [name="product"]');
        if (select_) {
          select_.innerHTML = '<option value="">Company-wide (no product)</option>' +
            d.products.map(function (p) { return '<option value="' + esc(p.slug) + '">' + esc(p.name) + "</option>"; }).join("");
        }
        wireProductActions(d.products);
      })
      .catch(function (err) { oops("[data-product-list]", err); });
  }

  function wireProductActions(products) {
    document.querySelectorAll("[data-edit-product]").forEach(function (button) {
      button.addEventListener("click", function () {
        var slug = button.getAttribute("data-edit-product");
        var product = products.filter(function (p) { return p.slug === slug; })[0];
        var form = document.querySelector("[data-product-form]");
        form.querySelector('[name="slug"]').value = product.slug;
        form.querySelector('[name="name"]').value = product.name;
        form.querySelector('[name="category"]').value = product.category;
        form.querySelector('[name="tagline"]').value = product.tagline;
        form.querySelector('[name="description"]').value = product.description;
        form.querySelector('[name="priceNaira"]').value = product.priceKobo ? product.priceKobo / 100 : "";
        form.querySelector('[name="priceNote"]').value = product.priceNote;
        form.querySelector('[name="status"]').value = product.status;
        form.querySelector("[data-form-mode]").textContent = "Editing " + product.slug;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    document.querySelectorAll("[data-post-update]").forEach(function (button) {
      button.addEventListener("click", function () {
        select("updates");
        var form = document.querySelector("[data-update-form]");
        setTimeout(function () {
          form.querySelector('[name="product"]').value = button.getAttribute("data-post-update");
          form.querySelector('[name="title"]').focus();
        }, 120);
      });
    });
  }

  var productForm = document.querySelector("[data-product-form]");
  if (productForm) {
    productForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var msg = productForm.querySelector("[data-msg]");
      var data = Object.fromEntries(new FormData(productForm).entries());
      var body = {
        name: data.name,
        category: data.category,
        tagline: data.tagline,
        description: data.description,
        priceNote: data.priceNote,
        status: data.status,
        priceKobo: data.priceNaira ? Math.round(Number(data.priceNaira) * 100) : null,
      };
      var editing = Boolean(data.slug);
      setMessage(msg, editing ? "Saving…" : "Creating…", "");
      api(editing ? "/api/products/" + encodeURIComponent(data.slug) : "/api/products", {
        method: editing ? "PATCH" : "POST",
        body: body,
      })
        .then(function () {
          setMessage(msg, editing ? "Product updated." : "Product created.", "good");
          productForm.reset();
          productForm.querySelector("[data-form-mode]").textContent = "New product";
          load("products", true);
          cache.overview = false;
        })
        .catch(function (err) { setMessage(msg, err.message, "bad"); });
    });
    var reset = productForm.querySelector("[data-reset-product]");
    if (reset) {
      reset.addEventListener("click", function () {
        productForm.reset();
        productForm.querySelector("[data-form-mode]").textContent = "New product";
      });
    }
  }

  /* ---------------------------------------------------------------- updates */

  function loadUpdates() {
    busy("[data-update-list]");
    Promise.all([api("/api/updates?limit=50"), api("/api/products")])
      .then(function (results) {
        var d = results[0];
        var select_ = document.querySelector('[data-update-form] [name="product"]');
        if (select_ && !select_.options.length) {
          select_.innerHTML = '<option value="">Company-wide (no product)</option>' +
            results[1].products.map(function (p) { return '<option value="' + esc(p.slug) + '">' + esc(p.name) + "</option>"; }).join("");
        }
        document.querySelector("[data-update-list]").innerHTML = d.updates.length
          ? d.updates.map(function (u) {
              return (
                '<article class="card"><div class="between"><div class="flex">' +
                '<span class="tag">' + esc(u.kind) + "</span>" +
                (u.productName ? '<span class="tiny">' + esc(u.productName) + "</span>" : '<span class="tiny">company-wide</span>') +
                (u.published ? "" : '<span class="tag warn">draft</span>') +
                '</div><span class="tiny">' + when(u.publishedAt) + "</span></div>" +
                '<h3 style="margin-top:12px">' + esc(u.title) + "</h3><p>" + esc(u.body) + "</p>" +
                '<div class="flex"><button class="btn ghost tiny-btn" data-toggle-update="' + u.id + '" data-published="' +
                u.published + '">' + (u.published ? "Unpublish" : "Publish") + "</button>" +
                '<button class="btn ghost tiny-btn" data-delete-update="' + u.id + '">Delete</button></div></article>'
              );
            }).join("")
          : '<p class="small">No updates posted yet.</p>';

        document.querySelectorAll("[data-toggle-update]").forEach(function (button) {
          button.addEventListener("click", function () {
            api("/api/updates/" + button.getAttribute("data-toggle-update"), {
              method: "PATCH",
              body: { published: button.getAttribute("data-published") !== "true" },
            }).then(function () { load("updates", true); });
          });
        });
        document.querySelectorAll("[data-delete-update]").forEach(function (button) {
          button.addEventListener("click", function () {
            if (!window.confirm("Delete this update permanently?")) return;
            api("/api/updates/" + button.getAttribute("data-delete-update"), { method: "DELETE" })
              .then(function () { load("updates", true); });
          });
        });
      })
      .catch(function (err) { oops("[data-update-list]", err); });
  }

  var updateForm = document.querySelector("[data-update-form]");
  if (updateForm) {
    updateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var msg = updateForm.querySelector("[data-msg]");
      var data = Object.fromEntries(new FormData(updateForm).entries());
      setMessage(msg, "Publishing…", "");
      api("/api/updates", {
        method: "POST",
        body: {
          product: data.product || undefined,
          title: data.title,
          body: data.body,
          kind: data.kind,
          published: data.published === "on",
        },
      })
        .then(function () {
          setMessage(msg, "Update published.", "good");
          updateForm.reset();
          load("updates", true);
        })
        .catch(function (err) { setMessage(msg, err.message, "bad"); });
    });
  }

  /* ------------------------------------------------------------------ stock */

  function loadStock() {
    busy("[data-stock-list]");
    Promise.all([api("/api/stock"), api("/api/stock/uploads")])
      .then(function (results) {
        var d = results[0];
        document.querySelector("[data-stock-summary]").innerHTML =
          '<div class="card kpi"><b>' + d.summary.skus + "</b><span>SKUs tracked</span></div>" +
          '<div class="card kpi"><b>' + d.summary.units.toLocaleString("en-NG") + "</b><span>units on hand</span></div>" +
          '<div class="card kpi"><b>' + d.summary.belowReorder + "</b><span>below reorder level</span></div>";

        document.querySelector("[data-stock-list]").innerHTML = d.stock.length
          ? d.stock.map(function (s) {
              var low = s.quantity <= s.reorderLevel;
              return (
                '<tr><td class="mono">' + esc(s.sku) + "</td><td>" + esc(s.name) + "</td><td>" + esc(s.warehouse) +
                '</td><td class="num"><b>' + s.quantity.toLocaleString("en-NG") + '</b></td><td class="num">' + s.reorderLevel +
                '</td><td class="num">' + (s.unitCostKobo ? naira(s.unitCostKobo) : "—") + "</td>" +
                '<td>' + (low ? '<span class="tag bad">reorder</span>' : '<span class="tag ok">ok</span>') + "</td>" +
                '<td><div class="flex"><button class="btn ghost tiny-btn" data-adjust="' + esc(s.sku) +
                '" data-delta="-1">−</button><button class="btn ghost tiny-btn" data-adjust="' + esc(s.sku) +
                '" data-delta="1">+</button><button class="btn ghost tiny-btn" data-set="' + esc(s.sku) + '">Set</button></div></td></tr>'
              );
            }).join("")
          : '<tr><td colspan="8" class="small">No stock rows yet — upload a CSV.</td></tr>';

        document.querySelectorAll("[data-adjust]").forEach(function (button) {
          button.addEventListener("click", function () {
            api("/api/stock/" + encodeURIComponent(button.getAttribute("data-adjust")), {
              method: "PATCH",
              body: { delta: Number(button.getAttribute("data-delta")) },
            }).then(function () { load("stock", true); cache.overview = false; });
          });
        });
        document.querySelectorAll("[data-set]").forEach(function (button) {
          button.addEventListener("click", function () {
            var sku = button.getAttribute("data-set");
            var value = window.prompt("New quantity for " + sku);
            if (value === null || value.trim() === "") return;
            api("/api/stock/" + encodeURIComponent(sku), { method: "PATCH", body: { quantity: Number(value) } })
              .then(function () { load("stock", true); cache.overview = false; });
          });
        });

        document.querySelector("[data-upload-history]").innerHTML = results[1].uploads.length
          ? results[1].uploads.map(function (u) {
              var tone = u.status === "processed" ? "ok" : u.status === "partial" ? "warn" : "bad";
              return (
                '<tr><td>' + esc(u.filename) + '</td><td class="num">' + u.rowsTotal + '</td><td class="num">' +
                u.rowsApplied + '</td><td class="num">' + u.rowsFailed + '</td><td><span class="tag ' + tone + '">' +
                esc(u.status) + "</span></td><td>" + when(u.createdAt) + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="6" class="small">No uploads yet.</td></tr>';
      })
      .catch(function (err) { oops("[data-stock-list]", err); });
  }

  var drop = document.querySelector("[data-drop]");
  if (drop) {
    var fileInput = document.querySelector("[data-file]");
    var uploadMsg = document.querySelector("[data-upload-msg]");

    function send(file) {
      if (!file) return;
      var mode = (document.querySelector('[name="uploadMode"]:checked') || {}).value || "set";
      var form = new FormData();
      form.append("file", file);
      setMessage(uploadMsg, "Uploading " + file.name + "…", "");
      fetch("/api/stock/upload?mode=" + mode, { method: "POST", body: form, credentials: "same-origin" })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || "Upload failed");
          var b = result.body;
          var text = b.applied + " row(s) applied" + (b.failed ? ", " + b.failed + " rejected" : "") + ".";
          setMessage(uploadMsg, text, b.failed ? "bad" : "good");
          if (b.errors && b.errors.length) {
            uploadMsg.innerHTML += "<br>" + b.errors.slice(0, 5).map(function (e) {
              return '<span class="tiny">row ' + e.row + " · " + esc(e.sku) + " · " + esc(e.reason) + "</span>";
            }).join("<br>");
          }
          load("stock", true);
          cache.overview = false;
        })
        .catch(function (err) { setMessage(uploadMsg, err.message, "bad"); });
    }

    drop.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { send(fileInput.files[0]); });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add("hot"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove("hot"); });
    });
    drop.addEventListener("drop", function (event) { send(event.dataTransfer.files[0]); });
  }

  /* ---------------------------------------------------------------- devices */

  function loadDevices() {
    busy("[data-device-list]");
    api("/api/devices")
      .then(function (d) {
        document.querySelector("[data-device-list]").innerHTML = d.devices.map(function (x) {
          return (
            "<tr><td><b>" + esc(x.name) + "</b></td><td>" + esc(x.type) + '</td><td class="mono">' + esc(x.identifier) +
            "</td><td>" + esc(x.reading) + '</td><td><span class="tag ' + (x.status === "online" ? "ok" : "warn") + '">' +
            esc(x.status) + "</span></td></tr>"
          );
        }).join("");
        var sum = document.querySelector("[data-device-summary]");
        if (sum) sum.textContent = d.summary.online + " of " + d.summary.total + " online";
      })
      .catch(function (err) { oops("[data-device-list]", err); });
  }

  /* ---------------------------------------------------------- meter signups */

  var meterFilter = document.querySelector("[data-meter-filter]");
  if (meterFilter) meterFilter.addEventListener("change", function () { load("meters", true); });

  function loadMeters() {
    busy("[data-meter-list]");
    var status = meterFilter ? meterFilter.value : "";
    api("/api/meters" + (status ? "?status=" + encodeURIComponent(status) : ""))
      .then(function (d) {
        var host = document.querySelector("[data-meter-list]");
        host.innerHTML = d.meters.length
          ? d.meters.map(function (m) {
              var tone = m.status === "verified" || m.status === "linked" ? "ok" : m.status === "pending-verification" ? "warn" : "bad";
              var actions = m.status === "pending-verification"
                ? '<button class="btn tiny-btn" data-meter-set="verified" data-meter="' + esc(m.meterNumber) + '">Verify</button> ' +
                  '<button class="btn ghost tiny-btn" data-meter-set="rejected" data-meter="' + esc(m.meterNumber) + '">Reject</button>'
                : "";
              return (
                '<tr><td class="mono">' + esc(m.meterNumber) + "</td><td><b>" + esc(m.holderName) + '</b><br><span class="small">' +
                esc(m.email) + " · " + esc(m.phone) + "</span></td><td>" + esc(m.disco) + " · Band " + esc(m.tariffBand) +
                '<br><span class="small">' + esc(m.meterType) + "</span></td><td>" + esc(m.address) +
                (m.state ? '<br><span class="small">' + esc(m.state) + "</span>" : "") + "</td><td>" + esc(m.source) +
                '</td><td><span class="tag ' + tone + '">' + esc(m.status) + "</span></td><td>" + when(m.registeredAt) +
                "</td><td>" + actions + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="8" class="small">No meters match this filter.</td></tr>';
        host.querySelectorAll("[data-meter-set]").forEach(function (button) {
          button.addEventListener("click", function () {
            button.disabled = true;
            api("/api/meters/" + encodeURIComponent(button.getAttribute("data-meter")), {
              method: "PATCH",
              body: { status: button.getAttribute("data-meter-set") },
            })
              .then(function () { load("meters", true); })
              .catch(function (err) { button.disabled = false; window.alert(err.message); });
          });
        });
      })
      .catch(function (err) { oops("[data-meter-list]", err); });
  }

  /* -------------------------------------------------------------- enquiries */

  function loadEnquiries() {
    busy("[data-enquiry-list]");
    Promise.all([api("/api/contact"), api("/api/grid-requests")])
      .then(function (r) {
        var rows = r[0].messages.map(function (m) {
          return { at: m.createdAt, topic: m.topic, who: m.name + (m.company ? " · " + m.company : ""), contact: m.email + (m.phone ? " · " + m.phone : ""), body: m.message };
        }).concat(r[1].requests.map(function (g) {
          return { at: g.createdAt, topic: "mini-grid", who: g.contactName, contact: g.contactEmail, body: g.peakLoadKw + " kW · " + g.sector + (g.location ? " · " + g.location : "") + (g.notes ? " — " + g.notes : "") };
        })).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
        document.querySelector("[data-enquiry-list]").innerHTML = rows.length
          ? rows.map(function (e) {
              return (
                "<tr><td>" + when(e.at) + '</td><td><span class="tag">' + esc(e.topic) + "</span></td><td><b>" + esc(e.who) +
                '</b><br><span class="small">' + esc(e.contact) + "</span></td><td>" + esc(e.body) + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="4" class="small">No enquiries yet.</td></tr>';
      })
      .catch(function (err) { oops("[data-enquiry-list]", err); });
  }

  /* ------------------------------------------------------- partner requests */

  var PARTNER_LABELS = {
    orgType: { bank: "Bank", fintech: "Fintech or payments", disco: "Distribution company", government: "Government or regulator", installer: "Installer or reseller", developer: "Software company", other: "Other" },
    integration: { vending: "Sell electricity units", metering: "Manage meters", monitoring: "Monitor and report", catalogue: "Products and devices", custom: "Something custom" },
    capabilities: { "quote-topups": "Price top-ups", "sell-units": "Sell units", "register-meters": "Register meters", "verify-meters": "Verify meters", "vending-log": "Sales history", webhooks: "Notifications", "device-data": "Device status", products: "Product catalogue" },
    channels: { "mobile-app": "Mobile app", web: "Website", ussd: "USSD", branch: "Branches or agents", pos: "POS terminals", "back-office": "Back office" },
    monthlyVolume: { "not-sure": "Not sure yet", "under-1k": "Fewer than 1,000", "1k-10k": "1,000 to 10,000", "10k-100k": "10,000 to 100,000", "over-100k": "More than 100,000" },
    goLive: { exploring: "Just exploring", "1-month": "Within a month", "1-3-months": "One to three months", "3-months-plus": "More than three months" },
  };
  var PARTNER_STATUS = { submitted: ["New", "warn"], reviewing: ["In review", ""], approved: ["Approved", "ok"], declined: ["Declined", "bad"] };

  function label(group, value) { return (PARTNER_LABELS[group] || {})[value] || value || "—"; }
  function labelList(group, list) { return list && list.length ? list.map(function (v) { return label(group, v); }).join(", ") : "None selected"; }

  var partnerFilter = document.querySelector("[data-partner-filter]");
  if (partnerFilter) partnerFilter.addEventListener("change", function () { load("partners", true); });

  function loadPartners() {
    busy("[data-partner-list]");
    var status = partnerFilter ? partnerFilter.value : "";
    api("/api/partners/applications" + (status ? "?status=" + encodeURIComponent(status) : ""))
      .then(function (d) {
        document.querySelector("[data-partner-summary]").innerHTML = ["submitted", "reviewing", "approved", "declined"].map(function (k) {
          return '<div class="card kpi"><b>' + (d.summary[k] || 0) + "</b><span>" + PARTNER_STATUS[k][0].toLowerCase() + "</span></div>";
        }).join("");
        var host = document.querySelector("[data-partner-list]");
        host.innerHTML = d.applications.length
          ? d.applications.map(renderApplication).join("")
          : '<p class="small">No requests match this filter.</p>';
        wirePartnerActions(host);
      })
      .catch(function (err) { oops("[data-partner-list]", err); });
  }

  function renderApplication(a) {
    var tone = PARTNER_STATUS[a.status] || [a.status, ""];
    var rows = [
      ["Organisation type", label("orgType", a.orgType)],
      ["Country", a.country || "—"],
      ["Website", a.website || "Not provided"],
      ["Wants to", label("integration", a.integration)],
      ["Features", labelList("capabilities", a.capabilities)],
      ["Channels", labelList("channels", a.channels)],
      ["Monthly volume", label("monthlyVolume", a.monthlyVolume)],
      ["Go-live", label("goLive", a.goLive)],
      ["Contact", a.contactName + (a.contactRole ? ", " + a.contactRole : "") + " · " + a.contactEmail + (a.contactPhone ? " · " + a.contactPhone : "")],
      ["Technical contact", a.techEmail || "Same as above"],
    ];
    if (a.notes) rows.push(["Notes", a.notes]);
    var key = a.testKey
      ? '<div class="spec-row"><span class="k">Test key</span><span class="v"><span class="mono">' + esc(a.testKey.keyPrefix || "") + "…</span> " +
        (a.testKey.revoked ? '<span class="tag bad">revoked</span>' : '<span class="tag ok">active</span>') + "</span></div>"
      : "";
    var ref = esc(a.reference);
    var actions = [];
    if (a.status === "submitted") actions.push('<button class="btn ghost tiny-btn" type="button" data-partner-set="reviewing" data-ref="' + ref + '">Start review</button>');
    if (a.status !== "declined" && (!a.testKey || a.testKey.revoked)) actions.push('<button class="btn tiny-btn" type="button" data-partner-key="' + ref + '">Approve and issue test key</button>');
    else if (a.status !== "approved" && a.status !== "declined") actions.push('<button class="btn tiny-btn" type="button" data-partner-set="approved" data-ref="' + ref + '">Approve</button>');
    if (a.status !== "declined") actions.push('<button class="btn ghost tiny-btn" type="button" data-partner-set="declined" data-ref="' + ref + '">Decline</button>');
    else actions.push('<button class="btn ghost tiny-btn" type="button" data-partner-set="reviewing" data-ref="' + ref + '">Reopen</button>');

    return (
      '<article class="card raised" style="margin-bottom:18px">' +
      '<div class="between"><div><h3 class="mb0">' + esc(a.organisation) + '</h3><span class="tiny mono">' + ref + " · " + when(a.createdAt) + "</span></div>" +
      '<span class="tag ' + tone[1] + '">' + esc(tone[0]) + "</span></div>" +
      '<div style="margin-top:14px">' +
      rows.map(function (r) { return '<div class="spec-row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + "</span></div>"; }).join("") +
      key + "</div>" +
      '<div class="field" style="margin-top:16px"><label for="notes-' + ref + '">Review notes (staff only)</label>' +
      '<textarea id="notes-' + ref + '" data-partner-notes="' + ref + '" rows="2">' + esc(a.reviewerNotes) + "</textarea></div>" +
      '<div class="flex">' + actions.join("") +
      '<button class="btn ghost tiny-btn" type="button" data-partner-save="' + ref + '">Save notes</button>' +
      '<a class="btn ghost tiny-btn" href="mailto:' + esc(a.techEmail || a.contactEmail) + "?subject=" +
      encodeURIComponent("Your Enapoint integration request " + a.reference) + '">Email partner</a></div>' +
      '<div class="msg" data-partner-msg="' + ref + '" hidden></div>' +
      "</article>"
    );
  }

  function wirePartnerActions(host) {
    function msgFor(ref) { return host.querySelector('[data-partner-msg="' + ref + '"]'); }
    function notesFor(ref) { var el = host.querySelector('[data-partner-notes="' + ref + '"]'); return el ? el.value : undefined; }

    host.querySelectorAll("[data-partner-set]").forEach(function (button) {
      button.addEventListener("click", function () {
        var ref = button.getAttribute("data-ref");
        var status = button.getAttribute("data-partner-set");
        if (status === "declined" && !window.confirm("Decline " + ref + "? You can reopen it later.")) return;
        button.disabled = true;
        api("/api/partners/applications/" + encodeURIComponent(ref), { method: "PATCH", body: { status: status, reviewerNotes: notesFor(ref) } })
          .then(function () { load("partners", true); })
          .catch(function (err) { button.disabled = false; setMessage(msgFor(ref), err.message, "bad"); });
      });
    });

    host.querySelectorAll("[data-partner-save]").forEach(function (button) {
      button.addEventListener("click", function () {
        var ref = button.getAttribute("data-partner-save");
        api("/api/partners/applications/" + encodeURIComponent(ref), { method: "PATCH", body: { reviewerNotes: notesFor(ref) } })
          .then(function () { setMessage(msgFor(ref), "Notes saved.", "good"); })
          .catch(function (err) { setMessage(msgFor(ref), err.message, "bad"); });
      });
    });

    host.querySelectorAll("[data-partner-key]").forEach(function (button) {
      button.addEventListener("click", function () {
        var ref = button.getAttribute("data-partner-key");
        if (!window.confirm("Approve " + ref + " and issue a test key? The key is shown once.")) return;
        button.disabled = true;
        api("/api/partners/applications/" + encodeURIComponent(ref) + "/key", { method: "POST" })
          .then(function (result) {
            var box = document.querySelector("[data-partner-newkey]");
            box.hidden = false;
            box.innerHTML =
              '<p class="tiny">Test key for ' + esc(result.application.organisation) + " · copy it now, it is never shown again</p>" +
              '<div class="secret">' + esc(result.key) + "</div>" +
              '<p class="small mb0" style="margin-top:10px">Scopes: ' + esc(result.record.scopes.join(", ")) + ". Test keys never move real money.</p>";
            box.scrollIntoView({ behavior: "smooth", block: "center" });
            cache.keys = false;
            if (partnerFilter && partnerFilter.value && partnerFilter.value !== "approved") partnerFilter.value = "approved";
            load("partners", true);
          })
          .catch(function (err) { button.disabled = false; setMessage(msgFor(ref), err.message, "bad"); });
      });
    });
  }

  /* ------------------------------------------------------------------- keys */

  function loadKeys() {
    busy("[data-key-list]");
    api("/api/keys")
      .then(function (d) {
        document.querySelector("[data-key-list]").innerHTML = d.keys.length
          ? d.keys.map(function (k) {
              return (
                "<tr><td>" + esc(k.label) + '</td><td><span class="tag">' + esc(k.mode) + '</span></td><td class="mono">' +
                esc(k.keyPrefix) + "…</td><td>" + (k.scopes || []).join(", ") + "</td><td>" + when(k.lastUsedAt) + "</td>" +
                "<td>" + (k.revoked ? '<span class="tag bad">revoked</span>'
                  : '<button class="btn ghost tiny-btn" data-revoke="' + k.id + '">Revoke</button>') + "</td></tr>"
              );
            }).join("")
          : '<tr><td colspan="6" class="small">No keys issued.</td></tr>';

        document.querySelectorAll("[data-revoke]").forEach(function (button) {
          button.addEventListener("click", function () {
            if (!window.confirm("Revoke this key? Calls using it stop working immediately.")) return;
            api("/api/keys/" + button.getAttribute("data-revoke"), { method: "DELETE" })
              .then(function () { load("keys", true); });
          });
        });
      })
      .catch(function (err) { oops("[data-key-list]", err); });
  }

  var keyForm = document.querySelector("[data-key-form]");
  if (keyForm) {
    keyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var msg = keyForm.querySelector("[data-msg]");
      var data = Object.fromEntries(new FormData(keyForm).entries());
      var scopes = ["read"];
      if (data.write === "on") scopes.push("write");
      setMessage(msg, "Generating…", "");
      api("/api/keys", { method: "POST", body: { label: data.label, mode: data.mode, scopes: scopes } })
        .then(function (result) {
          var box = document.querySelector("[data-new-key]");
          box.hidden = false;
          box.innerHTML =
            '<p class="tiny">Copy this now — it is never shown again</p>' +
            '<div class="secret">' + esc(result.key) + "</div>";
          setMessage(msg, "", "");
          keyForm.reset();
          load("keys", true);
        })
        .catch(function (err) { setMessage(msg, err.message, "bad"); });
    });
  }

  /* ------------------------------------------------------------------- apis */

  function loadApis() {
    var host = document.querySelector("[data-endpoint-list]");
    if (!host) return;
    var endpoints = [
      ["GET", "/api/products", "List the catalogue", "public"],
      ["POST", "/api/products", "Create a product", "write"],
      ["PATCH", "/api/products/:slug", "Update a product", "write"],
      ["GET", "/api/updates", "List product updates (drafts included with a key)", "public"],
      ["POST", "/api/updates", "Publish a product update", "write"],
      ["PATCH", "/api/updates/:id", "Edit, publish or unpublish an update", "write"],
      ["DELETE", "/api/updates/:id", "Delete an update", "write"],
      ["GET", "/api/stock", "Stock on hand by SKU", "read"],
      ["PATCH", "/api/stock/:sku", "Set or adjust a quantity", "write"],
      ["POST", "/api/stock/upload", "Upload a stock CSV", "write"],
      ["GET", "/api/stock/uploads", "Stock upload history", "read"],
      ["POST", "/api/payments/quote", "Price a top-up", "public"],
      ["POST", "/api/payments/initialize", "Start a payment", "public"],
      ["GET", "/api/payments/verify/:reference", "Verify and settle", "public"],
      ["POST", "/api/payments/webhook", "Provider callback", "signed"],
      ["POST", "/api/payments/simulate", "Settle an order taken offline", "console / test key"],
      ["POST", "/api/meters/verify", "Check whether a meter is registered", "public"],
      ["POST", "/api/meters/register", "Register a meter (verified with a write key)", "public / write"],
      ["GET", "/api/meters", "List registered meters", "read"],
      ["PATCH", "/api/meters/:number", "Verify, reject or update a meter", "write"],
      ["GET", "/api/vend", "Vending log", "read"],
      ["POST", "/api/vend/flush", "Deliver queued units", "write"],
      ["GET", "/api/devices", "Connected devices", "read"],
      ["GET", "/api/overview", "Operations summary", "read"],
      ["GET", "/api/keys", "Manage API keys", "console"],
      ["GET", "/api/partners/applications", "Review partner requests", "console"],
      ["GET", "/api/status", "Platform health", "public"],
    ];
    host.innerHTML = endpoints.map(function (e) {
      return (
        '<tr><td><span class="tag">' + e[0] + '</span></td><td class="mono">' + esc(e[1]) + "</td><td>" + esc(e[2]) +
        '</td><td><span class="tag">' + e[3] + "</span></td></tr>"
      );
    }).join("");
  }
})();
