import { describe, expect, it } from "vitest";
import { bootNewApp } from "./state";
import { S } from "../src/logic/state";
import * as A from "../src/logic/actions";
import { export_lobby, export_teams, storage_errors } from "../src/logic/importExport";
import { StatsApi } from "../src/logic/statsApi";
import { emptySlotId, toTarget } from "../src/ui/dropTargets";

const settings = (extra: object = {}) =>
  JSON.stringify({ slots_count: { tank: 1, dps: 2, support: 2 }, sr_calc_method: "main", update_picked: false, ...extra });

describe("text import", () => {
  it("skips blank and indented lines instead of creating players with an empty id", () => {
    bootNewApp({ owcgb_settings: settings() });
    const r = A.import_players("text", "Alpha#1 1500 2500 3500 dps\n\n   \n  Bravo#2 1000 2000 3000 tank\n");
    expect(r && r.ok).toBe(true);
    expect(S.lobby.map((p) => p.id)).toEqual(["Alpha-1", "Bravo-2"]);
    expect(S.lobby[1].classes).toEqual(["tank"]);
  });

  it("adds a BattleTag repeated in one import only once", () => {
    bootNewApp({ owcgb_settings: settings() });
    A.import_players("text", "Alpha#1 1 2 3\nAlpha#1 4 5 6");
    expect(S.lobby.map((p) => p.id)).toEqual(["Alpha-1"]);
    expect(S.lobby[0].sr_by_class.tank).toBe(1);
  });
});

describe("JSON import", () => {
  it("fills missing fields so the UI never reads undefined", () => {
    bootNewApp({ owcgb_settings: settings() });
    const r = A.import_players("json", JSON.stringify({ format_version: 5, players: [{ id: "Bare-1" }, { id: "Odd-2", classes: ["dps", "healer", "dps"], level: "7", sr_by_class: null }] }));
    expect(r && r.ok).toBe(true);
    const [a, b] = S.lobby;
    expect(a).toMatchObject({ id: "Bare-1", display_name: "Bare", level: 0, classes: [], sr_by_class: {}, playtime_by_class: {}, top_heroes: [], private_profile: false });
    expect(a.last_updated.getTime()).toBe(0);
    expect(b).toMatchObject({ classes: ["dps"], level: 7, sr_by_class: {} });
  });

  it("skips entries without an id and duplicate ids", () => {
    bootNewApp({ owcgb_settings: settings() });
    A.import_players("json", JSON.stringify({ format_version: 5, players: [null, { name: "x" }, { id: "" }, { id: "A-1" }, { id: "A-1" }] }));
    expect(S.lobby.map((p) => p.id)).toEqual(["A-1"]);
  });

  it("rejects a file without a players list", () => {
    bootNewApp({ owcgb_settings: settings() });
    const r = A.import_players("json", JSON.stringify({ format_version: 5 }));
    expect(r).toEqual({ ok: false, error: "Incorrect import format: no players list" });
  });
});

describe("exports", () => {
  it("quotes CSV cells that contain commas or quotes", () => {
    bootNewApp({ owcgb_settings: settings() });
    A.import_players("json", JSON.stringify({ format_version: 5, players: [{ id: "Comma-1", display_name: 'Smith, "Ace"' }] }));
    const row = export_lobby("csv").split("\n")[1];
    expect(row.startsWith('Comma#1,"Smith, ""Ace""",0,')).toBe(true);
  });

  it("separates name and roles with a tab in the plain text team list", () => {
    bootNewApp({ owcgb_settings: settings(), owcgb_role_lock_enabled: "false" });
    A.import_players("text", "Alpha#1 1500 2500 3500 dps");
    A.player_dblclick("Alpha-1");
    expect(export_teams("text-list", true, true, true, false, 2).split("\n")[1]).toBe("2500\tAlpha\tdps");
  });
});

describe("saved data", () => {
  it("starts with corrupted local storage and reports which keys were dropped", () => {
    storage_errors.length = 0;
    bootNewApp({
      owcgb_settings: "{broken",
      owcgb_lobby: "[{]",
      owcgb_team1: JSON.stringify([{ id: "Ok-1", classes: ["tank"], sr_by_class: { tank: 2000 } }, null, 5]),
      owcgb_team1_slots: JSON.stringify({ tank: [{ id: "Slot-1" }], offence: [{ id: "Old-1" }] }),
      owcgb_pinned_players: "nope",
      owcgb_saved_format: "5",
    });
    expect(storage_errors.sort()).toEqual(["lobby", "pinned_players", "settings"]);
    expect(S.lobby).toEqual([]);
    expect(S.team1.map((p) => p.id)).toEqual(["Ok-1"]);
    expect(S.team1_slots.tank.map((p) => p.id)).toEqual(["Slot-1"]);
    expect(S.Settings.slots_count).toEqual({ tank: 1, dps: 2, support: 2 });
  });
});

describe("drop target ids", () => {
  it("are unique per empty slot and parse back to the right target", () => {
    const ids = [0, 1, 2].flatMap((i) => [emptySlotId("team1", "dps", i), emptySlotId("team2", undefined, i)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(toTarget(emptySlotId("team1", "dps", 1))).toEqual({ type: "empty", container: "team1", slot_class: "dps" });
    expect(toTarget(emptySlotId("team2", undefined, 2))).toEqual({ type: "empty", container: "team2", slot_class: undefined });
    expect(toTarget("empty:lobby")).toEqual({ type: "empty", container: "lobby" });
    expect(toTarget("player:Name-123")).toEqual({ type: "player", id: "Name-123" });
    expect(toTarget("trash")).toEqual({ type: "trash" });
    expect(toTarget("empty:bogus:x:0")).toBeNull();
  });
});

describe("stopping the stats queue while a player is being added", () => {
  it("re-enables the add button", async () => {
    bootNewApp({ owcgb_settings: settings() });
    StatsApi.fetcher = () => new Promise<Response>(() => {});
    const { addPlayer, stopStatsUpdate } = await import("../src/ui/controller");
    const { ui } = await import("../src/ui/store");
    addPlayer("Waiting#1");
    expect(ui.adding).toBe(true);
    stopStatsUpdate();
    expect(ui.adding).toBe(false);
    expect(A.runtime.player_being_added).toBeUndefined();
  });
});

describe("balance result that arrives after the teams changed", () => {
  it("is discarded instead of duplicating the moved player", async () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `P${i}-1`, display_name: `P${i}`, classes: ["dps"], sr_by_class: { dps: 1500 + i * 100 } }));
    bootNewApp({
      owcgb_settings: settings(),
      owcgb_role_lock_enabled: "false",
      owcgb_team1: JSON.stringify(players.slice(0, 5)),
      owcgb_team2: JSON.stringify(players.slice(5)),
      owcgb_saved_format: "5",
    });
    const { startBalanceRequest, onWorkerMessage } = await import("../src/ui/controller");
    const sent = JSON.parse(JSON.stringify(startBalanceRequest()));
    A.player_dblclick("P0-1");
    expect(S.lobby.map((p) => p.id)).toEqual(["P0-1"]);
    const result = { is_successfull: true, is_rolelock: false, team1: sent.slice(5), team2: sent.slice(0, 5), team1_slots: {}, team2_slots: {} };
    onWorkerMessage({ data: ["finish", result] });
    const all = [...S.lobby, ...S.team1, ...S.team2].map((p) => p.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(10);
    expect(S.lobby.map((p) => p.id)).toEqual(["P0-1"]);
  });

  it("is applied with the live player objects, keeping edits made meanwhile", async () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `Q${i}-1`, display_name: `Q${i}`, classes: ["dps"], sr_by_class: { dps: 1500 + i * 100 } }));
    bootNewApp({
      owcgb_settings: settings(),
      owcgb_role_lock_enabled: "false",
      owcgb_team1: JSON.stringify(players.slice(0, 5)),
      owcgb_team2: JSON.stringify(players.slice(5)),
      owcgb_saved_format: "5",
    });
    const { startBalanceRequest, onWorkerMessage } = await import("../src/ui/controller");
    const sent = JSON.parse(JSON.stringify(startBalanceRequest()));
    const live = S.team1[0];
    live.display_name = "Renamed meanwhile";
    onWorkerMessage({ data: ["finish", { is_successfull: true, is_rolelock: false, team1: sent.slice(5), team2: sent.slice(0, 5), team1_slots: {}, team2_slots: {} }] });
    const after = [...S.team1, ...S.team2].find((p) => p.id == live.id)!;
    expect(after).toBe(live);
    expect(after.display_name).toBe("Renamed meanwhile");
  });
});

describe("saved state with the same player twice", () => {
  it("keeps only the first copy so the player can't be duplicated in the UI", () => {
    const p = { id: "Dup-1", display_name: "Dup", classes: ["dps"], sr_by_class: { dps: 2000 } };
    bootNewApp({
      owcgb_settings: settings(),
      owcgb_saved_format: "5",
      owcgb_lobby: JSON.stringify([p, { ...p }]),
      owcgb_team1: JSON.stringify([{ ...p }, { id: "Other-1" }]),
      owcgb_team2_slots: JSON.stringify({ tank: [{ ...p }], dps: [], support: [] }),
    });
    expect(S.lobby.map((x) => x.id)).toEqual(["Dup-1"]);
    expect(S.team1.map((x) => x.id)).toEqual(["Other-1"]);
    expect(S.team2_slots.tank).toEqual([]);
  });
});
