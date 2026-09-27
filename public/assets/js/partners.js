/* Enapoint — guided partner integration setup (/partners/setup).
   One form split into steps; each step is checked before moving on, answers are
   kept in sessionStorage so a refresh doesn't lose them, and the final submit
   goes to the database and the partnerships inbox. */

(function () {
  "use strict";

  var STORE_KEY = "ena-partner-setup";
  var PAGE_OPENED = Date.now();

  var LABELS = {
    orgType: {
      bank: "Bank", fintech: "Fintech or payments", disco: "Distribution company", government: "Government or regulator",
      installer: "Installer or reseller", developer: "Software company", other: "Something else",
    },
    integration: {
      vending: "Sell electricity units", metering: "Manage meters", monitoring: "Monitor and report",
      catalogue: "Products and devices", custom: "Something custom",
    },
  };

  // Sensible starting point for each organisation type picked on /developers.
  var ORG_DEFAULTS = { bank: "vending", fintech: "vending", disco: "metering", government: "monitoring", installer: "catalogue", developer: "catalogue" };

  function init() {
    var form = document.querySelector("[data-partner-wizard]");
    if (!form) return;
    var steps = Array.prototype.slice.call(form.querySelectorAll(".wizard-step"));
    var markers = Array.prototype.slice.call(document.querySelectorAll("[data-wizard-steps] li"));
    var prev = form.querySelector("[data-prev]");
    var next = form.querySelector("[data-next]");
    var submit = form.querySelector("[data-submit]");
    var msg = form.querySelector("[data-msg]");
    var done = document.querySelector("[data-wizard-done]");
    var current = 0;

    // The sticky header's height varies with the viewport (one row on phones, two on desktop).
    function headerOffset() {
      var header = document.querySelector(".site-header");
      return (header ? header.offsetHeight : 0) + 16;
    }

    function setMessage(text, kind) {
      msg.textContent = text || "";
      msg.className = "msg " + (kind || "");
      msg.hidden = !text;
    }

    /* ------------------------------------------------------------- state */

    function values() {
      var out = { capabilities: [], channels: [] };
      new FormData(form).forEach(function (value, key) {
        if (key === "form-name" || key === "bot-field" || key === "reference") return;
        if (key === "capabilities" || key === "channels") out[key].push(value);
        else out[key] = typeof value === "string" ? value.trim() : value;
      });
      return out;
    }

    function save() {
      var data = values();
      delete data.agree;
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ step: current, data: data })); } catch (e) {}
    }

    function restore() {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) {}
      var params = new URLSearchParams(window.location.search);
      var org = params.get("org");
      if (!saved && org && LABELS.orgType[org]) {
        saved = { step: 0, data: { orgType: org, integration: ORG_DEFAULTS[org] } };
      }
      if (!saved || !saved.data) return 0;
      Object.keys(saved.data).forEach(function (key) {
        var value = saved.data[key];
        var fields = form.querySelectorAll('[name="' + key + '"]');
        fields.forEach(function (field) {
          if (field.type === "radio") field.checked = field.value === value;
          else if (field.type === "checkbox") field.checked = Array.isArray(value) && value.indexOf(field.value) !== -1;
          else if (typeof value === "string") field.value = value;
        });
      });
      return Math.min(Math.max(Number(saved.step) || 0, 0), steps.length - 1);
    }

    /* -------------------------------------------------------- validation */

    function labelFor(field) {
      var label = form.querySelector('label[for="' + field.id + '"]');
      return label ? label.textContent.replace(/\s*\(optional\)/i, "").toLowerCase() : "this field";
    }

    function invalid(field, text) {
      field.setAttribute("aria-invalid", "true");
      setMessage(text, "bad");
      field.focus();
      return false;
    }

    function validate(index) {
      var step = steps[index];
      step.querySelectorAll("[aria-invalid]").forEach(function (f) { f.removeAttribute("aria-invalid"); });
      var checkedGroups = {};
      var required = step.querySelectorAll("[required]");
      for (var i = 0; i < required.length; i++) {
        var f = required[i];
        if (f.type === "radio") {
          if (checkedGroups[f.name]) continue;
          checkedGroups[f.name] = true;
          if (!step.querySelector('[name="' + f.name + '"]:checked')) {
            return invalid(f, f.name === "orgType" ? "Please choose the type of organisation." : "Please choose what you want to build.");
          }
        } else if (f.type === "checkbox") {
          if (!f.checked) return invalid(f, "Please tick the box to confirm before submitting.");
        } else if (!f.value.trim()) {
          return invalid(f, f.getAttribute("data-error") || "Please enter " + labelFor(f) + ".");
        }
      }
      var emails = step.querySelectorAll('input[type="email"]');
      for (var j = 0; j < emails.length; j++) {
        var e = emails[j];
        if (e.value.trim() && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e.value.trim())) {
          return invalid(e, "Please check the " + labelFor(e) + " — it doesn't look like a valid email address.");
        }
      }
      var web = step.querySelector('[name="website"]');
      if (web && web.value.trim() && !/^https?:\/\/\S+\.\S+/.test(web.value.trim())) {
        return invalid(web, "Please enter the full website address, starting with https://, or leave it blank.");
      }
      setMessage("");
      return true;
    }

    /* ------------------------------------------------------------ review */

    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function chipText(name, list) {
      if (!list.length) return "None selected";
      return list.map(function (v) {
        var input = form.querySelector('[name="' + name + '"][value="' + v + '"]');
        return input ? input.nextElementSibling.textContent : v;
      }).join(", ");
    }

    function optionText(name) {
      var select = form.querySelector('[name="' + name + '"]');
      return select && select.selectedIndex >= 0 ? select.options[select.selectedIndex].text : "";
    }

    function renderReview() {
      var d = values();
      var sections = [
        { step: 0, title: "Organisation", rows: [["Name", d.organisation], ["Type", LABELS.orgType[d.orgType]], ["Country", d.country], ["Website", d.website || "Not provided"]] },
        { step: 1, title: "Integration", rows: [["Goal", LABELS.integration[d.integration]]] },
        { step: 2, title: "Features", rows: [["Features", chipText("capabilities", d.capabilities)], ["Channels", chipText("channels", d.channels)], ["Monthly volume", optionText("monthlyVolume")], ["Go-live", optionText("goLive")]] },
        { step: 3, title: "Contacts", rows: [["Name", d.contactName + (d.contactRole ? ", " + d.contactRole : "")], ["Email", d.contactEmail], ["Phone", d.contactPhone || "Not provided"], ["Technical contact", d.techEmail || "Same as above"]] },
      ];
      form.querySelector("[data-review]").innerHTML = sections.map(function (s) {
        return '<div class="review-block"><div class="between"><h3 class="mb0">' + s.title + '</h3>' +
          '<button class="btn ghost tiny-btn" type="button" data-goto="' + s.step + '">Edit<span class="sr-only"> ' + s.title.toLowerCase() + "</span></button></div>" +
          s.rows.map(function (r) { return '<div class="spec-row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + "</span></div>"; }).join("") +
          "</div>";
      }).join("");
    }

    /* -------------------------------------------------------- navigation */

    function show(index, focus) {
      current = index;
      steps.forEach(function (s, i) { s.hidden = i !== index; });
      markers.forEach(function (m, i) {
        m.classList.toggle("done", i < index);
        if (i === index) m.setAttribute("aria-current", "step"); else m.removeAttribute("aria-current");
      });
      var last = index === steps.length - 1;
      prev.hidden = index === 0;
      next.hidden = last;
      submit.hidden = !last;
      if (last) renderReview();
      setMessage("");
      save();
      if (focus) {
        var legend = steps[index].querySelector("legend");
        var top = document.querySelector("[data-wizard-steps]").getBoundingClientRect().top + window.scrollY - headerOffset();
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
        if (legend) { legend.setAttribute("tabindex", "-1"); legend.focus({ preventScroll: true }); }
      }
    }

    next.addEventListener("click", function () {
      if (validate(current)) show(current + 1, true);
    });
    prev.addEventListener("click", function () { show(current - 1, true); });
    form.addEventListener("click", function (event) {
      var target = event.target.closest("[data-goto]");
      if (target) show(Number(target.getAttribute("data-goto")), true);
    });
    form.addEventListener("change", save);
    // Enter in a text field moves forward rather than submitting half a form.
    form.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && event.target.tagName === "INPUT" && current < steps.length - 1) {
        event.preventDefault();
        next.click();
      }
    });

    /* ------------------------------------------------------------ submit */

    function sendToInbox(reference) {
      var data = new FormData(form);
      data.set("reference", reference);
      return fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      }).then(function (res) { return res.ok; }).catch(function () { return false; });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      for (var i = 0; i < steps.length; i++) {
        if (!validate(i)) { if (i !== current) { show(i, true); validate(i); } return; }
      }
      var body = values();
      body.agree = "yes";
      body._hp = (form.querySelector('[name="bot-field"]') || {}).value || "";
      body._t = Date.now() - PAGE_OPENED;

      submit.disabled = true;
      prev.disabled = true;
      setMessage("Sending your request…", "");

      fetch("/api/partners/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
        })
        .then(function (r) {
          if (!r.res.ok) {
            var err = new Error(r.res.status < 500 && r.data.error ? r.data.error : "We couldn't send your request just now. Please try again, or email info@enapoint.com.");
            throw err;
          }
          return sendToInbox(r.data.reference).then(function () { return r.data.reference; });
        })
        .then(function (reference) {
          try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
          done.querySelector("[data-done-ref]").textContent = reference;
          done.querySelector("[data-done-email]").textContent = body.contactEmail;
          form.hidden = true;
          document.querySelector("[data-wizard-steps]").hidden = true;
          done.hidden = false;
          done.focus({ preventScroll: true });
          window.scrollTo({ top: Math.max(done.getBoundingClientRect().top + window.scrollY - headerOffset(), 0), behavior: "smooth" });
        })
        .catch(function (err) {
          submit.disabled = false;
          prev.disabled = false;
          setMessage(err instanceof TypeError ? "You appear to be offline. Check your connection and try again." : err.message, "bad");
        });
    });

    show(restore(), false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
