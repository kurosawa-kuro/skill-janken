// Exact physical headers, typed values and preserved row positions.
function readTable_(book, name, columns) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new AppError_("DATA_INTEGRITY_ERROR");
  const values = sheet.getDataRange().getValues();
  if (canonicalJson_(values[0]) !== canonicalJson_(columns))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return values.slice(1).map((row) => {
    if (row.length !== columns.length || row[0] === "")
      throw new AppError_("DATA_INTEGRITY_ERROR");
    return Object.fromEntries(
      columns.map((column, index) => [column, row[index]]),
    );
  });
}
function readTables_(
  book = SpreadsheetApp.openById(repositorySettings_().spreadsheetId),
) {
  const tables = { Settings: readTable_(book, "Settings", ["key", "value"]) };
  const schema = storageSchemaVersion_(tables);
  const definitions =
    schema === 2 ? tableDefinitions_() : legacyTableDefinitions_();
  for (const [name, columns] of Object.entries(definitions)) {
    if (name !== "Settings") tables[name] = readTable_(book, name, columns);
  }
  // New books must not accidentally mix the removed legacy tables with schema 2.
  if (
    schema === 2 &&
    (book.getSheetByName("Recipes") || book.getSheetByName("Assets"))
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return tables;
}
function validDisplayName_(value) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    [...value].length > 0 &&
    [...value].length <= 32 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(value)
  );
}
function validateMasters_(tables) {
  const expected = initialTables_();
  const unique = (rows, key) =>
    new Set(rows.map((r) => r[key])).size === rows.length;
  if (
    masterVersion_(tables) !== 2 ||
    tables.Settings.length !== 3 ||
    !unique(tables.Settings, "key") ||
    tables.Settings.some(
      (r) =>
        !expected.Settings.some(
          ([key, value]) => r.key === key && r.value === value,
        ),
    )
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  if (
    tables.Characters.length !== 3 ||
    !unique(tables.Characters, "characterId") ||
    !unique(tables.Characters, "sortOrder") ||
    tables.Characters.some(
      (r) =>
        !["C01", "C02", "C03"].includes(r.characterId) ||
        !validDisplayName_(r.name) ||
        ![1, 2, 3].includes(r.sortOrder) ||
        r.active !== true,
    )
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const effects = { S01: "WIN_BONUS", S02: "LOSE_BONUS", S03: "DRAW_BONUS" };
  if (
    tables.Skills.length !== 3 ||
    !unique(tables.Skills, "skillId") ||
    tables.Skills.some(
      (r) =>
        !Object.prototype.hasOwnProperty.call(effects, r.skillId) ||
        !validDisplayName_(r.name) ||
        r.effectCode !== effects[r.skillId] ||
        r.bonus !== 1 ||
        r.active !== true,
    )
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const pairs = tables.CharacterSkills.map(
    (r) => r.characterId + "/" + r.skillId,
  ).sort();
  if (
    canonicalJson_(pairs) !==
    canonicalJson_(expected.CharacterSkills.map((r) => r.join("/")).sort())
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const player = tables.Players[0];
  if (
    tables.Players.length !== 1 ||
    player.playerId !== "P001" ||
    !validDisplayName_(player.displayName) ||
    player.initialCharacterId !== "C01" ||
    !isUtcDate_(player.createdAt)
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
}
function readSnapshot_(book) {
  const tables = readTables_(book);
  if (storageSchemaVersion_(tables) === 1) return readLegacySnapshot_(tables);
  validateMasters_(tables);
  const journal = validateActions_(tables, initialState_(tables));
  const pick = (rows, columns) =>
    rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  return {
    tables,
    actions: journal.actions,
    data: {
      player: pick(tables.Players, ["playerId", "displayName"])[0],
      state: journal.state,
      characters: pick(
        [...tables.Characters].sort((a, b) => a.sortOrder - b.sortOrder),
        ["characterId", "name"],
      ),
      skills: pick(
        [...tables.Skills].sort((a, b) => a.skillId.localeCompare(b.skillId)),
        ["skillId", "name", "effectCode", "bonus"],
      ),
      characterSkills: tables.CharacterSkills,
      masterVersion: 2,
      storageSchemaVersion: 2,
      limits: {
        maxActions: 200,
        remainingActions: 200 - journal.actions.length,
      },
    },
  };
}
