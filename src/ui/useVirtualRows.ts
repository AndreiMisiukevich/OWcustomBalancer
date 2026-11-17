import { useLayoutEffect, useState, type RefObject } from "react";

export function useVirtualRows(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 6) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40) });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan);
      const end = Math.min(count, Math.ceil((el.scrollTop + el.clientHeight) / rowHeight) + overscan);
      setRange((r) => (r.start == start && r.end == end ? r : { start, end }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, count, rowHeight, overscan]);
  return range;
}
