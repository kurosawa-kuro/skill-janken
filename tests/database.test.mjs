import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSheetGas } from "./helpers/sheets.mjs";
import { mutation, DATASET } from "./helpers/fixtures.mjs";
const plain = (value) => JSON.parse(JSON.stringify(value));
const corrupt = (error) => error.code === "DATA_INTEGRITY_ERROR";

function rehash(g, row) {
  const fields = g.context.tableDefinitions_().Actions;
  row[14] = g.context.actionRecordHash_(
    Object.fromEntries(fields.map((key, i) => [key, row[i]])),
  );
}
function seedLegacyRound(g) {
  const request = mutation("playRound", {
    characterId: "C01",
    skillId: "S01",
    hand: "rock",
  });
  const before = g.context.readSnapshot_();
  const input = g.context.normalizedInput_(request);
  const change = g.context.produceGameChange_(
    request.op,
    plain(before.data.state),
    request.payload,
    before.tables,
    { cpuHand: "scissors" },
  );
  g.sheets
    .get("Actions")
    .rows.push([
      randomUUID(),
      "P001",
      1,
      request.requestId,
      g.context.payloadHash_(input),
      "ROUND",
      g.context.jsonCell_(input),
      g.context.jsonCell_(change.result),
      g.context.jsonCell_(change.state),
      new Date().toISOString(),
      1,
      2,
    ]);
}

test("schema 2 has six game tables and exposes derived state without persisting snapshots or removed features", () => {
  const g = createSheetGas(),
    defs = plain(g.context.tableDefinitions_());
  assert.equal(Object.keys(defs).length, 6);
  assert.equal(defs.Actions.length, 15);
  assert.equal(/Json|assetId|Recipes|Assets/.test(JSON.stringify(defs)), false);
  const response = g.call({ op: "bootstrap", payload: {} });
  assert.equal(response.data.storageSchemaVersion, 2);
  assert.equal(response.data.state.schemaVersion, 1);
  assert.equal(response.data.masterVersion, 2);
});

test("master keys and references are checked independently of physical row order and display labels", () => {
  const g = createSheetGas();
  for (const name of ["Characters", "Skills", "CharacterSkills", "Settings"]) {
    const sheet = g.sheets.get(name);
    sheet.rows = [sheet.rows[0], ...sheet.rows.slice(1).reverse()];
  }
  g.sheets.get("Characters").rows[1][1] = "新しい名前";
  assert.equal(g.call({ op: "bootstrap", payload: {} }).ok, true);
  for (const edit of [
    (g) => {
      g.sheets.get("CharacterSkills").rows[1] = ["C99", "S01"];
    },
    (g) => {
      g.sheets.get("CharacterSkills").rows[2] = [
        ...g.sheets.get("CharacterSkills").rows[1],
      ];
    },
    (g) => {
      g.sheets.get("Skills").rows[1][3] = 2;
    },
    (g) => {
      g.sheets.get("Characters").rows[2][2] = 1;
    },
    (g) => {
      g.sheets.get("Players").rows[1][2] = "C02";
    },
    (g) => {
      g.sheets.get("Settings").rows.push(["SCHEMA_VERSION", 2]);
    },
  ]) {
    const broken = createSheetGas();
    edit(broken);
    assert.throws(() => broken.context.readSnapshot_(), corrupt);
  }
});

test("replay derives history from stored outcomes without another random choice", () => {
  const g = createSheetGas();
  const saved = g.call(mutation());
  assert.equal(saved.ok, true);
  const rows = g.sheets.get("Actions").rows;
  assert.deepEqual(rows[1].slice(8, 11), ["", "", ""]);
  g.context.chooseIndex_ = () => assert.fail("randomness during replay");
  const state = g.context.readSnapshot_().data.state;
  assert.deepEqual(plain(state), saved.data.state);
  assert.equal(g.call(mutation()).replayed, true);
});

test("recomputed checksums do not bypass action constraints, foreign keys or payload binding", () => {
  for (const edit of [
    (row) => {
      row[7] = "C01";
    }, // Already owned DRAW.
    (row) => {
      row[8] = "S01";
    }, // DRAW may not carry a skill.
    (row) => {
      row[10] = "rock";
    },
    (row) => {
      row[2] = 2;
    },
    (row) => {
      row[6] = "b".repeat(64);
    }, // Payload binding remains independent.
  ]) {
    const g = createSheetGas();
    g.call(mutation());
    const row = g.sheets.get("Actions").rows[1];
    edit(row);
    rehash(g, row);
    assert.throws(() => g.context.readSnapshot_(), corrupt);
  }
  const g = createSheetGas();
  const request = mutation("playRound", {
    characterId: "C01",
    skillId: "S01",
    hand: "rock",
  });
  g.call(request);
  const row = g.sheets.get("Actions").rows[1];
  row[7] = "C02";
  row[4] = g.context.payloadHash_(
    g.context.normalizedInput_({
      ...request,
      payload: { ...request.payload, characterId: "C02" },
    }),
  );
  rehash(g, row);
  assert.throws(() => g.context.readSnapshot_(), corrupt);
});

test("physical schema 1 with master 2 remains readable and immutable even with valid game history", () => {
  const g = createSheetGas(2, 1);
  seedLegacyRound(g);
  const before = JSON.stringify([...g.sheets.values()].map((s) => s.rows));
  assert.equal(g.context.readSnapshot_().data.state.points, 3);
  assert.equal(g.context.readSnapshot_().data.storageSchemaVersion, 1);
  assert.equal(
    g.call({ op: "bootstrap", payload: {} }).error.code,
    "LEGACY_DATA_READ_ONLY",
  );
  assert.equal(
    g.call({ ...mutation(), expectedVersion: 1 }).error.code,
    "LEGACY_DATA_READ_ONLY",
  );
  assert.equal(
    JSON.stringify([...g.sheets.values()].map((s) => s.rows)),
    before,
  );
});

test("explicit migration keeps old rows, progress, action identity and dialogue, and never switches the connection", () => {
  const g = createSheetGas(2, 1);
  seedLegacyRound(g);
  g.context.withLock_(() => g.context.initializeDialogue_(g.book));
  const before = JSON.stringify([...g.sheets.values()].map((s) => s.rows));
  const books = new Map([["test-sheet", g.book]]);
  g.context.SpreadsheetApp.openById = (id) => books.get(id);
  g.book.copy = () => {
    const backup = createSheetGas(2, 1);
    for (const source of g.book.getSheets())
      (
        backup.sheets.get(source.name) || backup.book.insertSheet(source.name)
      ).rows = structuredClone(source.rows);
    backup.book.getId = () => "backup-sheet";
    books.set("backup-sheet", backup.book);
    return backup.book;
  };
  let target;
  g.context.SpreadsheetApp.create = () => {
    target = createSheetGas();
    target.context.SpreadsheetApp.create(); // Blank book, without replacing the source mock.
    target.book.getId = () => "migrated-sheet";
    books.set("migrated-sheet", target.book);
    return target.book;
  };
  const migrated = g.context.migrateLab_("test-sheet");
  assert.equal(migrated.activated, false);
  assert.equal(migrated.version, 1);
  assert.equal(g.props.get("JANKEN_SPREADSHEET_ID"), "test-sheet");
  assert.equal(
    JSON.stringify([...g.sheets.values()].map((s) => s.rows)),
    before,
  );
  const after = g.context.readSnapshot_(target.book);
  assert.equal(after.data.storageSchemaVersion, 2);
  assert.equal(after.data.state.points, 3);
  assert.equal(after.actions[0].datasetId, DATASET);
  assert.equal(after.actions[0].actionId, g.sheets.get("Actions").rows[1][0]);
  assert.equal(target.sheets.has("Assets"), false);
  assert.deepEqual(
    plain(g.context.readDialogue_(target.book)),
    plain(g.context.readDialogue_(g.book)),
  );
  assert.throws(
    () => g.context.withLock_(() => g.context.initializeGameBook_(target.book)),
    corrupt,
  );
});

test("failed initialization does not select an incomplete book; synthesis-era data is never converted", () => {
  const g = createSheetGas();
  g.props.delete("JANKEN_SPREADSHEET_ID");
  g.context.SpreadsheetApp.flush = () => {
    throw Error("storage unavailable");
  };
  assert.throws(() => g.context.setupLab_(), /storage unavailable/);
  assert.equal(g.props.has("JANKEN_SPREADSHEET_ID"), false);
  const legacy = createSheetGas(1);
  legacy.context.SpreadsheetApp.create = () =>
    assert.fail("created migration target");
  assert.throws(
    () => legacy.context.migrateLab_("test-sheet"),
    (error) => error.code === "INVALID_ARGUMENT",
  );
  assert.equal(legacy.props.get("JANKEN_SPREADSHEET_ID"), "test-sheet");
});
