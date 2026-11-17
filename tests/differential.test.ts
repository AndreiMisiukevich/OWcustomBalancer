import { afterAll, afterEach, describe, expect, it } from "vitest";
import { loadLegacyPage, seededRandom, type LegacyPage } from "./legacy";
import { bootNewApp } from "./state";
import { S } from "../src/logic/state";
import * as A from "../src/logic/actions";
import { calc_team_sr } from "../src/logic/common";
import { export_lobby, export_teams, save_players_list } from "../src/logic/importExport";
import { StatsUpdater } from "../src/logic/statsUpdater";
import { StatsApi } from "../src/logic/statsApi";

const SCENARIOS = Number(process.env.DIFF_SCENARIOS ?? 200);
const STEPS = Number(process.env.DIFF_STEPS ?? 20);
const CLASSES = ["tank", "dps", "support"];
const HEROES = ["ana", "mercy", "genji", "tracer", "reinhardt", "dva", "kiriko", "sojourn"];
const SLOT_PRESETS = [
  { tank: 1, dps: 2, support: 2 },
  { tank: 2, dps: 2, support: 2 },
  { tank: 1, dps: 1, support: 1 },
];
const SR_METHODS = ["main", "max", "average", "weighted"];
const STORAGE_KEYS = ["lobby", "team1", "team2", "team1_slots", "team2_slots", "pinned_players", "checkin", "role_lock_enabled", "settings"];

type Rnd = () => number;
const pick = <T,>(rnd: Rnd, arr: T[]) => arr[Math.floor(rnd() * arr.length)];

function makePlayer(rnd: Rnd, n: number) {
  const pool = CLASSES.slice();
  const classes: string[] = [];
  const count = rnd() < 0.08 ? 0 : 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) classes.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const sr_by_class: Record<string, number> = {};
  const playtime_by_class: Record<string, number> = {};
  for (const c of CLASSES) {
    if (classes.includes(c) || rnd() < 0.3) sr_by_class[c] = Math.floor(rnd() * 4999);
    if (rnd() < 0.7) playtime_by_class[c] = Math.round(rnd() * 500) / 10;
  }
  const heroes = rnd() < 0.3 ? [{ hero: pick(rnd, HEROES), playtime: 40 }] : [{ hero: pick(rnd, HEROES), playtime: 12 }, { hero: pick(rnd, HEROES), playtime: 9 }];
  const p: Record<string, unknown> = {
    id: `Player${n}-${1000 + Math.floor(rnd() * 9000)}`,
    display_name: `Player${n}`,
    sr_by_class,
    playtime_by_class,
    level: Math.floor(rnd() * 3000),
    classes,
    top_heroes: heroes,
    last_updated: new Date(Date.UTC(2024, 0, 1) + Math.floor(rnd() * 1e10)).toISOString(),
    private_profile: rnd() < 0.1,
  };
  if (rnd() < 0.2) p.ne = true;
  if (rnd() < 0.2) p.se = true;
  if (rnd() < 0.2) p.ce = rnd() < 0.5;
  return p;
}

function makeStorage(seed: number) {
  const rnd = seededRandom(seed);
  const slots = pick(rnd, SLOT_PRESETS);
  const team_size = slots.tank + slots.dps + slots.support;
  const role_lock = rnd() < 0.5;
  const players = Array.from({ length: 4 + Math.floor(rnd() * 22) }, (_, i) => makePlayer(rnd, i));
  const lobby: unknown[] = [];
  const team1: unknown[] = [];
  const team2: unknown[] = [];
  const s1: Record<string, unknown[]> = { tank: [], dps: [], support: [] };
  const s2: Record<string, unknown[]> = { tank: [], dps: [], support: [] };
  for (const p of players) {
    const r = rnd();
    if (r < 0.5) lobby.push(p);
    else if (role_lock) {
      const slotsObj = r < 0.75 ? s1 : s2;
      const c = pick(rnd, CLASSES) as keyof typeof slots;
      if (slotsObj[c].length < slots[c]) slotsObj[c].push(p);
      else lobby.push(p);
    } else {
      const team = r < 0.75 ? team1 : team2;
      if (team.length < team_size) team.push(p);
      else lobby.push(p);
    }
  }
  const ids = players.map((p) => p.id as string);
  const settings = {
    slots_count: slots,
    balancer_alg: pick(rnd, ["rolelockfallback", "rolelock", "classic"]),
    adjust_sr: rnd() < 0.5,
    adjust_dps: 110,
    adjust_tank: 100,
    adjust_support: 90,
    separate_otps: rnd() < 0.5,
    balance_priority: Math.floor(rnd() * 101),
    sr_calc_method: pick(rnd, SR_METHODS),
    balance_priority_rolelock: Math.floor(rnd() * 101),
    update_class: true,
    update_sr: true,
    update_edited_fields: rnd() < 0.5,
    update_picked: rnd() < 0.5,
    update_picked_maxage: pick(rnd, [0, 15, 100000]),
  };
  return {
    owcgb_lobby: JSON.stringify(lobby),
    owcgb_team1: JSON.stringify(team1),
    owcgb_team2: JSON.stringify(team2),
    owcgb_team1_slots: JSON.stringify(s1),
    owcgb_team2_slots: JSON.stringify(s2),
    owcgb_saved_format: "5",
    owcgb_settings: JSON.stringify(settings),
    owcgb_role_lock_enabled: String(role_lock),
    owcgb_pinned_players: JSON.stringify(ids.filter(() => rnd() < 0.2)),
    owcgb_checkin: JSON.stringify(ids.filter(() => rnd() < 0.4)),
    owcgb_team1_name: "Alpha",
    owcgb_team2_name: "Bravo",
  } as Record<string, string>;
}

const ids = (arr: { id: string }[]) => arr.map((p) => p.id);

function withClassTab(legacyText: string) {
  const out: string[] = [];
  const teams = [S.team1, S.team2];
  let t = -1;
  let i = 0;
  for (const line of legacyText.split("\n")) {
    if (line == S.team_names[0] || line == S.team_names[1]) {
      t++;
      i = 0;
      out.push(line);
      continue;
    }
    const player = teams[t]?.[i];
    if (player && line.endsWith(player.display_name + player.classes.join("/"))) {
      out.push(line.slice(0, line.length - player.classes.join("/").length) + "\t" + player.classes.join("/"));
      i++;
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}
const strip = (o: Record<string, unknown>) => {
  const { region: _r, platform: _p, offrole_rotation: _o, role_balance: _b, ...rest } = o;
  return rest;
};

function legacySnapshot(L: LegacyPage) {
  const g = L.g;
  return JSON.parse(
    JSON.stringify({
      lobby: g("lobby"),
      team1: g("team1"),
      team2: g("team2"),
      team1_slots: g("team1_slots"),
      team2_slots: g("team2_slots"),
      pinned: Array.from(g("pinned_players")).sort(),
      checkin: Array.from(g("checkin_list")).sort(),
      role_lock: g("is_role_lock_enabled()"),
      settings: strip(g("Settings")),
      queue: ids(g("StatsUpdater.queue")),
      sr: [g("calc_team_sr(team1, team1_slots)"), g("calc_team_sr(team2, team2_slots)")],
    }),
  );
}

function newSnapshot() {
  return JSON.parse(
    JSON.stringify({
      lobby: S.lobby,
      team1: S.team1,
      team2: S.team2,
      team1_slots: S.team1_slots,
      team2_slots: S.team2_slots,
      pinned: Array.from(S.pinned_players).sort(),
      checkin: Array.from(S.checkin_list).sort(),
      role_lock: S.role_lock_enabled,
      settings: strip(S.Settings),
      queue: ids(StatsUpdater.queue),
      sr: [calc_team_sr(S.team1, S.team1_slots), calc_team_sr(S.team2, S.team2_slots)],
    }),
  );
}

function storageSnapshot(get: (k: string) => string | null) {
  return Object.fromEntries(
    STORAGE_KEYS.map((k) => {
      const v = get("owcgb_" + k);
      if (v == null) return [k, null];
      const parsed = JSON.parse(v);
      if (k == "settings") return [k, strip(parsed)];
      if (Array.isArray(parsed) && typeof parsed[0] === "string") return [k, parsed.slice().sort()];
      return [k, parsed];
    }),
  );
}

function fakeTarget(id: string, container: string, slot_class?: string) {
  return {
    id,
    parentElement: { parentElement: { id: container } },
    hasAttribute: (a: string) => a == "slotClass" && slot_class !== undefined,
    getAttribute: () => slot_class,
  };
}

function legacyDropEvent(dragged: string, target: A.DropTarget) {
  let currentTarget;
  if (target.type == "player") currentTarget = fakeTarget(target.id, "x");
  else if (target.type == "trash") currentTarget = fakeTarget("trashcan", "");
  else currentTarget = fakeTarget("", target.container, target.slot_class);
  return { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => dragged }, currentTarget };
}

function allIds() {
  return [...ids(S.lobby), ...ids(S.team1), ...ids(S.team2), ...Object.values(S.team1_slots).flatMap(ids), ...Object.values(S.team2_slots).flatMap(ids)];
}

function emptyTargets(): A.DropTarget[] {
  const out: A.DropTarget[] = [{ type: "empty", container: "lobby" }];
  for (const [container, flat, slots] of [["team1", S.team1, S.team1_slots], ["team2", S.team2, S.team2_slots]] as const) {
    if (S.role_lock_enabled) {
      for (const c of CLASSES) if (slots[c].length < S.Settings.slots_count[c]) out.push({ type: "empty", container, slot_class: c });
    } else {
      const size = Object.values(S.Settings.slots_count).reduce((a, b) => a + b, 0);
      if (flat.length < size) out.push({ type: "empty", container });
    }
  }
  return out;
}

type Step = { name: string; legacy: (L: LegacyPage) => void; next: () => void };

function randomStep(rnd: Rnd, L: LegacyPage): Step | null {
  const everyone = allIds();
  const kind = pick(rnd, ["drop", "drop", "drop", "dblclick", "dblclick", "fill", "clearteam", "rolelock", "settings", "sortlobby", "shuffle", "sortteam", "edit", "checkin", "clearlobby", "balance", "stats"]);
  const seed = Math.floor(rnd() * 1e9);
  const reseed = () => {
    const r1 = seededRandom(seed);
    const r2 = seededRandom(seed);
    L.window.Math.random = r1;
    Math.random = r2;
  };

  switch (kind) {
    case "drop": {
      if (everyone.length == 0) return null;
      const dragged = pick(rnd, everyone);
      const r = rnd();
      let target: A.DropTarget;
      if (r < 0.45) target = { type: "player", id: pick(rnd, everyone) };
      else if (r < 0.85) target = pick(rnd, emptyTargets());
      else target = { type: "trash" };
      return {
        name: `drop ${dragged} -> ${JSON.stringify(target)}`,
        legacy: (L) => L.window.player_drop(legacyDropEvent(dragged, target)),
        next: () => void A.player_drop(dragged, target),
      };
    }
    case "dblclick": {
      if (everyone.length == 0) return null;
      const id = pick(rnd, everyone);
      const container = S.lobby.some((p) => p.id == id) ? "lobby" : "team1";
      return {
        name: `dblclick ${id}`,
        legacy: (L) => L.window.player_dblClick({ currentTarget: fakeTarget(id, container) }),
        next: () => void A.player_dblclick(id),
      };
    }
    case "fill":
      return {
        name: "fill teams",
        legacy: (L) => {
          reseed();
          L.window.fill_teams();
        },
        next: () => A.fill_teams(),
      };
    case "clearteam": {
      const t = rnd() < 0.5 ? 1 : 2;
      return {
        name: `clear team ${t}`,
        legacy: (L) => L.g(`move_team_to_lobby(team${t}, team${t}_slots); redraw_teams();`),
        next: () => A.move_team_to_lobby(t as 1 | 2),
      };
    }
    case "rolelock": {
      const checked = !S.role_lock_enabled;
      return {
        name: `role lock ${checked}`,
        legacy: (L) => {
          L.window.document.getElementById("role_lock_enabled").checked = checked;
          L.window.role_lock_changed();
        },
        next: () => A.role_lock_changed(checked),
      };
    }
    case "settings": {
      const slots = pick(rnd, SLOT_PRESETS);
      const method = pick(rnd, SR_METHODS);
      const prio = Math.floor(rnd() * 101);
      return {
        name: `settings ${JSON.stringify(slots)} ${method}`,
        legacy: (L) => {
          const d = L.window.document;
          L.window.fill_settings_dlg(L.g("Settings"));
          for (const c of CLASSES) d.getElementById("slots_count_" + c).value = String(slots[c as keyof typeof slots]);
          d.getElementById("sr_calc_method").value = method;
          d.getElementById("balance_priority").value = String(prio);
          L.window.apply_settings();
        },
        next: () => {
          const form = JSON.parse(JSON.stringify(S.Settings));
          form.slots_count = { ...slots };
          form.sr_calc_method = method;
          form.balance_priority = prio;
          A.apply_settings(form);
        },
      };
    }
    case "sortlobby": {
      const field = pick(rnd, ["display_name", "sr", "class", "level", "checkin"]);
      const inverse = rnd() < 0.5;
      return {
        name: `sort lobby ${field} ${inverse}`,
        legacy: (L) => L.window.sort_lobby(field, { hasAttribute: () => inverse, removeAttribute() {}, setAttribute() {} }),
        next: () => A.sort_lobby(field, inverse),
      };
    }
    case "shuffle":
      return {
        name: "shuffle",
        legacy: (L) => {
          reseed();
          L.window.shuffle_lobby();
        },
        next: () => A.shuffle_lobby(),
      };
    case "sortteam": {
      const t = rnd() < 0.5 ? 1 : 2;
      const field = pick(rnd, ["class", "display_name", "sr"]);
      return {
        name: `sort team ${t} ${field}`,
        legacy: (L) => L.g(`sort_team(team${t}, '${field}'); redraw_teams();`),
        next: () => A.sort_team(t as 1 | 2, field),
      };
    }
    case "edit": {
      if (everyone.length == 0) return null;
      const id = pick(rnd, everyone);
      const name = rnd() < 0.5 ? "Renamed" + Math.floor(rnd() * 99) : null;
      const moves = Array.from({ length: Math.floor(rnd() * 3) }, () => ({ row: Math.floor(rnd() * 3), up: rnd() < 0.5 }));
      const toggles = CLASSES.map(() => rnd() < 0.3);
      const srs = CLASSES.map(() => (rnd() < 0.3 ? Math.floor(rnd() * 4999) : null));
      const pinned = rnd() < 0.5;
      const checkin = rnd() < 0.5;
      return {
        name: `edit ${id}`,
        legacy: (L) => {
          const w = L.window;
          const d = w.document;
          L.g(`player_being_edited = find_player_by_id(${JSON.stringify(id)}); fill_player_stats_dlg();`);
          for (const m of moves) {
            const row = d.getElementById("dlg_player_class_table").rows[m.row];
            const fn = m.up ? w.player_class_row_moveup : w.player_class_row_movedown;
            fn({ currentTarget: row.cells[4].getElementsByTagName("input")[0] });
          }
          const rows = d.getElementById("dlg_player_class_table").rows;
          for (let i = 0; i < 3; i++) {
            const cb = rows[i].getElementsByClassName("dlg-class-enabled-checkbox")[0];
            if (toggles[i]) cb.checked = !cb.checked;
            if (srs[i] !== null) rows[i].getElementsByClassName("dlg-sr-by-class")[0].value = String(srs[i]);
          }
          if (name !== null) d.getElementById("dlg_player_display_name").value = name;
          d.getElementById("dlg_player_pinned").checked = pinned;
          d.getElementById("dlg_player_checkin").checked = checkin;
          w.edit_player_ok();
        },
        next: () => {
          const player = allPlayers().find((p) => p.id == id)!;
          const rows = A.edit_dialog_rows(player);
          for (const m of moves) {
            const i = m.row;
            if (m.up && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
            if (!m.up && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
          }
          for (let i = 0; i < 3; i++) {
            if (toggles[i]) rows[i].enabled = !rows[i].enabled;
            if (srs[i] !== null) rows[i].sr = srs[i]!;
          }
          A.edit_player_ok(player, { display_name: name ?? player.display_name, rows, pinned, checkin });
        },
      };
    }
    case "checkin": {
      if (rnd() < 0.3) {
        return { name: "reset checkin", legacy: (L) => L.window.reset_checkin(), next: () => A.reset_checkin() };
      }
      if (S.lobby.length == 0) return null;
      const id = pick(rnd, ids(S.lobby));
      const checked = !S.checkin_list.has(id);
      return {
        name: `manual checkin ${id} ${checked}`,
        legacy: (L) => {
          const cbox = { checked, getAttribute: () => id };
          const tr = { classList: { toggle() {} } };
          L.window.document.body.insertAdjacentHTML("beforeend", "");
          L.g("manual_checkin_open()");
          L.window.manual_checkin_toggle_player(tr, cbox);
        },
        next: () => A.set_checkin(id, checked),
      };
    }
    case "clearlobby":
      if (rnd() < 0.7) return null;
      return { name: "clear lobby", legacy: (L) => L.window.clear_lobby(), next: () => A.clear_lobby() };
    case "balance": {
      return {
        name: "balance request + result",
        legacy: (L) => {
          L.workerMessages.length = 0;
          L.window.balance_teams();
          const [settingsMsg, balanceMsg] = L.workerMessages;
          const { offrole_rotation: _rot, offrole_history: _hist, role_balance: _rb, ...originalSettings } = JSON.parse(JSON.stringify(A.build_balancer_settings()));
          expect(settingsMsg).toEqual(["settings", originalSettings]);
          expect(ids(balanceMsg[1])).toEqual(ids(A.collect_balance_players()));
          const result = fakeBalanceResult(balanceMsg[1], seed);
          const cloned = L.window.JSON.parse(JSON.stringify(result));
          const revive = (arr: any[]) => arr.forEach((p) => (p.last_updated = new L.window.Date(p.last_updated)));
          revive(cloned.team1);
          revive(cloned.team2);
          for (const slots of [cloned.team1_slots, cloned.team2_slots]) Object.values(slots).forEach((a: any) => revive(a));
          L.window.on_balance_worker_message({ data: ["finish", cloned] });
        },
        next: () => {
          const players = JSON.parse(JSON.stringify(A.collect_balance_players()));
          A.apply_balance_result(JSON.parse(JSON.stringify(fakeBalanceResult(players, seed))));
        },
      };
    }
    case "stats": {
      if (everyone.length == 0) return null;
      const id = pick(rnd, everyone);
      const sr: Record<string, number> = {};
      for (const c of CLASSES) if (rnd() < 0.6) sr[c] = 1 + Math.floor(rnd() * 4999);
      const playtime: Record<string, number> = rnd() < 0.15 ? {} : { tank: rnd() * 40, dps: rnd() * 40, support: rnd() * 40 };
      const heroes = [{ hero: pick(rnd, HEROES), playtime: 30 }];
      const level = Math.floor(rnd() * 3000);
      return {
        name: `stats success ${id}`,
        legacy: (L) => {
          L.g(`StatsUpdater.queue = [find_player_by_id(${JSON.stringify(id)})];`);
          L.g(`OWAPI.sr_by_class = ${JSON.stringify(sr)}; OWAPI.playtime_by_class = ${JSON.stringify(playtime)}; OWAPI.top_heroes = ${JSON.stringify(heroes)}; OWAPI.level = ${level}; OWAPI.id = ${JSON.stringify(id)}; OWAPI.display_name = ${JSON.stringify(id.split("-")[0])};`);
          L.g("StatsUpdater.onOWAPISuccess(); save_players_list();");
        },
        next: () => {
          StatsUpdater.queue = [allPlayers().find((p) => p.id == id)!];
          Object.assign(StatsApi, { sr_by_class: sr, playtime_by_class: playtime, top_heroes: heroes, level, id, display_name: id.split("-")[0] });
          StatsUpdater.onApiSuccess();
          save_players_list();
        },
      };
    }
  }
  return null;
}

function allPlayers() {
  return [...S.lobby, ...S.team1, ...S.team2, ...Object.values(S.team1_slots).flat(), ...Object.values(S.team2_slots).flat()];
}

function fakeBalanceResult(players: { id: string; classes: string[] }[], seed: number) {
  const rnd = seededRandom(seed);
  const shuffled = players.slice().sort(() => rnd() - 0.5);
  const half = Math.ceil(shuffled.length / 2);
  const t1 = shuffled.slice(0, half);
  const t2 = shuffled.slice(half);
  const toSlots = (arr: typeof players) => {
    const s: Record<string, typeof players> = { tank: [], dps: [], support: [] };
    for (const p of arr) s[p.classes[0] ?? "dps"].push(p);
    return s;
  };
  const rolelock = rnd() < 0.5;
  return {
    is_successfull: true,
    is_rolelock: rolelock,
    team1: rolelock ? [] : t1,
    team2: rolelock ? [] : t2,
    team1_slots: rolelock ? toSlots(t1) : { tank: [], dps: [], support: [] },
    team2_slots: rolelock ? toSlots(t2) : { tank: [], dps: [], support: [] },
  };
}


const executed: Record<string, number> = {};
afterAll(() => {
  if (process.env.DIFF_STATS) console.log(JSON.stringify(executed));
});

let page: LegacyPage | undefined;
afterEach(() => {
  page?.close();
  page = undefined;
});

describe("new state logic matches the original app action by action", () => {
  const realRandom = Math.random;
  for (let scenario = 0; scenario < SCENARIOS; scenario++) {
    it(`scenario ${scenario}`, () => {
      const storage = makeStorage(1000 + scenario);
      page = loadLegacyPage(storage);
      const mem = bootNewApp(storage);
      const L = page;
      expect(newSnapshot()).toEqual(legacySnapshot(L));
      const rnd = seededRandom(5000 + scenario);
      try {
        for (let step = 0; step < STEPS; step++) {
          const s = randomStep(rnd, L);
          if (!s) continue;
          const now = Date.now();
          const realNow = Date.now;
          Date.now = () => now;
          L.window.Date.now = () => now;
          try {
            s.legacy(L);
            s.next();
            const key = s.name.split(" ").slice(0, 2).join(" ");
            executed[key] = (executed[key] ?? 0) + 1;
          } finally {
            Date.now = realNow;
          }
          if (s.name.startsWith("stats")) {
            const id = s.name.split(" ").pop()!;
            const np = allPlayers().find((p) => p.id == id)!;
            expect(Math.abs(np.last_updated.getTime() - Date.now())).toBeLessThan(5000);
            expect(Math.abs(L.g(`find_player_by_id(${JSON.stringify(id)}).last_updated.getTime()`) - Date.now())).toBeLessThan(5000);
            np.last_updated = new Date(0);
            L.g(`find_player_by_id(${JSON.stringify(id)}).last_updated = new Date(0); save_players_list();`);
            save_players_list();
          }
          const a = newSnapshot();
          const b = legacySnapshot(L);
          if (s.name.startsWith("stats")) {
            for (const snap of [a, b]) {
              for (const list of [snap.lobby, snap.team1, snap.team2, ...Object.values(snap.team1_slots), ...Object.values(snap.team2_slots)] as any[]) {
                for (const p of list) delete p.last_updated;
              }
            }
          }
          expect(a, `${scenario}/${step}: ${s.name}`).toEqual(b);
          expect(storageSnapshot((k) => mem.getItem(k)), `${scenario}/${step} storage: ${s.name}`).toEqual(
            storageSnapshot((k) => L.window.localStorage.getItem(k)),
          );
        }
      } finally {
        Math.random = realRandom;
      }
    });
  }
});

describe("dblclick into full teams reports it like the original alert", () => {
  it("returns full when no free slot", () => {
    const storage = makeStorage(77);
    const settings = JSON.parse(storage.owcgb_settings);
    settings.slots_count = { tank: 1, dps: 1, support: 1 };
    storage.owcgb_settings = JSON.stringify(settings);
    storage.owcgb_role_lock_enabled = "false";
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(seededRandom(i + 1), i));
    storage.owcgb_team1 = JSON.stringify(players.slice(0, 3));
    storage.owcgb_team2 = JSON.stringify(players.slice(3, 6));
    storage.owcgb_lobby = JSON.stringify(players.slice(6));
    storage.owcgb_team1_slots = JSON.stringify({ tank: [], dps: [], support: [] });
    storage.owcgb_team2_slots = JSON.stringify({ tank: [], dps: [], support: [] });
    page = loadLegacyPage(storage);
    bootNewApp(storage);
    const id = players[6].id as string;
    page.window.player_dblClick({ currentTarget: fakeTarget(id, "lobby") });
    expect(page.alerts).toContain("Teams are full");
    expect(A.player_dblclick(id)).toBe("full");
  });
});

describe("import and export match the original", () => {
  for (let scenario = 0; scenario < 15; scenario++) {
    it(`exports, scenario ${scenario}`, () => {
      const storage = makeStorage(3000 + scenario);
      page = loadLegacyPage(storage);
      bootNewApp(storage);
      for (const f of ["json", "text", "csv"]) expect(export_lobby(f), f).toBe(page.window.export_lobby(f));
      for (const f of ["text-list", "html-table"]) {
        for (const [sr, cls] of [[true, true], [false, true], [true, false], [false, false]]) {
          let expected = page.window.export_teams(f, true, sr, cls, false, 2);
          if (f == "text-list" && cls && !S.role_lock_enabled) expected = withClassTab(expected);
          expect(export_teams(f, true, sr, cls, false, 2), `${f} ${sr} ${cls}`).toBe(expected);
        }
      }
    });
  }

  const IMPORTS: [string, string][] = [
    ["text", "Alpha#1234\nBravo#2222 1500 2500 3500 dps\nCharlie-3333,100,200,300\nDelta#4444 1 2"],
    ["text", "Echo#1 9999 1 1"],
    ["text", "Foxtrot#1 10 20 30 healer"],
    ["text", "Golf#1 x 20 30"],
    ["json", JSON.stringify({ format_version: 5, format_type: "customs", players: [makePlayer(seededRandom(9), 90), makePlayer(seededRandom(10), 91)] })],
    ["json", JSON.stringify({ format_version: 4, players: [{ id: "Old-1", display_name: "Old", sr: 2500, top_classes: ["tank", "dps"], top_heroes: [], level: 5, last_updated: "2019-01-01T00:00:00.000Z", private_profile: false }] })],
    ["json", JSON.stringify({ format_version: 1, players: [{ id: "Older-1", display_name: "Older", sr: 2100, current_sr: 1, max_sr: 2, top_classes: ["offence", "defence"], top_heroes: [] }] })],
    ["json", JSON.stringify({ format_version: 9, players: [] })],
    ["json", JSON.stringify({ format_version: 5, format_type: "tournament", players: [] })],
    ["json", "{not json"],
    ["xml", "<x/>"],
  ];
  IMPORTS.forEach(([format, text], i) => {
    it(`imports ${format} #${i}`, () => {
      const storage = makeStorage(4000 + i);
      page = loadLegacyPage(storage);
      bootNewApp(storage);
      const fixedNow = new Date("2026-01-01T00:00:00Z").getTime();
      const RealDate = Date;
      const legacyOk = page.window.import_lobby(format, text);
      const result = A.import_players(format, text);
      void RealDate;
      void fixedNow;
      if (legacyOk === true) {
        expect(result && result.ok).toBe(true);
      } else {
        expect(result && !result.ok && result.error).toBe(page.alerts[page.alerts.length - 1]);
      }
      const strip = (snap: any) => {
        for (const p of snap.lobby) if (p.last_updated && format == "text") delete p.last_updated;
        return snap;
      };
      const legacy = legacySnapshot(page);
      for (const p of legacy.lobby) if (p.level === undefined) p.level = 0;
      expect(strip(newSnapshot())).toEqual(strip(legacy));
      if (result && result.ok) expect(ids(result.for_update)).toEqual(ids(page.g("StatsUpdater.queue")));
    });
  });
});
