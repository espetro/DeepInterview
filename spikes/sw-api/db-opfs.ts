/**
 * OPFS-backed SQLite (sqlite-wasm, opfs-sahpool VFS) Kysely dialect for the
 * service-worker spike. Mirrors server/src/store/db.ts schema + migrate()
 * (copied, since server sources must stay untouched).
 *
 * The dialect implements the tiny surface Kysely's SqliteDriver consumes:
 *   prepare(sql) -> stmt with { reader, all(params), run(params) }
 * plus close().
 */
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, sql } from "kysely";
import type { Database, OpfsSAHPoolDatabase, Sqlite3Static } from "@sqlite.org/sqlite-wasm";

// ---- schema (copied from server/src/store/db.ts; keep in sync) ----

export interface DbSchema {
  sessions: {
    id: string;
    title: string;
    mode: "interview" | "coach";
    created_at: string;
    status: string;
    duration_min: number;
    plan: string | null;
  };
  turns: {
    id: string;
    session_id: string;
    seq: number;
    speaker: "user" | "agent";
    text: string;
    created_at: string;
    source: "voice" | "text";
  };
  events: {
    id: number;
    session_id: string;
    type: string;
    payload: string | null;
    at: string;
  };
  tool_state: {
    id: string;
    editor: string;
    whiteboard: string;
    updated_at: string;
  };
  reports: {
    session_id: string;
    overall_score: number;
    coverage_pct: number;
    data: string;
    generated_at: string;
  };
  documents: {
    id: string;
    session_id: string;
    name: string;
    kind: "pdf" | "md" | "txt" | "docx";
    size_bytes: number;
    status: "pending" | "processing" | "ready" | "failed";
    error: string | null;
    chunk_count: number | null;
    created_at: string;
  };
  chunks: {
    id: string;
    document_id: string;
    session_id: string;
    seq: number;
    text: string;
    embedding: Uint8Array;
  };
}

export type Db = Kysely<DbSchema>;

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    duration_min INTEGER NOT NULL,
    plan TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    seq INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tool_state (
    id TEXT PRIMARY KEY REFERENCES sessions(id),
    editor TEXT NOT NULL DEFAULT '',
    whiteboard TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    overall_score INTEGER NOT NULL,
    coverage_pct INTEGER NOT NULL,
    data TEXT NOT NULL,
    generated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    chunk_count INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    session_id TEXT NOT NULL REFERENCES sessions(id),
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)`,
];

// ---- sqlite-wasm -> Kysely dialect ----

/** Kysely's SqliteDriver calls db.prepare(sql) and inspects stmt.reader. */
function wrapForKysely(db: Database): Database {
  const rawPrepare = db.prepare.bind(db);
  // @ts-expect-error augmenting statements with the `reader` flag kysely needs
  db.prepare = (sqlText: string) => {
    const stmt = rawPrepare(sqlText);
    return Object.defineProperty(stmt, "reader", {
      value: /^\s*(select|with|returning|pragma)/i.test(sqlText),
    });
  };
  return db;
}

let wasmPromise: Promise<{ db: OpfsSAHPoolDatabase; sqlite3: Sqlite3Static }> | undefined;

/**
 * Boot sqlite-wasm, install the OPFS sahpool VFS (SyncAccessHandle pool, no
 * SharedArrayBuffer/COOP-COEP needed) and open the di database. The sahpool
 * flavor is the only OPFS VFS that works inside a service worker: the old
 * "opfs" VFS proxies through a dedicated Worker the SW cannot spawn reliably.
 * Safe to call repeatedly; returns the same promise.
 */
export function openOpfsDb(name = "di.db") {
  wasmPromise ??= (async () => {
    const wasm = await import("@sqlite.org/sqlite-wasm");
    const sqlite3 = await wasm.default({});
    if (!navigator.storage?.getDirectory) {
      throw new Error("OPFS unavailable in this context");
    }
    const pool = await sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 9 });
    const db = new pool.OpfsSAHPoolDb(name) as OpfsSAHPoolDatabase;
    return { db: db as unknown as OpfsSAHPoolDatabase, sqlite3 };
  })();
  return wasmPromise;
}

export async function createDatabase(name = "di.db"): Promise<Db> {
  const { SqliteDriver } = await import("kysely");
  const { db: raw } = await openOpfsDb(name);
  return new Kysely<DbSchema>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new SqliteDriver({ database: wrapForKysely(raw) as never }),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createIntrospector: (db: Kysely<any>) => new SqliteIntrospector(db),
    },
  });
}

/** Mirror of server migrate(): idempotent, table-name guarded. */
export async function migrate(db: Db): Promise<void> {
  const tables = await db.introspection.getTables();
  const names = new Set(tables.map((t) => t.name));
  for (const m of MIGRATIONS) {
    if (/^CREATE INDEX/i.test(m)) {
      await sql.raw(m).execute(db);
      continue;
    }
    const table = m.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1]!;
    if (names.has(table)) continue;
    await sql.raw(m).execute(db);
  }
}
