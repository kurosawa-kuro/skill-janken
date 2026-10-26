// Mutation persistence is internal; public GameService routes are added later.
function createRepository_() {
  return {
    bootstrap() {
      const book = SpreadsheetApp.openById(repositorySettings_().spreadsheetId);
      const { data } = readSnapshot_(book);
      if (data.masterVersion !== 2 || data.storageSchemaVersion !== 2)
        throw new AppError_("LEGACY_DATA_READ_ONLY");
      data.datasetId = payloadHash_(book.getId());
      data.dialogueCatalog = readPublicDialogue_(book);
      return { data, version: data.state.version };
    },
    getRelations() {
      const { data, actions } = readSnapshot_();
      if (data.masterVersion !== 2 || data.storageSchemaVersion !== 2)
        throw new AppError_("LEGACY_DATA_READ_ONLY");
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
