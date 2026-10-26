// Adapted from photo-diary/SheetStore: typed values and exact headers.
// Unlike the original, partially populated rows with an empty key are NOT hidden.
function readTables_() {
  const book = SpreadsheetApp.openById(repositorySettings_().spreadsheetId);
  const definitions = tableDefinitions_();
  const tables = {};
  for (const name of Object.keys(definitions)) {
    const sheet = book.getSheetByName(name);
    if (!sheet) throw new AppError_("DATA_INTEGRITY_ERROR");
    const values = sheet.getDataRange().getValues();
    const columns = definitions[name];
    if (JSON.stringify(values[0]) !== JSON.stringify(columns))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    // Keep sheet row positions stable for locked asset updates; reject gaps.
    tables[name] = values.slice(1).map((row) => {
      if (row[0] === "") throw new AppError_("DATA_INTEGRITY_ERROR");
      return Object.fromEntries(
        columns.map((column, index) => [column, row[index]]),
      );
    });
  }
  return tables;
}

function initialSnapshot_() {
  const tables = readTables_();
  // Phase 2 is read-only and supports only the verified initial dataset.
  // Phase 3 replaces this guard with full Actions validation and state recovery.
  if (tables.Actions.length !== 0) throw new AppError_("DATA_INTEGRITY_ERROR");
  const expected = initialTables_();
  for (const name of [
    "Characters",
    "Skills",
    "CharacterSkills",
    "Recipes",
    "Settings",
  ]) {
    const columns = tableDefinitions_()[name];
    const actual = tables[name].map((row) =>
      columns.map((column) => row[column]),
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected[name]))
      throw new AppError_("DATA_INTEGRITY_ERROR");
  }
  const player = tables.Players[0];
  if (
    tables.Players.length !== 1 ||
    player.playerId !== "P001" ||
    player.displayName !== "たんけんたい" ||
    typeof player.createdAt !== "string" ||
    !Number.isFinite(Date.parse(player.createdAt))
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  let state;
  try {
    state = JSON.parse(player.initialStateJson);
  } catch (_) {
    throw new AppError_("DATA_INTEGRITY_ERROR");
  }
  if (JSON.stringify(state) !== expected.Players[0][2])
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const assetIds = expected.Assets.map((row) => row[0]);
  if (
    tables.Assets.length !== 7 ||
    new Set(tables.Assets.map((row) => row.assetId)).size !== 7 ||
    tables.Assets.some(
      (row) =>
        !assetIds.includes(row.assetId) ||
        !["DRAFT", "READY", "REJECTED"].includes(row.status) ||
        !Number.isSafeInteger(row.version) ||
        row.version < 0 ||
        !Number.isSafeInteger(row.byteSize) ||
        row.byteSize < 0,
    )
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const pick = (rows, columns) =>
    rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column]])),
    );
  return {
    tables,
    data: {
      player: { playerId: player.playerId, displayName: player.displayName },
      state,
      characters: pick(tables.Characters, ["characterId", "name", "assetId"]),
      skills: pick(tables.Skills, [
        "skillId",
        "name",
        "effectCode",
        "bonus",
        "assetId",
      ]),
      characterSkills: tables.CharacterSkills,
      recipes: pick(tables.Recipes, [
        "recipeId",
        "ingredientA",
        "ingredientB",
        "resultSkillId",
        "cost",
      ]),
      masterVersion: 1,
      limits: { maxActions: 200, remainingActions: 200 },
    },
  };
}
