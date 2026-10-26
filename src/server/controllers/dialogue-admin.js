function adminApi(request) {
  try {
    requireAdmin_();
    if (Utilities.newBlob(JSON.stringify(request)).getBytes().length > 4096)
      throw new AppError_("INVALID_ARGUMENT");
    requireObjectKeys_(request, ["op", "payload"]);
    const keys = {
      list: [],
      initialize: ["datasetId"],
      generate: ["datasetId", "requestId", "slotKey", "draftRevision"],
      publish: [
        "datasetId",
        "slotKey",
        "draftRevision",
        "expectedVersion",
        "selectedIndices",
      ],
    };
    if (
      typeof request.op !== "string" ||
      !Object.prototype.hasOwnProperty.call(keys, request.op)
    )
      throw new AppError_("INVALID_ARGUMENT");
    const p = request.payload;
    requireObjectKeys_(p, keys[request.op]);
    const book = SpreadsheetApp.openById(repositorySettings_().spreadsheetId),
      snapshot = readSnapshot_(book);
    if (snapshot.data.masterVersion !== 2)
      throw new AppError_("LEGACY_DATA_READ_ONLY");
    const datasetId = payloadHash_(book.getId());
    if (request.op !== "list" && p.datasetId !== datasetId)
      throw new AppError_("DATASET_MISMATCH");
    if (
      ["generate", "publish"].includes(request.op) &&
      (!dialogueSlots_().includes(p.slotKey) ||
        !Number.isSafeInteger(p.draftRevision) ||
        p.draftRevision < 0)
    )
      throw new AppError_("INVALID_ARGUMENT");
    if (request.op === "generate" && !isUuid_(p.requestId))
      throw new AppError_("INVALID_ARGUMENT");
    if (
      request.op === "publish" &&
      (!Number.isSafeInteger(p.expectedVersion) || p.expectedVersion < 0)
    )
      throw new AppError_("INVALID_ARGUMENT");
    const data =
      request.op === "list"
        ? readDialogue_(book)
        : request.op === "initialize"
          ? withLock_(() => initializeDialogue_(book))
          : request.op === "generate"
            ? generateDialogueDraft_(book, p)
            : publishDialogue_(book, p);
    return {
      ok: true,
      requestId: null,
      replayed: false,
      data: { ...data, datasetId, generation: dialogueGenerationStatus_() },
    };
  } catch (error) {
    return { ok: false, requestId: null, error: publicError_(error) };
  }
}
