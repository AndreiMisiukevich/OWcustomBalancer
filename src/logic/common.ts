import { class_names, rank_tier } from "./defines";
import { S } from "./state";
import type { ExportOptionsShape, Player, SettingsShape, TeamSlots } from "./types";

export function array_shuffle<T>(a: T[]): T[] {
  let j: number, x: T, i: number;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

export function calc_team_sr(players_array: Player[], players_slots: TeamSlots): number {
  let team_sr = 0;
  if (is_role_lock_enabled()) {
    for (const class_name of class_names) {
      if (players_slots[class_name] == undefined) continue;
      for (let i = 0; i < players_slots[class_name].length; i++) {
        team_sr += get_player_sr(players_slots[class_name][i], class_name);
      }
    }
  } else {
    for (let i = 0; i < players_array.length; i++) {
      team_sr += get_player_sr(players_array[i], S.Settings["sr_calc_method"]);
    }
  }
  const team_size = get_team_size();
  return Math.round(team_sr / team_size);
}

export function create_empty_player(): Player {
  const new_player: Player = {
    id: "",
    display_name: "",
    sr_by_class: {},
    playtime_by_class: {},
    empty: true,
    level: 0,
    classes: [],
    top_heroes: [],
    last_updated: new Date(0),
    private_profile: false,
  };
  for (const class_name of class_names) {
    new_player.sr_by_class[class_name] = 0;
    new_player.playtime_by_class[class_name] = 0;
  }
  return new_player;
}

export function create_random_player(id: number): Player {
  const classes: string[] = class_names.slice();
  const top_classes: string[] = [];
  top_classes.push(classes.splice(Math.round(Math.random() * (classes.length - 1)), 1)[0]);
  if (Math.random() > 0.4) {
    const new_class = classes[Math.round(Math.random() * (classes.length - 1))];
    if (top_classes.indexOf(new_class) == -1) top_classes.push(new_class);
  }
  if (Math.random() > 0.8) {
    const new_class = classes[Math.round(Math.random() * (classes.length - 1))];
    if (top_classes.indexOf(new_class) == -1) top_classes.push(new_class);
  }
  const new_player: Player = {
    id: "player" + id + "-" + Math.round(Math.random() * 99999),
    display_name: "player " + id,
    sr_by_class: {},
    playtime_by_class: {},
    level: Math.round(Math.random() * 2000),
    empty: false,
    classes: top_classes,
    top_heroes: [],
    last_updated: new Date(0),
    fake_id: true,
    private_profile: false,
  };
  for (let i = 0; i < top_classes.length; i++) {
    new_player.sr_by_class[top_classes[i]] = Math.round(randn_bm(1, 4999, 1));
    new_player.playtime_by_class[top_classes[i]] = Math.round(randn_bm(1, 30, 1));
  }
  return new_player;
}

export function escapeHtml(html: string): string {
  return String(html)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
}


export function find_player_by_id(player_id: string): Player | undefined {
  for (let i = 0; i < S.lobby.length; i++) {
    if (player_id == S.lobby[i].id) return S.lobby[i];
  }
  for (const team of [S.team1, S.team2]) {
    for (let i = 0; i < team.length; i++) {
      if (player_id == team[i].id) return team[i];
    }
  }
  for (const team_slots of [S.team1_slots, S.team2_slots]) {
    for (const class_name in team_slots) {
      for (let i = 0; i < team_slots[class_name].length; i++) {
        if (player_id == team_slots[class_name][i].id) return team_slots[class_name][i];
      }
    }
  }
  return undefined;
}

export function find_team_with_free_slot(player: Player): Player[] | undefined {
  if (is_role_lock_enabled()) {
    for (const class_name of player.classes) {
      for (const team_slots of [S.team1_slots, S.team2_slots]) {
        if (team_slots[class_name].length < S.Settings.slots_count[class_name]) return team_slots[class_name];
      }
    }
    for (const team_slots of [S.team1_slots, S.team2_slots]) {
      for (const class_name in team_slots) {
        if (team_slots[class_name].length < S.Settings.slots_count[class_name]) return team_slots[class_name];
      }
    }
  } else {
    for (const team of [S.team1, S.team2]) {
      if (team.length < get_team_size()) return team;
    }
  }
  return undefined;
}

export function format_player_id(id: string) {
  return id.trim().replace("#", "-");
}

export function format_player_name(id: string) {
  return id.slice(0, id.search("-"));
}

export function get_default_settings(): SettingsShape {
  return {
    slots_count: { tank: 1, dps: 2, support: 2 },
    balancer_alg: "rolelockfallback",
    adjust_sr: false,
    adjust_dps: 110,
    adjust_tank: 100,
    adjust_support: 90,
    separate_otps: true,
    balance_priority: 50,
    sr_calc_method: "main",
    balance_priority_rolelock: 50,
    platform: "pc",
    update_class: true,
    update_sr: true,
    update_edited_fields: false,
    update_picked: false,
    update_picked_maxage: 15,
  };
}

export function get_default_export_options(): ExportOptionsShape {
  return { format: "image", include_sr: true, include_classes: true };
}

export function get_player_index(player_id: string, team: Player[]) {
  for (let i = 0; i < team.length; i++) {
    if (player_id == team[i].id) return i;
  }
  return -1;
}

export function get_player_at_index(team_slots: TeamSlots, player_index: number): Player | undefined {
  let current_index = 0;
  for (const class_name in team_slots) {
    for (let i = 0; i < team_slots[class_name].length; i++) {
      if (current_index == player_index) return team_slots[class_name][i];
      current_index++;
    }
  }
  return undefined;
}

export function get_player_role(team_slots: TeamSlots, player: Player): string | undefined {
  for (const class_name in team_slots) {
    for (let i = 0; i < team_slots[class_name].length; i++) {
      if (player.id == team_slots[class_name][i].id) return class_name;
    }
  }
  return undefined;
}

export function get_player_sr(player_struct: Player, method = "main"): number {
  if ((class_names as readonly string[]).indexOf(method) != -1) {
    if (player_struct.sr_by_class[method] !== undefined) {
      return player_struct.classes.indexOf(method) != -1 ? player_struct.sr_by_class[method] : 0;
    }
    return 0;
  }
  if (method == "max") {
    let max_sr = 0;
    for (const class_name of player_struct.classes) {
      if (is_undefined(player_struct.sr_by_class[class_name], 0) > max_sr) {
        max_sr = is_undefined(player_struct.sr_by_class[class_name], 0);
      }
    }
    return max_sr;
  } else if (method == "average") {
    if (player_struct.classes.length == 0) return 0;
    let sr = 0;
    for (const class_name of player_struct.classes) sr += is_undefined(player_struct.sr_by_class[class_name], 0);
    return Math.round(sr / player_struct.classes.length);
  } else if (method == "weighted") {
    if (player_struct.classes.length == 0) return 0;
    let sr = 0;
    let total_time = 0;
    for (const class_name of player_struct.classes) {
      let time = player_struct.playtime_by_class[class_name];
      if (time == undefined) time = 0;
      total_time += time;
      sr += is_undefined(player_struct.sr_by_class[class_name], 0) * time;
    }
    if (total_time == 0) total_time = 1;
    return Math.round(sr / total_time);
  } else {
    if (player_struct.classes.length == 0) return 0;
    const main_class = player_struct.classes[0];
    return player_struct.sr_by_class[main_class] !== undefined ? player_struct.sr_by_class[main_class] : 0;
  }
}

export function get_rank_name(sr: number): string {
  return rank_tier(sr).key;
}

export function get_team_name(team_number: number) {
  return S.team_names[team_number - 1];
}

export function get_team_size() {
  let team_size = 0;
  for (const class_name in S.Settings["slots_count"]) {
    for (let i = 0; i < S.Settings["slots_count"][class_name]; i++) team_size++;
  }
  return team_size;
}

export function get_team_player_count(team_slots: TeamSlots) {
  let player_count = 0;
  for (const class_name in team_slots) player_count += team_slots[class_name].length;
  return player_count;
}

export function init_team_slots(team_struct: TeamSlots) {
  for (const prop_name in team_struct) delete team_struct[prop_name];
  for (const class_name of class_names) team_struct[class_name] = [];
}


export function is_undefined<T>(expr: T | undefined, if_undefined: T): T {
  return typeof expr === "undefined" ? if_undefined : expr;
}

export function is_role_lock_enabled() {
  return S.role_lock_enabled;
}

export function print_date(date_value: Date | undefined) {
  if (typeof date_value === "undefined") return "-";
  if (date_value.getTime() == 0) return "-";
  return date_value.toLocaleString();
}

export function randn_bm(min: number, max: number, skew = 1): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num / 10.0 + 0.5;
  if (num > 1 || num < 0) num = randn_bm(min, max, skew);
  num = Math.pow(num, skew);
  num *= max - min;
  num += min;
  return num;
}

export function round_to(value: number, precision: number) {
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
}

export function sort_players(team: Player[], sort_field = "sr", order_asc = false) {
  let order = 1;
  if (order_asc) order = -1;

  if (sort_field == "class") {
    team.sort(function (player1, player2) {
      let val1 = 0;
      for (let i = 0; i < player1.classes.length; i++) {
        const weight = class_names.length - i - 1;
        val1 += ((class_names as readonly string[]).indexOf(player1.classes[i]) + 1) * Math.pow(10, weight);
      }
      let val2 = 0;
      for (let i = 0; i < player2.classes.length; i++) {
        const weight = class_names.length - i - 1;
        val2 += ((class_names as readonly string[]).indexOf(player2.classes[i]) + 1) * Math.pow(10, weight);
      }
      return order * (val1 - val2);
    });
  } else if (sort_field == "sr") {
    team.sort(function (player1, player2) {
      const val1 = get_player_sr(player1, S.Settings["sr_calc_method"]);
      const val2 = get_player_sr(player2, S.Settings["sr_calc_method"]);
      return order * (val2 - val1);
    });
  } else if (sort_field == "checkin") {
    team.sort(function (player1, player2) {
      const val1 = S.checkin_list.has(player1.id) ? 1 : 0;
      const val2 = S.checkin_list.has(player2.id) ? 1 : 0;
      return order * (val2 - val1);
    });
  } else {
    team.sort(function (player1, player2) {
      const a = player1[sort_field] as unknown;
      const b = player2[sort_field] as unknown;
      if (typeof a === "string") {
        const val1 = a.toLowerCase();
        const val2 = (b as string).toLowerCase();
        return order * (val1 < val2 ? -1 : val1 > val2 ? 1 : 0);
      }
      return order * ((b as number) - (a as number));
    });
  }
}

