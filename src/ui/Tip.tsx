import { AnimatePresence, motion } from "motion/react";
import { cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom";

export function Tip({ label, children, side = "top", delay = 320 }: { label: ReactNode; children: ReactElement<any>; side?: Side; delay?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const target = useRef<HTMLElement | null>(null);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (target.current) setRect(target.current.getBoundingClientRect());
    }, delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setRect(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("pointerdown", hide, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("pointerdown", hide, true);
    };
  }, [rect]);

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      target.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      if ((e.target as HTMLElement).matches(":focus-visible")) show();
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  const top = rect ? (side == "top" ? rect.top - 8 : rect.bottom + 8) : 0;
  const left = rect ? Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120) : 0;

  return (
    <>
      {child}
      {createPortal(
        <AnimatePresence>
          {rect && (
            <div key="tip" className="tip-anchor" style={{ top, left, transform: side == "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)" }}>
              <motion.div
                role="tooltip"
                className="tip"
                initial={{ opacity: 0, y: side == "top" ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.14 }}
              >
                {label}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
