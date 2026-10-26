// Test/preview data only. Never included in dist.
export function bootstrapResult() {
  return {
    version: 0,
    data: {
      player: { playerId: "P001", displayName: "たんけんたい" },
      state: {
        schemaVersion: 1,
        version: 0,
        points: 0,
        ownedCharacterIds: ["C01"],
        unlockedSkillIds: ["S01", "S02", "S03"],
      },
      characters: ["ひのこ", "しずく", "このは"].map((name, i) => ({
        characterId: `C0${i + 1}`,
        name,
        assetId: `A_C0${i + 1}`,
      })),
      skills: [
        "かちのひらめき",
        "まけてもいっぽ",
        "あいこのわ",
        "たんきゅうのひかり",
      ].map((name, i) => ({
        skillId: `S0${i + 1}`,
        name,
        effectCode: ["WIN_BONUS", "LOSE_BONUS", "DRAW_BONUS", "ALWAYS_BONUS"][
          i
        ],
        bonus: 1,
        assetId: `A_S0${i + 1}`,
      })),
      characterSkills: [
        ["C01", "S01"],
        ["C01", "S02"],
        ["C01", "S04"],
        ["C02", "S02"],
        ["C02", "S03"],
        ["C02", "S04"],
        ["C03", "S01"],
        ["C03", "S03"],
        ["C03", "S04"],
      ].map(([characterId, skillId]) => ({ characterId, skillId })),
      recipes: [
        {
          recipeId: "R01",
          ingredientA: "S01",
          ingredientB: "S02",
          resultSkillId: "S04",
          cost: 3,
        },
      ],
      masterVersion: 1,
      limits: { maxActions: 200, remainingActions: 200 },
    },
  };
}

export const UUID = "68bc9177-bae2-4b17-ae17-b2cabf5cdf72";
export function mutation(op = "drawCharacter", payload = {}) {
  return { op, requestId: UUID, expectedVersion: 0, payload };
}

export function scriptRunner(call, { fail = false } = {}) {
  const chain = {
    withSuccessHandler(fn) {
      this.success = fn;
      return this;
    },
    withFailureHandler(fn) {
      this.failure = fn;
      return this;
    },
    api(request) {
      const success = this.success,
        failure = this.failure;
      queueMicrotask(() => {
        if (fail) failure(new Error("PRIVATE_PROVIDER_MESSAGE"));
        else {
          try {
            success(call(request));
          } catch (error) {
            failure(error);
          }
        }
      });
    },
  };
  return { script: { run: chain } };
}
