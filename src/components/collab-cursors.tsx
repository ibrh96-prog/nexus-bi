import { usePresenceStore } from "@/stores/presence-store";
import { MousePointer2 } from "lucide-react";

/**
 * Overlay layer that renders every remote user's cursor at their reported
 * canvas coordinates. Mount this inside the canvas container (position:
 * relative). Coordinates are canvas-local (the same space you pass to
 * `emitCursor(x, y)`), so no viewport translation is needed here.
 */
export function CollabCursors() {
  const cursors = usePresenceStore((s) => s.cursors);
  const entries = Object.values(cursors);
  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {entries.map((c) => (
        <div
          key={c.userId}
          className="absolute -translate-x-1 -translate-y-1 will-change-transform transition-transform duration-75 ease-out"
          style={{ transform: `translate3d(${c.x}px, ${c.y}px, 0)` }}
        >
          <MousePointer2
            className="h-4 w-4 drop-shadow-sm"
            style={{ color: c.color, fill: c.color }}
            strokeWidth={1.5}
          />
          <span
            className="ml-3 mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
