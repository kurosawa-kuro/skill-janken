function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (typeof value !== "string" || !value.trim())
    throw new AppError_("INTERNAL_ERROR");
  return value.trim();
}

function repositorySettings_() {
  return { spreadsheetId: requiredProperty_("JANKEN_SPREADSHEET_ID") };
}

function assetSettings_() {
  return { folderId: requiredProperty_("JANKEN_DRIVE_FOLDER_ID") };
}

function geminiSettings_() {
  return {
    apiKey: requiredProperty_("GEMINI_API_KEY"),
    model: requiredProperty_("GEMINI_IMAGE_MODEL"),
  };
}

// Editor-only diagnostic: never returns values and never changes properties.
function inspectConfiguration_() {
  const properties = PropertiesService.getScriptProperties();
  return [
    "JANKEN_SPREADSHEET_ID",
    "JANKEN_DRIVE_FOLDER_ID",
    "GEMINI_API_KEY",
    "GEMINI_IMAGE_MODEL",
  ].map((name) => ({
    name,
    configured: Boolean((properties.getProperty(name) || "").trim()),
  }));
}
