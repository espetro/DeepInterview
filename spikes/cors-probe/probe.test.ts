// Sanity checks for the probe page: the inline script parses and the
// provider configs are well-formed. Pure static analysis, no browser needed.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const files = readdirSync(dir);
const htmlFile = files.find((f) => f.endsWith(".html"));
if (!htmlFile) throw new Error("no .html probe page found in " + dir);
const html = await Bun.file(join(dir, htmlFile)).text();

function extractScript(): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no inline <script> found");
  return m[1];
}

// Pull the PROVIDERS object literal out of the script and eval it in a sandbox.
function extractProviders(): Record<string, any> {
  const script = extractScript();
  const m = script.match(/const PROVIDERS = (\{[\s\S]*?\n      \});/);
  if (!m) throw new Error("PROVIDERS literal not found in script");
  return (0, eval)("(" + m[1].replace(/'z', /, "'z',") + ")");
}

describe("cors-check.html", () => {
  test("inline script parses as JS", () => {
    new Function(extractScript()); // throws SyntaxError on bad parse
  });

  test("has exactly one inline script", () => {
    expect(html.match(/<script>/g)?.length).toBe(1);
  });

  test("probes the three target providers", () => {
    const p = extractProviders();
    expect(Object.keys(p).sort()).toEqual(["anthropic", "groq", "openai"]);
  });

  test("each provider config is a valid minimal chat request", () => {
    for (const [name, cfg] of Object.entries<any>(extractProviders())) {
      expect(cfg.url, name + " url").toMatch(/^https:\/\/api\./);
      expect(cfg.body.messages.length).toBeGreaterThan(0);
      expect(cfg.body.max_tokens).toBeLessThanOrEqual(8); // keep probe cost ~0
      expect(typeof cfg.authHeader).toBe("string");
    }
    // Anthropic must send its non-standard headers (guarantees a preflight).
    expect(
      extractProviders().anthropic.extraHeaders["anthropic-version"],
    ).toBeTruthy();
  });

  test("page has run/clear controls and a results table", () => {
    expect(html).toContain('id="run"');
    expect(html).toContain('id="results"');
  });
});
