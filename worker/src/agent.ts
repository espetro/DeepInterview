import { Agent, tool } from "@livekit/agents";
import { z } from "zod";
import type { WorkerConfig } from "./config.ts";
import { DiApiClient } from "./session.ts";
import { buildPrompt, type SessionContext, type UpdateQuestionArgs } from "./prompt.ts";
import { describeWhiteboardSnapshot } from "./whiteboard.ts";

export interface DiAgentDeps {
  sessionId: string;
  api: DiApiClient;
  ctx: SessionContext;
}

const MAX_TOOL_OUTPUT = 4000;

function truncate(text: string, max = MAX_TOOL_OUTPUT): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated]`;
}

/**
 * Interview agent: LLM is injected by the session factory (provider-selected);
 * exposes update_question to rewrite the current question shown to the
 * candidate, and read_editor / read_whiteboard to inspect the candidate's
 * shared browser state (pushed to the di server by the web client).
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

    const readEditor = tool({
      name: "read_editor",
      description:
        "Read the candidate's current code editor contents from their shared browser workspace. Call when you need to review what they wrote.",
      parameters: z.object({}),
      execute: async () => {
        const state = await deps.api.getToolState(deps.sessionId);
        await deps.api.postEvent(deps.sessionId, "tool.read_editor", {
          length: state.editor.length,
        });
        return { text: truncate(state.editor) };
      },
    });

    const readWhiteboard = tool({
      name: "read_whiteboard",
      description:
        "Read the candidate's shared whiteboard (drawn shapes and their text/connections). Call when you need to see what they sketched.",
      parameters: z.object({}),
      execute: async () => {
        const state = await deps.api.getToolState(deps.sessionId);
        await deps.api.postEvent(deps.sessionId, "tool.read_whiteboard", {
          length: state.whiteboard.length,
        });
        return { text: truncate(describeWhiteboardSnapshot(state.whiteboard)) };
      },
    });

    super({
      instructions: buildPrompt(deps.ctx),
      tools: [updateQuestion, readEditor, readWhiteboard],
    });
    void config;
  }
}
