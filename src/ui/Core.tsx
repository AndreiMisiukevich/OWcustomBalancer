import { motion } from "motion/react";
import * as A from "../logic/actions";
import { calc_team_sr } from "../logic/common";
import { S } from "../logic/state";
import { balanceTeams, runAndRender } from "./controller";
import { IconDownload, IconScale, IconShuffle, IconLock } from "./icons";
import { openDialog, ui } from "./store";
import { AnimatedNumber } from "./Team";

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

      <div className="w-full">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="hud-label !text-[10px]">SR gap</span>
          <AnimatedNumber value={Math.abs(delta)} className="font-display text-[22px] font-extrabold leading-none text-text" />
        </div>
        <div className="delta-track">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-t1/70 to-t1/10" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-t2/70 to-t2/10" />
          <motion.div className="absolute inset-y-[-2px] w-[3px] bg-white shadow-[0_0_10px_white]" animate={{ left: `calc(${pos}% - 1.5px)` }} transition={{ type: "spring", stiffness: 140, damping: 18 }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span className="text-t1">◀ {S.team_names[0]}</span>
          <span className="text-t2">{S.team_names[1]} ▶</span>
        </div>
      </div>

      <label className="flex w-full cursor-pointer items-center justify-between gap-3 border-y border-line py-3" htmlFor="role_lock_switch">
        <span className="flex items-center gap-2">
          <IconLock size={16} className="text-brand" />
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.1em]">Role lock</span>
        </span>
        <Toggle id="role_lock_switch" checked={S.role_lock_enabled} label="Role lock" onChange={(v) => runAndRender(() => A.role_lock_changed(v))} />
      </label>

      <button className="balance-btn" onClick={balanceTeams} disabled={running} title="Find the most balanced composition. Click again for another variant.">
        <span className="relative flex items-center justify-center gap-2">
          <IconScale size={22} /> Balance
        </span>
      </button>

      <div className="grid w-full grid-cols-2 gap-2">
        <button className="btn !px-2" onClick={() => runAndRender(() => A.fill_teams())} title="Pick random checked-in players from the lobby to fill empty slots">
          <IconShuffle size={15} /> Fill
        </button>
        <button className="btn !px-2" onClick={() => openDialog({ kind: "exportTeams" })} title="Export team compositions">
          <IconDownload size={15} /> Export
        </button>
      </div>
    </div>
  );
}
