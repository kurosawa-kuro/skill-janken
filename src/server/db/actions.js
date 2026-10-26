function actionType_(op) {
  return { drawCharacter: "DRAW", playRound: "ROUND", synthesize: "SYNTHESIS" }[
    op
  ];
}

function validateState_(state, version) {
  requireObjectKeys_(state, [
    "schemaVersion",
    "version",
    "points",
    "ownedCharacterIds",
    "unlockedSkillIds",
  ]);
  if (
    state.schemaVersion !== 1 ||
    state.version !== version ||
    !Number.isSafeInteger(state.points) ||
    state.points < 0
  )
    throw Error();
  for (const [key, allowed, required] of [
    ["ownedCharacterIds", ["C01", "C02", "C03"], ["C01"]],
    ["unlockedSkillIds", ["S01", "S02", "S03", "S04"], ["S01", "S02", "S03"]],
  ]) {
    const ids = state[key];
    if (
      !Array.isArray(ids) ||
      ids.some((id) => !allowed.includes(id)) ||
      required.some((id) => !ids.includes(id)) ||
      canonicalJson_(ids) !== canonicalJson_([...new Set(ids)].sort())
    )
      throw Error();
  }
}

// Replay validates outcomes without drawing randomness.
function validateStoredTransition_(previous, input, result, state, tables) {
  if (masterVersion_(tables) === 1)
    return validateLegacyTransition_(previous, input, result, state, tables);
  validateState_(state, previous.version + 1);
  if (
    canonicalJson_(state.unlockedSkillIds) !==
    canonicalJson_(["S01", "S02", "S03"])
  )
    throw Error();
  const expected = produceGameChange_(
    input.op,
    JSON.parse(JSON.stringify(previous)),
    input.payload,
    tables,
    result,
  );
  if (
    canonicalJson_(expected.result) !== canonicalJson_(result) ||
    canonicalJson_(expected.state) !== canonicalJson_(state)
  )
    throw Error();
}

function validateActions_(
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

// The producer is server-side only; public requests cannot choose outcomes.
function commitAction_(
  request,
  produce,
  book,
  validateTransition = validateStoredTransition_,
) {
  const input = normalizedInput_(request),
    hash = payloadHash_(input);
  return withLock_(() => {
    book = book || SpreadsheetApp.openById(repositorySettings_().spreadsheetId);
    const before = readSnapshot_(book, validateTransition);
    if (before.data.masterVersion !== 2)
      throw new AppError_("LEGACY_DATA_READ_ONLY");
    if (request.datasetId !== payloadHash_(book.getId()))
      throw new AppError_("DATASET_MISMATCH");
    const saved = before.actions.find(
      (row) => row.requestId.toLowerCase() === request.requestId.toLowerCase(),
    );
    if (saved) {
      if (saved.payloadHash !== hash)
        throw new AppError_("REQUEST_ID_CONFLICT");
      return {
        data: { result: saved.result, state: saved.state },
        version: saved.seq,
        replayed: true,
      };
    }
    if (input.expectedVersion !== before.data.state.version)
      throw new AppError_("VERSION_CONFLICT");
    if (before.actions.length >= 200) throw new AppError_("OP_LIMIT");
    const change = produce(
      JSON.parse(JSON.stringify(before.data.state)),
      input.payload,
      before.tables,
    );
    const row = {
      actionId: Utilities.getUuid(),
      playerId: "P001",
      seq: before.data.state.version + 1,
      requestId: request.requestId.toLowerCase(),
      payloadHash: hash,
      type: actionType_(input.op),
      inputJson: jsonCell_(input),
      resultJson: jsonCell_(change.result),
      stateJson: jsonCell_(change.state),
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      masterVersion: 2,
    };
    validateActions_(
      { ...before.tables, Actions: [...before.tables.Actions, row] },
      JSON.parse(initialTables_().Players[0][2]),
      validateTransition,
    );
    requireWriteLock_();
    const range = book
      .getSheetByName("Actions")
      .getRange(before.actions.length + 2, 1, 1, 12);
    const values = tableDefinitions_().Actions.map((column) => row[column]);
    range.setValues([values]);
    SpreadsheetApp.flush();
    if (canonicalJson_(range.getValues()[0]) !== canonicalJson_(values))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    const after = readSnapshot_(book, validateTransition);
    if (
      after.actions.length !== before.actions.length + 1 ||
      after.actions.at(-1).requestId !== row.requestId
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    return {
      data: { result: after.actions.at(-1).result, state: after.data.state },
      version: row.seq,
      replayed: false,
    };
  });
}
