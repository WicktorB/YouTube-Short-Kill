// Rend src/chrome/icons/icon.svg en PNG (16, 32, 48, 128) avec Chromium.
//   node tools/make_chrome_icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/chrome/icons");
const svg = readFileSync(join(DIR, "icon.svg"), "utf8");

const browser = await chromium.launch({ executablePath: process.env.USK_CHROMIUM || undefined, args: ["--no-sandbox"] });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    "<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>" + svg
  );
  await page.screenshot({ path: join(DIR, "icon-" + size + ".png"), omitBackground: true });
  await page.close();
  console.log("écrit src/chrome/icons/icon-" + size + ".png");
}
await browser.close();
