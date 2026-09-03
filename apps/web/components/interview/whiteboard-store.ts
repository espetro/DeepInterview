/**
 * Whiteboard snapshot serialization (v1).
 *
 * The tldraw store keeps far more than the interviewer ever needs (camera,
 * opacity, handles, isDebugging...). We prune a full {@link getSnapshot}
 * document down to the shapes an agent could reason about: id, type, text-ish
 * props and arrow endpoints. Everything else is dropped so the published
 * snapshot stays comfortably under the 8KB budget; a hard cap truncates the
 * JSON anyway rather than ever bloating the data channel.
 *
 * Pure functions only — the React/publishing wiring lives in
 * whiteboard-panel.tsx, so this file is unit-testable in plain vitest/node.
 */

/** Wire format the agent's `read_whiteboard` tool renders to text. */
export interface WhiteboardSnapshot {
  /** Epoch ms when the snapshot was taken. */
  at: number;
  shapeCount: number;
  shapes: WhiteboardShape[];
}

export interface WhiteboardShape {
  id: string;
  type: string;
  /** Text label/content, when the shape carries any. */
  text?: string;
  /** For arrows: the ids the arrow points from / to, when bound. */
  from?: string;
  to?: string;
}

/** Hard ceiling on the published JSON; shapes are dropped tail-first past it. */
const MAX_JSON_BYTES = 8 * 1024;

interface RawShape {
  id?: unknown;
  type?: unknown;
  props?: Record<string, unknown> | undefined;
  /** tldraw arrow bindings, resolved at prune time. */
  index?: unknown;
}

interface RawBinding {
  fromId?: unknown;
  toId?: unknown;
  advertisedTerminal?: unknown;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** True for props keys the agent could actually read as content. */
function isTextProp(key: string): boolean {
  return key === "text" || key === "rich_text" || key === "labelText" || key === "rawText";
}

/**
 * Prune a tldraw `getSnapshot()` document to the essential wire format.
 * Accepts the shape of `{ document: { store: Record<string, unknown> } }`
 * structurally, so tests don't need tldraw installed.
 */
export function pruneSnapshot(document: unknown, now = Date.now()): WhiteboardSnapshot {
  const store =
    document && typeof document === "object" && "store" in (document as Record<string, unknown>)
      ? ((document as Record<string, unknown>).store as Record<string, unknown>)
      : undefined;

  const bindings: Record<string, { from?: string; to?: string }> = {};
  const shapes: WhiteboardShape[] = [];

  for (const record of Object.values(store ?? {})) {
    if (!record || typeof record !== "object") continue;
    const r = record as Record<string, unknown>;
    const typeName = asString(r.typeName);
    if (typeName === "binding") {
      const b = record as unknown as RawBinding;
      const from = asString(b.fromId);
      const to = asString(b.toId);
      const terminal = asString(b.advertisedTerminal);
      if (!from || !to) continue;
      const entry = (bindings[from] ??= {});
      if (terminal === "start") entry.from = to;
      else if (terminal === "end") entry.to = to;
      else {
        // Unknown terminal: keep both sides discoverable without guessing.
        entry.from ??= to;
      }
    } else if (typeName === "shape") {
      const s = record as unknown as RawShape;
      const id = asString(s.id);
      const type = asString(s.type);
      if (!id || !type) continue;
      const shape: WhiteboardShape = { id, type };
      const props = s.props;
      if (props && typeof props === "object") {
        for (const [key, value] of Object.entries(props)) {
          if (!isTextProp(key)) continue;
          const text = asString(value);
          if (text) {
            shape.text = text;
            break;
          }
        }
      }
      shapes.push(shape);
    }
  }

  // Attach arrow endpoints now that all bindings are known.
  for (const shape of shapes) {
    const bound = bindings[shape.id];
    if (!bound) continue;
    if (bound.from) shape.from = bound.from;
    if (bound.to) shape.to = bound.to;
  }

  // Keep the first (bottom-of-canvas / creation-order) shapes, drop the tail.
  const capped = shapes.slice(0, 200);
  return { at: now, shapeCount: shapes.length, shapes: capped };
}

/** Serialize to compact JSON, truncating shapes until it fits the byte budget. */
export function serializeSnapshot(snapshot: WhiteboardSnapshot): string {
  let json = JSON.stringify({ ...snapshot, shapes: snapshot.shapes });
  if (Buffer.byteLength(json, "utf8") <= MAX_JSON_BYTES) return json;
  let shapes = snapshot.shapes;
  while (shapes.length > 0) {
    shapes = shapes.slice(0, Math.floor(shapes.length / 2));
    json = JSON.stringify({
      at: snapshot.at,
      shapeCount: snapshot.shapeCount,
      truncated: true,
      shapes,
    });
    if (Buffer.byteLength(json, "utf8") <= MAX_JSON_BYTES) return json;
  }
  // Nothing left to keep — emit the count alone so the agent still knows
  // content existed, just not its text.
  return JSON.stringify({
    at: snapshot.at,
    shapeCount: snapshot.shapeCount,
    truncated: true,
    shapes: [],
  });
}
