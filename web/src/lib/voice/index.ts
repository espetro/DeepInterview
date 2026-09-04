import { BrowserVoiceDriver } from "./browser-driver";
import { ServerVoiceDriver, type SpeechDriver } from "./server-driver";

export type VoiceDriverKind = "server" | "browser";

const API_BASE = import.meta.env.VITE_DI_API_BASE as string | undefined ?? "";

/**
 * Pick a driver. Precedence: VITE_VOICE_DEFAULT (build-time pin, e.g. the
 * static Pages build), else probe the server health endpoint; a fetch-able
 * ${BASE}/api/health means the di binary (with the WS voice endpoint) is
 * hosting, otherwise fall back to the browser driver.
 */
export async function selectDriver(): Promise<VoiceDriverKind> {
  const pinned = import.meta.env.VITE_VOICE_DEFAULT as VoiceDriverKind | undefined;
  if (pinned === "server" || pinned === "browser") return pinned;
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    return res.ok ? "server" : "browser";
  } catch {
    return "browser";
  }
}

export async function createDriver(sessionId: string): Promise<SpeechDriver> {
  const kind = await selectDriver();
  return kind === "server" ? new ServerVoiceDriver(sessionId) : new BrowserVoiceDriver(sessionId);
}

export { BrowserVoiceDriver, ServerVoiceDriver };
export type { SpeechDriver } from "./server-driver";
