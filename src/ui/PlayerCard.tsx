import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { memo, useEffect, useRef } from "react";
import { get_player_sr, is_undefined, print_date } from "../logic/common";
import { class_titles, rank_label } from "../logic/defines";
import { S } from "../logic/state";
import type { Player } from "../logic/types";
import { moveByDoubleClick } from "./controller";
import { IconCheck, IconPin, RankBadge, RoleIcon, ROLE_COLORS } from "./icons";
import { openDialog, ui } from "./store";

export function playerTooltip(p: Player) {
  let t = p.id;
  if (p.level) t += "\nLevel: " + p.level;
  for (const c of p.classes) t += `\n${class_titles[c as keyof typeof class_titles] ?? c}: ${rank_label(is_undefined(p.sr_by_class[c], 0))} (${is_undefined(p.sr_by_class[c], 0)} SR)`;
  t += "\nLast updated: " + print_date(p.last_updated);
  if (p.top_heroes.length) t += "\nTop heroes: " + p.top_heroes.map((h) => h.hero).join(", ");
  return t;
}

interface CardProps {
  player: Player;
  srMethod: string;
  slotClass?: string;
  compact?: boolean;
  tint?: string;
  overlay?: boolean;
}

export function CardBody({ player, srMethod, slotClass, compact }: CardProps) {
  const sr = get_player_sr(player, slotClass ?? srMethod);
  const checked = !slotClass && S.checkin_list.has(player.id);
  const pinned = S.pinned_players.has(player.id);
  return (
    <>
      {slotClass && (
        <span className="slot-role" title={class_titles[slotClass as keyof typeof class_titles]}>
          <RoleIcon role={slotClass} size={18} />
        </span>
      )}
      <RankBadge sr={sr} size={compact ? 32 : 36} className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="pname">{player.display_name || " "}</span>
          {checked && <IconCheck size={14} className="shrink-0 text-ok" aria-label="Checked in" />}
          {pinned && <IconPin size={13} className="shrink-0 text-brand-2" aria-label="Pinned" />}
          {player.private_profile && <span className="chip !h-4 !px-1.5 !text-[10px] text-muted">PRIVATE</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12px] leading-none text-muted">
          <span className={"sr-num text-[13px] text-text/90" + (player.se === true ? " sr-edited" : "")}>{sr}</span>
          <span className="truncate">{rank_label(sr)}</span>
        </div>
      </div>
      <div className={"flex shrink-0 items-center gap-0.5" + (player.ce === true ? " rounded-sm outline outline-1 outline-dashed outline-brand/60" : "")}>
        {player.classes.map((c, i) => (
          <RoleIcon key={c} role={c} size={i == 0 ? 20 : 15} className={i == 0 ? "" : "opacity-55"} title={`${class_titles[c as keyof typeof class_titles] ?? c} ${is_undefined(player.sr_by_class[c], 0)} SR`} />
        ))}
      </div>
    </>
  );
}

function PlayerCardInner({ player, srMethod, slotClass, compact, tint }: CardProps) {
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

  return (
    <motion.div
      layout="position"
      layoutId={player.id}
      transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.8 }}
      ref={(node: HTMLDivElement | null) => {
        el.current = node;
        dragRef(node);
        dropRef(node);
      }}
      data-player-id={player.id}
      title={playerTooltip(player)}
      className={
        "pcard" +
        (compact ? " compact" : "") +
        (isDragging ? " is-ghost" : "") +
        (isOver && !isDragging ? " is-over" : "") +
        (highlighted ? " is-highlighted" : "")
      }
      style={{ "--tint": tint ?? "150 180 255" } as React.CSSProperties}
      onDoubleClick={() => moveByDoubleClick(player.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        ui.stats.editorResult = "";
        ui.stats.editorLoading = false;
        openDialog({ kind: "edit", player, nonce: Date.now() });
      }}
      {...attributes}
      {...listeners}
    >
      <CardBody player={player} srMethod={srMethod} slotClass={slotClass} compact={compact} />
    </motion.div>
  );
}

export const PlayerCard = memo(PlayerCardInner, () => false);

export function EmptySlot({ id, role, compact, label = "Open slot" }: { id: string; role?: string; compact?: boolean; label?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={"slot-empty" + (compact ? " compact" : "") + (isOver ? " is-over" : "")}>
      {role ? (
        <span className="slot-role !bg-transparent">
          <RoleIcon role={role} size={18} color={ROLE_COLORS[role] + "80"} />
        </span>
      ) : null}
      <span className="font-display text-[13px] font-semibold uppercase tracking-[0.18em]">{label}</span>
    </div>
  );
}
