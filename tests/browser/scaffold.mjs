import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, RUNTIME_FILES, walkFiles } from "../../scripts/files.mjs";
import { startPreview } from "../../scripts/preview.mjs";
import { createGas } from "../helpers/gas.mjs";

const output = join(ROOT, "artifacts");
mkdirSync(output, { recursive: true });
assert.deepEqual(
  walkFiles(join(ROOT, "dist")),
  [...RUNTIME_FILES, ".claspignore"].sort(),
);
assert.equal(
  createGas({ source: join(ROOT, "dist") }).call({
    op: "bootstrap",
    payload: {},
  }).ok,
  false,
);
const { server, url } = await startPreview(0);
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByText("きろくをよめたよ", { exact: true }).waitFor();
  assert.equal(
    await page.locator("#summary").innerText(),
    "たんけんたい\n\nたんきゅうポイント 0",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: join(output, "scaffold-mobile.png"),
    fullPage: true,
  });
  await page.route("**/__test_api", (route) => route.abort("failed"));
  await page.reload();
  const retry = page.getByRole("button", { name: "もういちどよむ" });
  await retry.waitFor();
  const bounds = await retry.boundingBox();
  assert.ok(bounds.height >= 44 && bounds.width >= 44);
  await page.keyboard.press("Tab");
  assert.equal(
    await retry.evaluate((element) => element === document.activeElement),
    true,
  );
  await page.screenshot({
    path: join(output, "scaffold-retry.png"),
    fullPage: true,
  });
  await page.unroute("**/__test_api");
  await page.keyboard.press("Enter");
  await page.getByText("きろくをよめたよ", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  const result = {
    testedAt: new Date().toISOString(),
    browser: await browser.version(),
    viewport: "360x800",
    checks: [
      "bootstrap via mocked GAS",
      "no horizontal overflow",
      "failure display",
      "44px button",
      "keyboard retry",
      "no page errors",
      "dist excludes test data",
    ],
    realGas: false,
  };
  writeFileSync(
    join(output, "scaffold-browser-result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
