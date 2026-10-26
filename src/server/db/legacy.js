// Read-only validation of master version 1. Never used to create new records.
function legacyTables_() {
  const state = {
    schemaVersion: 1,
    version: 0,
    points: 0,
    ownedCharacterIds: ["C01"],
    unlockedSkillIds: ["S01", "S02", "S03"],
  };
  return {
    Players: [
      ["P001", "たんけんたい", JSON.stringify(state), new Date().toISOString()],
    ],
    Characters: [
      ["C01", "ひのこ", "A_C01", 1, true],
      ["C02", "しずく", "A_C02", 2, true],
      ["C03", "このは", "A_C03", 3, true],
    ],
    Skills: [
      ["S01", "かちのひらめき", "WIN_BONUS", 1, "A_S01", true],
      ["S02", "まけてもいっぽ", "LOSE_BONUS", 1, "A_S02", true],
      ["S03", "あいこのわ", "DRAW_BONUS", 1, "A_S03", true],
      ["S04", "たんきゅうのひかり", "ALWAYS_BONUS", 1, "A_S04", true],
    ],
    CharacterSkills: [
      ["C01", "S01"],
      ["C01", "S02"],
      ["C01", "S04"],
      ["C02", "S02"],
      ["C02", "S03"],
      ["C02", "S04"],
      ["C03", "S01"],
      ["C03", "S03"],
      ["C03", "S04"],
    ],
    Recipes: [["R01", "S01", "S02", "S01|S02", "S04", 3, true]],
    Assets: ["C01", "C02", "C03", "S01", "S02", "S03", "S04"].map((id) => [
      "A_" + id,
      "",
      "",
      "",
      0,
      0,
      "DRAFT",
      "v1",
      "",
      "",
    ]),
    Actions: [],
    Settings: [
      ["MASTER_VERSION", 1],
      ["MAX_ACTIONS", 200],
      ["SCHEMA_VERSION", 1],
    ],
  };
}

function validateLegacyTransition_(previous, input, result, state, tables) {
  validateState_(state, previous.version + 1);
  const expected = JSON.parse(JSON.stringify(previous));
  expected.version++;
  const p = input.payload;
  if (input.op === "drawCharacter") {
    requireObjectKeys_(result, ["characterId", "candidateCount"]);
    const candidates = tables.Characters.filter(
      (c) => c.active && !previous.ownedCharacterIds.includes(c.characterId),
    );
    if (
      result.candidateCount !== candidates.length ||
      !candidates.some((c) => c.characterId === result.characterId)
    )
      throw Error();
    expected.ownedCharacterIds.push(result.characterId);
    expected.ownedCharacterIds.sort();
  } else if (input.op === "playRound") {
    requireObjectKeys_(result, [
      "characterId",
      "skillId",
      "playerHand",
      "cpuHand",
      "outcome",
      "basePoints",
      "bonusPoints",
      "earnedPoints",
    ]);
    const skill = tables.Skills.find(
      (s) => s.skillId === p.skillId && s.active,
    );
    if (
      !previous.ownedCharacterIds.includes(p.characterId) ||
      !previous.unlockedSkillIds.includes(p.skillId) ||
      !skill ||
      !tables.CharacterSkills.some(
        (r) => r.characterId === p.characterId && r.skillId === p.skillId,
      ) ||
      result.characterId !== p.characterId ||
      result.skillId !== p.skillId ||
      result.playerHand !== p.hand ||
      !["rock", "scissors", "paper"].includes(result.cpuHand)
    )
      throw Error();
    const beats = { rock: "scissors", scissors: "paper", paper: "rock" };
    const outcome =
      p.hand === result.cpuHand
        ? "DRAW"
        : beats[p.hand] === result.cpuHand
          ? "WIN"
          : "LOSE";
    const base = outcome === "WIN" ? 2 : 1;
    const bonus =
      skill.effectCode === "ALWAYS_BONUS" ||
      skill.effectCode === outcome + "_BONUS"
        ? skill.bonus
        : 0;
    if (
      result.outcome !== outcome ||
      result.basePoints !== base ||
      result.bonusPoints !== bonus ||
      result.earnedPoints !== base + bonus
    )
      throw Error();
    expected.points += result.earnedPoints;
  } else if (input.op === "synthesize") {
    requireObjectKeys_(result, ["recipeId", "unlockedSkillId", "spentPoints"]);
    const recipe = tables.Recipes.find(
      (r) => r.active && r.pairKey === p.ingredientSkillIds.join("|"),
    );
    if (
      !recipe ||
      p.ingredientSkillIds.some(
        (id) => !previous.unlockedSkillIds.includes(id),
      ) ||
      previous.unlockedSkillIds.includes(recipe.resultSkillId) ||
      previous.points < recipe.cost ||
      result.recipeId !== recipe.recipeId ||
      result.unlockedSkillId !== recipe.resultSkillId ||
      result.spentPoints !== recipe.cost
    )
      throw Error();
    expected.points -= recipe.cost;
    expected.unlockedSkillIds.push(recipe.resultSkillId);
    expected.unlockedSkillIds.sort();
  } else throw Error();
  if (canonicalJson_(expected) !== canonicalJson_(state)) throw Error();
}

function validateLegacyRequest_(request) {
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
      synthesize: ["ingredientSkillIds"],
      getRelations: [],
      getAsset: ["assetId"],
    };
    if (
      !request ||
      typeof request.op !== "string" ||
      !Object.prototype.hasOwnProperty.call(payloadKeys, request.op)
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    const mutation = ["drawCharacter", "playRound", "synthesize"].includes(
      request.op,
    );
    requireObjectKeys_(
      request,
      mutation
        ? ["op", "requestId", "expectedVersion", "payload"]
        : ["op", "payload"],
    );
    requireObjectKeys_(request.payload, payloadKeys[request.op]);
    if (
      mutation &&
      (!isUuid_(request.requestId) ||
        !Number.isSafeInteger(request.expectedVersion) ||
        request.expectedVersion < 0)
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    const payload = request.payload;
    if (request.op === "getAsset" && !isId_(payload.assetId))
      throw new AppError_("INVALID_ARGUMENT");
    if (
      request.op === "playRound" &&
      (!isId_(payload.characterId) ||
        !isId_(payload.skillId) ||
        !["rock", "scissors", "paper"].includes(payload.hand))
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    if (
      request.op === "synthesize" &&
      (!Array.isArray(payload.ingredientSkillIds) ||
        payload.ingredientSkillIds.length !== 2 ||
        !payload.ingredientSkillIds.every(isId_) ||
        payload.ingredientSkillIds[0] === payload.ingredientSkillIds[1])
    ) {
      throw new AppError_("INVALID_ARGUMENT");
    }
    return mutation;
  } catch (_) {
    throw new AppError_("INVALID_ARGUMENT");
  }
}

function normalizedLegacyInput_(request) {
  if (!validateLegacyRequest_(request)) throw new AppError_("INVALID_ARGUMENT");
  const payload = JSON.parse(JSON.stringify(request.payload));
  if (request.op === "synthesize") payload.ingredientSkillIds.sort();
  return { op: request.op, expectedVersion: request.expectedVersion, payload };
}
