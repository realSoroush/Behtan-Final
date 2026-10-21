import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: process.env.PRO_BROWSER_EXECUTABLE || undefined,
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 1250 },
  });
  const html = (
    await fs.readFile("output/pdf/sample-plan.html", "utf8")
  ).replaceAll(
    "http://127.0.0.1:5175",
    pathToFileURL(process.cwd() + "/public").href,
  );
  await fs.writeFile("output/pdf/sample-plan-local.html", html);
  await page.goto(
    pathToFileURL(process.cwd() + "/output/pdf/sample-plan-local.html").href,
  );
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => document.fonts.check("11px Behtan"));
  if (!font) throw new Error("Persian font did not load");
  await page.pdf({
    path: "output/pdf/behtan-pro-sample.pdf",
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  console.log("Sample PDF created with embedded Persian font");
} finally {
  await browser.close();
}
