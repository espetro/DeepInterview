import * as React from "react";
import { Room, RoomEvent } from "livekit-client";
import { mintToken } from "./api";

export interface VoiceRoom {
  /** connection state */
  status: "idle" | "connecting" | "connected" | "error";
  /** true while the agent's audio is playing (drives the orb) */
  agentSpeaking: boolean;
  error: string | null;
}

/**
 * Joins the session's LiveKit room on mount: publishes the local mic and
 * plays the agent's audio. Auto-disconnects on unmount. Text input stays on
 * the HTTP API; this hook only owns the media plane.
 */
export function useVoiceRoom(sessionId: string, muted: boolean): VoiceRoom {
  const [state, setState] = React.useState<VoiceRoom>({
    status: "idle",
    agentSpeaking: false,
    error: null,
  });
  const roomRef = React.useRef<Room | null>(null);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);

  // single detached <audio> element owned by the hook; tracks attach to it
  React.useEffect(() => {
    const el = document.createElement("audio");
    el.autoplay = true;
    audioElRef.current = el;
    return () => {
      audioElRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    // play agent audio through a single attached element
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === "audio") {
        const el = audioElRef.current;
        if (el) {
          track.attach(el);
          void el.play().catch(() => undefined);
        }
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setState((s) => ({
        ...s,
        agentSpeaking: speakers.some((sp) => sp !== room.localParticipant),
      }));
    });
    room.on(RoomEvent.Disconnected, () => {
      setState((s) => (s.status === "error" ? s : { ...s, status: "idle", agentSpeaking: false }));
    });

    (async () => {
      try {
        setState((s) => ({ ...s, status: "connecting" }));
        const { token, livekit_url } = await mintToken(sessionId);
        if (cancelled) return;
        await room.connect(livekit_url, token);
        if (cancelled) return void room.disconnect();
        await room.localParticipant.setMicrophoneEnabled(!muted);
        setState((s) => ({ ...s, status: "connected" }));
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            status: "error",
            error: err instanceof Error ? err.message : "room connection failed",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
    // sessionId fixed per mount; muted handled by the follow-up effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  React.useEffect(() => {
    void roomRef.current?.localParticipant.setMicrophoneEnabled(!muted);
  }, [muted]);

  return state;
}
