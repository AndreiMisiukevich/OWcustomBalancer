import { S, setStorage, type StorageLike } from "../src/logic/state";
import { StatsUpdater, StatsUpdaterState } from "../src/logic/statsUpdater";
import { StatsApi } from "../src/logic/statsApi";
import { init_state } from "../src/logic/actions";

export function memoryStorage(initial: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

export function bootNewApp(storage: Record<string, string>) {
  S.lobby = [];
  S.team1 = [];
  S.team2 = [];
  S.team1_slots = {};
  S.team2_slots = {};
  S.pinned_players = new Set();
  S.checkin_list = new Set();
  S.role_lock_enabled = false;
  S.team_names = ["Team 1", "Team 2"];
  S.offrole_matches = [];
  StatsUpdater.queue = [];
  StatsUpdater.state = StatsUpdaterState.idle;
  StatsUpdater.totalQueueLength = 0;
  StatsUpdater.currentIndex = 0;
  StatsApi.fetcher = () => new Promise<Response>(() => {});
  const mem = memoryStorage(storage);
  setStorage(mem);
  init_state();
  return mem;
}
