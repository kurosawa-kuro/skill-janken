function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (typeof value !== "string" || !value.trim())
    throw new AppError_("INTERNAL_ERROR");
  return value.trim();
}
function repositorySettings_() {
  return { spreadsheetId: requiredProperty_("JANKEN_SPREADSHEET_ID") };
}
function geminiSettings_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty("JANKEN_AI_TEXT_ENABLED") !== "true")
    throw new AppError_("AI_DISABLED");
  const model = requiredProperty_("GEMINI_TEXT_MODEL");
  // Explicit reviewed text-only allowlist; never infer an image or paid fallback.
  if (!["gemini-3.1-flash-lite"].includes(model))
    throw new AppError_("AI_UNAVAILABLE");
  return { model, apiKey: requiredProperty_("GEMINI_API_KEY") };
}
function inspectConfiguration_() {
  const p = PropertiesService.getScriptProperties();
  return [
    "JANKEN_SPREADSHEET_ID",
    "JANKEN_ADMIN_EMAIL",
    "GEMINI_API_KEY",
    "GEMINI_TEXT_MODEL",
    "JANKEN_AI_TEXT_ENABLED",
  ].map((name) => ({
    name,
    configured: Boolean((p.getProperty(name) || "").trim()),
  }));
}
