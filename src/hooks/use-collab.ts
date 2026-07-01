import { useEffect, useRef } from "react";
import { COLLAB_EVENTS, getCollabSocket } from "@/lib/collab-socket";
import { usePresenceStore, colorForUser, type RemoteCursor } from "@/stores/presence-store";
import { useWorkflowStore, type WorkflowEdge, type NodePosition } from "@/stores/workflow-store";

interface UseCollabOptions {
  workflowId: string;
  user: { userId: string; name: string; color?: string };
  /** Cursor emit throttle window (ms). Defaults to 40ms (~25 fps). */
  cursorThrottleMs?: number;
}

/**
 * Wire up socket.io collab for the current workflow room:
 *  - joins the room with the local user's presence
 *  - applies remote node/edge updates and cursor moves to the stores
 *  - exposes an `emitCursor(x, y)` fn that throttles cursor traffic
 */
export function useCollab({ workflowId, user, cursorThrottleMs = 40 }: UseCollabOptions) {
  const setSelf = usePresenceStore((s) => s.setSelf);
  const setCursor = usePresenceStore((s) => s.setCursor);
  const removeCursor = usePresenceStore((s) => s.removeCursor);
  const upsertPeer = usePresenceStore((s) => s.upsertPeer);
  const removePeer = usePresenceStore((s) => s.removePeer);
  const clearAll = usePresenceStore((s) => s.clearAll);

  // Throttle cursor emits with a trailing edge so the final position lands.
  const lastEmitRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const color = user.color ?? colorForUser(user.userId);
    const self = { userId: user.userId, name: user.name, color };
    setSelf(self);

    const socket = getCollabSocket();
    const join = () => socket.emit(COLLAB_EVENTS.join, { workflowId, user: self });
    if (socket.connected) join();
    socket.on("connect", join);

    const onSnapshot = (msg: { peers: Array<{ userId: string; name: string; color: string }> }) => {
      msg.peers.forEach(upsertPeer);
    };
    const onJoin = (p: { userId: string; name: string; color: string }) => upsertPeer(p);
    const onLeave = (p: { userId: string }) => removePeer(p.userId);

    const onCursor = (c: RemoteCursor) => setCursor({ ...c, updatedAt: Date.now() });

    const onNodeUpdate = (p: {
      nodeId: string;
      position?: NodePosition;
      data?: Record<string, unknown>;
      type?: string;
    }) => {
      useWorkflowStore.getState().applyRemoteNodeUpdate(p.nodeId, {
        position: p.position,
        data: p.data,
        type: p.type,
      });
    };

    const onEdgeAdd = (p: { edge: WorkflowEdge }) => {
      useWorkflowStore.getState().applyRemoteEdgeAdd(p.edge);
    };

    socket.on(COLLAB_EVENTS.presenceSnapshot, onSnapshot);
    socket.on(COLLAB_EVENTS.presenceJoin, onJoin);
    socket.on(COLLAB_EVENTS.presenceLeave, onLeave);
    socket.on(COLLAB_EVENTS.cursorMove, onCursor);
    socket.on(COLLAB_EVENTS.nodeUpdate, onNodeUpdate);
    socket.on(COLLAB_EVENTS.edgeAdd, onEdgeAdd);

    return () => {
      socket.off("connect", join);
      socket.off(COLLAB_EVENTS.presenceSnapshot, onSnapshot);
      socket.off(COLLAB_EVENTS.presenceJoin, onJoin);
      socket.off(COLLAB_EVENTS.presenceLeave, onLeave);
      socket.off(COLLAB_EVENTS.cursorMove, onCursor);
      socket.off(COLLAB_EVENTS.nodeUpdate, onNodeUpdate);
      socket.off(COLLAB_EVENTS.edgeAdd, onEdgeAdd);
      if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);
      clearAll();
    };
  }, [
    workflowId,
    user.userId,
    user.name,
    user.color,
    setSelf,
    setCursor,
    removeCursor,
    upsertPeer,
    removePeer,
    clearAll,
  ]);

  /** Throttled cursor emitter — call on pointer/drag move. */
  function emitCursor(x: number, y: number) {
    const now = Date.now();
    const self = usePresenceStore.getState().self;
    if (!self) return;
    pendingRef.current = { x, y };
    const elapsed = now - lastEmitRef.current;
    const flush = () => {
      if (!pendingRef.current) return;
      const socket = getCollabSocket();
      if (socket.connected) {
        socket.emit(COLLAB_EVENTS.cursorMove, {
          userId: self.userId,
          name: self.name,
          color: self.color,
          x: pendingRef.current.x,
          y: pendingRef.current.y,
        });
      }
      lastEmitRef.current = Date.now();
      pendingRef.current = null;
    };
    if (elapsed >= cursorThrottleMs) {
      flush();
    } else if (!trailingTimerRef.current) {
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        flush();
      }, cursorThrottleMs - elapsed);
    }
  }

  return { emitCursor };
}
