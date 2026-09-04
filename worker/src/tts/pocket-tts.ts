import {
  AudioByteStream,
  shortuuid,
  tts,
  type APIConnectOptions,
} from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import type { DiApiClient } from "../session.ts";

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;

export interface PocketTtsOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  voice: string;
  fetchImpl?: typeof fetch;
  /** When set, emit tts.request/tts.result pipeline events. */
  api?: DiApiClient;
  sessionId?: string;
}

/**
 * Buffered TTS that POSTs {input, voice, model, response_format:"mp3"} JSON to
 * an OpenAI-compatible /v1/audio/speech endpoint and streams the returned
 * audio back as frames. Non-streaming provider: `synthesize` fetches the whole
 * MP3 then chunks it into frames; `stream` issues one request per flushed
 * text segment.
 */
export class PocketTts extends tts.TTS {
  readonly label = "di_pocket_tts";

  constructor(private opts: PocketTtsOptions) {
    super(SAMPLE_RATE, CHANNELS, { streaming: false });
    this.opts = opts;
  }

  get model(): string {
    return this.opts.model;
  }

  get provider(): string {
    return "di.pocket";
  }

  synthesize(text: string, _connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new PocketChunkedStream(this, text, this.opts, abortSignal);
  }

  stream(): tts.SynthesizeStream {
    return new PocketSynthesizeStream(this, this.opts);
  }
}

async function fetchSpeech(
  opts: PocketTtsOptions,
  input: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey) {
    headers.authorization = `Bearer ${opts.apiKey}`;
  }
  const { api, sessionId } = opts;
  api
    ?.postEvent(sessionId!, "tts.request", { text_length: input.length })
    .catch((err) => console.warn(`[worker] failed to log tts.request: ${err}`));
  const startedAt = Date.now();
  const res = await (opts.fetchImpl ?? fetch)(
    `${opts.baseUrl.replace(/\/+$/, "")}/v1/audio/speech`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        input,
        voice: opts.voice,
        model: opts.model,
        response_format: "mp3",
      }),
      signal,
    },
  );
  const latency_ms = Date.now() - startedAt;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    api
      ?.postEvent(sessionId!, "tts.failed", { status: res.status, body, latency_ms })
      .catch((err) => console.warn(`[worker] failed to log tts.failed: ${err}`));
    throw new Error(`pocket tts failed: ${res.status} ${body}`);
  }
  const buffer = await res.arrayBuffer();
  api
    ?.postEvent(sessionId!, "tts.result", { bytes: buffer.byteLength, latency_ms })
    .catch((err) => console.warn(`[worker] failed to log tts.result: ${err}`));
  return buffer;
}


/** ChunkedStream that fetches the full mp3 then drains it frame by frame. */
class PocketChunkedStream extends tts.ChunkedStream {
  readonly label = "di_pocket_tts_chunked";

  constructor(
    ttsInst: tts.TTS,
    text: string,
    private opts: PocketTtsOptions,
    abortSignal?: AbortSignal,
  ) {
    super(text, ttsInst, undefined, abortSignal);
    this.opts = opts;
  }

  protected async run(): Promise<void> {
    try {
      const buffer = await fetchSpeech(this.opts, this.inputText, this.abortSignal);
      const requestId = shortuuid();
      const segmentId = shortuuid();
      const byteStream = new AudioByteStream(SAMPLE_RATE, CHANNELS);
      const frames = byteStream.write(buffer);
      let lastFrame: AudioFrame | undefined;
      const sendLast = (final: boolean) => {
        if (lastFrame) {
          this.queue.put({ requestId, segmentId, frame: lastFrame, final });
          lastFrame = undefined;
        }
      };
      for (const frame of frames) {
        sendLast(false);
        lastFrame = frame;
      }
      sendLast(true);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      throw error;
    } finally {
      this.queue.close();
    }
  }
}

/** SynthesizeStream that issues one buffered request per flushed text segment. */
class PocketSynthesizeStream extends tts.SynthesizeStream {
  readonly label = "di_pocket_tts_stream";
  private current = "";

  constructor(ttsInst: tts.TTS, private opts: PocketTtsOptions) {
    super(ttsInst);
    this.opts = opts;
  }

  protected async run(): Promise<void> {
    try {
      for await (const input of this.input) {
        if (input === tts.SynthesizeStream.FLUSH_SENTINEL) {
          if (this.current.trim() === "") continue;
          const buffer = await fetchSpeech(this.opts, this.current, this.abortSignal);
          const requestId = shortuuid();
          const segmentId = shortuuid();
          const byteStream = new AudioByteStream(SAMPLE_RATE, CHANNELS);
          const frames = byteStream.write(buffer);
          for (const frame of frames) {
            this.queue.put({ requestId, segmentId, frame, final: false });
          }
          this.current = "";
        } else {
          this.current += input;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      throw error;
    } finally {
      this.queue.close();
    }
  }
}
