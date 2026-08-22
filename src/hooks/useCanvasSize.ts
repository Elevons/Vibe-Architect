import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Track the pixel size of a container element with a ResizeObserver.
 */
export function useCanvasSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
