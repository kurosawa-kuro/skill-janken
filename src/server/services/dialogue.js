function dialogueDefinitions_() {
  return {
    DialogueDrafts: [
      "slotKey",
      "revision",
      "textsJson",
      "generationRequestId",
      "updatedAt",
    ],
    DialoguePublication: ["id", "version", "catalogJson", "updatedAt"],
  };
}
function dialogueSlots_() {
  return ["C01", "C02", "C03"].flatMap((characterId) =>
    ["WIN", "LOSE", "DRAW"].map((outcome) => characterId + "_" + outcome),
  );
}
function validDialogueText_(text) {
  return (
    typeof text === "string" &&
    text === text.trim() &&
    [...text].length > 0 &&
    [...text].length <= 40 &&
    /[ぁ-んァ-ヶ一-龠]/.test(text) &&
    !/[\x00-\x1f\x7f-\x9f<>\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u206f0-9０-９]/.test(
      text,
    ) &&
    !/https?:|www\.|\S+\.(com|net|org|jp)|ポイント|点獲得|ルール/i.test(text)
  );
}
function validateTexts_(texts, allowEmpty = false) {
  if (
    !Array.isArray(texts) ||
    texts.length > 3 ||
    (!allowEmpty && texts.length === 0) ||
    texts.some((t) => !validDialogueText_(t)) ||
    new Set(texts).size !== texts.length
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return texts;
}
function validateCatalog_(catalog) {
  requireObjectKeys_(catalog, ["version", "entries"]);
  if (
    !Number.isSafeInteger(catalog.version) ||
    catalog.version < 0 ||
    !Array.isArray(catalog.entries) ||
    catalog.entries.length > 9
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const slots = new Set();
  for (const e of catalog.entries) {
    requireObjectKeys_(e, ["characterId", "outcome", "texts"]);
    const slot = e.characterId + "_" + e.outcome;
    if (!dialogueSlots_().includes(slot) || slots.has(slot))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    slots.add(slot);
    validateTexts_(e.texts);
  }
  jsonCell_(catalog);
  return catalog;
}
function dialogueRaw_(book) {
  const defs = dialogueDefinitions_(),
    raw = {};
  for (const [name, columns] of Object.entries(defs)) {
    const sheet = book.getSheetByName(name);
    if (!sheet) {
      raw[name] = null;
      continue;
    }
    const rows = sheet.getDataRange().getValues();
    if (canonicalJson_(rows[0]) !== canonicalJson_(columns))
      throw new AppError_("DATA_INTEGRITY_ERROR");
    raw[name] = rows;
  }
  return raw;
}
function readDialogue_(book) {
  const raw = dialogueRaw_(book);
  if (Object.values(raw).every((v) => v === null))
    return {
      initialized: false,
      drafts: [],
      catalog: { version: 0, entries: [] },
    };
  if (Object.values(raw).some((v) => v === null))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const slots = dialogueSlots_(),
    rows = raw.DialogueDrafts.slice(1);
  if (rows.length !== 9) throw new AppError_("DATA_INTEGRITY_ERROR");
  const drafts = rows.map((r, i) => {
    if (
      r[0] !== slots[i] ||
      !Number.isSafeInteger(r[1]) ||
      r[1] < 0 ||
      typeof r[2] !== "string" ||
      !isUtcDate_(r[4]) ||
      (r[1] > 0 && !isUuid_(r[3]))
    )
      throw new AppError_("DATA_INTEGRITY_ERROR");
    const texts = JSON.parse(r[2]);
    validateTexts_(texts, true);
    return { slotKey: r[0], revision: r[1], texts };
  });
  const pub = raw.DialoguePublication;
  if (pub.length !== 2 || pub[1][0] !== "CURRENT" || !isUtcDate_(pub[1][3]))
    throw new AppError_("DATA_INTEGRITY_ERROR");
  const catalog = validateCatalog_(parseCell_(pub[1][2]));
  if (pub[1][1] !== catalog.version)
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return { initialized: true, drafts, catalog };
}
function readPublicDialogue_(book) {
  try {
    return readDialogue_(book).catalog;
  } catch (_) {
    return { version: 0, entries: [] };
  }
}
function writeDialogueRow_(sheet, row, values) {
  requireWriteLock_();
  const range = sheet.getRange(row, 1, 1, values.length);
  range.setValues([values]);
  SpreadsheetApp.flush();
  if (canonicalJson_(range.getValues()[0]) !== canonicalJson_(values))
    throw new AppError_("DATA_INTEGRITY_ERROR");
}
function initializeDialogue_(book) {
  requireWriteLock_();
  const current = readDialogue_(book);
  if (current.initialized) return current;
  for (const [name, columns] of Object.entries(dialogueDefinitions_())) {
    const sheet = book.insertSheet(name);
    writeDialogueRow_(sheet, 1, columns);
    sheet.setFrozenRows(1);
    if (name === "DialogueDrafts")
      dialogueSlots_().forEach((slot, i) =>
        writeDialogueRow_(sheet, i + 2, [
          slot,
          0,
          "[]",
          "",
          new Date().toISOString(),
        ]),
      );
    else
      writeDialogueRow_(sheet, 2, [
        "CURRENT",
        0,
        jsonCell_({ version: 0, entries: [] }),
        new Date().toISOString(),
      ]);
  }
  return readDialogue_(book);
}
function publishDialogue_(book, p) {
  return withLock_(() => {
    const current = readDialogue_(book),
      draft = current.drafts.find((d) => d.slotKey === p.slotKey);
    if (
      !draft ||
      draft.revision !== p.draftRevision ||
      current.catalog.version !== p.expectedVersion
    )
      throw new AppError_("VERSION_CONFLICT");
    if (
      !Array.isArray(p.selectedIndices) ||
      p.selectedIndices.length > 3 ||
      new Set(p.selectedIndices).size !== p.selectedIndices.length ||
      p.selectedIndices.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= draft.texts.length,
      )
    )
      throw new AppError_("INVALID_ARGUMENT");
    const entries = current.catalog.entries.filter(
      (e) => e.characterId + "_" + e.outcome !== p.slotKey,
    );
    if (p.selectedIndices.length) {
      const [characterId, outcome] = p.slotKey.split("_");
      entries.push({
        characterId,
        outcome,
        texts: p.selectedIndices.map((i) => draft.texts[i]),
      });
    }
    entries.sort((a, b) =>
      (a.characterId + a.outcome).localeCompare(b.characterId + b.outcome),
    );
    const catalog = validateCatalog_({
      version: current.catalog.version + 1,
      entries,
    });
    writeDialogueRow_(book.getSheetByName("DialoguePublication"), 2, [
      "CURRENT",
      catalog.version,
      jsonCell_(catalog),
      new Date().toISOString(),
    ]);
    return readDialogue_(book);
  });
}
function generationDay_() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
}
function verifiedProperty_(props, key, value) {
  const text = jsonCell_(value);
  props.setProperty(key, text);
  if (props.getProperty(key) !== text)
    throw new AppError_("DATA_INTEGRITY_ERROR");
}
function generationBudget_(props) {
  const text = props.getProperty("JANKEN_AI_DAILY"),
    day = generationDay_();
  if (!text) return { day, count: 0, stopped: false };
  const value = parseCell_(text);
  requireObjectKeys_(value, ["day", "count", "stopped"]);
  if (
    typeof value.day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    value.count > 20 ||
    typeof value.stopped !== "boolean" ||
    value.day > day
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return value.day === day ? value : { day, count: 0, stopped: false };
}
function generateDialogueDraft_(book, p) {
  const props = PropertiesService.getScriptProperties(),
    key = "JANKEN_AI_JOB_" + p.requestId.toLowerCase();
  const input = {
      datasetId: payloadHash_(book.getId()),
      slotKey: p.slotKey,
      draftRevision: p.draftRevision,
    },
    hash = payloadHash_(input);
  const reservation = withLock_(() => {
    const existing = props.getProperty(key);
    if (existing) {
      const job = parseCell_(existing);
      if (job.hash !== hash) throw new AppError_("REQUEST_ID_CONFLICT");
      return {
        existing: true,
        status: job.status === "reserved" ? "unknown" : job.status,
      };
    }
    const current = readDialogue_(book),
      draft = current.drafts.find((d) => d.slotKey === p.slotKey);
    if (!draft || draft.revision !== p.draftRevision)
      throw new AppError_("VERSION_CONFLICT");
    const settings = geminiSettings_(),
      budget = generationBudget_(props);
    if (
      budget.stopped ||
      budget.count >= 20 ||
      Object.keys(props.getProperties()).filter((k) =>
        k.startsWith("JANKEN_AI_JOB_"),
      ).length >= 200
    )
      throw new AppError_("AI_LIMIT");
    // Charge before reservation; a partial failure may consume budget, never permit extra calls.
    verifiedProperty_(props, "JANKEN_AI_DAILY", {
      ...budget,
      count: budget.count + 1,
    });
    verifiedProperty_(props, key, {
      hash,
      status: "reserved",
      day: budget.day,
      model: settings.model,
      promptVersion: "dialogue-v1",
    });
    return { existing: false, settings, day: budget.day };
  });
  if (reservation.existing)
    return { status: reservation.status, ...readDialogue_(book) };
  let generated;
  try {
    generated = generateTextCandidates_(p.slotKey, reservation.settings);
  } catch (_) {
    generated = { ok: false, stop: false };
  }
  return withLock_(() => {
    const job = parseCell_(props.getProperty(key));
    if (job.hash !== hash || job.status !== "reserved")
      throw new AppError_("DATA_INTEGRITY_ERROR");
    if (generated.stop) {
      const budget = generationBudget_(props);
      if (budget.day === reservation.day)
        verifiedProperty_(props, "JANKEN_AI_DAILY", {
          ...budget,
          stopped: true,
        });
    }
    const current = readDialogue_(book),
      draft = current.drafts.find((d) => d.slotKey === p.slotKey);
    let status = "failed";
    if (generated.ok && draft && draft.revision === p.draftRevision) {
      validateTexts_(generated.texts);
      writeDialogueRow_(
        book.getSheetByName("DialogueDrafts"),
        dialogueSlots_().indexOf(p.slotKey) + 2,
        [
          p.slotKey,
          draft.revision + 1,
          JSON.stringify(generated.texts),
          p.requestId.toLowerCase(),
          new Date().toISOString(),
        ],
      );
      status = "generated";
    }
    verifiedProperty_(props, key, { ...job, status });
    return { status, ...readDialogue_(book) };
  });
}
