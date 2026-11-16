import { class_names } from "./defines";
import {
  array_shuffle,
  create_empty_player,
  find_player_by_id,
  find_team_with_free_slot,
  format_player_id,
  format_player_name,
  get_default_export_options,
  get_default_settings,
  get_player_index,
  get_team_size,
  init_team_slots,
  is_role_lock_enabled,
  sort_players,
} from "./common";
import { import_lobby, read_saved_json, restore_saved_teams, save_checkin_list, save_pinned_list, save_players_list } from "./importExport";
import { S, storage_prefix, store } from "./state";
import { StatsUpdater } from "./statsUpdater";
import type { Player, SettingsShape, TeamSlots } from "./types";

export type DropTarget =
  | { type: "player"; id: string }
  | { type: "empty"; container: "lobby" | "team1" | "team2"; slot_class?: string }
  | { type: "trash" };

export interface BalancerSettings {
  slots_count: Record<string, number>;
  algorithm: string;
  separate_otps: boolean;
  adjust_sr: boolean;
  adjust_sr_by_class: Record<string, number>;
  balance_priority_classic: number;
  classic_sr_calc_method: string;
  balance_priority_rolelock: number;
}

export interface BalanceResult {
  is_successfull: boolean;
  is_rolelock: boolean;
  team1: Player[];
  team2: Player[];
  team1_slots: TeamSlots;
  team2_slots: TeamSlots;
}

export interface EditRow {
  class_name: string;
  sr: number;
  enabled: boolean;
}

export interface EditValues {
  display_name: string;
  rows: EditRow[];
  pinned: boolean;
  checkin: boolean;
}

export const runtime = {
  player_being_added: undefined as Player | undefined,
};

export function apply_stats_updater_settings() {
  StatsUpdater.update_edited_fields = S.Settings.update_edited_fields;
  StatsUpdater.update_sr = S.Settings.update_sr;
  StatsUpdater.update_class = S.Settings.update_class;
  StatsUpdater.platform = S.Settings.platform;
}

export function init_state() {
  const s = store();
  if (s.getItem("saved_players") !== null) convert_stored_data_v1();

  for (const [i, id] of (["team1_name", "team2_name"] as const).entries()) {
    const stored = s.getItem(storage_prefix + id);
    if (stored !== null) S.team_names[i] = stored;
  }

  S.Settings = get_default_settings();
  const saved_settings = read_saved_json("settings");
  if (saved_settings !== null && typeof saved_settings === "object") {
    for (const i in S.Settings) {
      if (saved_settings[i] !== undefined) S.Settings[i] = saved_settings[i];
    }
  }
  apply_stats_updater_settings();

  const role_lock = read_saved_json("role_lock_enabled");
  S.role_lock_enabled = role_lock !== null ? Boolean(role_lock) : false;

  const pinned = read_saved_json("pinned_players");
  if (Array.isArray(pinned)) S.pinned_players = new Set(pinned);

  const checkin = read_saved_json("checkin");
  if (Array.isArray(checkin)) S.checkin_list = new Set(checkin);

  S.ExportOptions = get_default_export_options();
  const saved = read_saved_json("export_options");
  if (saved !== null && typeof saved === "object") {
    for (const i of Object.keys(S.ExportOptions) as (keyof typeof S.ExportOptions)[]) {
      if (saved[i] !== undefined) (S.ExportOptions as unknown as Record<string, unknown>)[i] = saved[i];
    }
  }

  restore_saved_teams();
  save_players_list();
}

function convert_stored_data_v1() {
  const s = store();
  for (const [from, to] of [
    ["saved_players", "lobby"],
    ["saved_players_team1", "team1"],
    ["saved_players_team2", "team2"],
  ]) {
    const v = s.getItem(from);
    if (v !== null) {
      s.setItem(storage_prefix + to, v);
      s.removeItem(from);
    }
  }
  for (const i of [
    "region", "team1_name", "team2_name", "balance_adjust_sr", "balance_adjust_sr_dps", "balance_adjust_sr_tank",
    "balance_adjust_sr_support", "balance_class_uneveness_value", "balance_separate_otps", "balance_enable_captains",
    "update_class", "update_sr", "update_edited_fields", "update_picked", "dlg_setup_format", "dlg_setup_share_sr",
    "dlg_setup_share_classes", "dlg_setup_share_options",
  ]) {
    s.removeItem(i);
  }
}

export type AddPlayerStart = { status: "duplicate"; id: string } | { status: "queued"; player: Player } | { status: "empty" };

export function add_player_start(raw_id: string): AddPlayerStart {
  const player_id = format_player_id(raw_id);
  if (player_id == "") return { status: "empty" };
  if (find_player_by_id(player_id) !== undefined) return { status: "duplicate", id: player_id };
  const player = create_empty_player();
  player.id = player_id;
  runtime.player_being_added = player;
  StatsUpdater.addToQueue(player, 0, true);
  return { status: "queued", player };
}

export function import_players(format: string, text: string) {
  const result = import_lobby(format, text);
  if (result && result.ok && result.for_update.length > 0) StatsUpdater.addToQueue(result.for_update);
  return result;
}

export function place_new_player(player: Player) {
  let target_team = find_team_with_free_slot(player);
  if (target_team == undefined) target_team = S.lobby;
  target_team.push(player);
  save_players_list();
}

export function add_player_manually(player_id: string): Player {
  const new_player = create_empty_player();
  new_player.id = player_id;
  new_player.display_name = format_player_name(player_id);
  delete new_player.empty;
  place_new_player(new_player);
  return new_player;
}

export function add_test_players(number_to_add: number, create: (i: number) => Player): string[] {
  const added: string[] = [];
  for (let i = 1; i <= number_to_add; i++) {
    const new_player = create(i);
    if (find_player_by_id(new_player.id) !== undefined) continue;
    S.lobby.push(new_player);
    added.push(new_player.id);
  }
  save_players_list();
  return added;
}

export function apply_settings(form: SettingsShape) {
  let teams_changed = false;
  if (S.Settings["sr_calc_method"] != form.sr_calc_method && !is_role_lock_enabled()) teams_changed = true;

  const old_team_size = get_team_size();
  let new_team_size = 0;
  for (const class_name in S.Settings.slots_count) {
    const old_slot_count = S.Settings.slots_count[class_name];
    const new_slot_count = Number(form.slots_count[class_name]);
    new_team_size += new_slot_count;
    if (new_slot_count < old_slot_count) {
      teams_changed = true;
      while (S.team1_slots[class_name].length > new_slot_count) S.lobby.push(S.team1_slots[class_name].pop()!);
      while (S.team2_slots[class_name].length > new_slot_count) S.lobby.push(S.team2_slots[class_name].pop()!);
    }
    S.Settings.slots_count[class_name] = new_slot_count;
  }
  if (new_team_size < old_team_size) {
    for (const team of [S.team1, S.team2]) {
      while (team.length > new_team_size) S.lobby.push(team.pop()!);
    }
  }

  for (const setting_name in S.Settings) {
    if (setting_name == "slots_count") continue;
    S.Settings[setting_name] = form[setting_name];
  }

  store().setItem(storage_prefix + "settings", JSON.stringify(S.Settings));
  apply_stats_updater_settings();
  if (teams_changed) save_players_list();
  return teams_changed;
}

export function build_balancer_settings(): BalancerSettings {
  return {
    slots_count: S.Settings.slots_count,
    algorithm: S.Settings.balancer_alg,
    separate_otps: S.Settings.separate_otps,
    adjust_sr: S.Settings.adjust_sr,
    adjust_sr_by_class: {
      tank: S.Settings.adjust_tank,
      dps: S.Settings.adjust_dps,
      support: S.Settings.adjust_support,
    },
    balance_priority_classic: S.Settings.balance_priority,
    classic_sr_calc_method: S.Settings.sr_calc_method,
    balance_priority_rolelock: S.Settings.balance_priority_rolelock,
  };
}

export function collect_balance_players(): Player[] {
  let players = S.team1.slice();
  for (const class_name in S.team1_slots) players = players.concat(S.team1_slots[class_name]);
  players = players.concat(S.team2);
  for (const class_name in S.team2_slots) players = players.concat(S.team2_slots[class_name]);
  return players;
}

function revive_dates(p: Player): Player {
  if (!(p.last_updated instanceof Date)) p.last_updated = new Date(p.last_updated as unknown as string);
  return p;
}

export function apply_balance_result(result: BalanceResult) {
  S.role_lock_enabled = result.is_rolelock;
  store().setItem(storage_prefix + "role_lock_enabled", String(result.is_rolelock));
  S.team1 = result.team1.slice().map(revive_dates);
  S.team2 = result.team2.slice().map(revive_dates);
  init_team_slots(S.team1_slots);
  for (const class_name in result.team1_slots) S.team1_slots[class_name] = result.team1_slots[class_name].slice().map(revive_dates);
  init_team_slots(S.team2_slots);
  for (const class_name in result.team2_slots) S.team2_slots[class_name] = result.team2_slots[class_name].slice().map(revive_dates);
  sort_players(S.team1, "sr");
  sort_players(S.team2, "sr");
  save_players_list();
}

export function clear_lobby() {
  while (S.lobby.length > 0) {
    const player_to_delete = S.lobby.pop()!;
    S.checkin_list.delete(player_to_delete.id);
    S.pinned_players.delete(player_to_delete.id);
  }
  save_players_list();
  save_checkin_list();
  save_pinned_list();
}

export function clear_edited_mark(player: Player, field_name: "ne" | "se" | "ce") {
  player[field_name] = false;
  save_players_list();
}

export function edit_dialog_rows(player: Player): EditRow[] {
  const class_order: string[] = [];
  if (Array.isArray(player.classes)) for (const c of player.classes) class_order.push(c);
  for (const class_name of class_names) if (class_order.indexOf(class_name) == -1) class_order.push(class_name);
  return class_order.map((class_name) => ({
    class_name,
    enabled: player.classes.indexOf(class_name) != -1,
    sr: player.sr_by_class[class_name] == undefined ? 0 : player.sr_by_class[class_name],
  }));
}

export function edit_player_ok(player_struct: Player, values: EditValues) {
  const new_name = values.display_name;
  if (player_struct.display_name != new_name) player_struct.ne = true;
  player_struct.display_name = new_name;

  for (const row of values.rows) {
    let old_sr = player_struct.sr_by_class[row.class_name];
    if (old_sr == undefined) old_sr = 0;
    if (old_sr != Number(row.sr)) {
      player_struct.se = true;
      break;
    }
  }

  const new_classes = values.rows.filter((r) => r.enabled).map((r) => r.class_name);
  for (let i = 0; i < new_classes.length; i++) {
    if (player_struct.classes.indexOf(new_classes[i]) != i) {
      player_struct.ce = true;
      break;
    }
  }
  for (let i = 0; i < player_struct.classes.length; i++) {
    if (new_classes.indexOf(player_struct.classes[i]) != i) {
      player_struct.ce = true;
      break;
    }
  }

  player_struct.sr_by_class = {};
  player_struct.classes = [];
  for (const row of values.rows) {
    if ((class_names as readonly string[]).indexOf(row.class_name) == -1) continue;
    const new_sr = Number(row.sr);
    player_struct.sr_by_class[row.class_name] = new_sr;
    if (row.enabled && new_sr > 0) player_struct.classes.push(row.class_name);
  }

  if (values.pinned) S.pinned_players.add(player_struct.id);
  else S.pinned_players.delete(player_struct.id);
  save_pinned_list();

  if (values.checkin) S.checkin_list.add(player_struct.id);
  else S.checkin_list.delete(player_struct.id);
  save_checkin_list();

  save_players_list();
}

function pick_random_into(available_players: Player[], target: Player[], free_slots: number) {
  while (free_slots > 0 && available_players.length > 0) {
    const random_index = Math.floor(Math.random() * available_players.length);
    const random_player = available_players[random_index];
    S.lobby.splice(S.lobby.indexOf(random_player), 1);
    available_players.splice(available_players.indexOf(random_player), 1);
    target.push(random_player);
    free_slots--;
  }
  return free_slots;
}

export function fill_teams() {
  const allowed = (player: Player) => !(S.checkin_list.size > 0 && !S.checkin_list.has(player.id));
  if (is_role_lock_enabled()) {
    for (const team_slots of [S.team1_slots, S.team2_slots]) {
      for (const class_name in team_slots) {
        let free_slots = S.Settings.slots_count[class_name] - team_slots[class_name].length;
        const available_players: Player[] = [];
        for (const player of S.lobby) {
          if (!allowed(player)) continue;
          if (player.classes[0] !== class_name) continue;
          available_players.push(player);
        }
        free_slots = pick_random_into(available_players, team_slots[class_name], free_slots);
        if (free_slots <= 0) continue;

        for (const player of S.lobby) {
          if (!allowed(player)) continue;
          if (player.classes.indexOf(class_name) == -1) continue;
          available_players.push(player);
        }
        free_slots = pick_random_into(available_players, team_slots[class_name], free_slots);
        if (free_slots <= 0) continue;

        for (const player of S.lobby) {
          if (!allowed(player)) continue;
          available_players.push(player);
        }
        pick_random_into(available_players, team_slots[class_name], free_slots);
      }
    }
  } else {
    for (const team of [S.team1, S.team2]) {
      const free_slots = get_team_size() - team.length;
      const available_players: Player[] = [];
      for (const player of S.lobby) {
        if (S.checkin_list.size > 0) {
          if (S.checkin_list.has(player.id)) available_players.push(player);
        } else {
          available_players.push(player);
        }
      }
      pick_random_into(available_players, team, free_slots);
    }
  }
  save_players_list();
}

export function move_team_to_lobby(team_no: 1 | 2) {
  const team = team_no == 1 ? S.team1 : S.team2;
  const team_slots = team_no == 1 ? S.team1_slots : S.team2_slots;
  S.lobby = S.lobby.concat(team.filter((player) => !S.pinned_players.has(player.id)));
  const filtered = team.filter((player) => S.pinned_players.has(player.id));
  team.splice(0, team.length);
  while (filtered.length > 0) team.push(filtered.pop()!);
  for (const class_name in team_slots) {
    S.lobby = S.lobby.concat(team_slots[class_name].filter((player) => !S.pinned_players.has(player.id)));
    team_slots[class_name] = team_slots[class_name].filter((player) => S.pinned_players.has(player.id));
  }
  save_players_list();
}

export function reset_checkin() {
  S.checkin_list.clear();
  save_checkin_list();
}

export function set_checkin(player_id: string, checked: boolean) {
  if (checked) S.checkin_list.add(player_id);
  else S.checkin_list.delete(player_id);
  save_checkin_list();
}

export function role_lock_changed(checked: boolean) {
  S.role_lock_enabled = checked;
  store().setItem(storage_prefix + "role_lock_enabled", String(checked));

  for (const class_name of class_names) {
    if (S.team1_slots[class_name] == undefined) continue;
    while (S.team1_slots[class_name].length > 0) S.team1.push(S.team1_slots[class_name].shift()!);
  }
  for (const class_name of class_names) {
    if (S.team2_slots[class_name] == undefined) continue;
    while (S.team2_slots[class_name].length > 0) S.team2.push(S.team2_slots[class_name].shift()!);
  }

  if (checked) {
    for (const [team, slots] of [[S.team1, S.team1_slots], [S.team2, S.team2_slots]] as const) {
      init_team_slots(slots);
      for (const class_name of class_names) {
        for (let i = 0; i < S.Settings["slots_count"][class_name]; i++) {
          const removed_player = team.shift();
          if (removed_player == undefined) break;
          slots[class_name].push(removed_player);
        }
      }
    }
  }
  save_players_list();
}

export function save_team_name(team_no: 1 | 2, value: string) {
  S.team_names[team_no - 1] = value;
  store().setItem(storage_prefix + "team" + team_no + "_name", value);
}

export function save_export_options(format: string, include_sr: boolean, include_classes: boolean) {
  S.ExportOptions.format = format;
  S.ExportOptions.include_sr = include_sr;
  S.ExportOptions.include_classes = include_classes;
  store().setItem(storage_prefix + "export_options", JSON.stringify(S.ExportOptions));
}

export function shuffle_lobby() {
  S.lobby = array_shuffle(S.lobby);
  save_players_list();
}

export function sort_lobby(sort_field: string, order_inverse: boolean) {
  sort_players(S.lobby, sort_field, order_inverse);
  save_players_list();
}

export function sort_team(team_no: 1 | 2, sort_field: string) {
  sort_players(team_no == 1 ? S.team1 : S.team2, sort_field);
  save_players_list();
}

export function update_stats(scope: "all" | "active", stats_max_age: number) {
  if (scope == "all") StatsUpdater.addToQueue(S.lobby, stats_max_age);
  StatsUpdater.addToQueue(S.team1, stats_max_age);
  StatsUpdater.addToQueue(S.team2, stats_max_age);
  for (const class_name in S.team1_slots) StatsUpdater.addToQueue(S.team1_slots[class_name], stats_max_age);
  for (const class_name in S.team2_slots) StatsUpdater.addToQueue(S.team2_slots[class_name], stats_max_age);
}

export function update_player_stats_now(player: Player) {
  delete player.se;
  delete player.ce;
  StatsUpdater.addToQueue(player, 0, true);
}

export function container_of(player_id: string): Player[] | undefined {
  if (S.lobby.some((p) => p.id == player_id)) return S.lobby;
  let selected: Player[] | undefined;
  for (const team of [S.team1, S.team2]) {
    for (const p of team) if (player_id == p.id) selected = team;
  }
  for (const team_slots of [S.team1_slots, S.team2_slots]) {
    for (const class_name in team_slots) {
      for (const p of team_slots[class_name]) if (player_id == p.id) selected = team_slots[class_name];
    }
  }
  return selected;
}

export function player_dblclick(selected_id: string): "full" | "moved" | "none" {
  if (selected_id == "") return "none";
  const selected_team = container_of(selected_id);
  if (!selected_team) return "none";
  const selected_index = get_player_index(selected_id, selected_team);
  const selected_player = selected_team[selected_index];

  const new_team = selected_team == S.lobby ? find_team_with_free_slot(selected_player) : S.lobby;
  if (new_team === undefined) return "full";

  if (selected_team == S.lobby && S.Settings.update_picked) {
    StatsUpdater.addToQueue(selected_player, S.Settings.update_picked_maxage, true);
  }
  new_team.push(selected_player);
  selected_team.splice(selected_index, 1);
  save_players_list();
  return "moved";
}

export function player_drop(dragged_id: string, target: DropTarget): "removed" | "done" | "none" {
  let target_id = target.type == "player" ? target.id : "";
  if (dragged_id == target_id) return "none";

  let drag_action = "swap";
  if (target.type == "trash") {
    drag_action = "remove";
    target_id = "";
  }

  let dragged_team: Player[] | undefined;
  let dragged_index = -1;
  let dragged_player: Player | undefined;
  let target_team: Player[] | undefined;
  let target_index = -1;
  let target_player: Player | undefined;

  const scan = (team: Player[]) => {
    for (let i = 0; i < team.length; i++) {
      if (dragged_id == team[i].id) {
        dragged_team = team;
        dragged_index = i;
        dragged_player = team[i];
      }
      if (target_id == team[i].id) {
        target_team = team;
        target_index = i;
        target_player = team[i];
      }
    }
  };
  scan(S.lobby);
  scan(S.team1);
  scan(S.team2);
  for (const team_slots of [S.team1_slots, S.team2_slots]) {
    for (const class_name in team_slots) scan(team_slots[class_name]);
  }
  if (!dragged_team || !dragged_player) return "none";

  if (target_id == "" && target.type == "empty") {
    if (target.container == "lobby") {
      target_team = S.lobby;
      target_index = S.lobby.length;
    } else {
      const slots = target.container == "team1" ? S.team1_slots : S.team2_slots;
      const flat = target.container == "team1" ? S.team1 : S.team2;
      if (target.slot_class !== undefined) {
        target_team = slots[target.slot_class];
        target_index = slots[target.slot_class].length;
      } else {
        target_team = flat;
        target_index = flat.length;
      }
    }
    if (dragged_team == target_team) target_index = target_team.length - 1;
  }

  if (target_team == S.lobby && dragged_team != S.lobby) drag_action = "move";

  if (drag_action == "move") {
    target_team!.splice(target_index, 0, dragged_player);
    dragged_team.splice(dragged_index, 1);
  } else if (target_id == "") {
    dragged_team.splice(dragged_index, 1);
  } else {
    dragged_team[dragged_index] = target_player!;
  }

  if (drag_action == "swap") target_team![target_index] = dragged_player;

  if (drag_action == "remove") {
    StatsUpdater.removeFromQueue(dragged_id);
    S.pinned_players.delete(dragged_id);
    save_pinned_list();
    S.checkin_list.delete(dragged_id);
    save_checkin_list();
  }

  if (target_team != S.lobby && dragged_team == S.lobby && drag_action != "remove" && S.Settings.update_picked) {
    StatsUpdater.addToQueue(dragged_player, S.Settings.update_picked_maxage, true);
  }

  save_players_list();
  return drag_action == "remove" ? "removed" : "done";
}
