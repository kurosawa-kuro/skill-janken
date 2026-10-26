import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// An explicit deployment allowlist; adding a runtime file requires a review here.
export const RUNTIME_FILES = [
  "appsscript.json",
  "server/controllers/web.js",
  "server/controllers/api.js",
  "server/core/errors.js",
  "server/core/request.js",
  "server/core/settings.js",
  "server/core/canonical.js",
  "server/adapters/external.js",
  "server/application/services.js",
  "server/db/schema.js",
  "server/db/repository.js",
  "server/db/actions.js",
  "server/controllers/backup.js",
  "server/core/lock.js",
  "server/services/assets.js",
  "server/services/gemini.js",
  "server/controllers/admin.js",
  "client/index.html",
  "client/styles.html",
  "client/core/dom.html",
  "client/core/api.html",
  "client/core/pending.html",
  "client/core/assets.html",
  "client/app.html",
];

// Adapted from ai-english-trainer/tests/gas-mock.mjs: no .clasp.json dependency.
export function walkFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink())
        throw new Error("Symlinks are not deployable");
      const relative = prefix + entry.name;
      return entry.isDirectory()
        ? walkFiles(join(directory, entry.name), relative + "/")
        : [relative];
    })
    .sort();
}
