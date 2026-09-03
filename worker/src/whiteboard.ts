import type { WhiteboardShape, WhiteboardSnapshot } from "./whiteboard-types.ts";

/**
 * Compact LLM-facing text rendering of a whiteboard snapshot. Shape counts,
 * text content and arrow endpoints instead of raw JSON.
 */
export function describeWhiteboardSnapshot(json: string): string {
  let snap: WhiteboardSnapshot;
  try {
    snap = JSON.parse(json) as WhiteboardSnapshot;
  } catch {
    return "(unparseable whiteboard snapshot)";
  }
  const shapes = Array.isArray(snap.shapes) ? snap.shapes : [];
  if (shapes.length === 0) return "(empty whiteboard)";
  const lines = [`whiteboard: ${shapes.length} shape(s)`];
  for (const s of shapes) lines.push(describeShape(s));
  return lines.join("\n");
}

function describeShape(s: WhiteboardShape): string {
  const type = typeof s.type === "string" ? s.type : "unknown";
  const text = typeof s.text === "string" && s.text.trim() !== "" ? ` text="${s.text}"` : "";
  const arrow =
    typeof s.from === "string" || typeof s.to === "string"
      ? ` from ${s.from ?? "?"} to ${s.to ?? "?"}`
      : "";
  return `- ${type}${text}${arrow}`;
}
