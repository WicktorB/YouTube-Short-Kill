// Stockage de l'extension : chrome.storage.local (permission "storage").
// Mêmes clés que l'ancienne extension, donc réglages conservés.
const CONFIG_KEY = "usk_config";
const UNLOCK_KEY = "usk_unlocked_until";

// Un seul aller-retour pour tout l'état. Ne rejette jamais : si le stockage est
// indisponible (extension rechargée pendant que l'onglet est ouvert), on
// retombe sur les valeurs par défaut.
export async function load() {
  try {
    const d = await chrome.storage.local.get([CONFIG_KEY, UNLOCK_KEY]);
    return { config: d[CONFIG_KEY] || null, unlockedUntil: Number(d[UNLOCK_KEY]) || 0 };
  } catch (e) {
    return { config: null, unlockedUntil: 0 };
  }
}

function set(items) {
  try {
    chrome.storage.local.set(items).catch(function () {});
  } catch (e) {
    /* contexte d'extension invalidé : l'état reste en mémoire pour cet onglet */
  }
}

export function saveConfig(config) {
  set({ [CONFIG_KEY]: config });
}

export function saveUnlock(ts) {
  set({ [UNLOCK_KEY]: ts });
}

// Changements venant d'un autre onglet (ou écho de nos propres écritures) : les
// nouvelles valeurs sont dans l'événement, inutile de relire le stockage.
export function onChange(cb) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    const patch = {};
    if (changes[CONFIG_KEY]) patch.config = changes[CONFIG_KEY].newValue || null;
    if (changes[UNLOCK_KEY]) patch.unlockedUntil = Number(changes[UNLOCK_KEY].newValue) || 0;
    if (CONFIG_KEY in changes || UNLOCK_KEY in changes) cb(patch);
  });
}
