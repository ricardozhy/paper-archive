import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { maxBackupBytes, openStore, validateBackup } from "./store.mjs";

const { values, positionals } = parseArgs({
  options: { "dry-run": { type: "boolean" } },
  allowPositionals: true,
});
if (positionals.length !== 1) {
  throw new Error("用法：npm run archive:import -- <备份 JSON 路径> [--dry-run]");
}
const [file] = positionals;
if ((await stat(file)).size > maxBackupBytes) throw new Error("备份不得超过 5 MB，请分批导入。");
const backup = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
if (!validateBackup(backup)) {
  throw new Error("JSON 格式或记录有误，请参考 examples/archive.json。");
}

const store = openStore();
try {
  if (values["dry-run"]) {
    const ids = new Set(store.list().map(paper => paper.id));
    const existing = ids.size;
    for (const paper of backup.papers) ids.add(paper.id);
    const wouldAdd = ids.size - existing;
    console.log(JSON.stringify({ wouldAdd, skipped: backup.papers.length - wouldAdd, total: existing }));
  } else {
    const result = store.importMissing(backup.papers);
    console.log(JSON.stringify({ ...result, total: store.list().length }));
  }
} finally {
  store.close();
}
