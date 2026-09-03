import { Agent, tool } from "@livekit/agents";
import { z } from "zod";
import type { WorkerConfig } from "./config.ts";
import { DiApiClient } from "./session.ts";
import { buildPrompt, type SessionContext, type UpdateQuestionArgs } from "./prompt.ts";

export interface DiAgentDeps {
  sessionId: string;
  api: DiApiClient;
  ctx: SessionContext;
}

/**
 * Interview agent: LLM is injected by the session factory (provider-selected);
 * exposes update_question to rewrite the current question shown to the
 * candidate, logging a question.updated event to the di server.
 */
export class InterviewAgent extends Agent {
  constructor(config: WorkerConfig, deps: DiAgentDeps) {
    const updateQuestion = tool({
      name: "update_question",
      description:
        "Rewrite or replace the current interview question and the evaluation hints shown to the candidate. Call whenever the interview focus moves to a new question.",
      parameters: z.object({
        question: z.string().describe("The new current question text"),
        hints: z.array(z.string()).optional().describe("Evaluation hints for the new question"),
      }),
      execute: async (args: UpdateQuestionArgs) => {
        deps.ctx.currentQuestion = args.question;
        if (args.hints) deps.ctx.hints = args.hints;
        await deps.api.postEvent(deps.sessionId, "question.updated", {
          question: args.question,
          hints: args.hints ?? [],
        });
        return { ok: true, question: args.question };
      },
    });

    super({
      instructions: buildPrompt(deps.ctx),
      tools: [updateQuestion],
    });
    void config;
  }
}
