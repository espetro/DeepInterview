// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const listeners: Record<string, (...args: any[]) => void> = {};
const disconnect = vi.fn();
const connect = vi.fn(async () => {});
const setMic = vi.fn(async () => {});

vi.mock("livekit-client", () => {
  class FakeTrack {
    kind: string;
    constructor(kind: string) {
      this.kind = kind;
    }
    attach = vi.fn();
    detach = vi.fn();
  }
  return {
    Room: class {
      on = (evt: string, fn: (...args: any[]) => void) => {
        listeners[evt] = fn;
      };
      connect = connect;
      disconnect = disconnect;
      localParticipant = { setMicrophoneEnabled: setMic };
    },
    RoomEvent: {
      TrackSubscribed: "TrackSubscribed",
      TrackUnsubscribed: "TrackUnsubscribed",
      ActiveSpeakersChanged: "ActiveSpeakersChanged",
      Disconnected: "Disconnected",
    },
  };
});

vi.mock("./api", () => ({
  mintToken: vi.fn(async () => ({ token: "t", room: "interview-s1", livekit_url: "ws://x" })),
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceRoom } from "./voice-room";

describe("useVoiceRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const nav = window.navigator as any;
    const clone: any = {};
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(nav))) {
      try { clone[k] = nav[k]; } catch { /* skip restricted getters */ }
    }
    clone.mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) };
    Object.defineProperty(globalThis, "navigator", { value: clone, configurable: true });
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("connects and reports connected status", async () => {
    const { result } = renderHook(() => useVoiceRoom("s1", false));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(connect).toHaveBeenCalledWith("ws://x", "t");
    expect(setMic).toHaveBeenCalledWith(true);
  });

  it("treats any remote speaker as agent speaking", async () => {
    const { result } = renderHook(() => useVoiceRoom("s1", false));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    act(() => {
      listeners.ActiveSpeakersChanged([{ identity: "candidate-s1", isLocal: false }]);
    });
    expect(result.current.agentSpeaking).toBe(true);
    act(() => {
      listeners.ActiveSpeakersChanged([]);
    });
    expect(result.current.agentSpeaking).toBe(false);
  });

  it("disconnects on unmount", async () => {
    const { result, unmount } = renderHook(() => useVoiceRoom("s1", false));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
