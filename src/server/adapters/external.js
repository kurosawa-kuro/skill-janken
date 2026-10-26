// Real read-only adapters. Actions mutations remain disabled until phase 3.
function createRepository_() {
  return {
    bootstrap() {
      return { data: initialSnapshot_().data, version: 0 };
    },
    getRelations() {
      const data = initialSnapshot_().data;
      return {
        data: {
          player: data.player,
          recentActions: [],
          characters: data.characters,
          skills: data.skills,
          characterSkills: data.characterSkills,
          ownedCharacterIds: data.state.ownedCharacterIds,
          unlockedSkillIds: data.state.unlockedSkillIds,
        },
        version: 0,
      };
    },
  };
}

function createAssets_() {
  return {
    getAsset(assetId) {
      return readAsset_(assetId);
    },
  };
}

function createGemini_() {
  return {
    generate(assetId) {
      return generateImage_(assetId);
    },
  };
}

// Invoked from the editor only; Gemini is never in createServices_ or api.
function generateAsset_(assetId) {
  if (!isId_(assetId)) throw new AppError_("INVALID_ARGUMENT");
  return withLock_(() => {
    const row = initialSnapshot_().tables.Assets.find(
      (item) => item.assetId === assetId,
    );
    if (!row || row.status !== "DRAFT" || row.sourceFileId)
      throw new AppError_("INVALID_ARGUMENT");
    const result = createGemini_().generate(assetId);
    updateAssetRow_(assetId, result);
    return { assetId, generatedAt: result.generatedAt, status: "DRAFT" };
  });
}
