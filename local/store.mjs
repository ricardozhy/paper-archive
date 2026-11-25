import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const dataDirectory = new URL("../.local-data/", import.meta.url);
export const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export const maxRecordBytes = 256 * 1024;
export const maxBackupBytes = 5_000_000;

export function validatePaper(paper) {
  return paper && validId(paper.id) && typeof paper.title === "string"
    && paper.title.trim().length > 0 && paper.title.length <= 500
    && Buffer.byteLength(JSON.stringify(paper)) <= maxRecordBytes;
}

export function validateBackup(backup) {
  return backup?.format === "paper-archive" && backup?.version === 1
    && Array.isArray(backup.papers) && backup.papers.length <= 5000
    && backup.papers.every(validatePaper);
}

export function openStore(database = new URL("archive.sqlite", dataDirectory)) {
  mkdirSync(new URL(".", database), { recursive: true });
  const db = new DatabaseSync(fileURLToPath(database));
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const all = db.prepare("SELECT data FROM papers ORDER BY updated_at DESC, id");
  const one = db.prepare("SELECT data FROM papers WHERE id = ?");
  const insert = db.prepare("INSERT INTO papers VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING");
  const save = db.prepare(`
    INSERT INTO papers VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `);
  const remove = db.prepare("DELETE FROM papers WHERE id = ?");

  return {
    list: () => all.all().map(({ data }) => JSON.parse(data)),
    get(id) {
      const row = one.get(id);
      return row ? JSON.parse(row.data) : null;
    },
    save: (paper) => save.run(paper.id, JSON.stringify(paper), new Date().toISOString()),
    remove: (id) => remove.run(id),
    importMissing(records) {
      if (!Array.isArray(records) || !records.every(validatePaper)) {
        throw new Error("备份中存在标题、编号或长度不符合要求的记录。");
      }
      const timestamp = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        let added = 0;
        for (const paper of records) {
          added += Number(insert.run(paper.id, JSON.stringify(paper), timestamp).changes);
        }
        db.exec("COMMIT");
        return { added, skipped: records.length - added };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
