import { AnimatePresence, motion } from "motion/react";
import * as A from "../logic/actions";
import { calc_team_sr, get_team_size } from "../logic/common";
import { S } from "../logic/state";
import { balanceTeams, runAndRender } from "./controller";
import { IconDownload, IconScale, IconShuffle, IconLock } from "./icons";
import { openDialog, ui } from "./store";
import { AnimatedNumber } from "./Team";
import { Tip } from "./Tip";

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}

export function Core() {
  const sr1 = calc_team_sr(S.team1, S.team1_slots);
  const sr2 = calc_team_sr(S.team2, S.team2_slots);
  const delta = sr1 - sr2;
  const span = Math.max(200, Math.abs(delta));
  const pos = 50 + (delta / span) * 50 * 0.9;
  const running = ui.balance.phase == "running";
  const size = get_team_size();
  const count = (flat: typeof S.team1, slots: typeof S.team1_slots) => (S.role_lock_enabled ? Object.values(slots).reduce((a, x) => a + x.length, 0) : flat.length);
  const complete = size > 0 && count(S.team1, S.team1_slots) >= size && count(S.team2, S.team2_slots) >= size;
  const gap = Math.abs(delta);
  const quality = !complete ? { text: "Teams not full", color: "text-muted" } : gap <= 50 ? { text: "Even", color: "text-ok" } : gap <= 150 ? { text: "Close", color: "text-brand-2" } : { text: "Uneven", color: "text-danger" };

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <motion.div
        key={ui.balancePulse}
        initial={{ scale: ui.balancePulse ? 1.35 : 1, opacity: ui.balancePulse ? 0.4 : 1 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 14 }}
        className="relative hidden place-items-center lg:grid"
      >
        <svg width="120" height="120" viewBox="0 0 120 120" className="absolute" aria-hidden="true">
          <g className="ring-spin" style={{ transformOrigin: "60px 60px" }}>
            <circle cx="60" cy="60" r="54" fill="none" stroke="url(#vsg)" strokeWidth="2" strokeDasharray="40 14 6 14" />
          </g>
          <g className="ring-spin-rev" style={{ transformOrigin: "60px 60px" }}>
            <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(150 180 255 / .25)" strokeWidth="1" strokeDasharray="3 7" />
          </g>
          <defs>
            <linearGradient id="vsg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2bb8ff" />
              <stop offset="1" stopColor="#ff4a5e" />
            </linearGradient>
          </defs>
        </svg>
        <span className="vs-mark relative px-6 py-7">VS</span>
      </motion.div>

      <div className="relative w-full">
        <AnimatePresence>
          {ui.balancePulse > 0 && ui.balanceStamp && (
            <motion.div
              key={ui.balancePulse}
              className="stamp pointer-events-none absolute -top-9 left-1/2 z-10"
              initial={{ opacity: 0, scale: 1.6, x: "-50%", rotate: -8 }}
              animate={{ opacity: 1, scale: 1, x: "-50%", rotate: -4 }}
              exit={{ opacity: 0, y: -6, x: "-50%", transition: { duration: 0.3 } }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
            >
              Balanced
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="hud-label">SR gap</span>
          <AnimatedNumber value={gap} className="font-display text-[24px] font-extrabold leading-none text-text" />
        </div>
        <div className="delta-track">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-t1/70 to-t1/10" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-t2/70 to-t2/10" />
          <motion.div className="absolute inset-y-[-2px] w-[3px] bg-white shadow-[0_0_10px_white]" animate={{ left: `calc(${pos}% - 1.5px)` }} transition={{ type: "spring", stiffness: 140, damping: 18 }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
          <span className="flex min-w-0 items-center gap-1 text-t1">
            <span className="h-2 w-2 shrink-0 bg-t1 [clip-path:polygon(0_50%,100%_0,100%_100%)]" />
            <span className="truncate">{S.team_names[0] || "Team 1"}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1 text-t2">
            <span className="truncate">{S.team_names[1] || "Team 2"}</span>
            <span className="h-2 w-2 shrink-0 bg-t2 [clip-path:polygon(0_0,100%_50%,0_100%)]" />
          </span>
        </div>
        <div className={"mt-2 text-center font-display text-[13px] font-bold uppercase tracking-[0.2em] " + quality.color}>{quality.text}</div>
      </div>

      <label className="flex w-full cursor-pointer items-center justify-between gap-3 border-y border-line py-3" htmlFor="role_lock_switch">
        <span className="flex items-center gap-2">
          <IconLock size={16} className="text-brand" />
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.1em]">Role lock</span>
        </span>
        <Toggle id="role_lock_switch" checked={S.role_lock_enabled} label="Role lock" onChange={(v) => runAndRender(() => A.role_lock_changed(v))} />
      </label>

      <Tip label="Find the most even split. Click again for another variant." side="bottom">
        <button className="balance-btn" onClick={balanceTeams} disabled={running}>
          <span className="relative flex items-center justify-center gap-2">
            <IconScale size={22} /> Balance
          </span>
        </button>
      </Tip>

      <div className="grid w-full grid-cols-2 gap-2">
        <Tip label="Fill empty slots with random players from the lobby (checked-in only, if anyone is checked in)" side="bottom">
          <button className="btn !px-2" onClick={() => runAndRender(() => A.fill_teams())}>
            <IconShuffle size={15} /> Fill
          </button>
        </Tip>
        <Tip label="Export teams as text, a table or an image" side="bottom">
          <button className="btn !px-2" onClick={() => openDialog({ kind: "exportTeams" })}>
            <IconDownload size={15} /> Export
          </button>
        </Tip>
      </div>
    </div>
  );
}
