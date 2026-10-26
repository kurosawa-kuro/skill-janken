// Editor-only maintenance. Existing books are never initialized or overwritten.
function initializeGameBook_(book) {
  requireWriteLock_();
  if (!isPrivateOwned_(DriveApp.getFileById(book.getId())))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  if (
    book.getSheets().length !== 1 ||
    book
      .getSheets()[0]
      .getDataRange()
      .getValues()
      .flat()
      .some((value) => value !== "")
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  book.setSpreadsheetTimeZone("Asia/Tokyo");
  const defs = tableDefinitions_(),
    rows = initialTables_();
  let first = true;
  for (const name of Object.keys(defs)) {
    const sheet = first
      ? book.getSheets()[0].setName(name)
      : book.insertSheet(name);
    first = false;
    sheet
      .getRange(1, 1, 1, defs[name].length)
      .setValues([defs[name]])
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    if (rows[name].length)
      sheet
        .getRange(2, 1, rows[name].length, defs[name].length)
        .setValues(rows[name]);
  }
  SpreadsheetApp.flush();
  readSnapshot_(book);
  return {
    spreadsheetId: book.getId(),
    masterVersion: 2,
    storageSchemaVersion: 2,
  };
}
function setConnectionProperty_(props, key, value) {
  requireWriteLock_();
  props.setProperty(key, value);
  if (props.getProperty(key) !== value)
    throw new AppError_("DATA_INTEGRITY_ERROR");
}
function setupLab_() {
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("JANKEN_SPREADSHEET_ID")) {
      const snapshot = readSnapshot_();
      return {
        created: false,
        tables: Object.keys(snapshot.tables).length,
        storageSchemaVersion: snapshot.data.storageSchemaVersion,
        masterVersion: snapshot.data.masterVersion,
      };
    }
    const book = SpreadsheetApp.create("skill-janken-lab-db-schema2");
    initializeGameBook_(book);
    setConnectionProperty_(props, "JANKEN_SPREADSHEET_ID", book.getId());
    return { created: true, tables: 6, storageSchemaVersion: 2 };
  });
}
function createNewLab_() {
  return withLock_(() =>
    initializeGameBook_(SpreadsheetApp.create("skill-janken-lab-db-schema2")),
  );
}
function activateLab_(nextId, expectedId) {
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (
      props.getProperty("JANKEN_SPREADSHEET_ID") !== expectedId ||
      nextId === expectedId
    )
      throw new AppError_("VERSION_CONFLICT");
    const next = SpreadsheetApp.openById(nextId);
    if (
      !isPrivateOwned_(DriveApp.getFileById(nextId)) ||
      readSnapshot_(next).data.storageSchemaVersion !== 2
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    readDialogue_(next);
    const backup = verifiedDatabaseCopy_(expectedId, "before-schema2");
    setConnectionProperty_(props, "JANKEN_PREVIOUS_SPREADSHEET_ID", expectedId);
    setConnectionProperty_(props, "JANKEN_SPREADSHEET_ID", nextId);
    return {
      masterVersion: 2,
      storageSchemaVersion: 2,
      backupId: backup.spreadsheetId,
      spreadsheetId: nextId,
    };
  });
}

// Editor-only configuration; never reads or returns the API key.
function configureDialogue_(email, enabled = false) {
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof enabled !== "boolean"
  )
    throw new AppError_("INVALID_ARGUMENT");
  const actual = Session.getActiveUser().getEmail();
  if (!actual || actual.toLowerCase() !== email.toLowerCase())
    throw new AppError_("FORBIDDEN");
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (enabled && !(props.getProperty("GEMINI_API_KEY") || "").trim())
      throw new AppError_("AI_UNAVAILABLE");
    props.setProperty("JANKEN_AI_TEXT_ENABLED", "false");
    props.setProperty("JANKEN_ADMIN_EMAIL", email.toLowerCase());
    props.setProperty("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite");
    props.setProperty("JANKEN_AI_TEXT_ENABLED", String(enabled));
    if (
      props.getProperty("JANKEN_ADMIN_EMAIL") !== email.toLowerCase() ||
      props.getProperty("GEMINI_TEXT_MODEL") !== "gemini-3.1-flash-lite" ||
      props.getProperty("JANKEN_AI_TEXT_ENABLED") !== String(enabled)
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    return { configured: true, generationEnabled: enabled };
  });
}
// Editor-only migration: preserve the source and never activate implicitly.
function migrateLab_(sourceId) {
  return withLock_(() => {
    if (typeof sourceId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sourceId))
      throw new AppError_("INVALID_ARGUMENT");
    if (!isPrivateOwned_(DriveApp.getFileById(sourceId)))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    const source = SpreadsheetApp.openById(sourceId),
      before = readSnapshot_(source);
    if (
      before.data.storageSchemaVersion !== 1 ||
      before.data.masterVersion !== 2
    )
      throw new AppError_("INVALID_ARGUMENT");
    readDialogue_(source);
    const rawDialogue = dialogueRaw_(source);
    const sourceDigest = payloadHash_({
      game: before.tables,
      dialogue: rawDialogue,
    });
    const backup = verifiedDatabaseCopy_(sourceId, "before-schema2-migration");
    const target = SpreadsheetApp.create(
      "skill-janken-lab-db-schema2-migrated",
    );
    initializeGameBook_(target);
    const defs = tableDefinitions_();
    const player = before.tables.Players[0];
    target
      .getSheetByName("Players")
      .getRange(2, 1, 1, defs.Players.length)
      .setValues([
        [player.playerId, player.displayName, "C01", player.createdAt],
      ]);
    const rows = before.actions.map((action) => {
      const row = createActionRow_(
        { ...action.input, requestId: action.requestId },
        action,
      );
      row.actionId = action.actionId;
      row.requestId = action.requestId;
      row.createdAt = action.createdAt;
      row.recordHash = actionRecordHash_(row);
      return defs.Actions.map((column) => row[column]);
    });
    if (rows.length)
      target
        .getSheetByName("Actions")
        .getRange(2, 1, rows.length, defs.Actions.length)
        .setValues(rows);
    for (const [name, values] of Object.entries(rawDialogue)) {
      if (values === null) continue;
      const sheet = target.insertSheet(name);
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      sheet.setFrozenRows(1);
    }
    SpreadsheetApp.flush();
    const after = readSnapshot_(target);
    readDialogue_(target);
    const facts = (actions) =>
      actions.map(
        ({
          actionId,
          requestId,
          seq,
          payloadHash,
          input,
          result,
          state,
          createdAt,
        }) => ({
          actionId,
          requestId,
          seq,
          payloadHash,
          input,
          result,
          state,
          createdAt,
        }),
      );
    if (
      canonicalJson_(after.tables.Players[0]) !==
        canonicalJson_({
          playerId: player.playerId,
          displayName: player.displayName,
          initialCharacterId: "C01",
          createdAt: player.createdAt,
        }) ||
      canonicalJson_(after.data.state) !== canonicalJson_(before.data.state) ||
      canonicalJson_(facts(after.actions)) !==
        canonicalJson_(facts(before.actions)) ||
      canonicalJson_(dialogueRaw_(target)) !== canonicalJson_(rawDialogue) ||
      payloadHash_({
        game: readSnapshot_(source).tables,
        dialogue: dialogueRaw_(source),
      }) !== sourceDigest
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    return {
      spreadsheetId: target.getId(),
      backupId: backup.spreadsheetId,
      storageSchemaVersion: 2,
      masterVersion: 2,
      version: after.data.state.version,
      actionCount: after.actions.length,
      activated: false,
    };
  });
}
