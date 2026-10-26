import test from "node:test";
import assert from "node:assert/strict";
import { createSheetGas } from "./helpers/sheets.mjs";
import { createGas } from "./helpers/gas.mjs";

test("real repository adapter maps typed initial tables to the public contract", () => {
  const gas = createSheetGas();
  const response = gas.call({ op: "bootstrap", payload: {} });
  assert.equal(response.ok, true);
  assert.equal(response.version, 0);
  assert.equal(response.data.characters.length, 3);
  assert.equal(response.data.skills.length, 4);
  assert.equal(response.data.characterSkills.length, 9);
  assert.equal(response.data.recipes[0].cost, 3);
  assert.equal(JSON.stringify(response).includes("sourceFileId"), false);
  assert.equal(JSON.stringify(response).includes("test-sheet"), false);
});

test("repository refuses broken headers, blank keys, changed types, or existing actions", () => {
  const corruptions = [
    (gas) => gas.sheets.get("Assets").rows.splice(2, 0, Array(11).fill("")),
    (gas) => gas.sheets.get("Players").rows[0].reverse(),
    (gas) => gas.sheets.get("Characters").rows[1].splice(0, 1, ""),
    (gas) => gas.sheets.get("Characters").rows[1].splice(4, 1, "true"),
    (gas) => gas.sheets.get("Actions").rows.push(["", "P001", 1]),
    (gas) => gas.sheets.get("Actions").rows.push(["action1", "P001", 1]),
    (gas) =>
      gas.sheets.get("Assets").rows.push(gas.sheets.get("Assets").rows[1]),
  ];
  for (const corrupt of corruptions) {
    const gas = createSheetGas();
    corrupt(gas);
    assert.equal(
      gas.call({ op: "bootstrap", payload: {} }).error.code,
      "DATA_INTEGRITY_ERROR",
    );
  }
});

test("setup creates eight tables only for a new book and never overwrites configured data", () => {
  const gas = createSheetGas();
  gas.props.delete("JANKEN_SPREADSHEET_ID");
  assert.equal(gas.run("setupLab_()").created, true);
  assert.equal(gas.sheets.size, 8);
  assert.equal(gas.sheets.get("Actions").rows.length, 1);
  assert.equal(gas.sheets.get("Characters").rows[1][4], true);
  const before = structuredClone(
    [...gas.sheets.values()].map((sheet) => sheet.rows),
  );
  assert.equal(gas.run("setupLab_()").created, false);
  assert.deepEqual(
    [...gas.sheets.values()].map((sheet) => sheet.rows),
    before,
  );
  gas.sheets.get("Players").rows[1][2] = "invalid";
  assert.throws(() => gas.run("setupLab_()"));
  assert.equal(gas.sheets.get("Players").rows[1][2], "invalid");
  assert.equal(gas.lock.held, false);
});

test("lock contention does not create a book or release another lock", () => {
  const gas = createSheetGas();
  gas.lock.fail = true;
  assert.throws(() => gas.run("setupLab_()"), /BUSY/);
  assert.equal(gas.lock.releases, 0);
});

function webp(width = 64, height = 64) {
  const packed = (width - 1) | ((height - 1) << 14);
  const data = Buffer.alloc(26);
  data.write("RIFF");
  data.writeUInt32LE(18, 4);
  data.write("WEBPVP8L", 8);
  data.writeUInt32LE(5, 16);
  data[20] = 47;
  data.writeUInt32LE(packed >>> 0, 21);
  return [...data];
}

test("WebP dimensions and RIFF length are validated; PNG and oversized input rejected", () => {
  const gas = createGas();
  const result = gas.run(
    `validateWebp_(${JSON.stringify(webp())}, "image/webp")`,
  );
  assert.equal(result.width, 64);
  for (const [bytes, mime] of [
    [webp(513), "image/webp"],
    [webp(), "image/png"],
    [webp().slice(0, -1), "image/webp"],
    [Array(102401).fill(0), "image/webp"],
  ]) {
    assert.throws(() =>
      gas.run(
        `validateWebp_(${JSON.stringify(bytes)}, ${JSON.stringify(mime)})`,
      ),
    );
  }
});

test("asset lookup requires READY and only returns a validated private WebP", () => {
  const gas = createSheetGas(),
    bytes = webp();
  gas.context.privateImageFile_ = () => ({
    getSize: () => bytes.length,
    getMimeType: () => "image/webp",
    getBlob: () => ({ getBytes: () => bytes }),
  });
  gas.context.Utilities.base64Encode = (input) =>
    Buffer.from(input).toString("base64");
  const request = { op: "getAsset", payload: { assetId: "A_C01" } };
  assert.equal(gas.call(request).error.code, "ASSET_UNAVAILABLE");
  gas.run('registerWebp_("A_C01", "private-image-id")');
  const response = gas.call(request);
  assert.equal(response.ok, true);
  assert.equal(response.data.version, 1);
  assert.equal(response.data.mimeType, "image/webp");
  assert.equal(JSON.stringify(response).includes("private-image-id"), false);
  gas.context.privateImageFile_ = () => {
    throw Error("private permission info");
  };
  assert.equal(gas.call(request).error.code, "ASSET_UNAVAILABLE");
});

test("Gemini failure never creates a READY image and keys stay in request headers", () => {
  const gas = createSheetGas();
  gas.props.set("GEMINI_API_KEY", "SECRET_TEST_KEY");
  gas.props.set("GEMINI_IMAGE_MODEL", "gemini-test-image");
  const requests = [];
  gas.context.UrlFetchApp = {
    fetch(url, options) {
      requests.push({ url, options });
      return { getResponseCode: () => 429 };
    },
  };
  assert.throws(() => gas.run('generateAsset_("A_C01")'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.includes("SECRET_TEST_KEY"), false);
  assert.equal(
    requests[0].options.headers["x-goog-api-key"],
    "SECRET_TEST_KEY",
  );
  assert.equal(gas.sheets.get("Assets").rows[1][6], "DRAFT");
  assert.equal(gas.lock.held, false);
  assert.equal(gas.logs.length, 1);
  assert.equal(JSON.stringify(gas.logs).includes("SECRET_TEST_KEY"), false);
  gas.context.UrlFetchApp.fetch = (url, options) => {
    assert.match(url, /\/models\?pageSize=1000$/);
    assert.equal(options.payload, undefined);
    return {
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          models: [
            { name: "models/gemini-test-image" },
            { name: "SECRET_TEST_KEY" },
          ],
          ignored: "SECRET_TEST_KEY",
        }),
    };
  };
  gas.run("inspectGemini_()");
  assert.equal(JSON.stringify(gas.logs).includes("SECRET_TEST_KEY"), false);
  assert.equal(gas.sheets.get("Assets").rows[1][6], "DRAFT");
});

test("Gemini extracts image parts, persists source metadata, and refuses accidental re-generation", () => {
  const gas = createSheetGas();
  gas.props.set("GEMINI_API_KEY", "SECRET_TEST_KEY");
  gas.props.set("GEMINI_IMAGE_MODEL", "gemini-test-image");
  let calls = 0;
  gas.context.UrlFetchApp = {
    fetch() {
      calls++;
      return {
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    { text: "ignored" },
                    { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
                  ],
                },
              },
            ],
          }),
      };
    },
  };
  gas.context.Utilities.base64Decode = (text) => [
    ...Buffer.from(text, "base64"),
  ];
  gas.context.Utilities.newBlob = (bytes, mime, name) => ({
    bytes,
    mime,
    name,
  });
  gas.context.imageFolder_ = () => ({
    createFile: () => ({ getId: () => "private-source-id" }),
  });
  assert.equal(gas.run('generateAsset_("A_C01")').status, "DRAFT");
  assert.equal(gas.sheets.get("Assets").rows[1][1], "private-source-id");
  assert.equal(gas.sheets.get("Assets").rows[1][6], "DRAFT");
  assert.throws(() => gas.run('generateAsset_("A_C01")'));
  assert.equal(calls, 1);
});
