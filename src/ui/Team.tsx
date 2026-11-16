import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import * as A from "../logic/actions";
import { calc_team_sr, get_team_size } from "../logic/common";
import { class_names, rank_label } from "../logic/defines";
import { S } from "../logic/state";
import { runAndRender } from "./controller";
import { IconX, RankBadge, RoleIcon } from "./icons";
import { EmptySlot, PlayerCard } from "./PlayerCard";
import { ui } from "./store";
import { emptySlotId } from "./dropTargets";
import { Tip } from "./Tip";

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

function TeamName({ team }: { team: 1 | 2 }) {
  const [value, setValue] = useState(S.team_names[team - 1]);
  useEffect(() => setValue(S.team_names[team - 1]), [team]);
  return (
    <input
      className="team-name"
      value={value}
      aria-label={`Team ${team} name`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => A.save_team_name(team, value)}
      onKeyDown={(e) => {
        if (e.key == "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function TeamPanel({ team }: { team: 1 | 2 }) {
  const flat = team == 1 ? S.team1 : S.team2;
  const slots = team == 1 ? S.team1_slots : S.team2_slots;
  const container = team == 1 ? "team1" : "team2";
  const color = team == 1 ? "var(--t1)" : "var(--t2)";
  const tint = team == 1 ? "43 184 255" : "255 74 94";
  const roleLock = S.role_lock_enabled;
  const teamSize = get_team_size();
  const sr = calc_team_sr(flat, slots);
  const count = roleLock ? Object.values(slots).reduce((a, s) => a + s.length, 0) : flat.length;
  const method = S.Settings.sr_calc_method;
  const full = teamSize > 0 && count >= teamSize;
  const dragged = ui.dragPlayer;
  const fits = (role?: string) => (dragged ? (role ? dragged.classes.includes(role) : true) : false);

  return (
    <section
      className="panel team-panel flex min-w-0 flex-col p-4"
      style={{ "--team": color } as React.CSSProperties}
      aria-label={`Team ${team}`}
    >
      <div className="team-glow" />
      {ui.balancePulse > 0 && <div key={ui.balancePulse} className="balance-pulse pointer-events-none absolute inset-0" />}
      {full && <div key={`full-${ui.balancePulse}`} className="team-full-sweep pointer-events-none absolute inset-0" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="hud-label" style={{ color }}>
            Team {team} · {count}/{teamSize}
          </div>
          <TeamName team={team} />
        </div>
        <Tip label="Send everyone except pinned players back to the lobby">
          <button className="icon-btn" aria-label={`Clear team ${team}`} onClick={() => runAndRender(() => A.move_team_to_lobby(team))}>
            <IconX size={17} />
          </button>
        </Tip>
      </div>

      <div className="relative mt-2 flex items-center gap-3">
        <RankBadge sr={sr} size={46} />
        <div>
          <AnimatedNumber value={sr} className="team-sr" />
          {full ? (
            <div className="hud-label mt-1">Avg SR · {rank_label(sr)}</div>
          ) : (
            <Tip label="Empty slots count as 0 SR in the team average">
              <div className="hud-label mt-1 w-fit cursor-help">
                Avg SR · {teamSize - count} {teamSize - count == 1 ? "slot" : "slots"} open
              </div>
            </Tip>
          )}
        </div>
        {!roleLock && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <span className="hud-label">Sort</span>
            <div className="seg !p-[2px]">
              {[
                ["class", "Role"],
                ["display_name", "Name"],
                ["sr", "SR"],
              ].map(([f, l]) => (
                <button key={f} className="!h-7 !px-2.5 !text-[12px]" onClick={() => runAndRender(() => A.sort_team(team, f))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-4 flex flex-col gap-1.5">
        {roleLock
          ? class_names.flatMap((c) => {
              const arr = slots[c] ?? [];
              const items = arr.map((p) => <PlayerCard key={p.id} player={p} srMethod={method} slotClass={c} tint={tint} />);
              for (let i = arr.length; i < (S.Settings.slots_count[c] ?? 0); i++) {
                items.push(<EmptySlot key={`${c}-e${i}`} id={emptySlotId(container, c, i)} role={c} fits={fits(c)} />);
              }
              return items;
            })
          : [
              ...flat.map((p) => <PlayerCard key={p.id} player={p} srMethod={method} tint={tint} />),
              ...Array.from({ length: Math.max(0, teamSize - flat.length) }, (_, i) => <EmptySlot key={`e${i}`} id={emptySlotId(container, undefined, i)} fits={fits()} />),
            ]}
      </div>

      {roleLock && (
        <div className="relative mt-3 flex gap-4 text-[13px] text-muted">
          {class_names.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <RoleIcon role={c} size={13} /> {(slots[c] ?? []).length}/{S.Settings.slots_count[c]}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
