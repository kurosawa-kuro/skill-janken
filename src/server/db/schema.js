function tableDefinitions_() {
  return {
    Players: ["playerId", "displayName", "initialStateJson", "createdAt"],
    Characters: ["characterId", "name", "assetId", "sortOrder", "active"],
    Skills: ["skillId", "name", "effectCode", "bonus", "assetId", "active"],
    CharacterSkills: ["characterId", "skillId"],
    Recipes: [
      "recipeId",
      "ingredientA",
      "ingredientB",
      "pairKey",
      "resultSkillId",
      "cost",
      "active",
    ],
    Assets: [
      "assetId",
      "sourceFileId",
      "webpFileId",
      "mimeType",
      "byteSize",
      "version",
      "status",
      "promptVersion",
      "modelId",
      "generatedAt",
    ],
    Actions: [
      "actionId",
      "playerId",
      "seq",
      "requestId",
      "payloadHash",
      "type",
      "inputJson",
      "resultJson",
      "stateJson",
      "createdAt",
      "schemaVersion",
      "masterVersion",
    ],
    Settings: ["key", "value"],
  };
}

function initialTables_() {
  const state = {
    schemaVersion: 1,
    version: 0,
    points: 0,
    ownedCharacterIds: ["C01"],
    unlockedSkillIds: ["S01", "S02", "S03"],
  };
  return {
    Players: [
      ["P001", "たんけんたい", JSON.stringify(state), new Date().toISOString()],
    ],
    Characters: [
      ["C01", "ひのこ", "A_C01", 1, true],
      ["C02", "しずく", "A_C02", 2, true],
      ["C03", "このは", "A_C03", 3, true],
    ],
    Skills: [
      ["S01", "かちのひらめき", "WIN_BONUS", 1, "A_S01", true],
      ["S02", "まけてもいっぽ", "LOSE_BONUS", 1, "A_S02", true],
      ["S03", "あいこのわ", "DRAW_BONUS", 1, "A_S03", true],
      ["S04", "たんきゅうのひかり", "ALWAYS_BONUS", 1, "A_S04", true],
    ],
    CharacterSkills: [
      ["C01", "S01"],
      ["C01", "S02"],
      ["C01", "S04"],
      ["C02", "S02"],
      ["C02", "S03"],
      ["C02", "S04"],
      ["C03", "S01"],
      ["C03", "S03"],
      ["C03", "S04"],
    ],
    Recipes: [["R01", "S01", "S02", "S01|S02", "S04", 3, true]],
    Assets: ["C01", "C02", "C03", "S01", "S02", "S03", "S04"].map((id) => [
      "A_" + id,
      "",
      "",
      "",
      0,
      0,
      "DRAFT",
      "v1",
      "",
      "",
    ]),
    Actions: [],
    Settings: [
      ["MASTER_VERSION", 1],
      ["MAX_ACTIONS", 200],
      ["SCHEMA_VERSION", 1],
    ],
  };
}
