import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSheetGas } from "./helpers/sheets.mjs";
import { DATASET, mutation } from "./helpers/fixtures.mjs";
const plain = (x) => JSON.parse(JSON.stringify(x));
const lines = [
  "やったね！いっしょにたのしもう！",
  "つぎもいっしょにためそう！",
  "きみとあそべてうれしいな！",
];
function setup() {
  const g = createSheetGas();
  for (const [k, v] of Object.entries({
    JANKEN_ADMIN_EMAIL: "owner@example.com",
    JANKEN_AI_TEXT_ENABLED: "true",
    GEMINI_TEXT_MODEL: "gemini-3.1-flash-lite",
    GEMINI_API_KEY: "TEST_SECRET",
  }))
    g.props.set(k, v);
  const call = (op, p = {}) => plain(g.context.adminApi({ op, payload: p }));
  assert.equal(call("initialize", { datasetId: DATASET }).ok, true);
  let fetches = 0;
  g.context.UrlFetchApp = {
    fetch(url, options) {
      fetches++;
      assert.equal(g.lock.held, false);
      assert.ok(!url.includes("TEST_SECRET"));
      assert.equal(options.headers["x-goog-api-key"], "TEST_SECRET");
      const body = JSON.parse(options.payload);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(JSON.stringify(body).includes("P001"), false);
      return {
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [{ text: JSON.stringify({ texts: lines }) }],
                },
              },
            ],
          }),
      };
    },
  };
  return { g, call, fetches: () => fetches };
}
const gen = (revision = 0) => ({
  datasetId: DATASET,
  requestId: randomUUID(),
  slotKey: "C01_WIN",
  draftRevision: revision,
});
const pub = (revision = 1, version = 0, selectedIndices = [1]) => ({
  datasetId: DATASET,
  slotKey: "C01_WIN",
  draftRevision: revision,
  expectedVersion: version,
  selectedIndices,
});

test("admin is denied for missing, blank or different actual user, including direct API calls", () => {
  const { g, call } = setup();
  for (const email of ["", "visitor@example.com"]) {
    g.context.Session.getActiveUser = () => ({ getEmail: () => email });
    assert.equal(call("list").error.code, "FORBIDDEN");
    assert.throws(
      () => g.render({ parameter: { view: "admin" } }),
      (e) => e.code === "FORBIDDEN",
    );
  }
  g.context.Session.getActiveUser = () => ({
    getEmail: () => "owner@example.com",
  });
  g.props.delete("JANKEN_ADMIN_EMAIL");
  assert.equal(call("list").error.code, "FORBIDDEN");
});

test("draft is private until explicit publication; replay never generates twice and does not mutate Actions", () => {
  const { g, call, fetches } = setup(),
    p = gen(),
    before = JSON.stringify(g.sheets.get("Actions").rows);
  let r = call("generate", p);
  assert.equal(r.data.status, "generated");
  assert.deepEqual(r.data.drafts[0].texts, lines);
  assert.equal(fetches(), 1);
  assert.equal(call("generate", p).data.status, "generated");
  assert.equal(fetches(), 1);
  assert.equal(
    call("generate", { ...p, slotKey: "C02_WIN" }).error.code,
    "REQUEST_ID_CONFLICT",
  );
  assert.deepEqual(
    g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog.entries,
    [],
  );
  assert.equal(call("publish", pub()).ok, true);
  const catalog = g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog;
  assert.deepEqual(catalog.entries[0].texts, [lines[1]]);
  assert.equal(call("publish", pub()).error.code, "VERSION_CONFLICT");
  assert.equal(call("publish", pub(1, 1, [99])).error.code, "INVALID_ARGUMENT");
  assert.equal(
    call("publish", { ...pub(1, 1), texts: ["勝手な文"] }).error.code,
    "INVALID_ARGUMENT",
  );
  assert.equal(call("publish", pub(1, 1, [])).ok, true);
  assert.equal(
    g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog.entries
      .length,
    0,
  );
  assert.equal(JSON.stringify(g.sheets.get("Actions").rows), before);
  assert.equal(JSON.stringify(call("list")).includes("TEST_SECRET"), false);
  assert.deepEqual(g.logs, []);
});

test("429 stops the JST day and manual replay never retries generation; game remains available", () => {
  const { g, call } = setup();
  let count = 0;
  g.context.UrlFetchApp.fetch = () => {
    count++;
    return { getResponseCode: () => 429 };
  };
  const p = gen();
  assert.equal(call("generate", p).data.status, "failed");
  assert.equal(call("generate", p).data.status, "failed");
  assert.equal(call("generate", gen()).error.code, "AI_LIMIT");
  assert.equal(count, 1);
  assert.equal(
    g.call(
      mutation("playRound", {
        characterId: "C01",
        skillId: "S01",
        hand: "rock",
      }),
    ).ok,
    true,
  );
  g.context.generationDay_ = () => "2099-01-01";
  assert.equal(call("generate", gen()).data.status, "failed");
  assert.equal(count, 2);
});

test("daily cap, AI switch, model allowlist, and reserved unknown results fail without additional calls", () => {
  const { g, call, fetches } = setup();
  g.props.set("JANKEN_AI_TEXT_ENABLED", "false");
  assert.equal(call("generate", gen()).error.code, "AI_DISABLED");
  g.props.set("JANKEN_AI_TEXT_ENABLED", "true");
  g.props.set("GEMINI_TEXT_MODEL", "image-model");
  assert.equal(call("generate", gen()).error.code, "AI_UNAVAILABLE");
  g.props.set("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite");
  for (let i = 0; i < 20; i++)
    assert.equal(call("generate", gen(i)).data.status, "generated");
  assert.equal(call("generate", gen(20)).error.code, "AI_LIMIT");
  assert.equal(fetches(), 20);
  const p = gen(20),
    hash = g.context.payloadHash_({
      datasetId: DATASET,
      slotKey: p.slotKey,
      draftRevision: 20,
    });
  g.props.set(
    "JANKEN_AI_JOB_" + p.requestId,
    JSON.stringify({ hash, status: "reserved" }),
  );
  assert.equal(call("generate", p).data.status, "unknown");
  assert.equal(fetches(), 20);
});

test("invalid, blocked and oversized model output is discarded; publication survives failures", () => {
  const { g, call } = setup();
  call("generate", gen());
  call("publish", pub());
  const before = JSON.stringify(
    g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog,
  );
  const outputs = [
    { texts: ["<script>悪い文</script>"] },
    { texts: ["あ".repeat(41)] },
    { texts: ["点数は100です"] },
    { texts: ["https://example.comへ行こう"] },
    { texts: ["同じ文", "同じ文"] },
    { texts: ["\u202eあ"] },
    { texts: ["abc"] },
  ];
  for (const output of outputs) {
    g.context.UrlFetchApp.fetch = () => ({
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(output) }] },
            },
          ],
        }),
    });
    assert.equal(call("generate", gen(1)).data.status, "failed");
  }
  assert.equal(
    JSON.stringify(
      g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog,
    ),
    before,
  );
  g.sheets.get("DialoguePublication").rows[1][2] = "broken";
  assert.equal(call("list").ok, false);
  assert.deepEqual(
    g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog.entries,
    [],
  );
});

test("interrupted persistence and concurrent drafts never repeat external calls or overwrite newer drafts", () => {
  const { g, call, fetches } = setup(),
    p = gen();
  const flush = g.context.SpreadsheetApp.flush;
  let crash = true;
  g.context.SpreadsheetApp.flush = () => {
    if (crash && fetches() > 0) {
      crash = false;
      throw Error("lost reply");
    }
    flush();
  };
  assert.equal(call("generate", p).ok, false);
  assert.equal(fetches(), 1);
  assert.equal(call("generate", p).data.status, "unknown");
  assert.equal(fetches(), 1);
  assert.equal(call("list").data.drafts[0].revision, 1);
  const original = g.context.UrlFetchApp.fetch;
  g.context.UrlFetchApp.fetch = (...args) => {
    const row = g.sheets.get("DialogueDrafts").rows[1];
    row[1] = 2;
    row[2] = JSON.stringify(["新しい候補だよ"]);
    return original(...args);
  };
  assert.equal(call("generate", gen(1)).data.status, "failed");
  assert.deepEqual(call("list").data.drafts[0].texts, ["新しい候補だよ"]);
});

test("provider 5xx, invalid JSON, safety block and unavailable key never change published game data", () => {
  const { g, call } = setup();
  call("generate", gen());
  call("publish", pub());
  for (const response of [
    { getResponseCode: () => 503 },
    { getResponseCode: () => 200, getContentText: () => "not json" },
    { getResponseCode: () => 200, getContentText: () => "x".repeat(32769) },
    {
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
    },
  ]) {
    g.context.UrlFetchApp.fetch = () => response;
    assert.equal(call("generate", gen(1)).data.status, "failed");
    assert.equal(
      g.call({ op: "bootstrap", payload: {} }).data.dialogueCatalog.entries
        .length,
      1,
    );
  }
  g.props.delete("GEMINI_API_KEY");
  assert.equal(call("generate", gen(1)).ok, false);
  assert.equal(g.call({ op: "bootstrap", payload: {} }).ok, true);
});
