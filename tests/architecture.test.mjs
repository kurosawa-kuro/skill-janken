import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, RUNTIME_FILES, walkFiles } from "../scripts/files.mjs";
import { createGas } from "./helpers/gas.mjs";

test("only doGet and api are public GAS function declarations", () => {
  const names = RUNTIME_FILES.filter((file) => file.endsWith(".js")).flatMap(
    (file) =>
      [
        ...readFileSync(join(ROOT, "src", file), "utf8").matchAll(
          /^function\s+(\w+)\s*\(/gm,
        ),
      ].map((match) => match[1]),
  );
  assert.deepEqual(names.filter((name) => !name.endsWith("_")).sort(), [
    "api",
    "doGet",
  ]);
});

test("runtime allowlist excludes fixtures, credentials and development tools", () => {
  assert.deepEqual(walkFiles(join(ROOT, "src")), [...RUNTIME_FILES].sort());
  for (const file of RUNTIME_FILES) {
    assert.doesNotMatch(file, /test|fixture|secret|\.clasp|package/);
  }
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "src/appsscript.json"), "utf8"),
  );
  assert.deepEqual(manifest.webapp, {
    access: "MYSELF",
    executeAs: "USER_DEPLOYING",
  });
});

test("production composition never invokes Gemini during bootstrap", () => {
  const gas = createGas({ properties: { JANKEN_SPREADSHEET_ID: "test" } });
  let calls = 0;
  gas.context.createGemini_ = () => {
    calls++;
    throw new Error("Must not run");
  };
  assert.equal(gas.call({ op: "bootstrap", payload: {} }).ok, false);
  assert.equal(calls, 0);
});
