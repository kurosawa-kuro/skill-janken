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
  assert.equal(response.data.skills.length, 3);
  assert.equal(response.data.characterSkills.length, 6);
  assert.equal(response.data.recipes, undefined);
  assert.deepEqual(response.data.dialogueCatalog, { version: 0, entries: [] });
  assert.equal(JSON.stringify(response).includes("sourceFileId"), false);
  assert.equal(JSON.stringify(response).includes("test-sheet"), false);
});

test("repository refuses broken headers, blank keys, changed types, or invalid actions", () => {
  const corruptions = [
    (gas) => gas.sheets.get("Assets").rows.splice(2, 0, Array(11).fill("")),
    (gas) => gas.sheets.get("Players").rows[0].reverse(),
    (gas) => gas.sheets.get("Characters").rows[1].splice(0, 1, ""),
    (gas) => gas.sheets.get("Characters").rows[1].splice(4, 1, "true"),
    (gas) => gas.sheets.get("Actions").rows.push(["", "P001", 1]),
    (gas) => gas.sheets.get("Actions").rows.push(["action1", "P001", 1]),
    (gas) => gas.sheets.get("Assets").rows.push(["A_C01"]),
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
