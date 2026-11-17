import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { is_undefined, print_date } from "../logic/common";
import { class_titles, hero_classes, hero_names, rank_label } from "../logic/defines";
import { S } from "../logic/state";
import { offrole_history } from "../logic/offrole";
import type { Player } from "../logic/types";
import { IconCheck, IconLock, IconPin, RankBadge, RoleIcon } from "./icons";

type HoverState = { player: Player; rect: DOMRect } | null;

let state: HoverState = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function hoverStart(player: Player, el: HTMLElement) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state = { player, rect: el.getBoundingClientRect() };
    emit();
  }, 650);
}

export function hoverEnd() {
  clearTimeout(timer);
  if (state) {
    state = null;
    emit();
  }
}

const LEGACY_HERO_KEYS: Record<string, string> = { soldier76: "soldier-76", wrecking_ball: "wrecking-ball", mccree: "cassidy" };

export function heroName(key: string) {
  const k = LEGACY_HERO_KEYS[key] ?? key;
  return hero_names[k] ?? k.replace(/[-_]/g, " ");
}

export function heroRole(key: string) {
  return hero_classes[LEGACY_HERO_KEYS[key] ?? key];
}

export function HoverCard({ hidden }: { hidden: boolean }) {
  const h = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  const show = h && !hidden;
  let style: React.CSSProperties = {};
  if (h) {
    const width = 310;
    const right = h.rect.right + 12 + width < window.innerWidth;
    style = {
      top: Math.min(h.rect.top, window.innerHeight - 260),
      left: right ? h.rect.right + 12 : Math.max(8, h.rect.left - 12 - width),
      width,
    };
  }
  const p = h?.player;
  return createPortal(
    <AnimatePresence>
      {show && p && (
        <motion.div
          key={p.id}
          className="hovercard panel pointer-events-none fixed z-[70] p-3"
          style={{ ...style, "--cut": "10px", "--accent": "rgb(255 154 31 / .8)" } as React.CSSProperties}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.16 }}
        >
          <div className="flex items-center gap-2">
            <span className="pname !text-[19px]">{p.display_name || p.id}</span>
            {S.pinned_players.has(p.id) && <IconPin size={13} className="text-brand-2" />}
            {S.checkin_list.has(p.id) && <IconCheck size={14} className="text-ok" />}
            {p.private_profile && <IconLock size={13} className="text-muted" />}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">{p.id.replace("-", "#")}</div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {p.classes.length == 0 && <div className="text-[13px] text-muted">No roles selected</div>}
            {p.classes.map((c, i) => {
              const sr = is_undefined(p.sr_by_class[c], 0);
              return (
                <div key={c} className="flex items-center gap-2">
                  <RoleIcon role={c} size={16} />
                  <span className="w-[66px] shrink-0 font-display text-[14px] font-bold uppercase tracking-wide">{class_titles[c as keyof typeof class_titles]}</span>
                  <RankBadge sr={sr} size={22} />
                  <span className="whitespace-nowrap text-[13px]">{rank_label(sr)}</span>
                  <span className="sr-num ml-auto text-[13px] text-muted">{sr}</span>
                  {i == 0 && <span className="chip !h-4 !px-1.5 !text-[10px]">MAIN</span>}
                </div>
              );
            })}
          </div>
          {p.top_heroes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {p.top_heroes.map((t) => (
                <span key={t.hero} className="chip !h-6 !text-[12px]">
                  {heroRole(t.hero) && <RoleIcon role={heroRole(t.hero)} size={12} />}
                  {heroName(t.hero)}
                </span>
              ))}
            </div>
          )}
          {(offrole_history()[p.id] ?? 0) > 0 && (
            <div className="mt-2 text-[12px] text-brand-2">Off-role in {offrole_history()[p.id]} recorded {offrole_history()[p.id] == 1 ? "match" : "matches"} in the last 24 h</div>
          )}
          <div className="mt-2.5 border-t border-line pt-2 text-[12px] text-muted">
            Stats updated {print_date(p.last_updated)}
            <span className="float-right">Right-click to edit</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
