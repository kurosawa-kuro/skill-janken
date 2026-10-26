// Prepare an editor-only maintenance upload. Never create a deployment/version
// from this directory. After execution delete server/operator-run.gs in the
// editor, then push ordinary dist. clasp 3.4.1 does not detect remote-only files.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, RUNTIME_FILES } from "./files.mjs";

const [operation, backupId, expectedId] = process.argv.slice(2);
const connection = JSON.parse(readFileSync(join(ROOT, ".clasp.json"), "utf8"));
const commands = {
  setup: "setupLab_()",
  create: "createNewLab_()",
  backup: "backupLab_()",
  verify: `withLock_(() => {
    // Isolated test copy only. This producer is never deployed with the app.
    const original = readSnapshot_();
    const initialDigest = payloadHash_(original.tables);
    const isolated = backupLab_();
    const book = SpreadsheetApp.openById(isolated.spreadsheetId);
    const request = { op: "playRound", requestId: Utilities.getUuid(), expectedVersion: original.data.state.version, datasetId: payloadHash_(book.getId()), payload: { characterId: "C01", skillId: "S01", hand: "rock" } };
    const first = commitAction_(request, state => ({
      state: { ...state, version: state.version + 1, points: state.points + 1 },
      result: { characterId: "C01", skillId: "S01", playerHand: "rock", cpuHand: "rock", outcome: "DRAW", basePoints: 1, bonusPoints: 0, earnedPoints: 1 }
    }), book);
    const replay = commitAction_(request, () => { throw Error("Unexpected second producer"); }, book);
    const backup = verifiedDatabaseCopy_(isolated.spreadsheetId, "probe-backup");
    const restored = restoreBackupToCopy_(backup.spreadsheetId);
    const unchanged = payloadHash_(readSnapshot_().tables) === initialDigest;
    if (!replay.replayed || replay.version !== first.version || backup.digest !== restored.digest || !unchanged) throw Error("Probe failed");
    const result = { check: "isolated-journal-backup-restore", isolatedId: isolated.spreadsheetId, backupId: backup.spreadsheetId, restoredId: restored.spreadsheetId, version: first.version, replayed: replay.replayed, digestMatch: true, originalUnchanged: unchanged };
    console.log(JSON.stringify(result));
    return result;
  })`,
};
let expression = commands[operation];
if (
  operation === "configure" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backupId || "") &&
  ["true", "false"].includes(expectedId)
)
  expression = `configureDialogue_(${JSON.stringify(backupId)}, ${expectedId})`;
if (operation === "migrate" && /^[A-Za-z0-9_-]+$/.test(backupId || "")) {
  expression = `migrateLab_(${JSON.stringify(backupId)})`;
}
if (operation === "restore" && /^[A-Za-z0-9_-]+$/.test(backupId || "")) {
  expression = `restoreBackupToCopy_(${JSON.stringify(backupId)})`;
}
if (
  operation === "activate" &&
  /^[A-Za-z0-9_-]+$/.test(backupId || "") &&
  /^[A-Za-z0-9_-]+$/.test(expectedId || "")
)
  expression = `activateLab_(${JSON.stringify(backupId)}, ${JSON.stringify(expectedId)})`;
if (!expression || !connection.scriptId || connection.rootDir !== "dist")
  throw new Error(
    "Usage: node scripts/operator.mjs setup|create|backup|verify|migrate SOURCE_ID|restore BACKUP_ID|activate NEW_ID OLD_ID|configure EMAIL true|false (ordinary connection must target dist)",
  );
if (
  ["backup", "restore", "create", "activate", "configure", "migrate"].includes(
    operation,
  )
) {
  expression = `(() => { const result = ${expression}; console.log(JSON.stringify(result)); return result; })()`;
}
const target = join(ROOT, "artifacts/operator");
// Explicitly remove only obsolete generated artifacts from this fixed directory.
for (const file of ["client/core/assets.html", "server/services/assets.js"]) {
  const obsolete = join(target, file);
  if (existsSync(obsolete)) unlinkSync(obsolete);
}
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
