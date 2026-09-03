import type { ToolState, Turn, SessionEvent } from "@di/shared";
import { parse } from "valibot";
import { TurnSchema, SessionEventSchema, ToolStateSchema } from "@di/shared";

export interface DiApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/** Minimal client for the di server session-scoped REST API. */
export class DiApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, fetchImpl = fetch }: DiApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async postTurn(sessionId: string, turn: Turn): Promise<void> {
    const body = parse(TurnSchema, turn);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`postTurn failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  }

  /** Editor + whiteboard state the browser pushed to di. Empty strings when never pushed. */
  async getToolState(sessionId: string): Promise<ToolState> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/sessions/${sessionId}/tools`);
    if (!res.ok) {
      throw new Error(`getToolState failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return parse(ToolStateSchema, await res.json());
  }

  async postEvent(
    sessionId: string,
    type: string,
    payload?: unknown,
    at: string = new Date().toISOString(),
  ): Promise<void> {
    const body = parse(SessionEventSchema, {
      session_id: sessionId,
      type,
      ...(payload !== undefined ? { payload } : {}),
      at,
    } satisfies SessionEvent);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/sessions/${sessionId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`postEvent failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  }
}
