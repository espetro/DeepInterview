/**
 * WAV encoding helpers for buffered STT.
 *
 * Audio arrives from LiveKit as 16-bit linear PCM frames. The OpenAI-compatible
 * /v1/audio/transcriptions endpoint accepts multipart uploads, so we accumulate
 * frames and wrap the concatenated PCM in a minimal RIFF/WAVE container.
 */

export interface WavOptions {
  sampleRate: number;
  channels: number;
  bitsPerSample?: number;
}

/** Build a 44-byte canonical PCM WAV header. */
export function wavHeader(dataLength: number, opts: WavOptions): Buffer {
  const { sampleRate, channels, bitsPerSample = 16 } = opts;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/** Concatenate Int16 PCM chunks into one WAV file buffer. */
export function encodeWav(pcmChunks: Uint8Array[], opts: WavOptions): Buffer {
  const data = Buffer.concat(pcmChunks);
  return Buffer.concat([wavHeader(data.length, opts), data]);
}

export interface AudioFrameLike {
  data: Int16Array;
  sampleRate: number;
  numChannels: number;
}

/** Collect frames into PCM chunks, converting interleaved frame data. */
export class WavBuffer {
  readonly sampleRate: number;
  readonly numChannels: number;
  private chunks: Uint8Array[] = [];

  constructor(sampleRate: number, numChannels = 1) {
    this.sampleRate = sampleRate;
    this.numChannels = numChannels;
  }

  pushFrame(frame: AudioFrameLike): void {
    this.chunks.push(
      frame.data.buffer instanceof ArrayBuffer
        ? new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
        : new Uint8Array(frame.data.slice().buffer),
    );
  }

  get byteLength(): number {
    return this.chunks.reduce((sum, c) => sum + c.byteLength, 0);
  }

  isEmpty(): boolean {
    return this.byteLength === 0;
  }

  /** Finalize: return the complete WAV buffer. */
  toWav(): Buffer {
    return encodeWav(this.chunks, {
      sampleRate: this.sampleRate,
      channels: this.numChannels,
    });
  }
}
