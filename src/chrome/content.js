// Content script de l'extension Chrome (monde isolé, document_start).
//
// Tout est piloté par événements — aucun setInterval permanent, aucun
// MutationObserver :
//   - le masquage des Shorts est 100 % CSS (content.css, injecté par Chrome) ;
//   - les changements de page sont captés par l'API Navigation ;
//   - le minuteur ne se réveille que pendant un déblocage, sur un Short.
import { normalizeConfig } from "./config.js";
import * as store from "./store.js";
import { createUI } from "./ui.js";

const root = document.documentElement;
const CHECKING = "data-usk-checking";
const CHANNEL = "data-usk-channel";
const REDIRECT_KEY = "usk_redirect";

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

// Chargement direct d'un Short (mobile, nouvel onglet) : on se fie au référent.
function referrerIsChannel() {
  try {
    const ref = new URL(document.referrer);
    return ref.host === location.host && isChannelPath(ref.pathname);
  } catch (e) {
    return false;
  }
}

// Tant que le verrou est actif, toute lecture est stoppée à l'instant où elle
// démarre (événements `play`/`playing` en phase de capture) — pas de sondage.
function createMediaHold() {
  let held = false;
  function stop(e) {
    if (e.target instanceof HTMLMediaElement) e.target.pause();
  }
  return {
    hold: function () {
      if (held) return;
      held = true;
      document.addEventListener("play", stop, true);
      document.addEventListener("playing", stop, true);
      for (const v of document.querySelectorAll("video")) v.pause();
    },
    release: function () {
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
  let path = null; // dernier chemin évalué
  let channelPass = null; // chemin du Short autorisé car ouvert depuis une chaîne
  let timerHandle = 0;

  // Ne JAMAIS laisser la page bloquée ni casser YouTube : en cas d'erreur, on
  // libère le lecteur.
  function safe(fn) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        setFlag(CHECKING, false);
        media.release();
        console.warn("[UTub Short Kill]", e);
      }
    };
  }

  // ------------------------------------------------------------ Navigation

  const onRoute = safe(function () {
    const next = location.pathname;
    if (next === path) return; // replaceState, changement de ?query, doublons
    const prev = path;
    path = next;
    if (!isShortsPath(next)) channelPass = null;
    else if (prev === null ? referrerIsChannel() : isChannelPath(prev)) channelPass = next;
    refresh();
  });

  // ------------------------------------------------- État → page (idempotent)

  const refresh = safe(function () {
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
    unlockedUntil = Date.now() + config.unlockMinutes * 60000;
    store.saveUnlock(unlockedUntil);
    refresh();
  }

  // Mode « lecteur normal » : /shorts/ID → /watch?v=ID. Le garde anti-boucle vit
  // dans sessionStorage pour survivre au rechargement que provoque la redirection.
  function redirectToWatch() {
    const id = shortsId(path);
    if (!id) return false;
    const now = Date.now();
    try {
      const last = JSON.parse(sessionStorage.getItem(REDIRECT_KEY));
      if (last && last.id === id && now - last.at < 5000) return false;
    } catch (e) {
      /* pas de trace exploitable : on redirige */
    }
    try {
      sessionStorage.setItem(REDIRECT_KEY, JSON.stringify({ id: id, at: now }));
    } catch (e) {
      return false; // sans garde anti-boucle, on ne redirige pas
    }
    // Lecteur masqué et muet jusqu'à l'arrivée de la nouvelle page.
    setFlag(CHECKING, true);
    media.hold();
    setTimeout(function () {
      if (path === location.pathname && isShortsPath(path)) {
        setFlag(CHECKING, false);
        media.release();
      }
    }, 4000);
    location.replace("/watch?v=" + encodeURIComponent(id));
    return true;
  }

  // ------------------------------------------------------------- Minuteur

  // Un seul setTimeout, et seulement pendant un déblocage sur un Short : il se
  // réveille à chaque seconde si la pastille est visible, sinon uniquement à
  // l'expiration (pour re-verrouiller).
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
    timerHandle = setTimeout(onTimer, (shown ? remaining % 1000 : remaining) + 1);
  }

  const onTimer = safe(function () {
    if (unlockedUntil > Date.now()) syncTimer();
    else refresh(); // expiré : re-verrouille
  });

  // ------------------------------------------------------------- Réglages

  function applyConfig(next) {
    config = next;
    ui.removeGate(); // reconstruite par refresh() avec les nouvelles questions
    refresh();
  }

  const openSettings = safe(function () {
    ui.openSettings(config, {
      onSave: function (patch) {
        const next = normalizeConfig(Object.assign({}, config, patch));
        store.saveConfig(next);
        applyConfig(next);
      },
      onLock: function () {
        unlockedUntil = 0;
        channelPass = null;
        store.saveUnlock(0);
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

  // ---------------------------------------------------------------- Setup

  // Anti-flash : sur un Short, le lecteur est masqué avant même la lecture
  // (asynchrone) du stockage.
  if (isShortsPath(location.pathname)) setFlag(CHECKING, true);

  store.load().then(
    safe(function (saved) {
      config = normalizeConfig(saved.config);
      unlockedUntil = saved.unlockedUntil;

      store.onChange(safe(applyStored));
      // `currententrychange` est émis de façon synchrone à chaque changement
      // d'URL (pushState / replaceState / retour), y compris ceux faits par
      // YouTube lui-même : le Short est verrouillé avant d'être affiché.
      if (window.navigation) navigation.addEventListener("currententrychange", onRoute);
      else window.addEventListener("popstate", onRoute);
      window.addEventListener("yt-navigate-finish", onRoute);
      document.addEventListener("visibilitychange", refresh);
      // Page restaurée depuis le cache avant/arrière : l'état a pu changer.
      window.addEventListener("pageshow", function (e) {
        if (e.persisted) store.load().then(safe(applyStored));
      });
      // Clic sur l'icône de l'extension (voir background.js).
      chrome.runtime.onMessage.addListener(function (msg) {
        if (msg && msg.type === "usk:open-settings") openSettings();
      });

      onRoute();
    })
  );
}

if (window.top === window.self) main();
