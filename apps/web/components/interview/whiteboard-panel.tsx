"use client";

/**
 * <WhiteboardPanel> — embedded tldraw canvas for the live room (v1).
 *
 * Client-state only: no server persistence, no multiplayer sync. The tldraw
 * editor is mounted client-side; every committed store change is debounced
 * (500ms), pruned to shape essentials via whiteboard-store.ts, and published
 * on the LiveKit data channel under the "whiteboard" topic so the agent's
 * `read_whiteboard` tool always sees the latest board.
 *
 * tldraw touches window APIs during import, so this whole module is only ever
 * loaded through a `next/dynamic(..., { ssr: false })` wrapper (see the bottom
 * of this file) — never imported statically from a server-rendered tree.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { Tldraw, getSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";

import { pruneSnapshot, serializeSnapshot } from "@/components/interview/whiteboard-store";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";

/** Data-channel topic the agent worker listens on (see agent worker.py). */
export const WHITEBOARD_TOPIC = "whiteboard";

/** Publisher of snapshot JSON; injected so tests / preview can stub it. */
export type SnapshotPublisher = (json: string) => void;

const DEBOUNCE_MS = 500;

const WhiteboardCanvasDynamic = dynamic(
  () => Promise.resolve({ default: WhiteboardCanvas }),
  { ssr: false },
);

function WhiteboardCanvas({ publish }: { publish: SnapshotPublisher }) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishRef = React.useRef(publish);
  publishRef.current = publish;

  const handleMount = React.useCallback(
    (editor: Editor) => {
      const flush = () => {
        const snapshot = pruneSnapshot(getSnapshot(editor.store).document);
        publishRef.current(serializeSnapshot(snapshot));
      };

      const onChange = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, DEBOUNCE_MS);
      };

      const unsubscribe = editor.store.listen(onChange, { scope: "document" });
      // Publish once on mount so the agent has the (empty) baseline.
      flush();
      return unsubscribe;
    },
    [],
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="h-full w-full">
      <Tldraw onMount={handleMount} persistenceKey={undefined} />
    </div>
  );
}

export function WhiteboardPanel({
  publish,
  className,
}: {
  /** Sends one serialized snapshot over the room's data channel. */
  publish: SnapshotPublisher;
  className?: string;
}) {
  const messages = useMessages();
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-card border border-line bg-white",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[11px] font-medium tracking-wide text-muted">
          {t(messages, "interview.whiteboardTab")}
        </span>
        <span className="text-[10px] text-faint" role="status">
          {t(messages, "interview.agentSeesBoard")}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <WhiteboardCanvasDynamic publish={publish} />
      </div>
    </div>
  );
}
