import { parseArgs } from "node:util";
import { createDatabase, migrate, ping } from "./store/db";
import { loadConfig, ConfigError } from "./config/load";
import { probeProviders } from "./check/probe";
import { Supervisor, type ChildSpec } from "./supervisor/supervisor";
import { buildChildSpecs } from "./supervisor/specs";
import { createApp, serveApp } from "./api/app";

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      check: { type: "boolean", default: false },
      config: { type: "string", default: "config.yaml" },
      "no-supervise": { type: "boolean", default: false },
    },
  });

  let config;
  try {
    config = loadConfig(values.config!);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
  console.log(`[di] config ok (${values.config})`);

  if (values.check) {
    return check(config);
  }

  const db = createDatabase(config.files.db_path);
  await migrate(db);
  const testMode = process.env.DI_TEST_MODE === "1";

  const supervisor = values["no-supervise"]
    ? undefined
    : new Supervisor(buildChildSpecs(config) as ChildSpec[]);
  supervisor?.start();

  const app = await createApp({ config, db, supervisor, testMode });
  const server = serveApp(app, config.server.port);
  console.log(`[di] listening on http://localhost:${config.server.port}${testMode ? " (test mode)" : ""}`);

  const shutdown = async () => {
    console.log("\n[di] shutting down");
    server.stop(true);
    await supervisor?.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  // Keep the event loop alive while the server runs; shutdown() exits.
  await new Promise(() => {});
}

async function check(config: Awaited<ReturnType<typeof loadConfig>>): Promise<number> {
  const db = createDatabase(config.files.db_path);
  const dbOk = await ping(db);
  console.log(`[di --check] db: ${dbOk ? "ok" : "FAIL"}`);
  const providers = await probeProviders(config);
  for (const [name, ok] of Object.entries(providers)) {
    console.log(`[di --check] ${name}: ${ok ? "ok" : "FAIL"}`);
  }
  const allOk = dbOk && Object.values(providers).every(Boolean);
  console.log(`[di --check] ${allOk ? "all good" : "problems found"}`);
  return allOk ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
