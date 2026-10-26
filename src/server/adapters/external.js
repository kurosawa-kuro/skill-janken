// Mutation persistence is internal; public GameService routes are added later.
function createRepository_() {
  return {
    bootstrap() {
      const { data } = readSnapshot_();
      return { data, version: data.state.version };
    },
    getRelations() {
      const { data, actions } = readSnapshot_();
      return {
        data: {
          player: data.player,
          recentActions: actions
            .slice(-10)
            .reverse()
            .map(({ actionId, type, createdAt, result }) => ({
              actionId,
              type,
              createdAt,
              result,
            })),
          characters: data.characters,
          skills: data.skills,
          characterSkills: data.characterSkills,
          ownedCharacterIds: data.state.ownedCharacterIds,
          unlockedSkillIds: data.state.unlockedSkillIds,
        },
        version: data.state.version,
      };
    },
    commit: (request, produce) => commitAction_(request, produce),
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
    const row = readSnapshot_().tables.Assets.find(
      (item) => item.assetId === assetId,
    );
    if (!row || row.status !== "DRAFT" || row.sourceFileId)
      throw new AppError_("INVALID_ARGUMENT");
    const result = createGemini_().generate(assetId);
    updateAssetRow_(assetId, result);
    return { assetId, generatedAt: result.generatedAt, status: "DRAFT" };
  });
}
