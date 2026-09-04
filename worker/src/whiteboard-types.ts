/** Structural mirror of web/src/lib/whiteboard-store.ts wire format (worker cannot import web code). */
export interface WhiteboardSnapshot {
  at: number;
  shapeCount: number;
  shapes: WhiteboardShape[];
}

export interface WhiteboardShape {
  id: string;
  type: string;
  text?: string;
  from?: string;
  to?: string;
}
