import { useEffect } from "react";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "../lib/constants";

/**
 * Non-passive wheel zoom on the canvas: steps the zoom by ZOOM_STEP (scaled
 * by the current zoom) toward the cursor, keeping the world point under the
 * mouse fixed.
 */
export function useWheelZoom(
  canvasRef: { current: HTMLDivElement | null },
  pan: { x: number; y: number },
  zoom: number,
  setPan: (pan: { x: number; y: number }) => void,
  setZoom: (zoom: number) => void,
): void {
  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // World point under the cursor before zooming.
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta * zoom));

      // Adjust pan so the same world point stays under the cursor.
      setPan({ x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom });
      setZoom(newZoom);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [canvasRef, pan, zoom, setPan, setZoom]);
}
