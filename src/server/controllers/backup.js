// Copies only: never overwrites a book or changes the running connection.
function verifiedDatabaseCopy_(sourceId, label) {
  requireWriteLock_();
  if (typeof sourceId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sourceId))
    throw new AppError_("INVALID_ARGUMENT");
  const source = DriveApp.getFileById(sourceId);
  if (!isPrivateOwned_(source)) throw new AppError_("DATA_INTEGRITY_ERROR");
  const book = SpreadsheetApp.openById(sourceId);
  const before = readSnapshot_(book);
  const digest = payloadHash_(before.tables);
  const copy = book.copy(
    `skill-janken-lab-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  if (!isPrivateOwned_(DriveApp.getFileById(copy.getId())))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const after = readSnapshot_(copy);
  if (payloadHash_(after.tables) !== digest)
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return {
    spreadsheetId: copy.getId(),
    version: after.data.state.version,
    actionCount: after.actions.length,
    digest,
  };
}

function backupLab_() {
  return withLock_(() =>
    verifiedDatabaseCopy_(repositorySettings_().spreadsheetId, "backup"),
  );
}

function restoreBackupToCopy_(backupId) {
  if (backupId === repositorySettings_().spreadsheetId)
    throw new AppError_("INVALID_ARGUMENT");
  return withLock_(() => verifiedDatabaseCopy_(backupId, "restore-check"));
}
