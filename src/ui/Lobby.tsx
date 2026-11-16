import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import * as A from "../logic/actions";
import { S } from "../logic/state";
import { runAndRender } from "./controller";
import { IconCheck, IconDownload, IconSearch, IconShuffle, IconSort, IconTrash, IconUpload, IconUsers, IconX } from "./icons";
import { PlayerCard } from "./PlayerCard";
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
      <button className="icon-btn" title="Sort lobby" aria-label="Sort lobby" onClick={() => setOpen((o) => !o)}>
        <IconSort size={17} />
      </button>
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
            Lobby <span className="text-brand">{S.lobby.length}</span>
          </h2>
        </div>
        <div className="flex items-center">
          <button className="icon-btn" title="Import players" aria-label="Import players" onClick={() => openDialog({ kind: "import" })}>
            <IconUpload size={17} />
          </button>
          <button className="icon-btn" title="Export players" aria-label="Export players" onClick={() => openDialog({ kind: "exportLobby" })}>
            <IconDownload size={17} />
          </button>
          <SortMenu />
          <button
            className="icon-btn hover:!text-danger"
            title="Delete all lobby players"
            aria-label="Delete all lobby players"
            onClick={() => confirmAction("Clear lobby", "Permanently delete all players in the lobby?", "Delete all", () => runAndRender(() => A.clear_lobby()), true)}
          >
            <IconTrash size={17} />
          </button>
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
          <button
            className="btn btn-sm btn-ghost"
            title="Clear check-in mark for all players"
            onClick={() => confirmAction("Reset check-in", "Clear all check-in marks?", "Reset", () => runAndRender(() => A.reset_checkin()))}
          >
            Reset
          </button>
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
          <div className="grid h-full min-h-[140px] place-items-center px-6 text-center text-[14px] text-faint">
            {dragging ? "Drop here to send the player back to the lobby" : "No players yet. Add a BattleTag above or import a list."}
          </div>
        )}
        {S.lobby.length > 0 && visible.length == 0 && <div className="py-6 text-center text-[14px] text-faint">No players match “{filterInput}”.</div>}
      </div>
    </section>
  );
}
