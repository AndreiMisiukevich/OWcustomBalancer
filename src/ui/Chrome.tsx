import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addPlayer, stopStatsUpdate } from "./controller";
import { Emblem, IconGear, IconPlus, IconRefresh, IconInfo } from "./icons";
import { openDialog, rerender, ui } from "./store";

export function Backdrop() {
  const motes = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: `${(i * 53) % 100}%`,
        top: `${60 + ((i * 37) % 40)}%`,
        delay: `${(i * 1.7) % 12}s`,
        duration: `${14 + ((i * 7) % 12)}s`,
      })),
    [],
  );
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-photo" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}img/bg-night.jpg)` }} />
      <div className="backdrop-tint" />
      <div className="backdrop-grid" />
      <div className="backdrop-sweep" />
      {motes.map((m, i) => (
        <span key={i} className="mote" style={{ left: m.left, top: m.top, animationDelay: m.delay, animationDuration: m.duration }} />
      ))}
      <div className="backdrop-noise" />
    </div>
  );
}

function StatsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <IconRefresh size={15} /> <span className="hidden sm:inline">Update stats</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu right-0 top-11" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}>
            <button
              onClick={() => {
                setOpen(false);
                openDialog({ kind: "statsUpdate", scope: "active" });
              }}
            >
              Players in teams
            </button>
            <button
              onClick={() => {
                setOpen(false);
                openDialog({ kind: "statsUpdate", scope: "all" });
              }}
            >
              All players
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const submit = () => {
    if (!ui.adding) addPlayer(ui.addInput);
  };
  return (
    <header className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 px-4 pb-4 pt-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <motion.div initial={{ rotate: -30, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 12 }}>
          <Emblem size={46} />
        </motion.div>
        <div className="leading-none">
          <div className="title-skew text-[26px] sm:text-[30px]">
            Custom <span className="bg-gradient-to-r from-brand-2 to-brand bg-clip-text text-transparent">Balancer</span>
          </div>
          <div className="hud-label mt-1 !text-[10px]">Overwatch custom games · 5v5 &amp; 6v6</div>
        </div>
      </div>

      <form
        className="add-bar order-3 flex h-12 w-full min-w-0 items-center gap-2 pl-5 pr-2 md:order-none md:max-w-[560px] md:flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <IconPlus size={18} className="shrink-0 text-brand" />
        <input
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-text placeholder:text-faint focus:outline-none"
          placeholder="BattleTag, e.g. Player#1234"
          value={ui.addInput}
          onChange={(e) => {
            ui.addInput = e.target.value;
            rerender();
          }}
          aria-label="BattleTag"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn-primary !h-9" type="submit" disabled={ui.adding}>
          {ui.adding ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1b0d00]/30 border-t-[#1b0d00]" /> Fetching
            </>
          ) : (
            "Add player"
          )}
        </button>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <StatsMenu />
        <button className="btn" onClick={() => openDialog({ kind: "settings" })} aria-label="Settings">
          <IconGear size={16} /> <span className="hidden sm:inline">Settings</span>
        </button>
      </div>
    </header>
  );
}

export function StatsHud() {
  const s = ui.stats;
  const visible = s.active || s.status == "complete" || s.errors > 0;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="panel fixed bottom-4 right-4 z-30 w-[300px] p-3"
          style={{ "--accent": "rgb(43 184 255 / .8)" } as React.CSSProperties}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          {s.active ? (
            <>
              <div className="flex items-center justify-between">
                <span className="hud-label !text-t1">Updating stats</span>
                <span className="font-display text-[14px] font-bold">
                  {s.index}/{s.total}
                </span>
              </div>
              <div className="mt-1 truncate text-[13px] text-muted">{s.status}</div>
              <div className="delta-track mt-2">
                <motion.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-t1 to-ok" animate={{ width: `${s.total ? (s.index / s.total) * 100 : 0}%` }} />
              </div>
              <button className="btn btn-sm mt-2 w-full" onClick={stopStatsUpdate}>
                Stop
              </button>
            </>
          ) : s.status == "complete" ? (
            <div className="hud-label !text-ok">Update complete</div>
          ) : null}
          {s.errors > 0 && (
            <button className="mt-2 flex items-center gap-1.5 text-[13px] text-danger hover:underline" onClick={() => openDialog({ kind: "statsLog" })}>
              <IconInfo size={14} /> {s.errors} {s.errors == 1 ? "error" : "errors"} — open log
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2">
      <AnimatePresence>
        {ui.toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className="panel pointer-events-auto px-4 py-2.5 text-[14px]"
            role="status"
            style={
              {
                "--cut": "10px",
                "--accent": t.tone == "error" ? "#ff5168" : t.tone == "warn" ? "#ffc861" : t.tone == "ok" ? "#4be3a1" : "#2bb8ff",
              } as React.CSSProperties
            }
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-[12px] leading-relaxed text-faint sm:px-6 lg:px-8">
      <p>
        Drag players between lobby and teams, double-click to auto-move, right-click to edit. Everything is saved in this browser. Stats via{" "}
        <a className="underline hover:text-muted" href="https://overfast-api.tekrop.fr" target="_blank" rel="noreferrer">
          OverFast API
        </a>
        ; OW2 ranks are mapped to SR (500 per rank, 100 per division) for balancing. Based on{" "}
        <a className="underline hover:text-muted" href="https://github.com/adminimusRU/OWcustomBalancer" target="_blank" rel="noreferrer">
          OWcustomBalancer
        </a>{" "}
        by adminimusRU (MIT). Background photo: “Ciudad de las artes y las ciencias” by Nan Palmero,{" "}
        <a className="underline hover:text-muted" href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noreferrer">
          CC BY 2.0
        </a>
        , cropped and color-graded. Not affiliated with or endorsed by Blizzard Entertainment. Overwatch is a trademark of Blizzard Entertainment, Inc.
      </p>
    </footer>
  );
}
