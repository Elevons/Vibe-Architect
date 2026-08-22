import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Maximum time between the two taps of a double-tap, in ms. */
const DOUBLE_TAP_MS = 320;
/** Maximum distance between the two taps, in px. */
const DOUBLE_TAP_PX = 40;
/** A press that moved more than this was a drag, not a tap. */
const TAP_DRAG_PX = 8;

interface TapRecord {
  x: number;
  y: number;
  time: number;
}

/**
 * Touch double-tap detection for elements that also support mouse
 * double-click. Returns a pointerdown handler that records each touch tap
 * and invokes onDoubleTap when two taps land close together in time and
 * space. Mouse input is ignored (onDoubleClick covers it).
 */
export function useDoubleTap(onDoubleTap: () => void) {
  const lastTap = useRef<TapRecord | null>(null);
  const pressPos = useRef<TapRecord | null>(null);

  const handlePointerDown = useCallback((event: ReactPointerEvent): void => {
    if (event.pointerType === "mouse") {
      return;
    }
    pressPos.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent): void => {
    if (event.pointerType === "mouse") {
      return;
    }
    const press = pressPos.current;
    pressPos.current = null;
    if (press === null) {
      return;
    }
    // A press that moved is a drag/pan, not a tap.
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_DRAG_PX) {
      return;
    }
    const now = event.timeStamp;
    const last = lastTap.current;
    lastTap.current = { x: event.clientX, y: event.clientY, time: now };
    if (
      last !== null
      && now - last.time <= DOUBLE_TAP_MS
      && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      onDoubleTap();
    }
  }, [onDoubleTap]);

  return { handlePointerDown, handlePointerUp };
}
