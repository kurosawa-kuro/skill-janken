// Editor-only maintenance. Existing books are never initialized or overwritten.
function initializeGameBook_(book) {
  requireWriteLock_();
  if (!isPrivateOwned_(DriveApp.getFileById(book.getId())))
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
  return { spreadsheetId: book.getId(), masterVersion: 2 };
}
function setupLab_() {
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("JANKEN_SPREADSHEET_ID")) {
      const snapshot = readSnapshot_();
      return {
        created: false,
        tables: 8,
        masterVersion: snapshot.data.masterVersion,
      };
    }
    const book = SpreadsheetApp.create("skill-janken-lab-db-v2");
    props.setProperty("JANKEN_SPREADSHEET_ID", book.getId());
    initializeGameBook_(book);
    return { created: true, tables: 8 };
  });
}
function createNewLab_() {
  return withLock_(() =>
    initializeGameBook_(SpreadsheetApp.create("skill-janken-lab-db-v2")),
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
      readSnapshot_(next).data.masterVersion !== 2
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    const backup = verifiedDatabaseCopy_(expectedId, "before-v2");
    props.setProperty("JANKEN_PREVIOUS_SPREADSHEET_ID", expectedId);
    props.setProperty("JANKEN_SPREADSHEET_ID", nextId);
    return {
      masterVersion: 2,
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
