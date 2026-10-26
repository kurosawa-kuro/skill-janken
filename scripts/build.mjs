import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { Script } from "node:vm";
import { ROOT, RUNTIME_FILES, walkFiles } from "./files.mjs";

const source = join(ROOT, "src");
const target = join(ROOT, "dist");
const actual = walkFiles(source);
if (JSON.stringify(actual) !== JSON.stringify([...RUNTIME_FILES].sort())) {
  throw new Error(
    "src differs from the runtime allowlist; review scripts/files.mjs",
  );
}
const manifest = JSON.parse(
  readFileSync(join(source, "appsscript.json"), "utf8"),
);
if (
  manifest.runtimeVersion !== "V8" ||
  manifest.webapp.access !== "MYSELF" ||
  manifest.webapp.executeAs !== "USER_DEPLOYING"
)
  throw new Error("Unexpected deployment settings");
const allowedOutput = [...RUNTIME_FILES, ".claspignore"];
if (
  existsSync(target) &&
  walkFiles(target).some((file) => !allowedOutput.includes(file))
) {
  throw new Error("Unexpected files in dist; inspect them before rebuilding");
}
// Syntax checks include JS embedded in HTML (the GAS template is expanded in tests).
for (const file of RUNTIME_FILES) {
  const content = readFileSync(join(source, file), "utf8");
  if (file.endsWith(".js")) new Script(content, { filename: file });
  if (file.endsWith(".html")) {
    for (const match of content.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      new Script(match[1].replace(/<\?!=[\s\S]*?\?>/g, "{}"), {
        filename: file,
      });
    }
  }
  mkdirSync(dirname(join(target, file)), { recursive: true });
  writeFileSync(join(target, file), content);
}
// Adapted from ai-photo-diary/.claspignore, relative to the dist deployment root.
writeFileSync(
  join(target, ".claspignore"),
  "**/**\n!appsscript.json\n!server/\n!server/**/*.js\n!client/\n!client/**/*.html\n",
);
console.log(`Built ${RUNTIME_FILES.length} runtime files in dist (no upload).`);
