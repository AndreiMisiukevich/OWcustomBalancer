import { api_division_to_tier, hero_classes, sr_from_rank } from "./defines";
import { format_player_id, format_player_name } from "./common";
import type { TopHero } from "./types";

export const API_BASE = "https://overfast-api.tekrop.fr";

const API_ROLE_TO_CLASS: Record<string, string> = { tank: "tank", damage: "dps", support: "support" };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const StatsApi = {
  id: "",
  display_name: "",
  level: undefined as number | undefined,
  sr_by_class: {} as Record<string, number>,
  playtime_by_class: {} as Record<string, number>,
  top_heroes: [] as TopHero[],
  private_profile: false,

  onSuccess: undefined as undefined | (() => void),
  onFail: undefined as undefined | ((msg: string) => void),

  can_retry: false,

  timeout_ms: 15000,
  top_hero_max_ratio: 4.0,
  platform: "pc",
  fetcher: ((url, init) => fetch(url, init)) as Fetcher,

  is_processed: false,
  request_seq: 0,

  getStats() {
    this.sr_by_class = {};
    this.level = undefined;
    this.playtime_by_class = {};
    this.top_heroes = [];
    this.private_profile = false;
    this.id = format_player_id(this.id);
    this.display_name = format_player_name(this.id);
    this.is_processed = false;
    const seq = ++this.request_seq;
    void this.load(seq);
  },

  async load(seq: number) {
    const id = encodeURIComponent(this.id);
    const platform = this.platform;
    try {
      const summary = await this.request(`${API_BASE}/players/${id}/summary`);
      if (seq !== this.request_seq) return;
      const competitive = summary.competitive ? summary.competitive[platform] : null;
      const stats = await this.request(`${API_BASE}/players/${id}/stats/summary?gamemode=competitive&platform=${platform}`);
      if (seq !== this.request_seq) return;

      const has_stats = stats && (stats.roles || stats.heroes || stats.general);
      if (!summary.competitive && !has_stats) {
        this.can_retry = false;
        this.private_profile = true;
        throw new Error("Player has private profile");
      }
      if (!competitive) {
        this.can_retry = false;
        throw new Error("Player has no competitive stats on " + (platform == "pc" ? "PC" : "console"));
      }

      for (const api_role of Object.keys(API_ROLE_TO_CLASS)) {
        const rank = competitive[api_role];
        if (rank && rank.division && api_division_to_tier[rank.division]) {
          this.sr_by_class[API_ROLE_TO_CLASS[api_role]] = sr_from_rank(api_division_to_tier[rank.division], Number(rank.tier));
        }
      }

      const playtime: Record<string, number> = { tank: 0, dps: 0, support: 0 };
      for (const [api_role, role_stats] of Object.entries<any>((stats && stats.roles) || {})) {
        const class_name = API_ROLE_TO_CLASS[api_role];
        if (class_name && role_stats) playtime[class_name] += Number(role_stats.time_played || 0) / 3600;
      }
      this.playtime_by_class = playtime;

      const hero_stats: TopHero[] = [];
      for (const [hero, hs] of Object.entries<any>((stats && stats.heroes) || {})) {
        if (hero_classes[hero] === undefined) continue;
        hero_stats.push({ hero, playtime: Math.round((Number(hs.time_played || 0) / 3600) * 100) / 100 });
      }
      hero_stats.sort((a, b) => b.playtime - a.playtime);
      this.top_heroes = this.calculateTopHeroes(hero_stats.filter((h) => h.playtime > 0));

      this.finish();
    } catch (err) {
      if (seq !== this.request_seq) return;
      this.fail((err as Error).message);
    }
  },

  async request(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout_ms);
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: controller.signal });
    } catch (err) {
      this.can_retry = true;
      if ((err as Error).name === "AbortError") throw new Error("Stats API timeout");
      throw new Error("Stats API unreachable");
    } finally {
      clearTimeout(timer);
    }
    if (response.status == 200) return response.json();
    switch (response.status) {
      case 404:
        this.can_retry = false;
        throw new Error("Player not found (BattleTag is case-sensitive)");
      case 429:
      case 503:
        this.can_retry = true;
        throw new Error("Too many stats requests, try later");
      default:
        this.can_retry = true;
        throw new Error("Can't get player stats (HTTP " + response.status + ")");
    }
  },

  finish() {
    if (typeof this.onSuccess == "function" && !this.is_processed) this.onSuccess.call(undefined);
    this.is_processed = true;
  },

  fail(msg: string) {
    if (typeof this.onFail == "function" && !this.is_processed) this.onFail.call(this, msg);
    this.is_processed = true;
  },

  calculateTopHeroes(hero_playtime: TopHero[]) {
    const top_heroes: TopHero[] = [];
    if (hero_playtime.length != 0) top_heroes.push(hero_playtime[0]);
    for (let i = 1; i < hero_playtime.length; i++) {
      if (hero_playtime[i - 1].playtime / hero_playtime[i].playtime < this.top_hero_max_ratio) {
        top_heroes.push(hero_playtime[i]);
      } else {
        break;
      }
    }
    while (top_heroes.length > 4) top_heroes.pop();
    return top_heroes;
  },
};

export type StatsApiType = typeof StatsApi;
