import test from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./helpers/gas.mjs";
import { bootstrapResult, mutation, UUID } from "./helpers/fixtures.mjs";

test("bootstrap keeps the full contract and never includes settings", () => {
  const gas = createGas({
    properties: { GEMINI_API_KEY: "PRIVATE_KEY" },
    services: { bootstrap: bootstrapResult },
  });
  const response = gas.call({ op: "bootstrap", payload: {} });
  assert.deepEqual(response, {
    ok: true,
    requestId: null,
    replayed: false,
    ...bootstrapResult(),
  });
  assert.equal(JSON.stringify(response).includes("PRIVATE_KEY"), false);
});

test("mutation metadata is preserved, asset version stays inside data", () => {
  const gas = createGas({
    services: {
      drawCharacter: () => ({
        data: { result: { characterId: "C02" } },
        version: 1,
        replayed: true,
      }),
      getAsset: () => ({
        data: {
          assetId: "A_C01",
          version: 2,
          mimeType: "image/webp",
          base64: "fixture",
        },
      }),
    },
  });
  const result = gas.call(mutation());
  assert.equal(result.requestId, UUID);
  assert.equal(result.version, 1);
  assert.equal(result.replayed, true);
  const asset = gas.call({ op: "getAsset", payload: { assetId: "A_C01" } });
  assert.equal(asset.ok, true);
  assert.equal(Object.hasOwn(asset, "version"), false);
  assert.equal(asset.data.version, 2);
});

test("invalid contracts are rejected before creating external services", () => {
  const gas = createGas();
  gas.context.createServices_ = () => {
    throw new Error("must not execute");
  };
  const invalid = [
    null,
    [],
    {},
    { op: "constructor", payload: {} },
    { op: ["bootstrap"], payload: {} },
    { op: "bootstrap", payload: {}, playerId: "P002" },
    { op: "bootstrap", payload: { fileId: "private" } },
    { op: "getAsset", payload: { assetId: "A_C01", fileId: "private" } },
    { op: "getAsset", payload: { assetId: "a".repeat(33) } },
    { op: "getAsset", payload: { assetId: "../private" } },
    { op: "bootstrap", payload: { text: "あ".repeat(2000) } },
    { ...mutation(), expectedVersion: -1 },
    { ...mutation(), expectedVersion: 0.5 },
    { ...mutation(), expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...mutation(), requestId: "legacy-random-id" },
    { ...mutation(), requestId: "x".repeat(36) },
    mutation("playRound", { characterId: "C01", skillId: "S01", hand: "fire" }),
    mutation("playRound", {
      characterId: "C01",
      skillId: "S01",
      hand: "rock",
      points: 100,
    }),
    mutation("synthesize", { ingredientSkillIds: ["S01", "S01"] }),
    mutation("synthesize", { ingredientSkillIds: ["S01"] }),
  ];
  for (const request of invalid) {
    const result = gas.call(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    assert.equal(
      result.error.code,
      "INVALID_ARGUMENT",
      JSON.stringify(request),
    );
  }
});

test("all six valid operation shapes route to their intended service", () => {
  const requests = [
    { op: "bootstrap", payload: {} },
    { op: "getRelations", payload: {} },
    { op: "getAsset", payload: { assetId: "A_C01" } },
    mutation(),
    mutation("playRound", { characterId: "C01", skillId: "S01", hand: "rock" }),
    mutation("synthesize", { ingredientSkillIds: ["S02", "S01"] }),
  ];
  const calls = [];
  const services = Object.fromEntries(
    requests.map(({ op }) => [
      op,
      (payload, request) => {
        calls.push({ op, payload, request });
        return bootstrapResult();
      },
    ]),
  );
  const gas = createGas({ services });
  for (const request of requests) assert.equal(gas.call(request).ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.map((x) => x.request))),
    requests,
  );
});

test("unconfigured and unimplemented production adapters never return mock success", () => {
  for (const properties of [
    {},
    {
      JANKEN_SPREADSHEET_ID: "private-sheet",
      JANKEN_DRIVE_FOLDER_ID: "private-folder",
      GEMINI_API_KEY: "private-key",
      GEMINI_IMAGE_MODEL: "private-model",
    },
  ]) {
    const gas = createGas({ properties });
    for (const request of [
      { op: "bootstrap", payload: {} },
      { op: "getRelations", payload: {} },
      { op: "getAsset", payload: { assetId: "A_C01" } },
      mutation(),
    ]) {
      const result = gas.call(request);
      assert.equal(result.ok, false);
      assert.equal(JSON.stringify(result).includes("private-"), false);
    }
    assert.throws(() => gas.run('generateAsset_("A_C01")'));
    assert.deepEqual(gas.logs, []);
  }
});

test("provider error text never reaches the response or logs", () => {
  const gas = createGas({
    services: {
      bootstrap() {
        throw new Error("API_KEY private_file_id token");
      },
    },
  });
  assert.deepEqual(gas.call({ op: "bootstrap", payload: {} }).error, {
    code: "INTERNAL_ERROR",
    message: "つうしんをかくにんして、もういちど",
    retryable: true,
    details: {},
  });
  assert.deepEqual(gas.logs, []);
});

test("configuration diagnostics report only names and presence; no writes", () => {
  const gas = createGas({
    properties: { GEMINI_API_KEY: "SECRET", JANKEN_SPREADSHEET_ID: "  " },
  });
  const diagnostic = JSON.parse(
    JSON.stringify(gas.run("inspectConfiguration_()")),
  );
  assert.equal(
    diagnostic.find((item) => item.name === "GEMINI_API_KEY").configured,
    true,
  );
  assert.equal(
    diagnostic.find((item) => item.name === "JANKEN_SPREADSHEET_ID").configured,
    false,
  );
  assert.equal(JSON.stringify(diagnostic).includes("SECRET"), false);
  assert.equal(gas.props.size, 2);
});

test("web template has no external configuration and escapes embedded JSON", () => {
  const gas = createGas({ properties: { GEMINI_API_KEY: "SECRET" } });
  const html = gas.render();
  assert.equal(html.includes("<?"), false);
  assert.equal(html.includes("SECRET"), false);
  assert.match(html, /name="viewport"/);
  const attack = "</script><img src=x onerror=alert(1)>\u2028\u2029&";
  const escaped = gas.run(`serializeForScript_(${JSON.stringify({ attack })})`);
  assert.equal(/[<>&\u2028\u2029]/.test(escaped), false);
  assert.equal(JSON.parse(escaped).attack, attack);
  assert.throws(() => gas.run('include_("../env/secret")'));
});

test("broken service response is an error, not a successful bootstrap", () => {
  for (const result of [null, {}, { data: {} }, { data: {}, version: -1 }]) {
    const gas = createGas({ services: { bootstrap: () => result } });
    assert.equal(
      gas.call({ op: "bootstrap", payload: {} }).error.code,
      "INTERNAL_ERROR",
    );
  }
});
