// Adapted from photo-diary/SheetStore: typed values and exact headers.
// Unlike the original, partially populated rows with an empty key are NOT hidden.
function readTables_(
  book = SpreadsheetApp.openById(repositorySettings_().spreadsheetId),
) {
  const definitions = tableDefinitions_();
  const tables = {};
  for (const name of Object.keys(definitions)) {
    const sheet = book.getSheetByName(name);
    if (!sheet) throw new AppError_("DATA_INTEGRITY_ERROR");
    const values = sheet.getDataRange().getValues();
    const columns = definitions[name];
    if (JSON.stringify(values[0]) !== JSON.stringify(columns))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    // Preserve row positions; reject partial rows and gaps.
    tables[name] = values.slice(1).map((row) => {
      if (row[0] === "") throw new AppError_("DATA_INTEGRITY_ERROR");
      return Object.fromEntries(
        columns.map((column, index) => [column, row[index]]),
      );
    });
  }
  return tables;
}

function readSnapshot_(book, validateTransition = validateStoredTransition_) {
  const tables = readTables_(book);
  const masterVersion = masterVersion_(tables);
  const expected = initialTables_(masterVersion);
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
    !isUtcDate_(player.createdAt)
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  let state;
  try {
    state = parseCell_(player.initialStateJson);
  } catch (_) {
    throw new AppError_("DATA_INTEGRITY_ERROR");
  }
  if (
    canonicalJson_(state) !== canonicalJson_(JSON.parse(expected.Players[0][2]))
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const assetIds = expected.Assets.map((row) => row[0]);
  if (
    tables.Assets.length !== expected.Assets.length ||
    new Set(tables.Assets.map((row) => row.assetId)).size !==
      expected.Assets.length ||
    tables.Assets.some(
      (row) =>
        !assetIds.includes(row.assetId) ||
        !["DRAFT", "READY", "REJECTED"].includes(row.status) ||
        !Number.isSafeInteger(row.version) ||
        row.version < 0 ||
        !Number.isSafeInteger(row.byteSize) ||
        row.byteSize < 0 ||
        row.byteSize > 102400 ||
        [
          "sourceFileId",
          "webpFileId",
          "mimeType",
          "promptVersion",
          "modelId",
          "generatedAt",
        ].some((key) => typeof row[key] !== "string") ||
        (row.sourceFileId !== "" &&
          (!row.modelId ||
            !row.promptVersion ||
            !isUtcDate_(row.generatedAt))) ||
        (row.status === "READY" &&
          (!row.webpFileId ||
            row.mimeType !== "image/webp" ||
            row.byteSize < 1 ||
            row.version < 1)),
    )
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  if (
    tables.Assets.filter((row) => row.status === "READY").reduce(
      (sum, row) => sum + row.byteSize,
      0,
    ) > 716800
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const journal = validateActions_(tables, state, validateTransition);
  state = journal.state;
  const pick = (rows, columns) =>
    rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column]])),
    );
  return {
    tables,
    actions: journal.actions,
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
      masterVersion,
      limits: {
        maxActions: 200,
        remainingActions: 200 - journal.actions.length,
      },
    },
  };
}
