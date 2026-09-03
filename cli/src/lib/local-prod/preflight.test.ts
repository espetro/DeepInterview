import { describe, it, expect } from "vitest";
import {
  checkEnvFilePresent,
  checkEnvKeys,
  checkLiveKitKeyPairing,
  rollup,
} from "./preflight.js";

describe("checkEnvFilePresent", () => {
  it("returns null when the file exists", () => {
    expect(checkEnvFilePresent("package.json", "root")).toBeNull();
  });

  it("returns an error when the file is missing", () => {
    const issue = checkEnvFilePresent("/nonexistent/path/.env", "missing");
    expect(issue).not.toBeNull();
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("/nonexistent/path/.env");
  });
});

describe("checkEnvKeys", () => {
  it("reports each missing/empty key as an error", () => {
    const issues = checkEnvKeys(
      { A: "x", B: "" },
      ["A", "B", "C"],
      "test.env",
    );
    expect(issues.map((i) => i.message)).toEqual([
      "test.env: B is empty or missing",
      "test.env: C is empty or missing",
    ]);
    expect(issues.every((i) => i.level === "error")).toBe(true);
  });

  it("returns [] when every key is present", () => {
    expect(checkEnvKeys({ A: "1", B: "2" }, ["A", "B"], "x")).toEqual([]);
  });
});

describe("checkLiveKitKeyPairing", () => {
  it("warns when LIVEKIT_KEYS is unset", () => {
    const issue = checkLiveKitKeyPairing(
      { LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" },
      "agent.env",
    );
    expect(issue?.level).toBe("warning");
    expect(issue?.message).toContain("LIVEKIT_KEYS");
  });

  it("errors when LIVEKIT_KEYS does not grant the agent's pair", () => {
    const issue = checkLiveKitKeyPairing(
      {
        LIVEKIT_API_KEY: "k",
        LIVEKIT_API_SECRET: "s",
        LIVEKIT_KEYS: "other: secret",
      },
      "agent.env",
    );
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("does not grant");
  });

  it("returns null when the pair is included in LIVEKIT_KEYS", () => {
    expect(
      checkLiveKitKeyPairing(
        {
          LIVEKIT_API_KEY: "k",
          LIVEKIT_API_SECRET: "s",
          LIVEKIT_KEYS: "k: s",
        },
        "agent.env",
      ),
    ).toBeNull();
  });
});

describe("rollup", () => {
  it("collects errors and warnings across the input", () => {
    const r = rollup([
      { level: "error", message: "e1" },
      [{ level: "warning", message: "w1" }, { level: "error", message: "e2" }],
      null,
      { level: "warning", message: "w2" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message)).toEqual(["e1", "e2"]);
    expect(r.warnings.map((w) => w.message)).toEqual(["w1", "w2"]);
  });

  it("ok=true when there are no errors", () => {
    const r = rollup([{ level: "warning", message: "w" }, null]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });
});
