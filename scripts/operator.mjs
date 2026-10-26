// Prepare an editor-only maintenance upload. Never create a deployment/version
// from this directory. After execution delete server/operator-run.gs in the
// editor, then push ordinary dist. clasp 3.4.1 does not detect remote-only files.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, RUNTIME_FILES } from "./files.mjs";

const [operation, assetId, fileId] = process.argv.slice(2);
const connection = JSON.parse(readFileSync(join(ROOT, ".clasp.json"), "utf8"));
const commands = {
  setup: "setupLab_()",
  generate: "generateFirstAsset_()",
  inspect: "inspectGemini_()",
};
let expression = commands[operation];
if (
  operation === "register" &&
  /^(A_C0[1-3]|A_S0[1-4])$/.test(assetId || "") &&
  /^[A-Za-z0-9_-]+$/.test(fileId || "")
) {
  expression = `registerWebp_(${JSON.stringify(assetId)}, ${JSON.stringify(fileId)})`;
}
if (!expression || !connection.scriptId || connection.rootDir !== "dist")
  throw new Error(
    "Usage: node scripts/operator.mjs setup|inspect|generate|register A_C01 FILE_ID (ordinary connection must target dist)",
  );
const target = join(ROOT, "artifacts/operator");
for (const file of RUNTIME_FILES) {
  mkdirSync(dirname(join(target, file)), { recursive: true });
  copyFileSync(join(ROOT, "dist", file), join(target, file));
}
writeFileSync(
  join(target, "server/operator-run.js"),
  `// TEMPORARY: editor execution only. Restore dist BEFORE any deployment.\nfunction operatorRun() { return ${expression}; }\n`,
);
copyFileSync(join(ROOT, "dist/.claspignore"), join(target, ".claspignore"));
writeFileSync(
  join(target, ".clasp.json"),
  JSON.stringify({ scriptId: connection.scriptId, rootDir: "." }, null, 2) +
    "\n",
);
console.log(
  "Prepared artifacts/operator. Upload from that directory, run operatorRun in the editor, DELETE server/operator-run.gs in the editor, then push normal dist from the repository root. Verify the temporary file is absent before any deployment/version. clasp 3.4.1 --force only overwrites the manifest and does not detect remote-only files.",
);
