// Editor-only setup. Only a NEW book is initialized; configured data is never reset.
function setupLab_() {
  return withLock_(() => {
    imageFolder_();
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("JANKEN_SPREADSHEET_ID")) {
      readSnapshot_();
      console.log("Existing database verified; no data overwritten.");
      return { created: false, tables: 8 };
    }
    const book = SpreadsheetApp.create("skill-janken-lab-db");
    // Persist immediately. A partial failure must NOT trigger another automatic reset.
    properties.setProperty("JANKEN_SPREADSHEET_ID", book.getId());
    if (!isPrivateOwned_(DriveApp.getFileById(book.getId())))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    book.setSpreadsheetTimeZone("Asia/Tokyo");
    const definitions = tableDefinitions_(),
      rows = initialTables_();
    let first = true;
    for (const name of Object.keys(definitions)) {
      const sheet = first
        ? book.getSheets()[0].setName(name)
        : book.insertSheet(name);
      first = false;
      sheet
        .getRange(1, 1, 1, definitions[name].length)
        .setValues([definitions[name]])
        .setFontWeight("bold");
      sheet.setFrozenRows(1);
      if (rows[name].length)
        sheet
          .getRange(2, 1, rows[name].length, definitions[name].length)
          .setValues(rows[name]);
    }
    SpreadsheetApp.flush();
    readSnapshot_();
    console.log("Initial database verified: 8 tables, 0 actions.");
    return { created: true, tables: 8 };
  });
}

function updateAssetRow_(assetId, changes) {
  requireWriteLock_();
  const { tables } = readSnapshot_();
  const index = tables.Assets.findIndex((row) => row.assetId === assetId);
  if (index < 0) throw new AppError_("INVALID_ARGUMENT");
  const row = { ...tables.Assets[index], ...changes };
  const columns = tableDefinitions_().Assets;
  const sheet = SpreadsheetApp.openById(
    repositorySettings_().spreadsheetId,
  ).getSheetByName("Assets");
  const range = sheet.getRange(index + 2, 1, 1, columns.length);
  const values = columns.map((column) => row[column]);
  range.setValues([values]);
  SpreadsheetApp.flush();
  if (JSON.stringify(range.getValues()[0]) !== JSON.stringify(values))
    throw new AppError_("DATA_INTEGRITY_ERROR");
}

function registerWebp_(assetId, fileId) {
  return withLock_(() => {
    const { tables } = readSnapshot_();
    const row = tables.Assets.find((item) => item.assetId === assetId);
    if (!row) throw new AppError_("INVALID_ARGUMENT");
    const file = privateImageFile_(fileId),
      bytes = file.getBlob().getBytes();
    const dimensions = validateWebp_(bytes, file.getMimeType());
    const total = tables.Assets.filter(
      (item) => item.assetId !== assetId && item.status === "READY",
    ).reduce((sum, item) => sum + item.byteSize, bytes.length);
    if (total > 716800) throw new AppError_("ASSET_UNAVAILABLE");
    updateAssetRow_(assetId, {
      webpFileId: fileId,
      mimeType: "image/webp",
      byteSize: bytes.length,
      version: row.version + 1,
      status: "READY",
    });
    return {
      assetId,
      ...dimensions,
      byteSize: bytes.length,
      version: row.version + 1,
    };
  });
}

function generateFirstAsset_() {
  const result = generateAsset_("A_C01");
  console.log("A_C01 source image saved for adult review; not READY.");
  return result;
}
