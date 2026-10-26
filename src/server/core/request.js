function requireObjectKeys_(value, required) {
  if (
    !value ||
    Object.prototype.toString.call(value) !== "[object Object]" ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new AppError_("INVALID_ARGUMENT");
  }
}

function isId_(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(value);
}

function isUuid_(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function validateRequest_(request) {
  try {
    const json = JSON.stringify(request);
    if (
      typeof json !== "string" ||
      Utilities.newBlob(json).getBytes().length > 4096
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    const payloadKeys = {
      bootstrap: [],
      drawCharacter: [],
      playRound: ["characterId", "skillId", "hand"],
      getRelations: [],
    };
    if (
      !request ||
      typeof request.op !== "string" ||
      !Object.prototype.hasOwnProperty.call(payloadKeys, request.op)
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    const mutation = ["drawCharacter", "playRound"].includes(request.op);
    requireObjectKeys_(
      request,
      mutation
        ? ["op", "requestId", "expectedVersion", "datasetId", "payload"]
        : ["op", "payload"],
    );
    requireObjectKeys_(request.payload, payloadKeys[request.op]);
    if (
      mutation &&
      (!isUuid_(request.requestId) ||
        typeof request.datasetId !== "string" ||
        !/^[a-f0-9]{64}$/.test(request.datasetId) ||
        !Number.isSafeInteger(request.expectedVersion) ||
        request.expectedVersion < 0)
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    const payload = request.payload;
    if (
      request.op === "playRound" &&
      (!isId_(payload.characterId) ||
        !isId_(payload.skillId) ||
        !["rock", "scissors", "paper"].includes(payload.hand))
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    return mutation;
  } catch (_) {
    throw new AppError_("INVALID_ARGUMENT");
  }
}
