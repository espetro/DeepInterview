import * as v from "valibot";

export const CompetencyScoreSchema = v.object({
  name: v.string(),
  score: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
  evidence: v.array(
    v.object({
      quote: v.string(),
      turn_seq: v.pipe(v.number(), v.integer(), v.minValue(0)),
      verdict: v.picklist(["worked", "improve", "drop"]),
    }),
  ),
});
export type CompetencyScore = v.InferOutput<typeof CompetencyScoreSchema>;

export const ModelAnswerSchema = v.object({
  question_id: v.pipe(v.string(), v.uuid()),
  question_text: v.string(),
  answer: v.string(),
});
export type ModelAnswer = v.InferOutput<typeof ModelAnswerSchema>;

/** Port of the legacy ScoreCard shape minus LanguageReport and next_steps. */
export const ReportSchema = v.object({
  session_id: v.pipe(v.string(), v.uuid()),
  overall_score: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
  coverage_pct: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  competencies: v.array(CompetencyScoreSchema),
  model_answers: v.array(ModelAnswerSchema),
  /** ISO 8601 */
  generated_at: v.pipe(v.string(), v.isoTimestamp()),
});
export type Report = v.InferOutput<typeof ReportSchema>;
