/**
 * Timer payload shared between the agent's "timer" data-channel topic and the
 * web timer chip. Pure helpers, unit-tested in test/timer.test.ts.
 */

export interface TimerPayload {
  remaining_sec: number;
  elapsed_sec: number;
  total_sec: number;
}

/** Parse an agent "timer" topic message; null when malformed. */
export function parseTimerPayload(data: unknown): TimerPayload | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const d = data as Record<string, unknown>;
  const remaining = d.remaining_sec;
  const elapsed = d.elapsed_sec;
  const total = d.total_sec;
  if (
    typeof remaining !== "number" ||
    typeof elapsed !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(elapsed) ||
    !Number.isFinite(total)
  ) {
    return null;
  }
  return { remaining_sec: remaining, elapsed_sec: elapsed, total_sec: total };
}

/**
 * Format seconds as a countdown chip label: "12:34" or "1:02:03" past an hour.
 * Clamps at zero so a late tick never shows negative time.
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
