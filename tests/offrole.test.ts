import { describe, expect, it } from "vitest";
import { bootNewApp } from "./state";
import * as A from "../src/logic/actions";
import { S } from "../src/logic/state";
import { load_offrole, OFFROLE_WINDOW_MS, offrole_history, record_match, recent_matches, undo_last_match } from "../src/logic/offrole";

const p = (id: string, classes: string[]) => ({ id, display_name: id, classes, sr_by_class: Object.fromEntries(classes.map((c) => [c, 2500])) });

function bootTeams(roleLock = true) {
  return bootNewApp({
    owcgb_settings: JSON.stringify({ slots_count: { tank: 1, dps: 2, support: 2 }, update_picked: false }),
    owcgb_saved_format: "5",
    owcgb_role_lock_enabled: String(roleLock),
    owcgb_team1_slots: JSON.stringify({ tank: [p("A-1", ["dps", "tank"])], dps: [p("B-1", ["dps"]), p("C-1", ["dps"])], support: [p("D-1", ["support"]), p("E-1", ["tank", "support"])] }),
    owcgb_team2_slots: JSON.stringify({ tank: [p("F-1", ["tank"])], dps: [p("G-1", ["dps"]), p("H-1", ["dps"])], support: [p("I-1", ["support"]), p("J-1", ["support"])] }),
  });
}

describe("off-role tracking", () => {
  it("records everyone placed outside their main role", () => {
    bootTeams();
    const r = record_match(1000);
    expect(r.ok && r.off.map((x) => x.id).sort()).toEqual(["A-1", "E-1"]);
    expect(offrole_history(1000)).toEqual({ "A-1": 1, "E-1": 1 });
  });

  it("counts only the last 24 hours, so an evening from 20:00 to 02:00 stays together", () => {
    bootTeams();
    const evening = Date.UTC(2026, 10, 17, 20, 0);
    record_match(evening);
    record_match(evening + 6 * 3600 * 1000);
    expect(offrole_history(evening + 6 * 3600 * 1000)["A-1"]).toBe(2);
    expect(offrole_history(evening + OFFROLE_WINDOW_MS + 1000)["A-1"]).toBe(1);
    expect(offrole_history(evening + 6 * 3600 * 1000 + OFFROLE_WINDOW_MS + 1000)).toEqual({});
  });

  it("survives a reload and drops matches older than 24 hours when loading", () => {
    const mem = bootTeams();
    const now = Date.now();
    mem.setItem("owcgb_offrole_matches", JSON.stringify([{ at: now - OFFROLE_WINDOW_MS - 5000, off: ["A-1"] }, { at: now - 3600 * 1000, off: ["E-1"] }, { bogus: true }]));
    S.offrole_matches = [];
    load_offrole(now);
    expect(recent_matches(now)).toEqual([{ at: now - 3600 * 1000, off: ["E-1"] }]);
    record_match(now);
    expect(JSON.parse(mem.getItem("owcgb_offrole_matches")!)).toHaveLength(2);
  });

  it("undoes the last recorded match", () => {
    bootTeams();
    record_match(1000);
    record_match(2000);
    expect(undo_last_match(2000)).toBe(true);
    expect(offrole_history(2000)).toEqual({ "A-1": 1, "E-1": 1 });
  });

  it("refuses to record without role lock or with open slots", () => {
    bootTeams(false);
    expect(record_match(1000)).toEqual({ ok: false, reason: "Turn role lock on to track off-roles." });
    bootTeams();
    A.player_dblclick("J-1");
    expect(record_match(1000)).toEqual({ ok: false, reason: "Fill both teams before recording the match." });
  });

  it("sends the rotation strength and recent history to the balancer", () => {
    bootTeams();
    record_match();
    const settings = A.build_balancer_settings();
    expect(settings.offrole_rotation).toBe(1);
    expect(settings.role_balance).toBe(0);
    expect(settings.offrole_history).toEqual({ "A-1": 1, "E-1": 1 });
  });
});
