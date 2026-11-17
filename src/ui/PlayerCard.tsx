import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { get_player_sr } from "../logic/common";
import { rank_label } from "../logic/defines";
import { S } from "../logic/state";
import type { Player } from "../logic/types";
import { moveByDoubleClick } from "./controller";
import { hoverEnd, hoverStart } from "./HoverCard";
import { IconCheck, IconPin, RankBadge, RoleIcon, ROLE_COLORS } from "./icons";
import { openDialog, ui } from "./store";
import { is_offrole, offrole_history } from "../logic/offrole";

interface CardProps {
  player: Player;
  srMethod: string;
  slotClass?: string;
  compact?: boolean;
  tint?: string;
  animate?: boolean;
}

const pop = { initial: { scale: 0, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: "spring" as const, stiffness: 600, damping: 18 } };

export function CardBody({ player, srMethod, slotClass, compact }: CardProps) {
  const sr = get_player_sr(player, slotClass ?? srMethod);
  const checked = !slotClass && S.checkin_list.has(player.id);
  const pinned = S.pinned_players.has(player.id);
  const off = is_offrole(player, slotClass);
  const offCount = offrole_history()[player.id] ?? 0;
  return (
    <>
      {slotClass && (
        <span className={"slot-role" + (off ? " is-off" : "")} style={{ "--role": ROLE_COLORS[slotClass] } as React.CSSProperties} aria-label={off ? "Playing an off-role" : undefined}>
          <RoleIcon role={slotClass} size={18} />
        </span>
      )}
      <RankBadge sr={sr} size={compact ? 32 : 36} className="rank-badge shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="pname">{player.display_name || player.id}</span>
          {checked && (
            <motion.span {...pop} className="grid shrink-0 place-items-center" aria-label="Checked in">
              <IconCheck size={15} className="text-ok" />
            </motion.span>
          )}
          {pinned && (
            <motion.span {...pop} className="grid shrink-0 place-items-center" aria-label="Pinned">
              <IconPin size={14} className="text-brand-2" />
            </motion.span>
          )}
          {player.private_profile && <span className="chip !h-4 shrink-0 !px-1.5 !text-[10px] text-muted">PRIVATE</span>}
          {offCount > 0 && (
            <span className="chip off-chip !h-4 shrink-0 !px-1.5 !text-[10px]" aria-label={`Off-role in ${offCount} recorded ${offCount == 1 ? "match" : "matches"} in the last 24 hours`}>
              OFF {offCount}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 leading-none">
          <span className={"sr-num text-[14px] text-text" + (player.se === true ? " sr-edited" : "")}>{sr}</span>
          <span className="truncate text-[13px] text-muted">{rank_label(sr)}</span>
        </div>
      </div>
      <div className={"roles flex shrink-0 items-center gap-1" + (player.ce === true ? " roles-edited" : "")}>
        {player.classes.map((c, i) => (
          <RoleIcon key={c} role={c} size={i == 0 ? 20 : 15} className={i == 0 ? "" : "opacity-60"} />
        ))}
      </div>
    </>
  );
}

function openEditor(player: Player) {
  hoverEnd();
  ui.stats.editorResult = "";
  ui.stats.editorLoading = false;
  openDialog({ kind: "edit", player, nonce: Date.now() });
}

export function PlayerCard({ player, srMethod, slotClass, compact, tint, animate = true }: CardProps) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: "drag:" + player.id, data: { player } });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: "player:" + player.id });
  const el = useRef<HTMLDivElement | null>(null);
  const highlighted = ui.highlighted.has(player.id);

  useEffect(() => {
    if (ui.scrollTo == player.id && el.current) {
      el.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
      ui.scrollTo = null;
    }
  });

  const Card = animate ? motion.div : "div";
  const motionProps = animate ? { layout: "position" as const, layoutId: player.id, transition: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.8 } } : {};
  return (
    <Card
      {...motionProps}
      ref={(node: HTMLDivElement | null) => {
        el.current = node;
        dragRef(node);
        dropRef(node);
      }}
      data-player-id={player.id}
      className={
        "pcard" +
        (compact ? " compact" : "") +
        (isDragging ? " is-ghost" : "") +
        (isOver && !isDragging ? " is-over" : "") +
        (highlighted ? " is-highlighted" : "")
      }
      style={{ "--tint": tint ?? "150 180 255" } as React.CSSProperties}
      {...attributes}
      {...listeners}
      aria-label={`${player.display_name || player.id}, ${rank_label(get_player_sr(player, slotClass ?? srMethod))}`}
      onMouseEnter={(e) => {
        if (!ui.dragging) hoverStart(player, e.currentTarget);
      }}
      onMouseLeave={hoverEnd}
      onPointerDown={(e) => {
        hoverEnd();
        listeners?.onPointerDown?.(e);
      }}
      onMouseDown={(e) => {
        hoverEnd();
        listeners?.onMouseDown?.(e);
      }}
      onDoubleClick={() => {
        hoverEnd();
        moveByDoubleClick(player.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openEditor(player);
      }}
      onKeyDown={(e) => {
        if (e.key == "Enter") {
          e.preventDefault();
          moveByDoubleClick(player.id);
        } else if (e.key == "e" || e.key == "E" || e.key == "ContextMenu" || (e.key == "F10" && e.shiftKey)) {
          e.preventDefault();
          openEditor(player);
        }
      }}
    >
      <CardBody player={player} srMethod={srMethod} slotClass={slotClass} compact={compact} />
    </Card>
  );
}

export function EmptySlot({ id, role, fits }: { id: string; role?: string; fits?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={"slot-empty" + (isOver ? " is-over" : "") + (fits ? " is-target" : "")}
      style={role ? ({ "--role": ROLE_COLORS[role] } as React.CSSProperties) : undefined}
    >
      {role ? (
        <span className="slot-role !bg-transparent">
          <RoleIcon role={role} size={18} color={ROLE_COLORS[role] + "99"} />
        </span>
      ) : null}
      <span className="font-display text-[14px] font-semibold uppercase tracking-[0.16em]">Open slot</span>
    </div>
  );
}
