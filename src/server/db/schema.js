// Physical schema 2. API state.schemaVersion remains 1 for the existing UI.
function tableDefinitions_() {
  return {
    Players: ["playerId", "displayName", "initialCharacterId", "createdAt"],
    Characters: ["characterId", "name", "sortOrder", "active"],
    Skills: ["skillId", "name", "effectCode", "bonus", "active"],
    CharacterSkills: ["characterId", "skillId"],
    Actions: [
      "actionId",
      "playerId",
      "seq",
      "requestId",
      "payloadHash",
      "type",
      "datasetId",
      "characterId",
      "skillId",
      "playerHand",
      "cpuHand",
      "createdAt",
      "schemaVersion",
      "masterVersion",
      "recordHash",
    ],
    Settings: ["key", "value"],
  };
}
function initialTables_() {
  return {
    Players: [["P001", "たんけんたい", "C01", new Date().toISOString()]],
    Characters: [
      ["C01", "ひのこ", 1, true],
      ["C02", "しずく", 2, true],
      ["C03", "このは", 3, true],
    ],
    Skills: [
      ["S01", "かちのひらめき", "WIN_BONUS", 1, true],
      ["S02", "まけてもいっぽ", "LOSE_BONUS", 1, true],
      ["S03", "あいこのわ", "DRAW_BONUS", 1, true],
    ],
    CharacterSkills: [
      ["C01", "S01"],
      ["C01", "S02"],
      ["C02", "S02"],
      ["C02", "S03"],
      ["C03", "S01"],
      ["C03", "S03"],
    ],
    Actions: [],
    Settings: [
      ["MASTER_VERSION", 2],
      ["MAX_ACTIONS", 200],
      ["SCHEMA_VERSION", 2],
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
function storageSchemaVersion_(tables) {
  const rows = tables.Settings.filter((r) => r.key === "SCHEMA_VERSION");
  if (rows.length !== 1 || ![1, 2].includes(rows[0].value))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return rows[0].value;
}
function initialState_(tables) {
  return {
    schemaVersion: 1,
    version: 0,
    points: 0,
    ownedCharacterIds: [tables.Players[0].initialCharacterId],
    unlockedSkillIds: tables.Skills.filter((s) => s.active)
      .map((s) => s.skillId)
      .sort(),
  };
}
