// Réglages de l'extension Chrome : mêmes valeurs par défaut que le userscript
// (src/core/config.js), mais validées — ce qui sort du stockage n'est jamais
// utilisé tel quel.
//
// Les clés `enabled`, `hideShorts` et `gateEnabled` sont ignorées ici : pour
// tout couper, on désactive l'extension dans chrome://extensions (geste
// volontairement plus coûteux qu'un interrupteur).
import { DEFAULTS } from "../core/config.js";

export const LIMITS = {
  unlockMinutes: [1, 240],
  minAnswerLength: [1, 200]
};

export function clampInt(value, range, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range[1], Math.max(range[0], n));
}

export function normalizeConfig(raw) {
  const c = Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : null);
  c.showTimer = !!c.showTimer;
  c.allowFromChannels = !!c.allowFromChannels;
  c.showSettingsButton = !!c.showSettingsButton;
  c.openMode = c.openMode === "watch" ? "watch" : "short";
  c.unlockMinutes = clampInt(c.unlockMinutes, LIMITS.unlockMinutes, DEFAULTS.unlockMinutes);
  c.minAnswerLength = clampInt(c.minAnswerLength, LIMITS.minAnswerLength, DEFAULTS.minAnswerLength);
  const qs = Array.isArray(c.questions) ? c.questions : [];
  c.questions = DEFAULTS.questions.map(function (fallback, i) {
    return typeof qs[i] === "string" && qs[i].trim() ? qs[i].trim() : fallback;
  });
  return c;
}
