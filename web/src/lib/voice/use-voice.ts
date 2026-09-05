import * as React from "react";
import { createActor } from "xstate";
import { BrowserVoiceDriver } from "./browser-driver";
import { createDriver } from "./index";
import { voiceMachine } from "./machine";
import type { SpeechDriver } from "./server-driver";

/** Shape-compatible with the old VoiceRoom hook so the header UI keeps working. */
export interface VoiceState {
  status: "idle" | "connecting" | "connected" | "error";
  agentSpeaking: boolean;
  error: string | null;
  /** machine state for the status label: listening/thinking/speaking/… */
  phase: string;
  muted: boolean;
  /** browser-driver only: read a new agent turn aloud (no-op for server driver) */
  speakAgentTurn(text: string): void;
}

interface VoiceCoreState {
  status: VoiceState["status"];
  agentSpeaking: boolean;
  error: string | null;
  phase: string;
  muted: boolean;
}

/**
 * Voice loop hook: driver (server WS or browser Web Speech) + xstate turn
 * machine. Mute is applied via driver.setMuted and $muted stays the source
 * of truth in the route. StrictMode-safe via the cancelled flag.
 */
export function useVoice(sessionId: string, muted: boolean): VoiceState {
  const [state, setState] = React.useState<VoiceCoreState>({
    status: "idle",
    agentSpeaking: false,
    error: null,
    phase: "idle",
    muted,
  });
  const driverRef = React.useRef<SpeechDriver | null>(null);
  const actorRef = React.useRef<ReturnType<
    typeof createActor<typeof voiceMachine>
  > | null>(null);
  const speak = React.useCallback((text: string) => {
    const d = driverRef.current;
    if (d instanceof BrowserVoiceDriver) d.speakAgentTurn(text);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setState({
      status: "connecting",
      agentSpeaking: false,
      error: null,
      phase: "connecting",
      muted: false,
    });

    const actor = createActor(voiceMachine);
    actorRef.current = actor;

    async function boot() {
      let driver: SpeechDriver;
      try {
        driver = await createDriver(sessionId);
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, status: "error", error: String(err) }));
        }
        return;
      }
      if (cancelled) return void driver.stop();
      driverRef.current = driver;

      driver.onError = (message: string) => {
        actor.send({ type: "ERROR", message });
        if (!cancelled)
          setState((s) => ({ ...s, status: "error", error: message }));
      };
      driver.events.onSpeechStart = () => actor.send({ type: "SPEECH_START" });
      driver.events.onSpeechEnd = (text) =>
        actor.send({ type: "SPEECH_END", text });
      driver.events.onUserTurn = () => undefined; // transcript display via turns polling
      driver.events.onAgentTurn = () => undefined;
      driver.events.onAgentStart = () => actor.send({ type: "AGENT_START" });
      driver.events.onAgentDone = () => actor.send({ type: "AGENT_DONE" });

      actor.subscribe((snap) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          phase: String(snap.value),
          agentSpeaking:
            snap.value === "agent_speaking"
              ? true
              : snap.value === "listening"
                ? false
                : s.agentSpeaking,
        }));
      });
      actor.start();

      try {
        actor.send({ type: "CONNECT" });
        await driver.start();
        if (cancelled) return void driver.stop();
        actor.send({ type: "CONNECTED" });
        if (!cancelled) setState((s) => ({ ...s, status: "connected" }));
      } catch (err) {
        actor.send({ type: "CONNECT_FAILED" });
        if (!cancelled) {
          setState((s) => ({
            ...s,
            status: "error",
            error: err instanceof Error ? err.message : "voice start failed",
          }));
        }
      }
    }
    void boot();

    return () => {
      cancelled = true;
      actor.stop();
      actorRef.current = null;
      void driverRef.current?.stop();
      driverRef.current = null;
    };
    // sessionId fixed per mount; muted handled by the follow-up effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  React.useEffect(() => {
    driverRef.current?.setMuted(muted);
    setState((s) => ({ ...s, muted }));
  }, [muted]);

  return { ...state, speakAgentTurn: speak };
}
