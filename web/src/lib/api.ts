/**
 * di API client. The di binary serves the SPA and the /v1 API from one origin,
 * so plain fetch against relative paths is all the web app needs.
 */
const BASE = import.meta.env.VITE_DI_API_BASE ?? "";

export interface SessionDto {
  id: string;
  title: string;
  mode: "interview" | "coach";
  created_at: string;
  status: string;
  duration_min: number;
}

export interface TurnDto {
  id: string;
  session_id: string;
  seq: number;
  speaker: "user" | "agent";
  text: string;
  created_at: string;
  source: "voice" | "text";
}

export async function createSession(body: {
  title: string;
  mode: string;
  duration_min: number;
}): Promise<SessionDto> {
  const res = await fetch(`${BASE}/v1/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create session failed: ${res.status}`);
  return res.json();
}

export interface DocumentDto {
  id: string;
  session_id: string;
  name: string;
  kind: "pdf" | "md" | "txt" | "docx";
  size_bytes: number;
  status: "pending" | "processing" | "ready" | "failed";
  error?: string;
  chunk_count?: number;
  created_at: string;
}

export async function uploadDocuments(
  id: string,
  files: File[],
): Promise<{ documents: DocumentDto[] }> {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  const res = await fetch(`${BASE}/v1/sessions/${id}/documents`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `upload failed: ${res.status}`);
  }
  return res.json();
}

export async function listSessions(): Promise<SessionDto[]> {
  const res = await fetch(`${BASE}/v1/sessions`);
  if (!res.ok) throw new Error(`list sessions failed: ${res.status}`);
  return res.json();
}

export async function getSession(id: string): Promise<SessionDto> {
  const res = await fetch(`${BASE}/v1/sessions/${id}`);
  if (!res.ok) throw new Error(`get session failed: ${res.status}`);
  return res.json();
}

export async function getTurns(id: string): Promise<TurnDto[]> {
  const res = await fetch(`${BASE}/v1/sessions/${id}/turns`);
  if (!res.ok) throw new Error(`get turns failed: ${res.status}`);
  return res.json();
}

export async function getReport(id: string): Promise<unknown> {
  const res = await fetch(`${BASE}/v1/sessions/${id}/report`);
  if (!res.ok) throw new Error(`get report failed: ${res.status}`);
  return res.json();
}

export interface ToolStateDto {
  editor: string;
  whiteboard: string;
}

export async function pushToolState(
  id: string,
  state: ToolStateDto,
): Promise<void> {
  const res = await fetch(`${BASE}/v1/sessions/${id}/tools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`push tool state failed: ${res.status}`);
}

export async function postTextTurn(id: string, text: string): Promise<TurnDto> {
  const turn = {
    id: crypto.randomUUID(),
    session_id: id,
    seq: Date.now(),
    speaker: "user",
    text,
    created_at: new Date().toISOString(),
    source: "text",
  };
  const res = await fetch(`${BASE}/v1/sessions/${id}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(turn),
  });
  if (!res.ok) throw new Error(`post turn failed: ${res.status}`);
  return res.json();
}
