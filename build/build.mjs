// Build : génère trois sorties dans dist/.
//   - utub-short-kill.user.js  userscript (téléphone / Tampermonkey)  ← src/core
//   - extension/               extension générique (Firefox, Safari)  ← src/core
//   - chrome/                  extension Chrome/Chromium « unpacked »  ← src/chrome
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const RAW = "https://raw.githubusercontent.com/WicktorB/YouTube-Short-Kill/main/dist/utub-short-kill.user.js";

const banner = [
  "// ==UserScript==",
  "// @name         UTub Short Kill",
  "// @namespace    utub-short-kill",
  "// @version      " + VERSION,
  "// @description  Masque les YouTube Shorts (sauf sur les chaînes) et protège leur accès par 3 questions, avec minuteur et panneau de réglages.",
  "// @author       victor",
  "// @match        *://*.youtube.com/*",
  "// @match        *://youtube.com/*",
  "// @run-at       document-start",
  "// @grant        none",
  "// @downloadURL  " + RAW,
  "// @updateURL    " + RAW,
  "// ==/UserScript=="
].join("\n");

const common = {
  bundle: true,
  format: "iife",
  target: ["chrome90", "firefox90", "safari14"],
  loader: { ".css": "text" },
  legalComments: "none",
  logLevel: "warning"
};

rmSync(join(ROOT, "dist"), { recursive: true, force: true });
mkdirSync(join(ROOT, "dist/extension/icons"), { recursive: true });

// 1) Userscript
await build({
  ...common,
  entryPoints: [join(ROOT, "src/entry/userscript.js")],
  outfile: join(ROOT, "dist/utub-short-kill.user.js"),
  banner: { js: banner }
});

// 2) Extension (content script)
await build({
  ...common,
  entryPoints: [join(ROOT, "src/entry/extension.js")],
  outfile: join(ROOT, "dist/extension/content.js")
});

// 3) Manifest de l'extension (version synchronisée avec package.json)
const manifest = {
  manifest_version: 3,
  name: "UTub Short Kill",
  version: VERSION,
  description: "Masque les YouTube Shorts (sauf sur les chaînes) et protège leur accès par 3 questions.",
  icons: { 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  // Sans cette permission, chrome/browser.storage n'existe pas dans le content
  // script : réglages et déblocage n'étaient jamais enregistrés.
  permissions: ["storage"],
  content_scripts: [
    {
      matches: ["*://*.youtube.com/*", "*://youtube.com/*"],
      run_at: "document_start",
      all_frames: false,
      js: ["content.js"]
    }
  ],
  browser_specific_settings: { gecko: { id: "utub-short-kill@victor.bauchet", strict_min_version: "115.0" } }
};
writeFileSync(join(ROOT, "dist/extension/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// 4) Icônes
cpSync(join(ROOT, "icons/icon-48.png"), join(ROOT, "dist/extension/icons/icon-48.png"));
cpSync(join(ROOT, "icons/icon-128.png"), join(ROOT, "dist/extension/icons/icon-128.png"));

// 5) Extension Chrome (src/chrome) : cœur dédié, piloté par événements.
//    Sa version vit dans src/chrome/manifest.json, indépendante du userscript.
const CHROME = join(ROOT, "src/chrome");
const chromeManifest = JSON.parse(readFileSync(join(CHROME, "manifest.json"), "utf8"));
mkdirSync(join(ROOT, "dist/chrome"), { recursive: true });
await build({
  ...common,
  target: ["chrome" + chromeManifest.minimum_chrome_version],
  entryPoints: [join(CHROME, "content.js")],
  outfile: join(ROOT, "dist/chrome/content.js")
});
// CSS injecté nativement par Chrome (clé "css" du manifest) : la feuille
// commune, puis les règles propres à l'extension.
writeFileSync(
  join(ROOT, "dist/chrome/content.css"),
  readFileSync(join(ROOT, "src/styles/index.css"), "utf8") + "\n" + readFileSync(join(CHROME, "extra.css"), "utf8")
);
cpSync(join(CHROME, "manifest.json"), join(ROOT, "dist/chrome/manifest.json"));
cpSync(join(CHROME, "background.js"), join(ROOT, "dist/chrome/background.js"));
mkdirSync(join(ROOT, "dist/chrome/icons"));
for (const size of Object.keys(chromeManifest.icons)) {
  cpSync(join(CHROME, "icons/icon-" + size + ".png"), join(ROOT, "dist/chrome/icons/icon-" + size + ".png"));
}

console.log("build OK");
console.log("  dist/utub-short-kill.user.js  v" + VERSION);
console.log("  dist/extension/               v" + VERSION);
console.log("  dist/chrome/                  v" + chromeManifest.version);
