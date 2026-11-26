// Service worker (événementiel : ne tourne que le temps d'un clic).
// Clic sur l'icône de la barre d'outils → ouvre le panneau de réglages dans
// l'onglet YouTube actif.
chrome.action.onClicked.addListener(function (tab) {
  if (tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: "usk:open-settings" }).catch(function () {
    /* onglet hors YouTube, ou page ouverte avant le (re)chargement de l'extension */
  });
});
