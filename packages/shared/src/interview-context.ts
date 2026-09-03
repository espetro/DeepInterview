import { z } from "zod";
import { AnswerRecordSchema } from "./answer";
import { CandidateProfileSchema } from "./candidate";
import { CompanyIntelSchema } from "./company";
import { GapAnalysisSchema } from "./gap";
import { JobSpecSchema } from "./job";
import { QuestionPlanSchema } from "./question";
import { ScoreCardSchema } from "./score";

export const InterviewContextSchema = z.object({
  session_id: z.string(),
  candidate: CandidateProfileSchema,
  job: JobSpecSchema,
  company: CompanyIntelSchema,
  gap: GapAnalysisSchema,
  plan: QuestionPlanSchema,
  cursor: z.number().int().default(0),
  answers: z.array(AnswerRecordSchema).default([]),
  scorecard: ScoreCardSchema.nullable().default(null),
  /** Interview difficulty level requested at prep (easy/medium/hard). Null for sessions created before the field existed. */
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().default(null),
  /** Preferred TTS voice id. Null -> the worker picks the language default. */
  voice: z.string().nullable().default(null),
  /** Requested interview length in minutes (5-60). Null -> worker default. */
  duration_min: z.number().int().nullable().default(null),
});
export type InterviewContext = z.infer<typeof InterviewContextSchema>;
