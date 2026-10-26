import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, RUNTIME_FILES, walkFiles } from "../../scripts/files.mjs";
import { startPreview } from "../../scripts/preview.mjs";
import { createGas } from "../helpers/gas.mjs";
import { createSheetGas } from "../helpers/sheets.mjs";
import { convertWebp } from "../../scripts/convert-webp.mjs";

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
  const conversionPage = await browser.newPage();
  const png = await conversionPage.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    context.fillStyle = "#447799";
    context.fillRect(0, 0, 1024, 768);
    context.fillStyle = "white";
    context.font = "80px sans-serif";
    context.fillText("CONVERSION TEST", 30, 180);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const converted = await convertWebp(
    conversionPage,
    Buffer.from(png, "base64"),
  );
  assert.equal(converted.width, 512);
  assert.equal(converted.height, 384);
  assert.ok(converted.bytes.length <= 102400);
  assert.equal(converted.bytes.toString("ascii", 8, 12), "WEBP");
  await assert.rejects(
    convertWebp(conversionPage, Buffer.from("not an image")),
  );
  writeFileSync(join(output, "conversion-test.webp"), converted.bytes);
  await conversionPage.close();
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
  // Exercise the real pending client and journal boundary with a lost response.
  // The deterministic producer exists only in this test, never in public GAS.
  const journal = createSheetGas();
  let loseResponse = true;
  const sent = [];
  await page.route("**/__test_api", async (route) => {
    const request = route.request().postDataJSON();
    if (request.op === "drawCharacter") {
      sent.push(request);
      const result = journal.context.commitAction_(request, (state) => ({
        result: { characterId: "C02", candidateCount: 2 },
        state: { ...state, version: 1, ownedCharacterIds: ["C01", "C02"] },
      }));
      if (loseResponse) {
        loseResponse = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        json: { ok: true, requestId: request.requestId, ...result },
      });
    } else await route.fulfill({ json: journal.call(request) });
  });
  assert.equal(
    await page.evaluate(async () => {
      try {
        await App.commands.start("drawCharacter", {}, 0);
      } catch (error) {
        return error.code;
      }
    }),
    "NETWORK_ERROR",
  );
  // A second tab/session has since committed a later state.
  journal.context.commitAction_(
    {
      op: "playRound",
      requestId: crypto.randomUUID(),
      expectedVersion: 1,
      payload: { characterId: "C01", skillId: "S01", hand: "rock" },
    },
    (state) => ({
      state: { ...state, version: 2, points: 1 },
      result: {
        characterId: "C01",
        skillId: "S01",
        playerHand: "rock",
        cpuHand: "rock",
        outcome: "DRAW",
        basePoints: 1,
        bonusPoints: 0,
        earnedPoints: 1,
      },
    }),
  );
  await page.reload();
  const resend = page.getByRole("button", { name: "つづきのきろくをかくにん" });
  await resend.waitFor();
  assert.equal(sent.length, 1);
  assert.equal(await page.locator("#summary").isVisible(), false);
  await resend.click();
  await page.getByText("たんきゅうポイント 1", { exact: true }).waitFor();
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(journal.sheets.get("Actions").rows.length, 3);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem(App.pending.KEY)),
    null,
  );
  await page.screenshot({
    path: join(output, "hardening-recovered.png"),
    fullPage: true,
  });
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
      "pending survives browser reload without automatic resend",
      "lost response manual replay does not append twice",
      "replay refreshes the later journal state",
      "local PNG to WebP conversion stays within 512px and 100KiB",
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
