import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./db-opfs";

/** Node-safe: SQL string checks only (sqlite-wasm/OPFS can't run in node). */
describe("sw-api spike migrations", () => {
  it("mirror the server schema tables", () => {
    const tables = MIGRATIONS.flatMap((m) => m.match(/CREATE TABLE IF NOT EXISTS (\w+)/) ?? []);
    expect(tables).toEqual([
      "sessions",
      "turns",
      "events",
      "tool_state",
      "reports",
      "documents",
      "chunks",
    ]);
  });

  it("includes the chunks index and is idempotent (IF NOT EXISTS everywhere)", () => {
    const index = MIGRATIONS.find((m) => m.startsWith("CREATE INDEX"));
    expect(index).toBe("CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)");
    for (const m of MIGRATIONS) expect(m).toMatch(/IF NOT EXISTS/);
  });

  it("declares FKs to sessions with wal-free pragma-free DDL (opfs-compatible)", () => {
    expect(MIGRATIONS.join("\n")).not.toContain("PRAGMA");
  });
});
