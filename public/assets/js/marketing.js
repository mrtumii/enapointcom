/* Marketing console (/marketing). Staff sign in with the console password; the
   session cookie then authorises /api/campaigns and /api/leads. */
(function () {
  "use strict";
  var login = document.querySelector("[data-mk-login]");
  var app = document.querySelector("[data-mk-app]");
  if (!login || !app) return;

  var esc = function (s) { return ENA.escapeHtml(s); };
  var $ = function (s) { return app.querySelector(s); };
  var state = { segment: "all", channel: "email", segments: [], push: 0, emailProvider: null };

  var TEMPLATES = {
    custom: { s: "", b: "", u: "/" },
    paymonthly: { s: "Own your power — pay small small", u: "/pay-monthly",
      b: "Buy your ENA solar system today and pay monthly with Summit Bank and The Alternative Bank. Choose a 30%, 40% or 50% deposit, or spread the full amount over up to 34 months.\n\nOpen the planner to see your monthly payment in seconds." },
    founding50: { s: "Founding 50: 24-hour solar power for 50 homes", u: "/founding50",
      b: "We're installing complete ENA solar and storage systems in our first 50 homes, at founding prices. Reserve yours before the places run out." },
    launch: { s: "New from ENA", u: "/products",
      b: "We've just launched a new addition to the ENA range — built on the same cells, BMS and ENA Control software you already trust. Tap to see it and reserve yours." },
    media: { s: "Just dropped: our new campaign", u: "/",
      b: "Catch our latest reveal — new media, new offer. See it first and share the word. #ENAPoint #OwnYourPower" },
    welfare: { s: "Solar for your staff — buy now, pay small small", u: "/pay-monthly",
      b: "A no-cost-to-you welfare benefit: your staff can own an ENA solar system on salary-friendly monthly payments through Summit Bank and The Alternative Bank, with full after-sales warranty.\n\nReply to arrange a presentation." },
  };

  async function boot() {
    try {
      var s = await ENA.api("/api/admin/session");
      if (s.authenticated) return start();
      login.hidden = false;
      if (!s.configured) ENA.setMessage(login.querySelector("[data-msg]"), "The console password hasn't been set up for this site yet.", "bad");
    } catch (e) { login.hidden = false; }
  }

  login.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = login.querySelector("[data-msg]");
    try {
      await ENA.api("/api/admin/session", { method: "POST", body: { password: login.elements.password.value } });
      login.reset(); msg.hidden = true; start();
    } catch (err) { ENA.setMessage(msg, err.message, "bad"); }
  });

  $("[data-mk-logout]").addEventListener("click", async function () {
    await ENA.api("/api/admin/session", { method: "DELETE" }).catch(function () {});
    app.hidden = true; login.hidden = false;
  });

  function start() {
    login.hidden = true; app.hidden = false;
    loadCampaigns(); loadLeads();
  }

  async function loadCampaigns() {
    try {
      var d = await ENA.api("/api/campaigns");
      state.segments = d.segments; state.push = d.pushSubscribers; state.emailProvider = d.emailProvider;
      renderSegments(); renderLog(d.campaigns);
      var note = $("[data-mk-email-note]");
      if (!d.emailProvider) ENA.setMessage(note, "Email isn't connected yet, so campaigns can go out as push notifications only. Connect an email provider (Resend or Postmark) to send email.", "");
      else note.hidden = true;
      update();
    } catch (err) {
      if (err.status === 401) { app.hidden = true; login.hidden = false; return; }
      $("[data-mk-segments]").innerHTML = '<p class="small">' + esc(err.message) + "</p>";
    }
  }

  function renderSegments() {
    $("[data-mk-segments]").innerHTML = state.segments.map(function (s) {
      return '<label class="seg-opt"><input type="radio" name="segment" value="' + esc(s.id) + '"' + (s.id === state.segment ? " checked" : "") + ">" +
        '<span class="txt"><span class="t">' + esc(s.title) + '</span><span class="d">' + esc(s.detail) + "</span></span>" +
        '<span class="ct">' + Number(s.count).toLocaleString("en-NG") + "</span></label>";
    }).join("");
    app.querySelectorAll('input[name="segment"]').forEach(function (r) {
      r.addEventListener("change", function () { state.segment = r.value; update(); });
    });
  }

  function renderLog(list) {
    var log = $("[data-mk-log]");
    if (!list || !list.length) { log.innerHTML = '<li class="warn">No campaigns yet</li>'; return; }
    log.innerHTML = list.map(function (c) {
      var parts = [];
      if (c.channel !== "push") parts.push(c.emailSent + " emails" + (c.emailFailed ? " (" + c.emailFailed + " failed)" : ""));
      if (c.channel !== "email") parts.push(c.pushSent + " pushes");
      var status = c.status === "sent" ? parts.join(" · ") : c.status;
      return '<li class="' + (c.status === "sent" ? "" : "warn") + '" title="' + esc(c.note || "") + '">' + esc(c.subject) +
        '<span class="meta">' + esc(status) + " · " + esc(ENA.when(c.createdAt)) + "</span></li>";
    }).join("");
    // Keep refreshing while anything is still going out.
    if (list.some(function (c) { return c.status === "queued" || c.status === "sending"; })) setTimeout(loadCampaigns, 4000);
  }

  async function loadLeads() {
    try {
      var d = await ENA.api("/api/leads");
      $("[data-mk-lead-count]").textContent = d.leads.length + " recent";
      $("[data-mk-leads]").innerHTML = d.leads.length ? d.leads.map(function (l) {
        var s = l.system || {};
        return "<tr><td>" + esc(ENA.when(l.createdAt)) + "</td><td>" + esc(l.name) + '<br><span class="small mono">' + esc(l.reference) + "</span></td>" +
          "<td>" + esc(l.email) + "<br>" + esc(l.phone || "") + "</td><td>" + esc(l.place || "—") + "</td>" +
          "<td>" + esc((s.batteryKwh || 0) + " kWh · " + (s.inverterKva || 0) + " kVA · " + (s.panels || 0) + " panels") + "<br>" +
          '<span class="small">' + esc(s.priceNaira ? "₦" + Number(s.priceNaira).toLocaleString("en-NG") : "") + " · " + esc(l.pay) + "</span></td>" +
          "<td>" + (l.marketingOk ? '<span class="tag ok">yes</span>' : '<span class="tag">no</span>') + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="small">No advisor sign-ups yet.</td></tr>';
    } catch (err) {
      $("[data-mk-leads]").innerHTML = '<tr><td colspan="6" class="small">' + esc(err.message) + "</td></tr>";
    }
  }

  var form = $("[data-mk-form]");
  var chButtons = app.querySelectorAll("[data-mk-channel] button");
  chButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      chButtons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      state.channel = b.getAttribute("data-ch"); update();
    });
  });
  $("[data-mk-template]").addEventListener("change", function () {
    var t = TEMPLATES[this.value]; if (!t) return;
    form.elements.subject.value = t.s; form.elements.body.value = t.b; form.elements.url.value = t.u; update();
  });
  ["subject", "body"].forEach(function (n) { form.elements[n].addEventListener("input", update); });

  function count() {
    var seg = state.segments.find(function (s) { return s.id === state.segment; });
    var emails = seg ? seg.count : 0;
    if (state.channel === "email") return emails + " email" + (emails === 1 ? "" : "s");
    if (state.channel === "push") return state.push + " browser" + (state.push === 1 ? "" : "s");
    return emails + " emails + " + state.push + " browsers";
  }

  function update() {
    var subj = form.elements.subject.value || "Your subject line…";
    var body = form.elements.body.value || "Your message to customers appears here as you type.";
    $("[data-mk-send]").textContent = "Send to " + count();
    $("[data-mk-push-count]").textContent = state.channel === "email" ? "" : "Push goes to every browser that turned on ENA alerts (" + state.push + " now), whichever audience is selected.";
    var html = "";
    if (state.channel !== "push") {
      html += '<div class="preview-email"><div class="pe-top"><img src="/assets/img/brand/ena-mark-sm.webp" alt="" width="18" height="19"> Enapoint &lt;info@enapoint.com&gt;</div>' +
        '<div class="pe-sub">' + esc(subj) + '</div><div class="pe-body">' + esc(body) + "</div>" +
        '<div class="pe-foot"><span class="cta" style="font-size:12px;padding:7px 14px">See the details</span><span>Unsubscribe link included</span></div></div>';
    }
    if (state.channel !== "email") {
      var short = body.length > 90 ? body.slice(0, 90) + "…" : body;
      html += '<div class="phone"><div class="scr"><div class="push"><img src="/icon-512.png" alt="" width="26" height="26">' +
        '<span class="pt"><b>' + esc(subj) + "</b>" + esc(short) + "<small>Enapoint · now</small></span></div></div></div>";
    }
    $("[data-mk-preview]").innerHTML = html;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = form.querySelector("[data-msg]");
    var send = $("[data-mk-send]");
    var payload = { segment: state.segment, channel: state.channel, subject: form.elements.subject.value.trim(), body: form.elements.body.value.trim(), url: form.elements.url.value.trim() || "/" };
    if (!payload.subject || !payload.body) { ENA.setMessage(msg, "Add a subject and a message first.", "bad"); return; }
    if (!window.confirm("Send “" + payload.subject + "” to " + count() + "?")) return;
    send.disabled = true;
    try {
      await ENA.api("/api/campaigns", { method: "POST", body: payload });
      ENA.setMessage(msg, "Campaign queued — it's going out now.", "good");
      loadCampaigns();
    } catch (err) { ENA.setMessage(msg, err.message, "bad"); }
    finally { send.disabled = false; }
  });

  update();
  boot();
})();
