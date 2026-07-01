# Real-time collab

Server: `server/collab.ts` attaches Socket.io to the same HTTP server as Express (`server/index.ts`). Rooms are `workflow:<id>`. Broadcasts:

- `cursor-move` — `{ userId, name, color, x, y }`
- `node-update` — `{ userId, nodeId, position?, data?, type? }`
- `edge-add` — `{ userId, edge: { id, source, target } }`

Plus presence: `presence:snapshot` (sent to joiner), `presence:join`, `presence:leave`.

Client:

- `src/lib/collab-socket.ts` — singleton `io()` client. Set `VITE_COLLAB_URL` when the API runs on a different origin.
- `src/stores/workflow-store.ts` — emits `node-update` / `edge-add` when local actions run; exposes `applyRemoteNodeUpdate` / `applyRemoteEdgeAdd` that apply inbound events without re-emitting (no echo loop).
- `src/stores/presence-store.ts` — peers and cursors, plus a deterministic `colorForUser()` palette.
- `src/hooks/use-collab.ts` — joins the room, subscribes to all events, and returns a throttled `emitCursor(x, y)` (default 40ms window with a trailing edge, so drags don't flood the server).
- `src/components/collab-cursors.tsx` — overlay layer rendering remote cursors with name pills and per-user color.

Usage in the workflow route:

```tsx
const { emitCursor } = useCollab({
  workflowId,
  user: { userId: currentUser.id, name: currentUser.name },
});

<div
  ref={canvasRef}
  onPointerMove={(e) => {
    const r = canvasRef.current!.getBoundingClientRect();
    emitCursor(e.clientX - r.left, e.clientY - r.top);
  }}
>
  <CollabCursors />
  {/* nodes / edges */}
</div>;
```

Concurrency notes:

- Cursor emits are throttled with a leading + trailing edge — matches Figma-style feel while capping traffic at ~25 msg/s per client.
- Node drags should call `updateNodePosition` on `pointermove` (the store already dedupes identical positions). If you want to reduce load further, only call it every N pixels moved.
- `applyRemote*` actions bypass history so remote edits don't pollute undo/redo.
