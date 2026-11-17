import type { ExportOptionsShape, Player, SettingsShape, TeamSlots } from "./types";

export const storage_prefix = "owcgb_";

export const S = {
  lobby: [] as Player[],
  team1: [] as Player[],
  team2: [] as Player[],
  team1_slots: {} as TeamSlots,
  team2_slots: {} as TeamSlots,
  pinned_players: new Set<string>(),
  checkin_list: new Set<string>(),
  Settings: {} as SettingsShape,
  ExportOptions: {} as ExportOptionsShape,
  role_lock_enabled: false,
  team_names: ["Team 1", "Team 2"] as [string, string],
  offrole_matches: [] as { at: number; off: string[] }[],
};

let version = 0;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion() {
  return version;
}

export function notify() {
  version++;
  for (const l of listeners) l();
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStorage = new Map<string, string>();
const fallbackStorage: StorageLike = {
  getItem: (k) => (memoryStorage.has(k) ? memoryStorage.get(k)! : null),
  setItem: (k, v) => void memoryStorage.set(k, String(v)),
  removeItem: (k) => void memoryStorage.delete(k),
};

let storage: StorageLike = fallbackStorage;
try {
  if (typeof localStorage !== "undefined") storage = localStorage;
} catch {
  storage = fallbackStorage;
}

export function setStorage(s: StorageLike) {
  storage = s;
}

export function store(): StorageLike {
  return storage;
}
