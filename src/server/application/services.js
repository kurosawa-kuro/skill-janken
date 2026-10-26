function createServices_() {
  const repository = createRepository_();
  const assets = createAssets_();
  return {
    bootstrap: () => repository.bootstrap(),
    getRelations: () => repository.getRelations(),
    getAsset: (payload) => assets.getAsset(payload.assetId),
    // GameService and Actions persistence are implemented in later tasks.
    drawCharacter: () => {
      throw new AppError_("INTERNAL_ERROR");
    },
    playRound: () => {
      throw new AppError_("INTERNAL_ERROR");
    },
    synthesize: () => {
      throw new AppError_("INTERNAL_ERROR");
    },
  };
}
