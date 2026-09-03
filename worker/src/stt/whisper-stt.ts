import {
  stt,
  asLanguageCode,
  type VAD,
} from "@livekit/agents";
import type { AudioBuffer } from "@livekit/agents";
import { WavBuffer } from "./wav.ts";

export interface WhisperSttOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  language?: string;
  fetchImpl?: typeof fetch;
}

/** The VAD-segmenting wrapper type produced by whisperStreamAdapter. */
export type WhisperStreamAdapter = stt.StreamAdapter;

/**
 * Buffered STT that POSTs a WAV to an OpenAI-compatible
 * /v1/audio/transcriptions endpoint (field `file`, model from config).
 *
 * `recognize()` receives VAD-collected audio (via StreamAdapter), encodes it as
 * WAV, and posts the multipart request. Non-streaming by design (v1 mode).
 */
export class WhisperStt extends stt.STT {
  readonly label = "di_whisper_stt";
  private opts: WhisperSttOptions;

  constructor(opts: WhisperSttOptions) {
    super({ streaming: false, interimResults: false });
    this.opts = opts;
  }

  get model(): string {
    return this.opts.model;
  }

  get provider(): string {
    return "di.whisper";
  }

  protected async _recognize(frame: AudioBuffer, abortSignal?: AbortSignal) {
    const frames = Array.isArray(frame) ? frame : [frame];
    if (frames.length === 0) {
      return emptyEvent(this.opts.language ?? "en");
    }
    const first = frames[0]!;
    const wav = new WavBuffer(first.sampleRate, first.channels);
    for (const f of frames) {
      wav.pushFrame({ data: f.data, sampleRate: f.sampleRate, numChannels: f.channels });
    }
    const text = await this.transcribeWav(wav.toWav(), abortSignal);
    if (text.trim() === "") {
      return emptyEvent(this.opts.language ?? "en");
    }
    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      alternatives: [
        {
          language: asLanguageCode(this.opts.language ?? "en"),
          text,
          startTime: 0,
          endTime: 0,
          confidence: 1,
        },
      ],
    } satisfies stt.SpeechEvent;
  }

  /** POST the WAV to the transcriptions endpoint, return the text. */
  async transcribeWav(wav: Buffer, abortSignal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    form.append("model", this.opts.model);
    if (this.opts.language) {
      form.append("language", this.opts.language);
    }
    const headers: Record<string, string> = {};
    if (this.opts.apiKey) {
      headers.authorization = `Bearer ${this.opts.apiKey}`;
    }
    const res = await (this.opts.fetchImpl ?? fetch)(
      `${this.opts.baseUrl.replace(/\/+$/, "")}/v1/audio/transcriptions`,
      { method: "POST", headers, body: form, signal: abortSignal },
    );
    if (!res.ok) {
      throw new Error(`whisper stt failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const json = (await res.json()) as { text?: string };
    return json.text ?? "";
  }

  stream(): stt.SpeechStream {
    // Integration point: StreamAdapter must be constructed with a VAD. The
    // worker entry wires this via whisperStreamAdapter(vad) so the same STT
    // instance is wrapped once VAD is loaded.
    throw new Error("use whisperStreamAdapter(stt, vad) instead of calling stream() directly");
  }
}

function emptyEvent(language: string): stt.SpeechEvent {
  const lang = asLanguageCode(language);
  return {
    type: stt.SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [
      { language: lang, text: "", startTime: 0, endTime: 0, confidence: 0 },
    ],
  };
}

/** Wrap the buffered STT with VAD-based segmentation (agents-js StreamAdapter). */
export function whisperStreamAdapter(sttImpl: WhisperStt, vad: VAD): stt.StreamAdapter {
  return new stt.StreamAdapter(sttImpl, vad);
}
