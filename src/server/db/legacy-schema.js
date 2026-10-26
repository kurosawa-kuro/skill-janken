// Read-only physical schema 1 (master 1 and 2). New writes never use this path.
function legacyTableDefinitions_() {
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

function legacyInitialTables_(masterVersion = 2) {
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
function readLegacySnapshot_(tables) {
  const masterVersion = masterVersion_(tables);
  const expected = legacyInitialTables_(masterVersion);
  for (const name of [
    "Characters",
    "Skills",
    "CharacterSkills",
    "Recipes",
    "Settings",
  ]) {
    const columns = legacyTableDefinitions_()[name];
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
  const journal = validateLegacyActions_(tables, state);
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
      storageSchemaVersion: 1,
      limits: {
        maxActions: 200,
        remainingActions: 200 - journal.actions.length,
      },
    },
  };
}
function validateLegacyActions_(
  tables,
  initialState,
  validateTransition = validateStoredTransition_,
) {
  try {
    if (tables.Actions.length > 200) throw Error();
    let state = initialState;
    validateState_(state, 0);
    const ids = new Set(),
      requests = new Set(),
      actions = [];
    for (const row of tables.Actions) {
      if (
        !isUuid_(row.actionId) ||
        !isUuid_(row.requestId) ||
        ids.has(row.actionId.toLowerCase()) ||
        requests.has(row.requestId.toLowerCase()) ||
        row.playerId !== "P001" ||
        row.seq !== state.version + 1 ||
        row.schemaVersion !== 1 ||
        row.masterVersion !== masterVersion_(tables) ||
        !isUtcDate_(row.createdAt)
      )
        throw Error();
      const input = parseCell_(row.inputJson),
        result = parseCell_(row.resultJson),
        next = parseCell_(row.stateJson);
      const normalized = (
        masterVersion_(tables) === 1 ? normalizedLegacyInput_ : normalizedInput_
      )({
        ...input,
        requestId: row.requestId,
      });
      if (
        input.expectedVersion !== state.version ||
        canonicalJson_(input) !== canonicalJson_(normalized) ||
        row.type !== actionType_(input.op) ||
        row.payloadHash !== payloadHash_(input)
      )
        throw Error();
      validateState_(next, row.seq);
      validateTransition(state, input, result, next, tables);
      ids.add(row.actionId.toLowerCase());
      requests.add(row.requestId.toLowerCase());
      actions.push({ ...row, input, result, state: next });
      state = next;
    }
    return { state, actions };
  } catch (_) {
    throw new AppError_("DATA_INTEGRITY_ERROR");
  }
}
