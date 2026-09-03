import { describe, expect, it } from "vitest";
import {
  pruneSnapshot,
  serializeSnapshot,
  type WhiteboardSnapshot,
} from "../components/interview/whiteboard-store";

function doc(records: Record<string, unknown>) {
  return { store: records };
}

describe("pruneSnapshot", () => {
  it("returns an empty snapshot for empty/garbage input", () => {
    expect(pruneSnapshot(undefined)).toEqual({ at: expect.any(Number), shapeCount: 0, shapes: [] });
    expect(pruneSnapshot(doc({}))).toMatchObject({ shapeCount: 0, shapes: [] });
  });

  it("keeps only id/type/text essentials from shapes", () => {
    const snap = pruneSnapshot(
      doc({
        shapeA1: { typeName: "shape", id: "shape:A1", type: "text", props: { text: "  hello ", opacity: 1 } },
        inst1: { typeName: "instance", id: "inst:1", type: "instance" },
      }),
    );
    expect(snap.shapeCount).toBe(1);
    expect(snap.shapes[0]).toEqual({ id: "shape:A1", type: "text", text: "hello" });
  });

  it("skips blank text", () => {
    const snap = pruneSnapshot(
      doc({ s: { typeName: "shape", id: "s", type: "geo", props: { text: "   " } } }),
    );
    expect(snap.shapes[0]?.text).toBeUndefined();
  });

  it("resolves arrow bindings into from/to", () => {
    const snap = pruneSnapshot(
      doc({
        a: { typeName: "shape", id: "shape:a", type: "arrow", props: { labelText: "then" } },
        b: { typeName: "shape", id: "shape:b", type: "geo", props: { text: "Step 1" } },
        c: { typeName: "shape", id: "shape:c", type: "geo", props: { text: "Step 2" } },
        bind1: {
          typeName: "binding",
          fromId: "shape:a",
          toId: "shape:b",
          advertisedTerminal: "start",
        },
        bind2: {
          typeName: "binding",
          fromId: "shape:a",
          toId: "shape:c",
          advertisedTerminal: "end",
        },
      }),
    );
    const arrow = snap.shapes.find((s) => s.type === "arrow");
    expect(arrow).toMatchObject({ from: "shape:b", to: "shape:c", text: "then" });
  });

  it("caps the shape list at 200 while reporting the true count", () => {
    const store: Record<string, unknown> = {};
    for (let i = 0; i < 250; i++) {
      store[`s${i}`] = { typeName: "shape", id: `shape:s${i}`, type: "geo" };
    }
    const snap = pruneSnapshot(doc(store));
    expect(snap.shapeCount).toBe(250);
    expect(snap.shapes.length).toBe(200);
  });
});

describe("serializeSnapshot", () => {
  it("emits compact JSON under the byte budget for reasonable boards", () => {
    const snap: WhiteboardSnapshot = {
      at: 1_700_000_000_000,
      shapeCount: 3,
      shapes: [
        { id: "shape:a", type: "text", text: "hello" },
        { id: "shape:b", type: "geo", text: "Step 1" },
        { id: "shape:c", type: "arrow", from: "shape:b", to: "shape:d" },
      ],
    };
    const json = serializeSnapshot(snap);
    expect(json.length).toBeLessThan(8 * 1024);
    expect(JSON.parse(json)).toMatchObject({ shapeCount: 3 });
  });

  it("halves shapes (marking truncated) until the JSON fits 8KB", () => {
    const shapes = Array.from({ length: 2000 }, (_, i) => ({
      id: `shape:s${i}`,
      type: "geo",
      text: `x`.repeat(64),
    }));
    const json = serializeSnapshot({ at: 0, shapeCount: 2000, shapes });
    expect(Buffer.byteLength(json, "utf8")).toBeLessThanOrEqual(8 * 1024);
    const parsed = JSON.parse(json) as { truncated?: boolean; shapes: unknown[] };
    expect(parsed.truncated).toBe(true);
    expect(parsed.shapes.length).toBeLessThan(2000);
  });
});
