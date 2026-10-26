import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSheetGas } from "./helpers/sheets.mjs";
import { DATASET, mutation } from "./helpers/fixtures.mjs";
const plain = (x) => JSON.parse(JSON.stringify(x));
const snapshot = (g) => plain(g.context.readSnapshot_());

test("nine hand combinations and all nine skill/outcome bonuses are determined only on server", () => {
  const g = createSheetGas(),
    hands = ["rock", "scissors", "paper"];
  const expected = [
    ["DRAW", "WIN", "LOSE"],
    ["LOSE", "DRAW", "WIN"],
    ["WIN", "LOSE", "DRAW"],
  ];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      assert.equal(g.context.roundOutcome_(hands[a], hands[b]), expected[a][b]);
  const { tables, data } = snapshot(g);
  for (const [skillId, characterId] of [
    ["S01", "C01"],
    ["S02", "C01"],
    ["S03", "C02"],
  ]) {
    for (let b = 0; b < 3; b++) {
      const state = {
        ...structuredClone(data.state),
        ownedCharacterIds: ["C01", "C02", "C03"],
      };
      const c = g.context.produceGameChange_(
        "playRound",
        state,
        { characterId, skillId, hand: "rock" },
        tables,
        { cpuHand: hands[b] },
      );
      const outcome = expected[0][b],
        bonus =
          { S01: "WIN", S02: "LOSE", S03: "DRAW" }[skillId] === outcome ? 1 : 0;
      assert.equal(c.result.bonusPoints, bonus);
      assert.equal(c.state.points, (outcome === "WIN" ? 2 : 1) + bonus);
    }
  }
  for (const [random, index] of [
    [0, 0],
    [0.4999, 0],
    [0.5, 1],
    [0.999999, 1],
  ])
    assert.equal(g.context.chooseIndex_(2, random), index);
  for (const n of [-1, 1, NaN, Infinity])
    assert.throws(() => g.context.chooseIndex_(2, n));
});

test("real game permits two unowned draws, rejects illegal ownership/skill and performs zero external fetches", () => {
  const g = createSheetGas();
  let calls = 0;
  g.context.UrlFetchApp = {
    fetch() {
      calls++;
      throw Error();
    },
  };
  const play = (p) => g.call(mutation("playRound", p));
  assert.equal(
    play({ characterId: "C02", skillId: "S02", hand: "rock" }).error.code,
    "CHARACTER_NOT_OWNED",
  );
  for (const skillId of ["S03", "S04"])
    assert.equal(
      play({ characterId: "C01", skillId, hand: "rock" }).error.code,
      "SKILL_NOT_AVAILABLE",
    );
  for (let i = 0; i < 2; i++)
    assert.equal(
      g.call({ ...mutation(), requestId: randomUUID(), expectedVersion: i }).ok,
      true,
    );
  assert.equal(
    g.call({ ...mutation(), requestId: randomUUID(), expectedVersion: 2 }).error
      .code,
    "ALL_OWNED",
  );
  assert.deepEqual(snapshot(g).data.state.ownedCharacterIds, [
    "C01",
    "C02",
    "C03",
  ]);
  const r = g.call({
    ...mutation("playRound", {
      characterId: "C03",
      skillId: "S03",
      hand: "paper",
    }),
    requestId: randomUUID(),
    expectedVersion: 2,
  });
  assert.equal(r.ok, true);
  assert.equal(snapshot(g).actions.length, 3);
  assert.equal(calls, 0);
  assert.equal(
    g.call({ ...mutation(), datasetId: "b".repeat(64) }).error.code,
    "DATASET_MISMATCH",
  );
  for (const op of ["synthesize", "getAsset", "getBattleLine"])
    assert.equal(g.call({ op, payload: {} }).error.code, "INVALID_ARGUMENT");
});

test("legacy history including synthesis is validated without changing rows or hashes, and cannot be played", () => {
  const g = createSheetGas(1),
    rows = g.sheets.get("Actions").rows;
  let state = snapshot(g).data.state;
  for (let i = 0; i < 4; i++) {
    const synthesis = i === 3;
    const input = g.context.normalizedLegacyInput_({
      op: synthesis ? "synthesize" : "playRound",
      requestId: randomUUID(),
      expectedVersion: i,
      payload: synthesis
        ? { ingredientSkillIds: ["S02", "S01"] }
        : { characterId: "C01", skillId: "S01", hand: "rock" },
    });
    const result = synthesis
      ? { recipeId: "R01", unlockedSkillId: "S04", spentPoints: 3 }
      : {
          characterId: "C01",
          skillId: "S01",
          playerHand: "rock",
          cpuHand: "rock",
          outcome: "DRAW",
          basePoints: 1,
          bonusPoints: 0,
          earnedPoints: 1,
        };
    state = {
      ...state,
      version: i + 1,
      points: synthesis ? 0 : i + 1,
      unlockedSkillIds: synthesis
        ? ["S01", "S02", "S03", "S04"]
        : state.unlockedSkillIds,
    };
    rows.push([
      randomUUID(),
      "P001",
      i + 1,
      randomUUID(),
      g.context.payloadHash_(input),
      synthesis ? "SYNTHESIS" : "ROUND",
      g.context.jsonCell_(input),
      g.context.jsonCell_(result),
      g.context.jsonCell_(state),
      new Date().toISOString(),
      1,
      1,
    ]);
  }
  const before = JSON.stringify(rows);
  assert.equal(snapshot(g).data.state.version, 4);
  assert.equal(
    g.call({ op: "bootstrap", payload: {} }).error.code,
    "LEGACY_DATA_READ_ONLY",
  );
  assert.equal(g.call(mutation()).error.code, "LEGACY_DATA_READ_ONLY");
  assert.equal(JSON.stringify(rows), before);
  rows[4][8] = JSON.stringify({ ...state, points: 1 });
  assert.throws(
    () => snapshot(g),
    (e) => e.code === "DATA_INTEGRITY_ERROR",
  );
});
