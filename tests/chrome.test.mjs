// Teste l'extension Chrome BUILDÉE (dist/chrome) chargée pour de vrai dans
// Chromium, comme en « unpacked » : manifest, CSS natif, content script en
// monde isolé, chrome.storage, service worker. Les pages youtube.com sont
// servies localement (interception réseau), sans accès à Internet.
import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIXTURE, CHROMIUM_EXE } from "./_server.mjs";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "chrome");
const YT = "https://www.youtube.com";

// 1 s de silence (WAV 8 kHz mono 8 bits) : un vrai média à mettre en lecture.
function silentWav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  return "data:audio/wav;base64," + b.toString("base64");
}
const HTML = FIXTURE.replace("</body>", `<audio id="media" loop src="${silentWav()}"></audio></body>`);

let failures = 0;
const errors = [];
function check(name, cond) {
  console.log((cond ? "  ✓ " : "  ✗ ") + name);
  if (!cond) failures++;
}

const profile = mkdtempSync(join(tmpdir(), "usk-chrome-"));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROMIUM_EXE,
  headless: false, // le « nouveau » headless (ci-dessous) sait charger les extensions
  args: [
    "--headless=new",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-extensions-except=" + EXT,
    "--load-extension=" + EXT
  ]
});
await ctx.route("https://*.youtube.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML }));
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));

function watch(page) {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("[UTub Short Kill]")) errors.push(m.text());
  });
  return page;
}
const page = watch(await ctx.newPage());

const has = (sel, p = page) => p.evaluate((s) => !!document.querySelector(s), sel);
const disp = (sel, p = page) =>
  p.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).display : "MISSING";
  }, sel);
const checking = () => page.evaluate(() => document.documentElement.getAttribute("data-usk-checking"));
const stored = () => sw.evaluate(() => chrome.storage.local.get(null));
const store = (items) => sw.evaluate((i) => chrome.storage.local.set(i), items);
// Navigation interne, comme le fait YouTube (pushState dans le monde de la page).
const spa = (path) => page.evaluate((p) => history.pushState({}, "", p), path);
async function answer() {
  await page.evaluate(() => {
    document.querySelectorAll("#usk-gate textarea").forEach((t) => {
      t.value = "une réponse suffisamment longue";
      t.dispatchEvent(new Event("input"));
    });
  });
  await page.click("#usk-gate .usk-unlock");
}

// ---------------------------------------------------------------------------
console.log("\n[Chargement]");
await page.goto(YT + "/");
await page.waitForSelector("#usk-gear");
check("service worker démarré", sw.url().endsWith("/background.js"));
check("CSS injecté nativement (pas de <style> ajouté)", !(await has("#usk-style")));
check("bouton ⚙️ visible", (await disp("#usk-gear")) === "flex");
check(
  "monde de la page intact (history natif, aucun global)",
  await page.evaluate(() => /native code/.test(String(history.pushState)) && !("__USK_TEST" in window))
);

console.log("\n[Masquage 100 % CSS]");
check("guide Shorts masqué", (await disp("#guide-shorts")) === "none");
check("guide Accueil visible", (await disp("#guide-home")) !== "none");
check("étagère reel masquée", (await disp("#reel-shelf")) === "none");
check("vignette lockup masquée", (await disp("#lockup")) === "none");
check("short en grille masqué", (await disp("#rich-short")) === "none");
check("section Shorts masquée", (await disp("#rich-section")) === "none");
check("short en liste masqué (sans JS)", (await disp("#vid-short")) === "none");
check("vidéos normales visibles", (await disp("#vid-normal")) !== "none" && (await disp("#rich-normal")) !== "none");
check("aucune classe posée par JS", !(await has(".usk-hidden")));
await page.evaluate(() => document.querySelector("#vid-short a").setAttribute("href", "/watch?v=zzz"));
check("vignette recyclée en vidéo normale → réapparaît", (await disp("#vid-short")) !== "none");

console.log("\n[Navigation interne → verrou immédiat]");
check(
  "fenêtre affichée dans le même tick que pushState",
  await page.evaluate(() => {
    history.pushState({}, "", "/shorts/xyz");
    return !!document.getElementById("usk-gate");
  })
);
check("lecteur masqué (anti-flash)", (await checking()) === "1");
check("3 questions", (await page.evaluate(() => document.querySelectorAll("#usk-gate textarea").length)) === 3);
check("bouton ⚙️ masqué sur un Short", (await disp("#usk-gear")) === "none");
check(
  "lecture stoppée dès qu'elle démarre",
  await page.evaluate(async () => {
    const m = document.getElementById("media");
    await m.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
    return m.paused;
  })
);
await page.fill("#usk-gate textarea", "saisie en cours");
await page.evaluate(() => {
  window.dispatchEvent(new Event("yt-navigate-finish"));
  history.replaceState({}, "", "/shorts/xyz?feature=share");
});
check(
  "saisie conservée malgré les événements de navigation en double",
  (await page.inputValue("#usk-gate textarea")) === "saisie en cours"
);
check("bouton Débloquer désactivé tant que les réponses sont trop courtes", await page.isDisabled("#usk-gate .usk-unlock"));

console.log("\n[Déblocage + persistance]");
await answer();
check("fenêtre retirée", !(await has("#usk-gate")));
check("lecteur ré-affiché", (await checking()) === null);
check("minuteur affiché", await has("#usk-timer"));
check(
  "lecture de nouveau possible",
  await page.evaluate(async () => {
    const m = document.getElementById("media");
    await m.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
    return !m.paused;
  })
);
check("déblocage enregistré dans chrome.storage", (await stored()).usk_unlocked_until > Date.now());
await page.goto(YT + "/shorts/xyz");
await page.waitForSelector("#usk-timer");
check("après rechargement : toujours débloqué", !(await has("#usk-gate")) && (await checking()) === null);

console.log("\n[Expiration → re-verrouillage]");
await store({ usk_unlocked_until: Date.now() + 1200 });
await page.waitForSelector("#usk-gate", { timeout: 4000 }).catch(() => {});
check("fenêtre de retour à l'expiration", await has("#usk-gate"));
check("minuteur retiré", !(await has("#usk-timer")));

console.log("\n[Exception chaîne]");
await page.goto(YT + "/@createur");
await page.waitForSelector("#usk-gear");
check("Shorts visibles sur une chaîne", (await disp("#reel-shelf")) !== "none" && (await disp("#vid-short")) !== "none");
await spa("/shorts/abc");
check("Short ouvert depuis une chaîne : pas de fenêtre", !(await has("#usk-gate")) && (await checking()) === null);
await page.evaluate(() => window.dispatchEvent(new Event("yt-navigate-finish")));
check("… et toujours pas après yt-navigate-finish", !(await has("#usk-gate")));
await spa("/shorts/def");
check("Short suivant (scroll) : fenêtre", await has("#usk-gate"));
await page.goto(YT + "/");
await page.waitForSelector("#usk-gear");
check("hors chaîne : Shorts de nouveau masqués", (await disp("#reel-shelf")) === "none");

console.log("\n[Réglages via l'icône de l'extension]");
const page2 = watch(await ctx.newPage());
await page2.goto(YT + "/");
await page2.waitForSelector("#usk-gear");
await page.bringToFront();
await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  chrome.action.onClicked.dispatch(tab);
});
await page.waitForSelector("#usk-settings", { timeout: 3000 }).catch(() => {});
check("clic sur l'icône → panneau ouvert dans l'onglet actif", await has("#usk-settings"));
check("… et seulement dans celui-là", !(await has("#usk-settings", page2)));
await page.fill('#usk-settings input[type="number"]', "99999");
await page.fill("#usk-settings .usk-set-q", "   ");
await page.selectOption("#usk-settings select", "watch");
await page.uncheck('#usk-settings .usk-set-row:nth-of-type(3) input[type="checkbox"]');
await page.click("#usk-settings .usk-leave");
await page.waitForTimeout(200);
const cfg = (await stored()).usk_config || {};
check("panneau fermé", !(await has("#usk-settings")));
check("durée bornée à 240 min", cfg.unlockMinutes === 240);
check("question vide → question par défaut", /^Pourquoi/.test(cfg.questions[0]));
check("mode d'ouverture enregistré", cfg.openMode === "watch");
check("bouton ⚙️ retiré dans cet onglet", (await disp("#usk-gear")) === "none");
check("… et dans l'autre onglet (synchro)", (await disp("#usk-gear", page2)) === "none");
await page2.close();

console.log("\n[Mode lecteur normal]");
await store({ usk_unlocked_until: Date.now() + 60000 });
await page.goto(YT + "/shorts/vid42");
await page.waitForURL("**/watch?v=vid42", { timeout: 4000 }).catch(() => {});
check("/shorts/ID → /watch?v=ID", page.url() === YT + "/watch?v=vid42");
await page.goto(YT + "/shorts/vid42");
await page.waitForSelector("#usk-timer", { timeout: 3000 }).catch(() => {});
check("anti-boucle : pas de 2e redirection immédiate", page.url() === YT + "/shorts/vid42" && (await checking()) === null);

console.log("\n[Portée]");
await page.goto("https://studio.youtube.com/");
await page.waitForTimeout(300);
check("inactif sur studio.youtube.com", (await disp("#guide-shorts")) !== "none" && !(await has("#usk-gear")));

check("aucune erreur JS", errors.length === 0);
if (errors.length) errors.forEach((e) => console.log("   " + e));

await ctx.close();
rmSync(profile, { recursive: true, force: true });
console.log("\n" + (failures === 0 ? "EXTENSION CHROME (unpacked) OK ✅" : failures + " échec(s) ❌"));
process.exit(failures === 0 ? 0 : 1);
