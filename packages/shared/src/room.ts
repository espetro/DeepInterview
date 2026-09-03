import { z } from "zod";

export const TokenRequestSchema = z.object({
  session_id: z.string(),
  identity: z.string(),
  name: z.string().nullable().default(null),
});
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

export const TokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  room: z.string(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const RoomMetadataSchema = z.object({
  session_id: z.string(),
  /**
   * Requested interview length in minutes. Optional: the agent falls back to
   * its default (max_interview_duration_sec) when absent, and clamps the
   * effective value to [20, 45] minutes.
   */
  duration_min: z.number().int().nullable().default(null),
  /** Interview difficulty level (easy/medium/hard). Null when unset. */
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().default(null),
  /** Preferred TTS voice id. Null when the worker should pick the default. */
  voice: z.string().nullable().default(null),
});
export type RoomMetadata = z.infer<typeof RoomMetadataSchema>;
