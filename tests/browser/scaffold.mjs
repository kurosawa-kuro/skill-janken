import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { ROOT, RUNTIME_FILES, walkFiles } from "../../scripts/files.mjs";
import { startPreview } from "../../scripts/preview.mjs";
const output = join(ROOT, "artifacts");
mkdirSync(output, { recursive: true });
assert.deepEqual(
  walkFiles(join(ROOT, "dist")),
  [...RUNTIME_FILES, ".claspignore"].sort(),
);
const { server, gas, url } = await startPreview(0);
let browser;
const errors = [],
  calls = [];
let generated = 0;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/__test_")) calls.push(JSON.parse(r.postData()));
  });
  await page.goto(url);
  await expect(page.locator("#status")).toHaveText("きろくをよめたよ");
  await expect(page.locator("#summary")).toContainText("0");
  assert.equal(calls.length, 1);
  const fit = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  await fit();
  await page.screenshot({ path: join(output, "mvp-home.png"), fullPage: true });
  for (let i = 0; i < 2; i++) {
    const before = calls.length;
    await page.getByRole("button", { name: "なかまをよぶ（無料）" }).click();
    await expect(page.locator("#result")).toBeVisible();
    assert.equal(calls.length, before + 1);
    await page.locator("#result-close").click();
  }
  await expect(
    page.getByRole("button", { name: "みんなそろったよ" }),
  ).toBeDisabled();
  await page.locator('[data-view="friends"]').click();
  await expect(page.locator("#view .card")).toHaveCount(3);
  await page.locator('[data-view="battle"]').click();
  await page.locator("#battle-character").selectOption("C02");
  await expect(page.locator('input[name="skill"]')).toHaveCount(2);
  await page.locator('input[value="S03"]').check();
  const before = calls.length;
  await page.getByRole("button", { name: "グー", exact: true }).click();
  await expect(page.locator("#result")).toBeVisible();
  assert.equal(calls.length, before + 1);
  await expect(page.locator(".bubble")).toBeVisible();
  await fit();
  await page.screenshot({
    path: join(output, "mvp-battle.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#result")).not.toBeVisible();
  assert.equal(
    await page.evaluate(() => document.activeElement.tagName),
    "BUTTON",
  );
  await page.locator('[data-view="relations"]').click();
  await expect(page.locator("td")).toHaveCount(9);
  assert.equal(
    await page
      .locator("td")
      .evaluateAll((xs) => xs.filter((x) => x.textContent === "○").length),
    6,
  );
  await expect(page.locator("ol li")).toHaveCount(3);
  await fit();
  await page.screenshot({
    path: join(output, "mvp-relations.png"),
    fullPage: true,
  });
  const points = gas.context.readSnapshot_().data.state.points;
  await page.reload();
  await expect(page.locator("#summary")).toContainText(
    "たんきゅうポイント " + points,
  );
  // Actual commit with deliberately lost HTTP response, persisted pending then manual replay.
  await page.locator('[data-view="battle"]').click();
  let discarded;
  await page.route("**/__test_api", async (route) => {
    const r = route.request().postDataJSON();
    if (r.op === "playRound" && !discarded) {
      discarded = r;
      gas.call(r);
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "グー", exact: true }).click();
  await expect(page.locator("#resend")).toBeVisible();
  await page.unroute("**/__test_api");
  const count = gas.sheets.get("Actions").rows.length;
  await page.reload();
  await expect(page.locator("#resend")).toBeVisible();
  assert.equal(gas.sheets.get("Actions").rows.length, count);
  await page.locator("#resend").click();
  await expect(page.locator("#resend")).not.toBeVisible();
  assert.equal(gas.sheets.get("Actions").rows.length, count);
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#result-close").click();
  assert.deepEqual(
    calls.filter((r) => r.requestId === discarded.requestId),
    [discarded, discarded],
  );
  // Competing tabs refresh rather than applying a second stale mutation.
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator("#status")).toHaveText("きろくをよめたよ");
  await page.locator('[data-view="battle"]').click();
  await other.locator('[data-view="battle"]').click();
  await page.getByRole("button", { name: "グー", exact: true }).click();
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#result-close").click();
  await other.getByRole("button", { name: "パー", exact: true }).click();
  await expect(other.locator("#status")).toContainText("きろく");
  await expect(other.locator("#summary")).toHaveText(
    await page.locator("#summary").textContent(),
  );
  await other.close();
  // Admin generates into drafts, publishes explicitly, game uses the catalog on next bootstrap only.
  for (const [k, v] of Object.entries({
    JANKEN_AI_TEXT_ENABLED: "true",
    GEMINI_TEXT_MODEL: "gemini-3.1-flash-lite",
    GEMINI_API_KEY: "TEST_ONLY",
  }))
    gas.props.set(k, v);
  gas.context.UrlFetchApp = {
    fetch() {
      generated++;
      return {
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        texts: [
                          "いっしょにできてうれしいな！",
                          "つぎもたのしもうね！",
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      };
    },
  };
  const admin = await context.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(url + "?view=admin");
  await admin.locator("#admin-init").click();
  await expect(admin.locator("#admin-slots section")).toHaveCount(9);
  const slot = admin.locator("#admin-slots section").first();
  await slot.getByRole("button", { name: "候補を生成" }).click();
  await expect(slot.locator("input[type=checkbox]")).toHaveCount(2);
  assert.equal(generated, 1);
  assert.equal(gas.context.readPublicDialogue_(gas.book).entries.length, 0);
  await slot.locator("input[type=checkbox]").first().check();
  await slot.getByRole("button", { name: "選んだ文を採用・公開" }).click();
  await expect(slot).toContainText("採用済み");
  await admin.screenshot({
    path: join(output, "mvp-admin.png"),
    fullPage: true,
  });
  gas.context.chooseIndex_ = () => 1; // test-only: rock vs scissors, no public override
  await page.reload();
  await expect(page.locator("#status")).toHaveText("きろくをよめたよ");
  await page.locator('[data-view="battle"]').click();
  const start = calls.length;
  await page.getByRole("button", { name: "グー", exact: true }).click();
  await expect(page.locator(".bubble")).toHaveText(
    "いっしょにできてうれしいな！",
  );
  assert.equal(calls.length, start + 1);
  assert.equal(generated, 1);
  await slot.getByRole("button", { name: "採用を解除して定型文へ" }).click();
  await expect(slot).toContainText("定型文のみ");
  assert.equal(await page.locator("img").count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(
    calls.some((r) =>
      ["synthesize", "getAsset", "getBattleLine", "generate"].includes(r.op),
    ),
    false,
  );
  writeFileSync(
    join(output, "mvp-browser-result.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        viewport: "360x800",
        result: "PASS",
        actions: gas.context.readSnapshot_().actions.length,
        checks: [
          "golden-path",
          "no-overflow",
          "one-rpc-per-mutation",
          "lost-response-reload-manual-replay",
          "two-tab-version-conflict",
          "admin-review-publish-unpublish",
          "no-game-generation",
          "keyboard-dialog",
          "no-images",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Chromium MVP game/admin checks PASS");
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
