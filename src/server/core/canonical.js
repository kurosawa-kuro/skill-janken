function canonicalJson_(value) {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson_).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonicalJson_(value[key]))
        .join(",") +
      "}"
    );
  const json = JSON.stringify(value);
  if (
    json === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return json;
}

// Copied from ai-english-trainer/core/request-hash.js; canonicalize before hashing.
function payloadHash_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonicalJson_(value),
    Utilities.Charset.UTF_8,
  )
    .map((v) => (v & 255).toString(16).padStart(2, "0"))
    .join("");
}

function normalizedInput_(request) {
  if (!validateRequest_(request)) throw new AppError_("INVALID_ARGUMENT");
  const payload = JSON.parse(JSON.stringify(request.payload));
  return {
    op: request.op,
    expectedVersion: request.expectedVersion,
    datasetId: request.datasetId,
    payload,
  };
}

function jsonCell_(value) {
  const json = canonicalJson_(value);
  if (Utilities.newBlob(json).getBytes().length > 8192)
    throw new AppError_("DATA_INTEGRITY_ERROR");
  return json;
}

function parseCell_(text) {
  try {
    if (
      typeof text !== "string" ||
      Utilities.newBlob(text).getBytes().length > 8192
    )
      throw Error();
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch (_) {
    throw new AppError_("DATA_INTEGRITY_ERROR");
  }
}

function isUtcDate_(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
