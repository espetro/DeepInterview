import { describe, expect, it } from "vitest";
import { formatCountdown, parseTimerPayload } from "../lib/timer";

describe("parseTimerPayload", () => {
  it("accepts a well-formed payload", () => {
    expect(
      parseTimerPayload({ remaining_sec: 300, elapsed_sec: 60, total_sec: 360 }),
    ).toEqual({ remaining_sec: 300, elapsed_sec: 60, total_sec: 360 });
  });

  it("rejects malformed and non-object payloads", () => {
    expect(parseTimerPayload(null)).toBeNull();
    expect(parseTimerPayload("timer")).toBeNull();
    expect(parseTimerPayload([1, 2, 3])).toBeNull();
    expect(parseTimerPayload({ remaining_sec: "5" })).toBeNull();
    expect(parseTimerPayload({ remaining_sec: 1, elapsed_sec: 2 })).toBeNull();
    expect(
      parseTimerPayload({ remaining_sec: NaN, elapsed_sec: 0, total_sec: 1 }),
    ).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("formats mm:ss", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(600)).toBe("10:00");
  });

  it("formats h:mm:ss past an hour", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(3723)).toBe("1:02:03");
  });

  it("clamps negative time at zero", () => {
    expect(formatCountdown(-5)).toBe("00:00");
  });
});
