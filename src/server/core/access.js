// Private Drive checks adapted from ai-photo-diary/services/photo/drive-store.js.
function isPrivateOwned_(item) {
  const owner = item.getOwner(),
    account = Session.getEffectiveUser().getEmail();
  return Boolean(
    account &&
      owner &&
      owner.getEmail() === account &&
      !item.isTrashed() &&
      item.getSharingAccess() === DriveApp.Access.PRIVATE &&
      item.getEditors().length === 0 &&
      item.getViewers().length === 0,
  );
}

function requireAdmin_() {
  const expected =
    PropertiesService.getScriptProperties().getProperty("JANKEN_ADMIN_EMAIL");
  const actual = Session.getActiveUser().getEmail();
  if (
    !expected ||
    !actual ||
    expected.trim().toLowerCase() !== actual.trim().toLowerCase()
  )
    throw new AppError_("FORBIDDEN");
}
