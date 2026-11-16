import { class_names, SR_MAX } from "./defines";
import {
  escapeHtml,
  find_player_by_id,
  format_player_id,
  format_player_name,
  create_empty_player,
  get_player_at_index,
  get_player_role,
  get_player_sr,
  get_rank_name,
  get_team_name,
  get_team_player_count,
  get_team_size,
  init_team_slots,
  is_role_lock_enabled,
  is_undefined,
} from "./common";
import { S, storage_prefix, store } from "./state";
import type { Player, TeamSlots } from "./types";

export const icon_datauri: { classes: Record<string, string>; ranks: Record<string, string> } = {
  classes: {},
  ranks: {},
};

export function current_format_version() {
  return 5;
}

export function export_lobby(format: string) {
  let export_str = "";
  const lobby = S.lobby;
  if (format == "json") {
    const export_struct = { format_version: current_format_version(), format_type: "customs", players: lobby };
    export_str = JSON.stringify(export_struct, null, " ");
  } else if (format == "text") {
    for (const p of lobby) export_str += p.id.trim().replace("-", "#") + "\n";
  } else if (format == "csv") {
    export_str += "BattleTag,Name,Level,Tank SR,DPS SR,Support SR,Main class,Main hero,Last updated,Private profile\n";
    for (const p of lobby) {
      const player_id = p.id.trim().replace("-", "#");
      const main_class = p.classes[0] !== undefined ? p.classes[0] : "";
      const main_hero = p.top_heroes[0] !== undefined ? p.top_heroes[0].hero : "";
      const last_updated = p.last_updated.toISOString();
      const sr_tank = is_undefined(p.sr_by_class["tank"], 0);
      const sr_dps = is_undefined(p.sr_by_class["dps"], 0);
      const sr_support = is_undefined(p.sr_by_class["support"], 0);
      export_str +=
        [player_id, p.display_name, p.level, sr_tank, sr_dps, sr_support, main_class, main_hero, last_updated, p.private_profile].map(csv_cell).join(",") + "\n";
    }
  }
  return export_str.trim();
}

function csv_cell(value: unknown) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function export_teams(
  format: string,
  include_players: boolean,
  include_sr: boolean,
  include_classes: boolean,
  include_captains: boolean,
  table_columns: number,
) {
  let setup_str = "";
  if (format == "text-list") {
    if (is_role_lock_enabled()) {
      const teams = [S.team1_slots, S.team2_slots];
      for (let t = 0; t < teams.length; t++) {
        setup_str += get_team_name(t + 1) + "\n";
        if (include_players) {
          for (const class_name in teams[t]) {
            for (const player of teams[t][class_name]) {
              let player_str = class_name + "\t";
              if (include_sr) player_str += get_player_sr(player, class_name) + "\t";
              player_str += player.display_name + "\t";
              if (include_classes) player_str += player.classes.join("/");
              setup_str += player_str + "\n";
            }
          }
        }
      }
      setup_str += "\n";
    } else {
      const teams = [S.team1, S.team2];
      for (let t = 0; t < teams.length; t++) {
        setup_str += get_team_name(t + 1) + "\n";
        if (include_players) {
          for (const player of teams[t]) {
            let player_str = "";
            if (include_sr) player_str += get_player_sr(player, S.Settings.sr_calc_method) + "\t";
            player_str += player.display_name;
            if (include_classes) player_str += "\t" + player.classes.join("/");
            setup_str += player_str + "\n";
          }
          setup_str += "\n";
        }
      }
    }
  } else if (format == "html-table") {
    setup_str = export_teams_html(include_players, include_sr, include_classes, table_columns, false);
  } else if (format == "image") {
    setup_str = export_teams_html(include_players, include_sr, include_classes, table_columns, true);
  }
  return setup_str.trim();
}

function class_short(class_name: string) {
  return class_name == "support" ? "sup" : class_name;
}

export function export_teams_html(
  include_players: boolean,
  include_sr: boolean,
  include_classes: boolean,
  table_columns: number,
  draw_icons: boolean,
) {
  let setup_str = "";
  const role_lock = is_role_lock_enabled();
  const teams: (Player[] | TeamSlots)[] = role_lock ? [S.team1_slots, S.team2_slots] : [S.team1, S.team2];

  let title_colspan = 1;
  if (include_players) {
    if (include_sr) title_colspan++;
    if (include_classes) title_colspan++;
    if (role_lock) title_colspan++;
  }
  const _team_size = get_team_size();

  setup_str += "<table style='border-collapse: collapse; background-color: white;'>\n";
  for (let row = 1; row <= Math.ceil(teams.length / table_columns); row++) {
    const team_offset = (row - 1) * table_columns;
    setup_str += "<tr>";
    for (let t = team_offset; t < team_offset + table_columns; t++) {
      if (t >= teams.length) break;
      setup_str += "<td colspan='" + title_colspan + "' style='text-align: center;background-color: gray; color: white; border: 1px solid gray;'>";
      setup_str += escapeHtml(get_team_name(t + 1));
      setup_str += "</td>";
      setup_str += "<td style='width: 1em;'></td>";
    }
    setup_str += "</tr>\n";

    if (include_players) {
      for (let p = 0; p < _team_size; p++) {
        setup_str += "<tr>";
        for (let t = team_offset; t < team_offset + table_columns; t++) {
          if (t >= teams.length) break;
          let player: Player | undefined;
          let team_length: number;
          if (role_lock) {
            const slots = teams[t] as TeamSlots;
            player = get_player_at_index(slots, p);
            team_length = get_team_player_count(slots);
            setup_str += "<td style='text-align: left; border-bottom: 1px solid gray; border-left: 1px solid gray; border-right: 1px solid gray; white-space: nowrap;'>";
            if (p < team_length) {
              const slot_role = get_player_role(slots, player!)!;
              setup_str += draw_icons
                ? "<img style='filter: opacity(60%);' src='" + icon_datauri.classes[slot_role] + "' alt='" + slot_role + "'/>"
                : class_short(slot_role);
            }
            setup_str += "</td>";
          } else {
            const arr = teams[t] as Player[];
            player = arr[p];
            team_length = arr.length;
          }

          if (include_sr) {
            setup_str += "<td style='text-align: right; padding-right: 0.5em; border-bottom: 1px solid gray;border-left: 1px solid gray;'>";
            if (p < team_length) {
              const player_sr = role_lock
                ? get_player_sr(player!, get_player_role(teams[t] as TeamSlots, player!))
                : get_player_sr(player!, S.Settings.sr_calc_method);
              if (draw_icons) {
                const rank_name = get_rank_name(player_sr);
                setup_str += "<img src='" + icon_datauri.ranks[rank_name] + "' alt='" + rank_name + "'/>";
              } else {
                setup_str += player_sr;
              }
            }
            setup_str += "</td>";
          }

          let borders = "border-bottom: 1px solid gray;";
          if (!include_sr) borders += "border-left: 1px solid gray;";
          if (!include_classes) borders += "border-right: 1px solid gray;";
          setup_str += "<td style='text-align: left; padding: 0.2em; white-space: nowrap; " + borders + "'>";
          if (p < team_length) setup_str += escapeHtml(player!.display_name);
          setup_str += "</td>";

          if (include_classes) {
            setup_str += "<td style='text-align: left; border-bottom: 1px solid gray; border-right: 1px solid gray; white-space: nowrap;'>";
            if (p < team_length) {
              if (player!.classes[0] != undefined) {
                const class_name = player!.classes[0];
                setup_str += draw_icons
                  ? "<img style='filter: opacity(60%);' src='" + icon_datauri.classes[class_name] + "'/>"
                  : class_short(class_name);
              }
              if (player!.classes[1] != undefined) {
                const class_name = player!.classes[1];
                setup_str += draw_icons
                  ? "<img style='height: 15px; width: auto; filter: opacity(40%);' src='" + icon_datauri.classes[class_name] + "'/>"
                  : "/" + class_short(class_name);
              }
            }
            setup_str += "</td>";
          }
          setup_str += "<td></td>";
        }
        setup_str += "</tr>\n";
      }
    }
    setup_str += "<tr style='height: 1em;'></tr>";
  }
  setup_str += "</table>\n";
  return setup_str;
}

export type ImportResult = { ok: true; added: Player[]; for_update: Player[] } | { ok: false; error: string };

export function import_lobby(format: string, import_str: string | null): ImportResult | undefined {
  const added_players: Player[] = [];
  const players_for_update: Player[] = [];
  if (import_str == null || import_str == "") return undefined;

  if (format == "json") {
    try {
      const import_struct = JSON.parse(import_str);
      if (import_struct.format_version > current_format_version()) {
        throw new Error("Unsupported format version: " + import_struct.format_version);
      }
      if (import_struct.format_type !== undefined && import_struct.format_type != "customs") {
        throw new Error("Unsupported format type: " + import_struct.format_type);
      }
      if (!Array.isArray(import_struct.players)) throw new Error("no players list");
      for (let i = 0; i < import_struct.players.length; i++) {
        let imported_player = import_struct.players[i];
        if (!imported_player || typeof imported_player.id !== "string" || imported_player.id.trim() == "") continue;
        if (find_player_by_id(imported_player.id) !== undefined) continue;
        if (added_players.some((p) => p.id == imported_player.id)) continue;
        imported_player = sanitize_player_struct(imported_player, import_struct.format_version);
        added_players.push(imported_player);
      }
    } catch (err) {
      return { ok: false, error: "Incorrect import format: " + (err as Error).message };
    }
  } else if (format == "text") {
    try {
      const battletag_list = import_str.trim().split("\n");
      for (const raw_line of battletag_list) {
        const line = raw_line.trim();
        if (line == "") continue;
        const fields = line.split(/[ \t.,;|]+/);
        const player_id = format_player_id(fields[0]);
        if (find_player_by_id(player_id) !== undefined) continue;
        if (added_players.some((p) => p.id == player_id)) continue;
        const new_player = create_empty_player();
        delete new_player.empty;
        new_player.id = player_id;
        new_player.display_name = format_player_name(player_id);
        if (fields.length >= 4) {
          const index_offset = 1;
          for (let class_index = 0; class_index < class_names.length; class_index++) {
            const class_sr_text = fields[class_index + index_offset];
            const class_sr = Number(class_sr_text);
            if (Number.isNaN(class_sr)) throw new Error("Incorrect SR number " + class_sr_text);
            if (class_sr < 0 || class_sr > SR_MAX) throw new Error("Incorrect SR value " + class_sr);
            new_player.sr_by_class[class_names[class_index]] = class_sr;
          }
          new_player.last_updated = new Date();
        }
        if (fields.length >= 5) {
          const class_name = fields[4];
          if ((class_names as readonly string[]).indexOf(class_name) == -1) throw new Error("Incorrect class name " + class_name);
          new_player.classes.push(class_name);
        }
        if (fields.length == 1) players_for_update.push(new_player);
        added_players.push(new_player);
      }
    } catch (err) {
      return { ok: false, error: "Incorrect import format: " + (err as Error).message };
    }
  } else {
    return { ok: false, error: "Unknown import format: " + format };
  }

  for (const p of added_players) S.lobby.push(p);
  save_players_list();
  return { ok: true, added: added_players, for_update: players_for_update };
}

export const storage_errors: string[] = [];

export function read_saved_json(key: string): any {
  const json = store().getItem(storage_prefix + key);
  if (json == null) return null;
  try {
    return JSON.parse(json);
  } catch {
    storage_errors.push(key);
    return null;
  }
}

function parse_saved(key: string) {
  const value = read_saved_json(key);
  return value !== null && typeof value === "object" ? value : null;
}

function is_player_like(p: unknown): boolean {
  return typeof p === "object" && p !== null && typeof (p as { id?: unknown }).id === "string";
}

export function restore_saved_teams() {
  let saved_format: number | string | null = store().getItem(storage_prefix + "saved_format");
  if (saved_format === null) saved_format = 1;
  const fmt = Number(saved_format);
  const seen = new Set<string>();
  const fresh = (p: unknown) => {
    if (!is_player_like(p)) return false;
    const id = (p as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  for (const [key, target] of [["lobby", S.lobby], ["team1", S.team1], ["team2", S.team2]] as const) {
    const saved_team = parse_saved(key);
    if (Array.isArray(saved_team)) {
      for (const p of saved_team) if (fresh(p)) target.push(sanitize_player_struct(p, fmt));
    }
  }
  for (const [key, target] of [["team1_slots", S.team1_slots], ["team2_slots", S.team2_slots]] as const) {
    init_team_slots(target);
    const saved_team = parse_saved(key);
    if (saved_team != null) {
      for (const class_name of class_names) {
        if (!Array.isArray(saved_team[class_name])) continue;
        for (const p of saved_team[class_name]) if (fresh(p)) target[class_name].push(sanitize_player_struct(p, fmt));
      }
    }
  }
}

export function sanitize_player_struct(player_struct: any, saved_format: number): Player {
  if (!Array.isArray(player_struct.top_classes)) player_struct.top_classes = [];
  if (!Array.isArray(player_struct.top_heroes)) player_struct.top_heroes = [];

  if (saved_format == 1) {
    delete player_struct.current_sr;
    delete player_struct.max_sr;
    if (player_struct.top_classes[0] == "offence" || player_struct.top_classes[0] == "defence") player_struct.top_classes[0] = "dps";
    if (player_struct.top_classes[1] == "offence" || player_struct.top_classes[1] == "defence") player_struct.top_classes[1] = "dps";
    if (player_struct.top_classes[0] == "dps" && player_struct.top_classes[1] == "dps") player_struct.top_classes.pop();
  }
  if (saved_format <= 2) player_struct.last_updated = new Date(0);
  if (saved_format <= 3) player_struct.private_profile = false;
  if (saved_format <= 4) {
    player_struct.classes = [];
    player_struct.sr_by_class = {};
    player_struct.playtime_by_class = {};
    for (const class_name of player_struct.top_classes) {
      player_struct.classes.push(class_name);
      player_struct.sr_by_class[class_name] = player_struct.sr;
      player_struct.playtime_by_class[class_name] = 0;
    }
    delete player_struct.top_classes;
    delete player_struct.sr;
  }
  if (saved_format >= 3) {
    player_struct.last_updated = player_struct.last_updated !== undefined ? new Date(player_struct.last_updated) : new Date(0);
  }
  if (Number.isNaN(new Date(player_struct.last_updated).getTime())) player_struct.last_updated = new Date(0);
  if (typeof player_struct.sr_by_class !== "object" || player_struct.sr_by_class === null) player_struct.sr_by_class = {};
  if (typeof player_struct.playtime_by_class !== "object" || player_struct.playtime_by_class === null) player_struct.playtime_by_class = {};
  if (!Array.isArray(player_struct.classes)) player_struct.classes = [];
  player_struct.classes = player_struct.classes.filter((c: unknown, i: number, arr: unknown[]) => (class_names as readonly unknown[]).includes(c) && arr.indexOf(c) == i);
  if (typeof player_struct.display_name !== "string") player_struct.display_name = format_player_name(String(player_struct.id));
  if (typeof player_struct.level !== "number") player_struct.level = Number(player_struct.level) || 0;
  if (typeof player_struct.private_profile !== "boolean") player_struct.private_profile = false;
  player_struct.top_heroes = player_struct.top_heroes.filter((h: any) => h && typeof h.hero === "string");
  return player_struct as Player;
}

export function save_pinned_list() {
  store().setItem(storage_prefix + "pinned_players", JSON.stringify(Array.from(S.pinned_players)));
}

export function save_checkin_list() {
  store().setItem(storage_prefix + "checkin", JSON.stringify(Array.from(S.checkin_list)));
}

export function save_players_list() {
  const s = store();
  s.setItem(storage_prefix + "lobby", JSON.stringify(S.lobby));
  s.setItem(storage_prefix + "team1", JSON.stringify(S.team1));
  s.setItem(storage_prefix + "team2", JSON.stringify(S.team2));
  s.setItem(storage_prefix + "team1_slots", JSON.stringify(S.team1_slots));
  s.setItem(storage_prefix + "team2_slots", JSON.stringify(S.team2_slots));
  s.setItem(storage_prefix + "saved_format", String(current_format_version()));
}
