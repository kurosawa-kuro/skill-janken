// Adapted from ai-english-trainer/core/lock.js.
let writeLockHeld_ = false;
function requireWriteLock_() {
  if (!writeLockHeld_) throw new AppError_("INTERNAL_ERROR");
}
function withLock_(fn) {
  if (writeLockHeld_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new AppError_("BUSY", true);
  writeLockHeld_ = true;
  try {
    return fn();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      writeLockHeld_ = false;
      lock.releaseLock();
    }
  }
}
