import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Canvas dimensions, with a short retry while the element mounts.
 *
 * In embedded mode the page renders a loading screen first, so the canvas
 * ref is still null when this effect first runs. Retrying until the ref is
 * populated keeps the measured size (and therefore fit/frame and centered
 * node placement) correct instead of leaving it at zero.
 */
export function useCanvasSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let attempts = 0;

    const attach = (): void => {
      const element = ref.current;
      if (element === null) {
        if (attempts < 600) {
          attempts += 1;
          frame = requestAnimationFrame(attach);
        }
        return;
      }
      observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry !== undefined) {
          setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
      observer.observe(element);
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };

    attach();
    return () => {
      cancelAnimationFrame(frame);
      if (observer !== null) {
        observer.disconnect();
      }
    };
  }, [ref]);

  return size;
}
