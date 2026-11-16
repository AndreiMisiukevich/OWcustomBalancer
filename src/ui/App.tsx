import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import * as A from "../logic/actions";
import { create_random_player, find_player_by_id } from "../logic/common";
import { S } from "../logic/state";
import type { Player } from "../logic/types";
import { Backdrop, Footer, Header, StatsHud, Toasts } from "./Chrome";
import { Core } from "./Core";
import { BalanceOverlay, Dialogs } from "./Dialogs";
import { IconTrash } from "./icons";
import { Lobby } from "./Lobby";
import { CardBody } from "./PlayerCard";
import { highlight, rerender, toast, ui, useApp } from "./store";
import { TeamPanel } from "./Team";

const rank = (id: string) => (id == "trash" ? 0 : id.startsWith("player:") ? 1 : id == "empty:lobby" ? 3 : 2);
const collision: CollisionDetection = (args) => pointerWithin(args).sort((a, b) => rank(String(a.id)) - rank(String(b.id)));

function toTarget(overId: string): A.DropTarget | null {
  if (overId == "trash") return { type: "trash" };
  if (overId.startsWith("player:")) return { type: "player", id: overId.slice("player:".length) };
  if (overId.startsWith("empty:")) {
    const [, container, slot_class] = overId.split(":");
    return { type: "empty", container: container as "lobby" | "team1" | "team2", slot_class: slot_class || undefined };
  }
  return null;
}

function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "trash" });
  return (
    <motion.div
      ref={setNodeRef}
      className={"trash-zone fixed bottom-6 left-1/2 z-40 flex h-16 w-[min(420px,calc(100vw-32px))] items-center justify-center gap-3 font-display text-[18px] font-bold uppercase tracking-[0.14em] text-white transition-transform" + (isOver ? " is-over" : "")}
      initial={{ opacity: 0, y: 40, x: "-50%" }}
      animate={{ opacity: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, y: 40, x: "-50%" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <IconTrash size={22} /> Drop to delete player
    </motion.div>
  );
}

function DebugPanel() {
  const [n, setN] = useState(12);
  return (
    <div className="panel fixed bottom-4 left-4 z-30 flex items-center gap-2 p-2" style={{ "--cut": "8px" } as React.CSSProperties}>
      <span className="hud-label">Debug</span>
      <input className="field !h-8 !w-16 !px-2" type="number" min={1} max={10000} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Number of test players" />
      <button
        className="btn btn-sm"
        onClick={() => {
          if (!Number.isInteger(n) || n <= 0 || n > 10000) return;
          const added = A.add_test_players(n, create_random_player);
          highlight(added);
        }}
      >
        Add test players
      </button>
    </div>
  );
}

const nameOf = (id: string | number) => {
  const p = find_player_by_id(String(id).replace(/^drag:/, ""));
  return p ? p.display_name || p.id : String(id);
};
const targetName = (id: string | number) => {
  const s = String(id);
  if (s == "trash") return "delete zone";
  if (s.startsWith("player:")) return nameOf(s.slice(7));
  if (s == "empty:lobby") return "lobby";
  const [, container, role] = s.split(":");
  return `${container == "team1" ? "team 1" : "team 2"}${role ? " " + role : ""} slot`;
};
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}`,
  onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${targetName(over.id)}` : `${nameOf(active.id)} is not over a drop target`),
  onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped on ${targetName(over.id)}` : `${nameOf(active.id)} dropped`),
  onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} cancelled`,
};

const debug = new URLSearchParams(location.search).has("debug");

export function App() {
  useApp();
  const [active, setActive] = useState<Player | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActive((e.active.data.current?.player as Player) ?? null);
    ui.dragging = true;
    rerender();
  };
  const onDragEnd = (e: DragEndEvent) => {
    const player = e.active.data.current?.player as Player | undefined;
    setActive(null);
    ui.dragging = false;
    if (player && e.over) {
      const target = toTarget(String(e.over.id));
      if (target) {
        const r = A.player_drop(player.id, target);
        if (r == "removed") toast(`${player.display_name || player.id} deleted`, "info", 2500);
      }
    }
    rerender();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActive(null);
        ui.dragging = false;
        rerender();
      }}
    >
      <Backdrop />
      <div className="relative z-10 min-h-screen">
        <Header />
        <LayoutGroup>
          <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-6 sm:px-6 lg:px-8 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
            <div className="order-2 flex min-h-[420px] flex-col xl:order-1 xl:h-[calc(100vh-120px)] xl:min-h-[640px] xl:sticky xl:top-4">
              <Lobby dragging={ui.dragging} />
            </div>
            <div className="order-1 grid items-start gap-4 xl:order-2 lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)]">
              <TeamPanel team={1} />
              <div className="order-first lg:order-none">
                <Core />
              </div>
              <TeamPanel team={2} />
            </div>
          </main>
        </LayoutGroup>
        <Footer />
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="pcard pcard-overlay" style={{ "--tint": "255 154 31" } as React.CSSProperties}>
            <CardBody player={active} srMethod={S.Settings.sr_calc_method} />
          </div>
        ) : null}
      </DragOverlay>
      <AnimatePresence>{ui.dragging && <TrashZone key="trash" />}</AnimatePresence>
      <StatsHud />
      <Toasts />
      <Dialogs />
      <BalanceOverlay />
      {debug && <DebugPanel />}
    </DndContext>
  );
}
