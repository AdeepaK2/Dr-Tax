// expo-sqlite's async API on top of Node's built-in SQLite (in memory).
import { DatabaseSync } from 'node:sqlite';

type P = unknown[];
const flat = (p: P) => (p.length === 1 && Array.isArray(p[0]) ? (p[0] as unknown[]) : p) as never[];

export async function openDatabaseAsync() {
  const db = new DatabaseSync(':memory:');
  const api = {
    execAsync: async (sql: string) => void db.exec(sql),
    runAsync: async (sql: string, ...p: P) => {
      const r = db.prepare(sql).run(...flat(p));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...p: P) => {
      const row = db.prepare(sql).get(...flat(p));
      return row ? { ...row } : null;
    },
    getAllAsync: async (sql: string, ...p: P) => db.prepare(sql).all(...flat(p)).map((r) => ({ ...r })),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    withExclusiveTransactionAsync: async (fn: (txn: unknown) => Promise<void>) => api.withTransactionAsync(() => fn(api)),
  };
  return api;
}
