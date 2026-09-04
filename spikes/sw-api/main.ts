/** Drives the SW-served API: register sw, then create session / post turns / put+get report. */

const out = document.getElementById("out")!;
const swState = document.getElementById("sw-state")!;

function log(msg: string, cls = "") {
  const line = document.createElement("pre");
  if (cls) line.className = cls;
  line.textContent = msg;
  out.appendChild(line);
}

const SESSION_KEY = "di.spike.session";

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`/v1${path}`, init);
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, body };
}

async function registerSw(): Promise<void> {
  if ("serviceWorker" in navigator === false) throw new Error("no serviceWorker in navigator");
  const reg = await navigator.serviceWorker.register("/sw.ts", { type: "module", scope: "/" });
  await navigator.serviceWorker.ready;
  swState.textContent = `sw: active (scope ${reg.scope})`;
  // give the worker's top-level await (db boot + migrate) a moment if needed
  await new Promise((r) => setTimeout(r, 100));
}

const reportBody = (sessionId: string) => ({
  session_id: sessionId,
  overall_score: 7,
  coverage_pct: 60,
  competencies: [
    {
      name: "systems",
      score: 7,
      evidence: [{ quote: "did x", turn_seq: 0, verdict: "worked" }],
    },
  ],
  model_answers: [
    { question_id: crypto.randomUUID(), question_text: "q?", answer: "a" },
  ],
  generated_at: new Date().toISOString(),
});

async function runRoundTrip(): Promise<void> {
  out.textContent = "";

  // 1. create session
  const created = await api("/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "sw-api spike", mode: "interview", duration_min: 10 }),
  });
  log(`POST /v1/sessions -> ${created.status} ${JSON.stringify(created.body)}`,
    created.status === 201 ? "ok" : "bad");
  const sid = created.body.id as string;
  if (!sid) return;
  localStorage.setItem(SESSION_KEY, sid);

  // 2. post two turns
  for (const [speaker, text] of [["user", "tell me about x"], ["agent", "sure, y"]] as const) {
    const turn = await api(`/sessions/${sid}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        speaker,
        text,
        created_at: new Date().toISOString(),
        source: "text",
      }),
    });
    log(`POST /v1/sessions/:id/turns (${speaker}) -> ${turn.status} seq=${turn.body.seq}`,
      turn.status === 201 ? "ok" : "bad");
  }

  // 3. put + get report
  const put = await api(`/sessions/${sid}/report`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reportBody(sid)),
  });
  log(`PUT /v1/sessions/:id/report -> ${put.status}`, put.status === 200 ? "ok" : "bad");
  const got = await api(`/sessions/${sid}/report`);
  log(`GET /v1/sessions/:id/report -> ${got.status} overall=${got.body.overall_score}`,
    got.status === 200 ? "ok" : "bad");

  // 4. tools round-trip
  const putTools = await api(`/sessions/${sid}/tools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ editor: "fn main() {}", whiteboard: "" }),
  });
  const gotTools = await api(`/sessions/${sid}/tools`);
  log(`tools round-trip -> ${putTools.status}/${gotTools.status} editor=${JSON.stringify(gotTools.body.editor)}`,
    gotTools.body.editor === "fn main() {}" ? "ok" : "bad");

  log("reload the page and run again to verify persistence (session list should include this id).");
}

async function checkPersistence(): Promise<void> {
  out.textContent = "";
  const sid = localStorage.getItem(SESSION_KEY);
  if (!sid) return log("no stored session id; run the round-trip first", "bad");
  const got = await api(`/sessions/${sid}`);
  log(`GET /v1/sessions/${sid} after reload -> ${got.status} title=${JSON.stringify(got.body.title)}`,
    got.status === 200 ? "ok" : "bad");
  const turns = await api(`/sessions/${sid}/turns`);
  log(`GET turns -> ${turns.status} count=${Array.isArray(turns.body) ? turns.body.length : "?"}`,
    turns.status === 200 ? "ok" : "bad");
  const rep = await api(`/sessions/${sid}/report`);
  log(`GET report after reload -> ${rep.status}`,
    rep.status === 200 ? "ok" : "bad");
}

document.getElementById("run")!.addEventListener("click", () => void runRoundTrip().catch((e) => log(`error: ${e}`, "bad")));
document.getElementById("reload")!.addEventListener("click", () => location.reload());
void registerSw().then(checkPersistence).catch((e) => {
  swState.textContent = "sw: failed";
  log(`sw registration error: ${e}`, "bad");
});
