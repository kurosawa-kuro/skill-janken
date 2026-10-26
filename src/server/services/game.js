function chooseIndex_(length, random = Math.random()) {
  if (
    !Number.isInteger(length) ||
    length < 1 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1
  )
    throw new AppError_("INVALID_ARGUMENT");
  return Math.floor(random * length);
}
function roundOutcome_(hand, cpuHand) {
  if (
    !["rock", "scissors", "paper"].includes(hand) ||
    !["rock", "scissors", "paper"].includes(cpuHand)
  )
    throw new AppError_("INVALID_ARGUMENT");
  return hand === cpuHand
    ? "DRAW"
    : { rock: "scissors", scissors: "paper", paper: "rock" }[hand] === cpuHand
      ? "WIN"
      : "LOSE";
}
function produceGameChange_(op, state, p, tables, stored) {
  let result;
  if (op === "drawCharacter") {
    const candidates = tables.Characters.filter(
      (c) => c.active && !state.ownedCharacterIds.includes(c.characterId),
    );
    if (!candidates.length) throw new AppError_("ALL_OWNED");
    const id = stored
      ? stored.characterId
      : candidates[chooseIndex_(candidates.length)].characterId;
    if (!candidates.some((c) => c.characterId === id))
      throw new AppError_("INVALID_ARGUMENT");
    result = { characterId: id, candidateCount: candidates.length };
    state.ownedCharacterIds.push(id);
    state.ownedCharacterIds.sort();
  } else if (op === "playRound") {
    if (!state.ownedCharacterIds.includes(p.characterId))
      throw new AppError_("CHARACTER_NOT_OWNED");
    const skill = tables.Skills.find(
      (s) => s.skillId === p.skillId && s.active,
    );
    if (
      !skill ||
      !["S01", "S02", "S03"].includes(p.skillId) ||
      !state.unlockedSkillIds.includes(p.skillId) ||
      !tables.CharacterSkills.some(
        (r) => r.characterId === p.characterId && r.skillId === p.skillId,
      )
    )
      throw new AppError_("SKILL_NOT_AVAILABLE");
    const cpuHand = stored
      ? stored.cpuHand
      : ["rock", "scissors", "paper"][chooseIndex_(3)];
    const outcome = roundOutcome_(p.hand, cpuHand),
      basePoints = outcome === "WIN" ? 2 : 1,
      bonusPoints = skill.effectCode === outcome + "_BONUS" ? 1 : 0;
    result = {
      characterId: p.characterId,
      skillId: p.skillId,
      playerHand: p.hand,
      cpuHand,
      outcome,
      basePoints,
      bonusPoints,
      earnedPoints: basePoints + bonusPoints,
    };
    state.points += result.earnedPoints;
  } else throw new AppError_("INVALID_ARGUMENT");
  state.version++;
  return { state, result };
}
