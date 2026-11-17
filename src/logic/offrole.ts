import { class_names } from "./defines";
import { get_team_size } from "./common";
import { read_saved_json } from "./importExport";
import { S, storage_prefix, store } from "./state";
import type { Player } from "./types";

export const OFFROLE_WINDOW_MS = 24 * 3600 * 1000;

export interface OffroleMatch {
  at: number;
  off: string[];
}

function save() {
  store().setItem(storage_prefix + "offrole_matches", JSON.stringify(S.offrole_matches));
}

export function load_offrole(now = Date.now()) {
  const saved = read_saved_json("offrole_matches");
  S.offrole_matches = Array.isArray(saved)
    ? saved.filter((m: any) => m && typeof m.at === "number" && Array.isArray(m.off) && m.at >= now - OFFROLE_WINDOW_MS)
    : [];
}

export function recent_matches(now = Date.now()) {
  return S.offrole_matches.filter((m) => m.at >= now - OFFROLE_WINDOW_MS);
}

export function offrole_history(now = Date.now()): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of recent_matches(now)) for (const id of m.off) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function is_offrole(player: Player, slot_class: string | undefined) {
  return slot_class !== undefined && player.classes[0] !== slot_class;
}

export function current_offrole_players(): Player[] {
  if (!S.role_lock_enabled) return [];
  const out: Player[] = [];
  for (const slots of [S.team1_slots, S.team2_slots]) {
    for (const class_name of class_names) {
      for (const p of slots[class_name] ?? []) if (is_offrole(p, class_name)) out.push(p);
    }
  }
  return out;
}

export type RecordResult = { ok: true; off: Player[]; matches: number } | { ok: false; reason: string };

export function record_match(now = Date.now()): RecordResult {
  if (!S.role_lock_enabled) return { ok: false, reason: "Turn role lock on to track off-roles." };
  const size = get_team_size();
  for (const slots of [S.team1_slots, S.team2_slots]) {
    const count = Object.values(slots).reduce((a, s) => a + s.length, 0);
    if (count < size) return { ok: false, reason: "Fill both teams before recording the match." };
  }
  const off = current_offrole_players();
  S.offrole_matches = [...recent_matches(now), { at: now, off: off.map((p) => p.id) }];
  save();
  return { ok: true, off, matches: recent_matches(now).length };
}

export function undo_last_match(now = Date.now()) {
  const recent = recent_matches(now);
  if (!recent.length) return false;
  S.offrole_matches = recent.slice(0, -1);
  save();
  return true;
}

export function reset_offrole() {
  S.offrole_matches = [];
  save();
}
