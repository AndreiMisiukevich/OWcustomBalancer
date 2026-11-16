import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import * as A from "../logic/actions";
import { S } from "../logic/state";
import { runAndRender } from "./controller";
import { IconCheck, IconDownload, IconSearch, IconShuffle, IconSort, IconTrash, IconUpload, IconUsers, IconX } from "./icons";
import { PlayerCard } from "./PlayerCard";
import { AnimatedNumber } from "./Team";
import { Tip } from "./Tip";
import { confirmAction, openDialog } from "./store";

const SORTS: [string, string][] = [
  ["display_name", "Name"],
  ["sr", "Rank / SR"],
  ["class", "Role"],
  ["level", "Level"],
  ["checkin", "Check-in"],
];
const sortInverse: Record<string, boolean> = {};

function SortMenu() {
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
      <Tip label="Sort or shuffle">
        <button className="icon-btn" aria-label="Sort lobby" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconSort size={17} />
        </button>
      </Tip>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu right-0 top-9"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
          >
            <div className="hud-label px-2 pb-1 pt-1">Sort by</div>
            {SORTS.map(([field, label]) => (
              <button
                key={field}
                onClick={() => {
                  const inverse = sortInverse[field] ?? false;
                  sortInverse[field] = !inverse;
                  runAndRender(() => A.sort_lobby(field, inverse));
                  setOpen(false);
                }}
              >
                <IconSort size={14} className="text-muted" /> {label}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => {
                runAndRender(() => A.shuffle_lobby());
                setOpen(false);
              }}
            >
              <IconShuffle size={14} className="text-muted" /> Shuffle
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Lobby({ dragging }: { dragging: boolean }) {
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: "empty:lobby" });

  useEffect(() => {
    const t = setTimeout(() => setFilter(filterInput.toLowerCase()), 400);
    return () => clearTimeout(t);
  }, [filterInput]);

  const visible = S.lobby.filter((p) => filter == "" || p.display_name.toLowerCase().includes(filter) || p.id.toLowerCase().includes(filter));

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4" style={{ "--accent": "rgb(255 154 31 / 0.7)" } as React.CSSProperties} aria-label="Lobby">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="hud-label">Player pool</div>
          <h2 className="title-skew text-[28px] leading-none">
            Lobby <AnimatedNumber value={S.lobby.length} className="text-brand" />
          </h2>
        </div>
        <div className="flex items-center">
          <Tip label="Import players">
            <button className="icon-btn" aria-label="Import players" onClick={() => openDialog({ kind: "import" })}>
              <IconUpload size={17} />
            </button>
          </Tip>
          <Tip label="Export players">
            <button className="icon-btn" aria-label="Export players" onClick={() => openDialog({ kind: "exportLobby" })}>
              <IconDownload size={17} />
            </button>
          </Tip>
          <SortMenu />
          <Tip label="Delete everyone in the lobby">
            <button
              className="icon-btn hover:!text-danger"
              aria-label="Delete all lobby players"
              disabled={S.lobby.length == 0}
              onClick={() =>
                confirmAction("Clear lobby", `Permanently delete all ${S.lobby.length} players in the lobby? Players in teams stay.`, "Delete all", () => runAndRender(() => A.clear_lobby()), true)
              }
            >
              <IconTrash size={17} />
            </button>
          </Tip>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-y border-line py-2">
        <IconUsers size={16} className="text-ok" />
        <span className="text-[13px] text-muted">
          <b className="font-display text-[15px] text-text">{S.checkin_list.size}</b> checked in
        </span>
        <div className="ml-auto flex gap-1">
          <button className="btn btn-sm" onClick={() => openDialog({ kind: "checkin" })}>
            <IconCheck size={14} /> Check-in
          </button>
          <Tip label="Clear all check-in marks">
            <button
              className="btn btn-sm btn-ghost"
              disabled={S.checkin_list.size == 0}
              onClick={() => confirmAction("Reset check-in", "Clear all check-in marks?", "Reset", () => runAndRender(() => A.reset_checkin()))}
            >
              Reset
            </button>
          </Tip>
        </div>
      </div>

      <div className="relative mt-3">
        <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          className="field !h-9 !pl-9 !pr-9 !text-[14px]"
          placeholder="Filter by name or BattleTag"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          aria-label="Filter lobby"
          style={filter ? { borderColor: "rgb(255 154 31 / 0.6)" } : undefined}
        />
        {filterInput && (
          <button className="icon-btn absolute right-1 top-1/2 !h-7 !w-7 -translate-y-1/2" aria-label="Clear filter" onClick={() => setFilterInput("")}>
            <IconX size={14} />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={"-mx-1 mt-3 min-h-[120px] flex-1 overflow-y-auto px-1 pb-2 transition-colors" + (isOver ? " bg-brand/5 outline outline-1 outline-brand/50" : "")}
      >
        <div className="flex flex-col gap-1.5">
          {visible.map((p) => (
            <PlayerCard key={p.id} player={p} srMethod={S.Settings.sr_calc_method} compact />
          ))}
        </div>
        {S.lobby.length == 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
            <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" className="opacity-70">
              <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="none" stroke="rgb(150 180 255 / .35)" strokeWidth="2" strokeDasharray="6 5" className="ring-spin" style={{ transformOrigin: "32px 32px" }} />
              <path d="M32 22v20M22 32h20" stroke="#ff9a1f" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="font-display text-[18px] font-bold uppercase tracking-[0.08em]">{dragging ? "Drop to bench" : "Lobby is empty"}</div>
            <p className="max-w-[240px] text-[14px] leading-snug text-muted">
              {dragging ? "Release here to send the player back to the lobby." : "Add a BattleTag at the top, or import a list you already have."}
            </p>
            {!dragging && (
              <div className="mt-1 flex gap-2">
                <button className="btn btn-sm" onClick={() => openDialog({ kind: "import" })}>
                  <IconUpload size={14} /> Import list
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => openDialog({ kind: "info" })}>
                  How it works
                </button>
              </div>
            )}
          </motion.div>
        )}
        {S.lobby.length > 0 && visible.length == 0 && <div className="py-6 text-center text-[14px] text-muted">No players match “{filterInput}”.</div>}
      </div>
    </section>
  );
}
