import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

function client(rpc = async () => {}) {
  const App = { api: { call: rpc } };
  const context = vm.createContext({
    App,
    TextEncoder,
    window: {},
    crypto: { randomUUID },
  });
  for (const name of ["pending", "dialogue"])
    vm.runInContext(
      readFileSync(
        new URL(`../src/client/core/${name}.html`, import.meta.url),
        "utf8",
      ).replace(/<\/?script>/g, ""),
      context,
    );
  return App;
}
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
const DATASET = "a".repeat(64);
const key = "skill-janken-pending-v1-2-" + DATASET;
const boot = (version = 0) => ({
  version,
  data: { masterVersion: 2, datasetId: DATASET, state: { version } },
});
const ack = (request) => ({
  requestId: request.requestId,
  version: request.expectedVersion + 1,
  data: {
    state: { version: request.expectedVersion + 1 },
    result: { characterId: "C02" },
  },
});
const code = (expected) => (error) => error.code === expected;

test("pending is stored before RPC, survives reload and manually replays before refreshing latest", async () => {
  const App = client(),
    storage = memory(),
    calls = [];
  let lost = true;
  const rpc = async (request) => {
    calls.push(structuredClone(request));
    if (request.op === "bootstrap") return boot(lost ? 0 : 4);
    assert.equal(JSON.parse(storage.getItem(key)).requestId, request.requestId);
    if (lost) {
      lost = false;
      throw { kind: "transport", code: "NETWORK_ERROR" };
    }
    return ack(request);
  };
  const first = App.pending.create({ initial: boot(), storage, rpc });
  await first.sync();
  await assert.rejects(
    first.start("drawCharacter", {}, 0),
    code("NETWORK_ERROR"),
  );
  const original = JSON.parse(storage.getItem(key));
  await assert.rejects(
    first.start("drawCharacter", {}, 0),
    code("PENDING_UNRESOLVED"),
  );
  const reloaded = App.pending.create({ initial: boot(), storage, rpc });
  assert.equal(calls.length, 2); // no automatic sends on creation
  const result = await reloaded.retry();
  assert.equal(result.mutation.version, 1);
  assert.equal(result.latest.version, 4);
  assert.equal(storage.getItem(key), null);
  assert.equal(reloaded.status().needsSync, false);
  assert.deepEqual(calls[2], original);
  assert.equal(calls[3].op, "bootstrap");
});

test("storage write/read failure or malformed pending blocks new mutations", async () => {
  const App = client();
  let writes = 0;
  const rpc = async (req) => {
    if (req.op !== "bootstrap") writes++;
    return boot();
  };
  const storage = memory();
  storage.setItem = () => {
    throw Error("quota");
  };
  const commands = App.pending.create({ initial: boot(), storage, rpc });
  await commands.sync();
  await assert.rejects(
    commands.start("drawCharacter", {}, 0),
    code("STORAGE_UNAVAILABLE"),
  );
  assert.equal(writes, 0);
  assert.equal(commands.status().blocked, true);
  for (const text of ["{", "null", "{}", '"' + "x".repeat(5000) + '"']) {
    const store = memory();
    store.setItem(App.pending.KEY, text);
    const c = App.pending.create({ initial: boot(), storage: store, rpc });
    assert.equal(c.status().blocked, true);
    assert.equal(store.getItem(App.pending.KEY), text);
    await assert.rejects(c.retry(), code("PENDING_UNRESOLVED"));
  }
  assert.equal(
    App.pending
      .create({
        initial: boot(),
        storage: {
          getItem() {
            throw Error("denied");
          },
        },
        rpc,
      })
      .status().blocked,
    true,
  );
});

test("unacknowledged, malformed and integrity responses retain pending; definitive rejection clears and refreshes", async () => {
  for (const errorCode of [
    "BUSY",
    "INTERNAL_ERROR",
    "DATA_INTEGRITY_ERROR",
    "REQUEST_ID_CONFLICT",
    "VERSION_CONFLICT",
    "OP_LIMIT",
  ]) {
    const App = client(),
      storage = memory(),
      requests = [];
    const commands = App.pending.create({
      initial: boot(),
      storage,
      rpc: async (request) => {
        requests.push(request.op);
        if (request.op === "bootstrap") return boot();
        throw { kind: "business", code: errorCode };
      },
    });
    await commands.sync();
    await assert.rejects(
      commands.start("drawCharacter", {}, 0),
      code(errorCode),
    );
    const definite = ["VERSION_CONFLICT", "OP_LIMIT"].includes(errorCode);
    assert.equal(storage.getItem(key) === null, definite);
    assert.equal(requests.length, definite ? 3 : 2);
  }
  const App = client(),
    storage = memory();
  const commands = App.pending.create({
    initial: boot(),
    storage,
    rpc: async (req) =>
      req.op === "bootstrap"
        ? boot()
        : { ...ack(req), requestId: randomUUID() },
  });
  await commands.sync();
  await assert.rejects(
    commands.start("drawCharacter", {}, 0),
    code("INVALID_RESPONSE"),
  );
  assert.ok(storage.getItem(key));
});

test("busy commands cannot race and failed latest refresh prevents another mutation", async () => {
  const App = client(),
    storage = memory();
  let finish,
    bootCalls = 0;
  const commands = App.pending.create({
    initial: boot(),
    storage,
    rpc: async (req) => {
      if (req.op === "bootstrap") {
        if (++bootCalls > 1) throw { code: "NETWORK_ERROR" };
        return boot();
      }
      return new Promise((resolve) => {
        finish = () => resolve({ ...ack(req), replayed: true });
      });
    },
  });
  await commands.sync();
  const send = commands.start("drawCharacter", {}, 0);
  assert.equal(commands.status().busy, true);
  await assert.rejects(commands.retry(), code("PENDING_UNRESOLVED"));
  await assert.rejects(
    commands.start("drawCharacter", {}, 0),
    code("PENDING_UNRESOLVED"),
  );
  finish();
  await assert.rejects(send, code("NETWORK_ERROR"));
  assert.equal(storage.getItem(key), null);
  assert.equal(commands.status().needsSync, true);
  await assert.rejects(
    commands.start("drawCharacter", {}, 1),
    code("PENDING_UNRESOLVED"),
  );
});

test("failed pending removal blocks writes and preserves the request for reload", async () => {
  const App = client(),
    storage = memory();
  storage.removeItem = () => {
    throw Error("denied");
  };
  const commands = App.pending.create({
    initial: boot(),
    storage,
    rpc: async (req) => (req.op === "bootstrap" ? boot() : ack(req)),
  });
  await commands.sync();
  await assert.rejects(
    commands.start("drawCharacter", {}, 0),
    code("STORAGE_UNAVAILABLE"),
  );
  assert.equal(commands.status().blocked, true);
  assert.ok(storage.getItem(key));
});

test("normal mutation uses only one RPC; a different dataset cannot reuse pending requests", async () => {
  const App = client(),
    storage = memory(),
    calls = [];
  const commands = App.pending.create({
    initial: boot(),
    storage,
    rpc: async (r) => {
      calls.push(r);
      return ack(r);
    },
  });
  const r = await commands.start("drawCharacter", {}, 0);
  assert.equal(calls.length, 1);
  assert.equal(r.latest.version, 1);
  assert.equal(commands.status().needsSync, false);
  const old = { ...calls[0], datasetId: "b".repeat(64) };
  storage.setItem(key, JSON.stringify(old));
  assert.equal(
    App.pending.create({ initial: boot(), storage }).status().blocked,
    true,
  );
});

test("published line is selected locally and deterministically, missing slots use presets", () => {
  const App = client(() => assert.fail("dialogue called RPC")),
    id = randomUUID(),
    result = { characterId: "C01", outcome: "WIN" };
  const catalog = {
    version: 1,
    entries: [
      { ...result, texts: ["いっしょにたのしもう！", "つぎもがんばろう！"] },
    ],
  };
  assert.deepEqual(
    App.dialogue.choose(catalog, id, result),
    App.dialogue.choose(catalog, id.toUpperCase(), result),
  );
  assert.equal(
    App.dialogue.choose(catalog, id, result).source,
    "AIでつくったひとこと",
  );
  for (const c of ["C01", "C02", "C03"])
    for (const o of ["WIN", "LOSE", "DRAW"])
      assert.ok(App.dialogue.preset(c, o).length);
  assert.equal(
    App.dialogue.choose(null, id, result).source,
    "なかまのひとこと",
  );
});
