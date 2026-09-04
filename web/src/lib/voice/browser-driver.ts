import type { Turn } from "@di/shared/session";
import { postTextTurn } from "../api";
import type { SpeechDriver } from "./server-driver";

/**
 * Browser driver: Web Speech API fallback for browsers/hosts without the
 * voice WS endpoint (e.g. static deploys). Chrome-only in practice:
 * SpeechRecognition (continuous+interim) is Chromium; speechSynthesis is
 * wider but voices vary. There is no server LLM loop here: candidate speech
 * is recognized and posted as a text-source turn via REST, and the route
 * calls speakAgentTurn() when its turns polling sees a new agent turn, so
 * transcripts/reports stay identical to the server driver.
 */

/** structural type for SpeechRecognition (not in TS DOM lib) */
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
type RecognitionCtor = new () => RecognitionLike;

export class BrowserVoiceDriver implements SpeechDriver {
  status: SpeechDriver["status"] = "idle";
  agentSpeaking = false;
  onError: (message: string) => void = () => undefined;
  events: SpeechDriver["events"] = {};  private recognition: RecognitionLike | null = null;
  private muted = false;
  private restarting = false;

  constructor(private readonly sessionId: string) {}

  async start(): Promise<void> {
    const w = globalThis as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor || !("speechSynthesis" in globalThis)) {
      this.status = "error";
      this.onError("speech recognition not supported in this browser");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language ?? "en-US";
    rec.onresult = (ev) => this.handleResult(ev);
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        this.status = "error";
        this.onError("microphone permission denied");
      }
    };
    // continuous mode ends on silence in some builds; restart while active
    rec.onend = () => {
      if (this.status === "connected" && !this.restarting) {
        this.restarting = true;
        setTimeout(() => {
          this.restarting = false;
          try {
            rec.start();
          } catch {
            // already started
          }
        }, 200);
      }
    };
    this.recognition = rec;
    this.status = "connected";
    rec.start();
  }

  private handleResult(ev: SpeechRecognitionEventLike) {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (!result || !result.isFinal) continue;
      const text = result[0].transcript.trim();
      if (!text || this.muted) continue;
      this.events.onSpeechStart?.();
      postTextTurn(this.sessionId, text)
        .then((turn) => {
          this.events.onUserTurn?.(turn as unknown as Turn);
          this.events.onSpeechEnd?.(text);
        })
        .catch((err: unknown) => this.onError(String(err)));
    }
  }

  /** Called by the route when turns polling sees a new agent turn. */
  speakAgentTurn(text: string) {
    if (this.muted || !("speechSynthesis" in globalThis)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.onstart = () => {
      this.agentSpeaking = true;
      this.events.onAgentStart?.();
    };
    utter.onend = () => {
      this.agentSpeaking = false;
      this.events.onAgentDone?.();
    };
    this.agentSpeaking = true;
    this.events.onAgentStart?.();
    globalThis.speechSynthesis.speak(utter);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) globalThis.speechSynthesis?.cancel();
  }

  async stop(): Promise<void> {
    this.recognition?.stop();
    this.recognition = null;
    globalThis.speechSynthesis?.cancel();
    this.status = "idle";
    this.agentSpeaking = false;
  }
}
