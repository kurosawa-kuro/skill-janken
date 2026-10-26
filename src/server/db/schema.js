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

function initialTables_(masterVersion = 2) {
  if (masterVersion === 1) return legacyTables_();
  if (masterVersion !== 2) throw new AppError_("DATA_INTEGRITY_ERROR");
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
      ["C01", "ひのこ", "", 1, true],
      ["C02", "しずく", "", 2, true],
      ["C03", "このは", "", 3, true],
    ],
    Skills: [
      ["S01", "かちのひらめき", "WIN_BONUS", 1, "", true],
      ["S02", "まけてもいっぽ", "LOSE_BONUS", 1, "", true],
      ["S03", "あいこのわ", "DRAW_BONUS", 1, "", true],
    ],
    CharacterSkills: [
      ["C01", "S01"],
      ["C01", "S02"],
      ["C02", "S02"],
      ["C02", "S03"],
      ["C03", "S01"],
      ["C03", "S03"],
    ],
    Recipes: [],
    Assets: [],
    Actions: [],
    Settings: [
      ["MASTER_VERSION", 2],
      ["MAX_ACTIONS", 200],
      ["SCHEMA_VERSION", 1],
    ],
  };
}
function masterVersion_(tables) {
  const version = tables.Settings.find(
    (r) => r.key === "MASTER_VERSION",
  )?.value;
  if (![1, 2].includes(version)) throw new AppError_("DATA_INTEGRITY_ERROR");
  return version;
}
