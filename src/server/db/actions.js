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

// Hash persisted facts, including the random outcome; this is an integrity checksum, not a signature.
function actionRecordHash_(row) {
  const { recordHash, ...facts } = row;
  return payloadHash_(facts);
}
function createActionRow_(request, change) {
  const input = normalizedInput_(request);
  const row = {
    actionId: Utilities.getUuid(),
    playerId: "P001",
    seq: input.expectedVersion + 1,
    requestId: request.requestId.toLowerCase(),
    payloadHash: payloadHash_(input),
    type: actionType_(input.op),
    datasetId: input.datasetId,
    characterId: change.result.characterId,
    skillId: input.op === "playRound" ? input.payload.skillId : "",
    playerHand: input.op === "playRound" ? input.payload.hand : "",
    cpuHand: input.op === "playRound" ? change.result.cpuHand : "",
    createdAt: new Date().toISOString(),
    schemaVersion: 2,
    masterVersion: 2,
  };
  return { ...row, recordHash: actionRecordHash_(row) };
}
function validateActions_(tables, initialState) {
  try {
    if (tables.Actions.length > 200) throw Error();
    let state = initialState;
    validateState_(state, 0);
    const ids = new Set(),
      requests = new Set(),
      actions = [];
    for (const row of tables.Actions) {
      requireObjectKeys_(row, tableDefinitions_().Actions);
      if (
        !isUuid_(row.actionId) ||
        !isUuid_(row.requestId) ||
        ids.has(row.actionId.toLowerCase()) ||
        requests.has(row.requestId.toLowerCase()) ||
        row.playerId !== "P001" ||
        row.seq !== state.version + 1 ||
        row.schemaVersion !== 2 ||
        row.masterVersion !== 2 ||
        !isUtcDate_(row.createdAt) ||
        row.recordHash !== actionRecordHash_(row)
      )
        throw Error();
      let op, payload, stored;
      if (row.type === "DRAW") {
        if (row.skillId !== "" || row.playerHand !== "" || row.cpuHand !== "")
          throw Error();
        op = "drawCharacter";
        payload = {};
        stored = { characterId: row.characterId };
      } else if (row.type === "ROUND") {
        op = "playRound";
        payload = {
          characterId: row.characterId,
          skillId: row.skillId,
          hand: row.playerHand,
        };
        stored = { cpuHand: row.cpuHand };
      } else throw Error();
      const input = normalizedInput_({
        op,
        payload,
        expectedVersion: state.version,
        datasetId: row.datasetId,
        requestId: row.requestId,
      });
      if (row.payloadHash !== payloadHash_(input)) throw Error();
      const change = produceGameChange_(
        op,
        JSON.parse(JSON.stringify(state)),
        payload,
        tables,
        stored,
      );
      validateState_(change.state, row.seq);
      ids.add(row.actionId.toLowerCase());
      requests.add(row.requestId.toLowerCase());
      actions.push({
        ...row,
        input,
        result: change.result,
        state: change.state,
      });
      state = change.state;
    }
    return { state, actions };
  } catch (_) {
    throw new AppError_("DATA_INTEGRITY_ERROR");
  }
}

// The producer is server-side only; public requests cannot choose outcomes.
function commitAction_(request, produce, book) {
  const input = normalizedInput_(request),
    hash = payloadHash_(input);
  return withLock_(() => {
    book = book || SpreadsheetApp.openById(repositorySettings_().spreadsheetId);
    const before = readSnapshot_(book);
    if (
      before.data.storageSchemaVersion !== 2 ||
      before.data.masterVersion !== 2
    )
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
    try {
      validateStoredTransition_(
        before.data.state,
        input,
        change.result,
        change.state,
        before.tables,
      );
    } catch (_) {
      throw new AppError_("DATA_INTEGRITY_ERROR");
    }
    const row = createActionRow_(request, change);
    validateActions_(
      { ...before.tables, Actions: [...before.tables.Actions, row] },
      initialState_(before.tables),
    );
    requireWriteLock_();
    const columns = tableDefinitions_().Actions;
    const range = book
      .getSheetByName("Actions")
      .getRange(before.actions.length + 2, 1, 1, columns.length);
    const values = columns.map((column) => row[column]);
    range.setValues([values]);
    SpreadsheetApp.flush();
    if (canonicalJson_(range.getValues()[0]) !== canonicalJson_(values))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    const after = readSnapshot_(book);
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
