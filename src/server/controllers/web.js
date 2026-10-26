// Adapted from ai-english-trainer/controllers/web.js; no menus or auto seeding.
function doGet() {
  const template = HtmlService.createTemplateFromFile("client/index");
  template.config = { title: "スキルじゃんけんラボ" };
  return template
    .evaluate()
    .setTitle(template.config.title)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function include_(name) {
  const allowed = [
    "client/styles",
    "client/core/dom",
    "client/core/api",
    "client/app",
  ];
  if (!allowed.includes(name)) throw new Error("Unknown template");
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Copied from ai-photo-diary/controllers/web.js: safe JSON inside a script tag.
function serializeForScript_(value) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
