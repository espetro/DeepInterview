import { describe, expect, it } from "vitest";
import { describeWhiteboardSnapshot } from "./whiteboard.ts";
import type { WhiteboardSnapshot } from "./whiteboard-types.ts";

function snap(shapes: WhiteboardSnapshot["shapes"], shapeCount = shapes.length): string {
  return JSON.stringify({ at: Date.now(), shapeCount, shapes });
}

describe("describeWhiteboardSnapshot", () => {
  it("renders shape count, types, text and arrow endpoints", () => {
    const text = describeWhiteboardSnapshot(
      snap([
        { id: "s1", type: "text", text: "two-pointer" },
        { id: "a1", type: "arrow", from: "s1", to: "s2" },
        { id: "s2", type: "rectangle" },
      ]),
    );
    expect(text).toContain("whiteboard: 3 shape(s)");
    expect(text).toContain('- text text="two-pointer"');
    expect(text).toContain("- arrow from s1 to s2");
    expect(text).toContain("- rectangle");
  });

  it("handles empty and unparseable snapshots", () => {
    expect(describeWhiteboardSnapshot(JSON.stringify({ at: 1, shapeCount: 0, shapes: [] }))).toContain(
      "empty whiteboard",
    );
    expect(describeWhiteboardSnapshot("not json{")).toContain("unparseable");
  });
});
