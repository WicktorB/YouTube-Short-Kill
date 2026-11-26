(() => {
  // src/core/config.js
  var DEFAULTS = {
    enabled: true,
    // extension active
    hideShorts: true,
    // masquer les Shorts dans les feeds / recherche / reco
    gateEnabled: true,
    // exiger les 3 questions pour accéder à un Short
    showTimer: true,
    // afficher le minuteur pendant le visionnage
    allowFromChannels: true,
    // exception : Shorts accessibles depuis une chaîne
    showSettingsButton: true,
    // bouton ⚙️ en bas à droite des pages YouTube
    openMode: "short",
    // "short" = lecteur Shorts | "watch" = lecteur normal
    unlockMinutes: 5,
    // durée de déblocage après réussite
    minAnswerLength: 15,
    // longueur minimale d'une réponse libre
    questions: [
      "Pourquoi veux-tu regarder des Shorts maintenant ?",
      "Combien de temps comptes-tu y passer, pr\xE9cis\xE9ment ?",
      "Qu'est-ce que tu devrais \xEAtre en train de faire \xE0 la place ?"
    ]
  };

  // src/chrome/config.js
  var LIMITS = {
    unlockMinutes: [1, 240],
    minAnswerLength: [1, 200]
  };
  function clampInt(value, range, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(range[1], Math.max(range[0], n));
  }
  function normalizeConfig(raw) {
    const c = Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : null);
    c.showTimer = !!c.showTimer;
    c.allowFromChannels = !!c.allowFromChannels;
    c.showSettingsButton = !!c.showSettingsButton;
    c.openMode = c.openMode === "watch" ? "watch" : "short";
    c.unlockMinutes = clampInt(c.unlockMinutes, LIMITS.unlockMinutes, DEFAULTS.unlockMinutes);
    c.minAnswerLength = clampInt(c.minAnswerLength, LIMITS.minAnswerLength, DEFAULTS.minAnswerLength);
    const qs = Array.isArray(c.questions) ? c.questions : [];
    c.questions = DEFAULTS.questions.map(function(fallback, i) {
      return typeof qs[i] === "string" && qs[i].trim() ? qs[i].trim() : fallback;
    });
    return c;
  }

  // src/chrome/store.js
  var CONFIG_KEY = "usk_config";
  var UNLOCK_KEY = "usk_unlocked_until";
  async function load() {
    try {
      const d = await chrome.storage.local.get([CONFIG_KEY, UNLOCK_KEY]);
      return { config: d[CONFIG_KEY] || null, unlockedUntil: Number(d[UNLOCK_KEY]) || 0 };
    } catch (e) {
      return { config: null, unlockedUntil: 0 };
    }
  }
  function set(items) {
    try {
      chrome.storage.local.set(items).catch(function() {
      });
    } catch (e) {
    }
  }
  function saveConfig(config) {
    set({ [CONFIG_KEY]: config });
  }
  function saveUnlock(ts) {
    set({ [UNLOCK_KEY]: ts });
  }
  function onChange(cb) {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== "local") return;
      const patch = {};
      if (changes[CONFIG_KEY]) patch.config = changes[CONFIG_KEY].newValue || null;
      if (changes[UNLOCK_KEY]) patch.unlockedUntil = Number(changes[UNLOCK_KEY].newValue) || 0;
      if (CONFIG_KEY in changes || UNLOCK_KEY in changes) cb(patch);
    });
  }

  // src/chrome/ui.js
  var SVG_NS = "http://www.w3.org/2000/svg";
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
  function formatTime(totalSec) {
    const s = Math.max(0, totalSec);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor(s % 3600 / 60);
    return hh > 0 ? hh + ":" + pad(mm) + ":" + pad(s % 60) : mm + ":" + pad(s % 60);
  }
  function createUI() {
    const root2 = document.documentElement;
    let gate = null;
    let settings = null;
    let gear = null;
    let timer = null;
    let timerText = null;
    let toastEl = null;
    let toastHandle = 0;
    function showGate(config, onPass) {
      if (gate) return;
      const min = config.minAnswerLength;
      const hint = h("p", { class: "usk-hint" });
      const unlock = h("button", { type: "submit", class: "usk-btn usk-unlock", text: "D\xE9bloquer" });
      const fields = [];
      function validate() {
        const ok = fields.every(function(f) {
          return f.value.trim().length >= min;
        });
        unlock.disabled = !ok;
        hint.textContent = ok ? "" : "Chaque r\xE9ponse doit faire au moins " + min + " caract\xE8res.";
        return ok;
      }
      const form = h("form", {
        class: "usk-form",
        onsubmit: function(e) {
          e.preventDefault();
          if (!validate()) return;
          removeGate();
          onPass();
        }
      });
      config.questions.forEach(function(q, i) {
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
            onclick: function() {
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
            h("h1", { class: "usk-title", text: "Es-tu s\xFBr de vouloir regarder des Shorts ?" })
          ]),
          h("p", {
            class: "usk-sub",
            text: "R\xE9ponds aux 3 questions pour d\xE9bloquer " + config.unlockMinutes + " min. Sinon, reviens \xE0 l'essentiel."
          }),
          form
        ])
      ]);
      root2.appendChild(gate);
      validate();
      fields[0].focus({ preventScroll: true });
    }
    function removeGate() {
      if (gate) gate.remove();
      gate = null;
    }
    function closeSettings() {
      if (settings) settings.remove();
      settings = null;
    }
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
      const questions = config.questions.map(function(q) {
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
          questions: questions.map(function(input) {
            return input.value;
          })
        });
        toast("R\xE9glages enregistr\xE9s \u2713");
      }
      settings = h(
        "div",
        {
          id: "usk-settings",
          class: "usk-ov",
          role: "dialog",
          "aria-modal": "true",
          onclick: function(e) {
            if (e.target === settings) closeSettings();
          },
          onkeydown: function(e) {
            if (e.key === "Escape") closeSettings();
          }
        },
        [
          h("div", { class: "usk-card" }, [
            h("div", { class: "usk-head" }, [logo(), h("h1", { class: "usk-title", text: "R\xE9glages" })]),
            toggleRow("showTimer", "Afficher le minuteur"),
            toggleRow("allowFromChannels", "Autoriser depuis les cha\xEEnes"),
            toggleRow("showSettingsButton", "Afficher le bouton \u2699\uFE0F sur la page"),
            row("Ouverture d'un Short", refs.openMode),
            numRow("unlockMinutes", "Dur\xE9e de d\xE9blocage (min)"),
            numRow("minAnswerLength", "Longueur min. des r\xE9ponses"),
            h("div", { class: "usk-set-qs" }, [h("div", { class: "usk-q", text: "Les 3 questions" })].concat(questions)),
            h("div", { class: "usk-actions" }, [
              h("button", {
                type: "button",
                class: "usk-btn usk-unlock",
                text: "Verrouiller maintenant",
                onclick: function() {
                  closeSettings();
                  actions.onLock();
                  toast("Verrouill\xE9 \u{1F512}");
                }
              }),
              h("button", { type: "button", class: "usk-btn usk-leave", text: "Enregistrer", onclick: save })
            ])
          ])
        ]
      );
      root2.appendChild(settings);
    }
    function setGear(visible, onClick) {
      if (!gear) {
        if (!visible) return;
        gear = h("div", {
          id: "usk-gear",
          role: "button",
          title: "R\xE9glages UTub Short Kill",
          "aria-label": "R\xE9glages UTub Short Kill",
          text: "\u2699\uFE0F",
          onclick: onClick
        });
      }
      if (visible && !gear.isConnected) root2.appendChild(gear);
      gear.style.display = visible ? "flex" : "none";
    }
    function renderTimer(ms) {
      if (!timer) {
        timerText = h("span", { class: "usk-timer-text" });
        timer = h("div", { id: "usk-timer", "aria-hidden": "true" }, [h("span", { class: "usk-timer-dot" }), timerText]);
      }
      if (!timer.isConnected) root2.appendChild(timer);
      const sec = Math.ceil(ms / 1e3);
      timerText.textContent = formatTime(sec);
      timer.classList.toggle("usk-timer-low", sec <= 30);
    }
    function removeTimer() {
      if (timer) timer.remove();
    }
    function toast(msg) {
      clearTimeout(toastHandle);
      if (toastEl) toastEl.remove();
      toastEl = h("div", { id: "usk-toast", role: "status", text: msg });
      root2.appendChild(toastEl);
      toastHandle = setTimeout(function() {
        toastEl.remove();
        toastEl = null;
      }, 1600);
    }
    return { showGate, removeGate, openSettings, closeSettings, setGear, renderTimer, removeTimer, toast };
  }

  // src/chrome/content.js
  var root = document.documentElement;
  var CHECKING = "data-usk-checking";
  var CHANNEL = "data-usk-channel";
  var REDIRECT_KEY = "usk_redirect";
  function isShortsPath(path) {
    return /^\/shorts(?:\/|$)/.test(path);
  }
  function isChannelPath(path) {
    return /^\/(?:@|channel\/|c\/|user\/)/.test(path);
  }
  function shortsId(path) {
    const m = path.match(/^\/shorts\/([^/?#]+)/);
    return m ? m[1] : null;
  }
  function setFlag(name, on) {
    if (on) root.setAttribute(name, "1");
    else root.removeAttribute(name);
  }
  function referrerIsChannel() {
    try {
      const ref = new URL(document.referrer);
      return ref.host === location.host && isChannelPath(ref.pathname);
    } catch (e) {
      return false;
    }
  }
  function createMediaHold() {
    let held = false;
    function stop(e) {
      if (e.target instanceof HTMLMediaElement) e.target.pause();
    }
    return {
      hold: function() {
        if (held) return;
        held = true;
        document.addEventListener("play", stop, true);
        document.addEventListener("playing", stop, true);
        for (const v of document.querySelectorAll("video")) v.pause();
      },
      release: function() {
        if (!held) return;
        held = false;
        document.removeEventListener("play", stop, true);
        document.removeEventListener("playing", stop, true);
      }
    };
  }
  function main() {
    const ui = createUI();
    const media = createMediaHold();
    let config = normalizeConfig(null);
    let unlockedUntil = 0;
    let path = null;
    let channelPass = null;
    let timerHandle = 0;
    function safe(fn) {
      return function() {
        try {
          return fn.apply(this, arguments);
        } catch (e) {
          setFlag(CHECKING, false);
          media.release();
          console.warn("[UTub Short Kill]", e);
        }
      };
    }
    const onRoute = safe(function() {
      const next = location.pathname;
      if (next === path) return;
      const prev = path;
      path = next;
      if (!isShortsPath(next)) channelPass = null;
      else if (prev === null ? referrerIsChannel() : isChannelPath(prev)) channelPass = next;
      refresh();
    });
    const refresh = safe(function() {
      const onShorts = isShortsPath(path);
      setFlag(CHANNEL, config.allowFromChannels && isChannelPath(path));
      const passed = config.allowFromChannels && channelPass === path;
      const unlocked = unlockedUntil > Date.now();
      if (onShorts && !passed && !unlocked) {
        setFlag(CHECKING, true);
        media.hold();
        ui.showGate(config, onGatePassed);
      } else {
        ui.removeGate();
        if (onShorts && !passed && config.openMode === "watch" && redirectToWatch()) return;
        setFlag(CHECKING, false);
        media.release();
      }
      ui.setGear(config.showSettingsButton && !onShorts, openSettings);
      syncTimer();
    });
    function onGatePassed() {
      unlockedUntil = Date.now() + config.unlockMinutes * 6e4;
      saveUnlock(unlockedUntil);
      refresh();
    }
    function redirectToWatch() {
      const id = shortsId(path);
      if (!id) return false;
      const now = Date.now();
      try {
        const last = JSON.parse(sessionStorage.getItem(REDIRECT_KEY));
        if (last && last.id === id && now - last.at < 5e3) return false;
      } catch (e) {
      }
      try {
        sessionStorage.setItem(REDIRECT_KEY, JSON.stringify({ id, at: now }));
      } catch (e) {
        return false;
      }
      setFlag(CHECKING, true);
      media.hold();
      setTimeout(function() {
        if (path === location.pathname && isShortsPath(path)) {
          setFlag(CHECKING, false);
          media.release();
        }
      }, 4e3);
      location.replace("/watch?v=" + encodeURIComponent(id));
      return true;
    }
    function syncTimer() {
      clearTimeout(timerHandle);
      timerHandle = 0;
      const remaining = unlockedUntil - Date.now();
      if (remaining <= 0 || !isShortsPath(path)) {
        ui.removeTimer();
        return;
      }
      const shown = config.showTimer && !document.hidden;
      if (config.showTimer) ui.renderTimer(remaining);
      else ui.removeTimer();
      timerHandle = setTimeout(onTimer, (shown ? remaining % 1e3 : remaining) + 1);
    }
    const onTimer = safe(function() {
      if (unlockedUntil > Date.now()) syncTimer();
      else refresh();
    });
    function applyConfig(next) {
      config = next;
      ui.removeGate();
      refresh();
    }
    const openSettings = safe(function() {
      ui.openSettings(config, {
        onSave: function(patch) {
          const next = normalizeConfig(Object.assign({}, config, patch));
          saveConfig(next);
          applyConfig(next);
        },
        onLock: function() {
          unlockedUntil = 0;
          channelPass = null;
          saveUnlock(0);
          refresh();
        }
      });
    });
    function applyStored(saved) {
      let changed = false;
      if ("unlockedUntil" in saved && saved.unlockedUntil !== unlockedUntil) {
        unlockedUntil = saved.unlockedUntil;
        changed = true;
      }
      if ("config" in saved) {
        const next = normalizeConfig(saved.config);
        if (JSON.stringify(next) !== JSON.stringify(config)) {
          applyConfig(next);
          return;
        }
      }
      if (changed) refresh();
    }
    if (isShortsPath(location.pathname)) setFlag(CHECKING, true);
    load().then(
      safe(function(saved) {
        config = normalizeConfig(saved.config);
        unlockedUntil = saved.unlockedUntil;
        onChange(safe(applyStored));
        if (window.navigation) navigation.addEventListener("currententrychange", onRoute);
        else window.addEventListener("popstate", onRoute);
        window.addEventListener("yt-navigate-finish", onRoute);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("pageshow", function(e) {
          if (e.persisted) load().then(safe(applyStored));
        });
        chrome.runtime.onMessage.addListener(function(msg) {
          if (msg && msg.type === "usk:open-settings") openSettings();
        });
        onRoute();
      })
    );
  }
  if (window.top === window.self) main();
})();
