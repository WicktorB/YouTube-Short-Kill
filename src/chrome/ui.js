// Interface de l'extension Chrome : fenêtre des 3 questions, panneau de
// réglages, minuteur, bouton ⚙️ et toast. Mêmes classes CSS que le userscript
// (src/styles/index.css). Tout est construit par DOM pur, sans chaîne HTML.
import { DEFAULTS } from "../core/config.js";
import { LIMITS, clampInt } from "./config.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function h(tag, props, kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    if (k === "class") e.className = props[k];
    else if (k === "text") e.textContent = props[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), props[k]);
    else e.setAttribute(k, props[k]);
  }
  for (const c of kids || []) if (c) e.appendChild(c);
  return e;
}

function svg(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function logo() {
  const s = svg("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" });
  s.append(
    svg("circle", { cx: "12", cy: "12", r: "9.2", stroke: "currentColor", "stroke-width": "2" }),
    svg("path", { d: "M10.2 8.6l5 3.4-5 3.4z", fill: "currentColor" }),
    svg("line", {
      x1: "5.5",
      y1: "5.5",
      x2: "18.5",
      y2: "18.5",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    })
  );
  return h("span", { class: "usk-logo" }, [s]);
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

export function formatTime(totalSec) {
  const s = Math.max(0, totalSec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return hh > 0 ? hh + ":" + pad(mm) + ":" + pad(s % 60) : mm + ":" + pad(s % 60);
}

export function createUI() {
  const root = document.documentElement;
  let gate = null;
  let settings = null;
  let gear = null;
  let timer = null;
  let timerText = null;
  let toastEl = null;
  let toastHandle = 0;

  // ------------------------------------------------------- Fenêtre 3 questions

  // Idempotent : si la fenêtre est déjà là, on n'y touche pas (les réponses en
  // cours de saisie ne sont jamais effacées par un événement de navigation).
  function showGate(config, onPass) {
    if (gate) return;
    const min = config.minAnswerLength;
    const hint = h("p", { class: "usk-hint" });
    const unlock = h("button", { type: "submit", class: "usk-btn usk-unlock", text: "Débloquer" });
    const fields = [];

    function validate() {
      const ok = fields.every(function (f) {
        return f.value.trim().length >= min;
      });
      unlock.disabled = !ok;
      hint.textContent = ok ? "" : "Chaque réponse doit faire au moins " + min + " caractères.";
      return ok;
    }

    const form = h("form", {
      class: "usk-form",
      onsubmit: function (e) {
        e.preventDefault();
        if (!validate()) return;
        removeGate();
        onPass();
      }
    });
    config.questions.forEach(function (q, i) {
      const ta = h("textarea", {
        class: "usk-input",
        rows: "2",
        autocomplete: "off",
        spellcheck: "false",
        oninput: validate
      });
      fields.push(ta);
      form.appendChild(h("label", { class: "usk-field" }, [h("span", { class: "usk-q", text: i + 1 + ". " + q }), ta]));
    });
    form.appendChild(
      h("div", { class: "usk-actions" }, [
        h("button", {
          type: "button",
          class: "usk-btn usk-leave",
          text: "Quitter les Shorts",
          onclick: function () {
            location.replace("/");
          }
        }),
        unlock
      ])
    );
    form.appendChild(hint);

    gate = h("div", { id: "usk-gate", class: "usk-ov", role: "dialog", "aria-modal": "true" }, [
      h("div", { class: "usk-card" }, [
        h("div", { class: "usk-head" }, [
          logo(),
          h("h1", { class: "usk-title", text: "Es-tu sûr de vouloir regarder des Shorts ?" })
        ]),
        h("p", {
          class: "usk-sub",
          text: "Réponds aux 3 questions pour débloquer " + config.unlockMinutes + " min. Sinon, reviens à l'essentiel."
        }),
        form
      ])
    ]);
    root.appendChild(gate);
    validate();
    fields[0].focus({ preventScroll: true });
  }

  function removeGate() {
    if (gate) gate.remove();
    gate = null;
  }

  // ------------------------------------------------------------- Réglages

  function closeSettings() {
    if (settings) settings.remove();
    settings = null;
  }

  // actions = { onSave(patch), onLock() }
  function openSettings(config, actions) {
    if (settings) return;
    const refs = {};

    function row(label, control) {
      return h("label", { class: "usk-set-row" }, [h("span", { text: label }), control]);
    }
    function toggleRow(key, label) {
      refs[key] = h("input", { type: "checkbox" });
      refs[key].checked = config[key];
      return row(label, refs[key]);
    }
    function numRow(key, label) {
      refs[key] = h("input", { type: "number", min: String(LIMITS[key][0]), max: String(LIMITS[key][1]) });
      refs[key].value = config[key];
      return row(label, refs[key]);
    }

    refs.openMode = h("select", {}, [
      h("option", { value: "short", text: "Lecteur Shorts" }),
      h("option", { value: "watch", text: "Lecteur normal (/watch)" })
    ]);
    refs.openMode.value = config.openMode;

    const questions = config.questions.map(function (q) {
      const input = h("input", { type: "text", class: "usk-set-q" });
      input.value = q;
      return input;
    });

    function save() {
      closeSettings();
      actions.onSave({
        showTimer: refs.showTimer.checked,
        allowFromChannels: refs.allowFromChannels.checked,
        showSettingsButton: refs.showSettingsButton.checked,
        openMode: refs.openMode.value,
        unlockMinutes: clampInt(refs.unlockMinutes.value, LIMITS.unlockMinutes, DEFAULTS.unlockMinutes),
        minAnswerLength: clampInt(refs.minAnswerLength.value, LIMITS.minAnswerLength, DEFAULTS.minAnswerLength),
        questions: questions.map(function (input) {
          return input.value;
        })
      });
      toast("Réglages enregistrés ✓");
    }

    settings = h(
      "div",
      {
        id: "usk-settings",
        class: "usk-ov",
        role: "dialog",
        "aria-modal": "true",
        onclick: function (e) {
          if (e.target === settings) closeSettings();
        },
        onkeydown: function (e) {
          if (e.key === "Escape") closeSettings();
        }
      },
      [
        h("div", { class: "usk-card" }, [
          h("div", { class: "usk-head" }, [logo(), h("h1", { class: "usk-title", text: "Réglages" })]),
          toggleRow("showTimer", "Afficher le minuteur"),
          toggleRow("allowFromChannels", "Autoriser depuis les chaînes"),
          toggleRow("showSettingsButton", "Afficher le bouton ⚙️ sur la page"),
          row("Ouverture d'un Short", refs.openMode),
          numRow("unlockMinutes", "Durée de déblocage (min)"),
          numRow("minAnswerLength", "Longueur min. des réponses"),
          h("div", { class: "usk-set-qs" }, [h("div", { class: "usk-q", text: "Les 3 questions" })].concat(questions)),
          h("div", { class: "usk-actions" }, [
            h("button", {
              type: "button",
              class: "usk-btn usk-unlock",
              text: "Verrouiller maintenant",
              onclick: function () {
                closeSettings();
                actions.onLock();
                toast("Verrouillé 🔒");
              }
            }),
            h("button", { type: "button", class: "usk-btn usk-leave", text: "Enregistrer", onclick: save })
          ])
        ])
      ]
    );
    root.appendChild(settings);
  }

  // ------------------------------------------------------------ Bouton ⚙️

  // Créé seulement s'il doit être visible.
  function setGear(visible, onClick) {
    if (!gear) {
      if (!visible) return;
      gear = h("div", {
        id: "usk-gear",
        role: "button",
        title: "Réglages UTub Short Kill",
        "aria-label": "Réglages UTub Short Kill",
        text: "⚙️",
        onclick: onClick
      });
    }
    if (visible && !gear.isConnected) root.appendChild(gear);
    gear.style.display = visible ? "flex" : "none";
  }

  // ------------------------------------------------------------- Minuteur

  function renderTimer(ms) {
    if (!timer) {
      timerText = h("span", { class: "usk-timer-text" });
      timer = h("div", { id: "usk-timer", "aria-hidden": "true" }, [h("span", { class: "usk-timer-dot" }), timerText]);
    }
    if (!timer.isConnected) root.appendChild(timer);
    const sec = Math.ceil(ms / 1000);
    timerText.textContent = formatTime(sec);
    timer.classList.toggle("usk-timer-low", sec <= 30);
  }

  function removeTimer() {
    if (timer) timer.remove();
  }

  // ---------------------------------------------------------------- Toast

  function toast(msg) {
    clearTimeout(toastHandle);
    if (toastEl) toastEl.remove();
    toastEl = h("div", { id: "usk-toast", role: "status", text: msg });
    root.appendChild(toastEl);
    toastHandle = setTimeout(function () {
      toastEl.remove();
      toastEl = null;
    }, 1600);
  }

  return { showGate, removeGate, openSettings, closeSettings, setGear, renderTimer, removeTimer, toast };
}
