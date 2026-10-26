import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSheetGas } from "./helpers/sheets.mjs";

import { DATASET } from "./helpers/fixtures.mjs";

const request = (version = 0) => ({
  op: "playRound",
  expectedVersion: version,
  datasetId: DATASET,
  requestId: randomUUID(),
  payload: { characterId: "C01", skillId: "S01", hand: "rock" },
});
const round = (state) => ({
  state: { ...state, version: state.version + 1, points: state.points + 1 },
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
});
const code = (expected) => (error) => error.code === expected;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("journal commits once, restores latest state, and replays historical results without producer", () => {
  const gas = createSheetGas();
  const first = request();
  let calls = 0;
  const produce = (state) => {
    assert.equal(gas.lock.held, true);
    calls++;
    return round(state);
  };
  assert.equal(gas.context.commitAction_(first, produce).replayed, false);
  gas.context.commitAction_(request(1), produce);
  const replay = gas.context.commitAction_(
    { ...first, requestId: first.requestId.toUpperCase() },
    produce,
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.version, 1);
  assert.equal(replay.data.state.points, 1);
  assert.equal(gas.call({ op: "bootstrap", payload: {} }).data.state.points, 2);
  assert.equal(gas.sheets.get("Actions").rows.length, 3);
  assert.equal(calls, 2);
  assert.equal(gas.lock.held, false);
  assert.throws(
    () => gas.context.commitAction_({ ...first, expectedVersion: 1 }, produce),
    code("REQUEST_ID_CONFLICT"),
  );
  assert.throws(
    () => gas.context.commitAction_(request(), produce),
    code("VERSION_CONFLICT"),
  );
  const relations = gas.call({ op: "getRelations", payload: {} });
  assert.equal(JSON.stringify(relations).includes("payloadHash"), false);
});

test("canonical key order and UTF-8 limits remain strict", () => {
  const g = createSheetGas(),
    a = request();
  const b = {
    payload: a.payload,
    datasetId: a.datasetId,
    requestId: a.requestId,
    op: a.op,
    expectedVersion: 0,
  };
  assert.equal(
    g.context.payloadHash_(g.context.normalizedInput_(a)),
    g.context.payloadHash_(g.context.normalizedInput_(b)),
  );
  g.context.jsonCell_({ text: "あ".repeat(2700) });
  assert.throws(
    () => g.context.jsonCell_({ text: "あ".repeat(2800) }),
    code("DATA_INTEGRITY_ERROR"),
  );
  assert.throws(() => g.context.parseCell_("[]"), code("DATA_INTEGRITY_ERROR"));
});

test("draw transition checks candidate count, ownership, and exact next state before writing", () => {
  const gas = createSheetGas();
  const draw = {
    op: "drawCharacter",
    expectedVersion: 0,
    datasetId: DATASET,
    requestId: randomUUID(),
    payload: {},
  };
  const produce = (state) => ({
    state: { ...state, version: 1, ownedCharacterIds: ["C01", "C02"] },
    result: { characterId: "C02", candidateCount: 2 },
  });
  assert.throws(
    () =>
      gas.context.commitAction_(draw, (state) => ({
        ...produce(state),
        result: { characterId: "C02", candidateCount: 1 },
      })),
    code("DATA_INTEGRITY_ERROR"),
  );
  assert.equal(gas.sheets.get("Actions").rows.length, 1);
  assert.deepEqual(
    plain(
      gas.context.commitAction_(draw, produce).data.state.ownedCharacterIds,
    ),
    ["C01", "C02"],
  );
});

test("every journal row is validated; corruption cannot silently roll state back", () => {
  const changes = [
    (row) => {
      row[0] = "";
    },
    (row) => {
      row[2] = 2;
    },
    (row) => {
      row[1] = "P999";
    },
    (row) => {
      row[4] = "bad-hash";
    },
    (row) => {
      row[5] = "DRAW";
    },
    (row) => {
      row[6] = "{";
    },
    (row) => {
      row[7] = "C99";
    },
    (row) => {
      row[8] = "S04";
    },
    (row) => {
      row[9] = "invalid-hand";
    },
    (row) => {
      row[10] = "paper";
    },
    (row) => {
      row[11] = "2026-02-30T00:00:00.000Z";
    },
    (row) => {
      row[12] = 1;
    },
    (row) => {
      row[13] = 1;
    },
    (row) => {
      row[14] = "bad-hash";
    },
  ];
  for (const corrupt of changes) {
    const gas = createSheetGas();
    gas.context.commitAction_(request(), round);
    corrupt(gas.sheets.get("Actions").rows[1]);
    assert.throws(
      () => gas.context.readSnapshot_(),
      code("DATA_INTEGRITY_ERROR"),
    );
    assert.throws(
      () =>
        gas.context.commitAction_(request(1), () =>
          assert.fail("producer ran"),
        ),
      code("DATA_INTEGRITY_ERROR"),
    );
    assert.equal(gas.sheets.get("Actions").rows.length, 2);
  }
  for (const duplicate of [0, 3]) {
    const gas = createSheetGas();
    gas.context.commitAction_(request(), round);
    gas.context.commitAction_(request(1), round);
    const rows = gas.sheets.get("Actions").rows;
    rows[2][duplicate] = rows[1][duplicate];
    assert.throws(
      () => gas.context.readSnapshot_(),
      code("DATA_INTEGRITY_ERROR"),
    );
  }
});

test("200-row limit still permits replay and rejects new writes before producer", () => {
  const gas = createSheetGas();
  const rows = gas.sheets.get("Actions").rows;
  let state = plain(gas.context.readSnapshot_().data.state);
  let last;
  for (let i = 0; i < 200; i++) {
    last = request(i);
    const change = round(state);
    const row = gas.context.createActionRow_(last, change);
    rows.push(
      gas.context.tableDefinitions_().Actions.map((column) => row[column]),
    );
    state = change.state;
  }
  assert.equal(gas.context.readSnapshot_().data.limits.remainingActions, 0);
  const never = () => assert.fail("producer ran");
  assert.equal(gas.context.commitAction_(last, never).replayed, true);
  assert.throws(
    () => gas.context.commitAction_({ ...last, expectedVersion: 200 }, never),
    code("REQUEST_ID_CONFLICT"),
  );
  assert.throws(
    () => gas.context.commitAction_(request(199), never),
    code("VERSION_CONFLICT"),
  );
  assert.throws(
    () => gas.context.commitAction_(request(200), never),
    code("OP_LIMIT"),
  );
  assert.equal(rows.length, 201);
});

test("lock failure writes nothing; flush/response loss replays a persisted row and always releases", () => {
  const gas = createSheetGas(),
    req = request();
  gas.lock.fail = true;
  assert.throws(() => gas.context.commitAction_(req, round), code("BUSY"));
  assert.equal(gas.sheets.get("Actions").rows.length, 1);
  gas.lock.fail = false;
  let fail = true;
  gas.context.SpreadsheetApp.flush = () => {
    if (fail) {
      fail = false;
      throw Error("lost flush response");
    }
  };
  assert.throws(
    () => gas.context.commitAction_(req, round),
    /lost flush response/,
  );
  assert.equal(gas.lock.held, false);
  assert.equal(
    gas.context.commitAction_(req, () => assert.fail("double application"))
      .replayed,
    true,
  );
  // Simulate losing an otherwise successful transport response.
  const second = request(1);
  gas.context.commitAction_(second, round);
  assert.equal(
    gas.context.commitAction_(second, () => assert.fail("double application"))
      .replayed,
    true,
  );
  assert.equal(gas.sheets.get("Actions").rows.length, 3);
});

test("partial write blocks recovery instead of appending another row", () => {
  const gas = createSheetGas(),
    req = request(),
    sheet = gas.sheets.get("Actions");
  const getRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...args) => {
    const range = getRange(...args),
      set = range.setValues;
    range.setValues = (values) => set.call(range, [values[0].slice(0, 6)]);
    return range;
  };
  assert.throws(
    () => gas.context.commitAction_(req, round),
    code("DATA_INTEGRITY_ERROR"),
  );
  assert.equal(gas.lock.held, false);
  assert.throws(
    () => gas.context.commitAction_(req, round),
    code("DATA_INTEGRITY_ERROR"),
  );
  assert.equal(sheet.rows.length, 2);
});

test("backup and restore verify copies including nonzero journal, without switching the running database", () => {
  const gas = createSheetGas();
  gas.context.commitAction_(request(), round);
  gas.context.withLock_(() => gas.context.initializeDialogue_(gas.book));
  const books = new Map([["test-sheet", gas.book]]);
  let count = 0,
    corrupt = false;
  gas.context.SpreadsheetApp.openById = (id) => books.get(id);
  const addCopy = (id) => {
    books.get(id).copy = () => {
      assert.equal(gas.lock.held, true);
      const copyId = `copy-${++count}`;
      const copied = createSheetGas();
      for (const source of books.get(id).getSheets())
        (
          copied.sheets.get(source.name) || copied.book.insertSheet(source.name)
        ).rows = structuredClone(source.rows);
      if (corrupt) copied.sheets.get("Actions").rows[1][8] = "{}";
      books.set(copyId, copied.book);
      copied.book.getId = () => copyId;
      addCopy(copyId);
      return copied.book;
    };
  };
  addCopy("test-sheet");
  gas.context.DriveApp.getFileById = (id) => ({ getId: () => id });
  const backup = gas.context.backupLab_();
  const restored = gas.context.restoreBackupToCopy_(backup.spreadsheetId);
  assert.equal(restored.version, 1);
  assert.equal(restored.actionCount, 1);
  assert.equal(restored.digest, backup.digest);
  assert.notEqual(restored.spreadsheetId, backup.spreadsheetId);
  assert.equal(gas.props.get("JANKEN_SPREADSHEET_ID"), "test-sheet");
  assert.throws(
    () => gas.context.restoreBackupToCopy_("test-sheet"),
    code("INVALID_ARGUMENT"),
  );
  corrupt = true;
  assert.throws(() => gas.context.backupLab_(), code("DATA_INTEGRITY_ERROR"));
  gas.context.isPrivateOwned_ = () => false;
  assert.throws(() => gas.context.backupLab_(), code("DATA_INTEGRITY_ERROR"));
});
