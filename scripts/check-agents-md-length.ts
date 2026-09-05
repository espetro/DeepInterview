#!/usr/bin/env bun
/** Keeps scoped AGENTS.md files from re-bloating back into one long doc. */
import { readFileSync } from "node:fs";

const MAX_LOC = 90;
const files = (
  await Array.fromAsync(new Bun.Glob("**/AGENTS.md").scan({ cwd: "." }))
).filter((f) => !f.includes("node_modules"));

const offenders: string[] = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > MAX_LOC)
    offenders.push(`${file}: ${lines} lines (max ${MAX_LOC})`);
}

if (offenders.length > 0) {
  console.error(
    `AGENTS.md files exceeding the LOC cap:\n  ${offenders.join("\n  ")}`,
  );
  process.exit(1);
}
console.log("OK: all AGENTS.md files within the LOC cap");
