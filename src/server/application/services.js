function createServices_() {
  const repository = createRepository_();
  return {
    bootstrap: () => repository.bootstrap(),
    getRelations: () => repository.getRelations(),
    drawCharacter: (_, request) =>
      repository.commit(request, (state, p, tables) =>
        produceGameChange_("drawCharacter", state, p, tables),
      ),
    playRound: (_, request) =>
      repository.commit(request, (state, p, tables) =>
        produceGameChange_("playRound", state, p, tables),
      ),
  };
}
