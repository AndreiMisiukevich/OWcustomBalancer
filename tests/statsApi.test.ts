import { describe, expect, it } from "vitest";
import { StatsApi } from "../src/logic/statsApi";
import { rank_division, rank_label, rank_tier, sr_from_rank } from "../src/logic/defines";

const SUMMARY = {
  username: "Tester",
  competitive: {
    pc: {
      season: 25,
      tank: { division: "diamond", tier: 2 },
      damage: { division: "ultimate", tier: 1 },
      support: null,
      open: null,
    },
    console: null,
  },
};

const STATS = {
  general: {},
  roles: {
    tank: { time_played: 36000 },
    damage: { time_played: 7200 },
    support: { time_played: 1800 },
  },
  heroes: {
    reinhardt: { time_played: 20000 },
    sigma: { time_played: 9000 },
    genji: { time_played: 1000 },
    "not-a-hero": { time_played: 99999 },
  },
};

function respond(map: Record<string, { status: number; body?: unknown }>) {
  return async (url: string) => {
    const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => url.includes(k));
    const r = key ? map[key] : { status: 500 };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  };
}

function run(fetcher: (url: string) => Promise<Response>, id = "Tester#1234", platform = "pc") {
  return new Promise<{ ok: boolean; msg?: string }>((resolve) => {
    StatsApi.fetcher = fetcher as typeof StatsApi.fetcher;
    StatsApi.id = id;
    StatsApi.platform = platform;
    StatsApi.onSuccess = () => resolve({ ok: true });
    StatsApi.onFail = (msg) => resolve({ ok: false, msg });
    StatsApi.getStats();
  });
}

describe("rank scale", () => {
  it("maps rank and division to SR and back", () => {
    expect(sr_from_rank("bronze", 5)).toBe(550);
    expect(sr_from_rank("gold", 3)).toBe(1750);
    expect(sr_from_rank("diamond", 1)).toBe(3450);
    expect(sr_from_rank("champion", 1)).toBe(4950);
    for (const tier of ["bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "champion"]) {
      for (let d = 1; d <= 5; d++) {
        const sr = sr_from_rank(tier, d);
        expect(rank_tier(sr).key).toBe(tier);
        expect(rank_division(sr)).toBe(d);
      }
    }
    expect(rank_label(0)).toBe("Unranked");
    expect(rank_label(120)).toBe("Bronze 5");
    expect(rank_label(5000)).toBe("Champion 1");
  });
});

describe("OverFast stats client", () => {
  it("parses ranks, role playtime and top heroes", async () => {
    const r = await run(respond({ "/summary": { status: 200, body: SUMMARY }, "/stats/summary": { status: 200, body: STATS } }));
    expect(r.ok).toBe(true);
    expect(StatsApi.id).toBe("Tester-1234");
    expect(StatsApi.display_name).toBe("Tester");
    expect(StatsApi.sr_by_class).toEqual({ tank: 3350, dps: 4950 });
    expect(StatsApi.playtime_by_class).toEqual({ tank: 10, dps: 2, support: 0.5 });
    expect(StatsApi.top_heroes).toEqual([
      { hero: "reinhardt", playtime: 5.56 },
      { hero: "sigma", playtime: 2.5 },
    ]);
  });

  it("requests the encoded BattleTag on the chosen platform", async () => {
    const urls: string[] = [];
    await run(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes("/stats/") ? STATS : SUMMARY), { status: 200 });
    }, "Name#42", "console");
    expect(urls[0]).toBe("https://overfast-api.tekrop.fr/players/Name-42/summary");
    expect(urls[1]).toContain("/players/Name-42/stats/summary?gamemode=competitive&platform=console");
  });

  it("fails without retry when the player has no ranks on the platform", async () => {
    const r = await run(respond({ "/summary": { status: 200, body: SUMMARY }, "/stats/summary": { status: 200, body: STATS } }), "Tester#1234", "console");
    expect(r).toEqual({ ok: false, msg: "Player has no competitive stats on console" });
    expect(StatsApi.can_retry).toBe(false);
  });

  it("reports a missing player", async () => {
    const r = await run(respond({ "/summary": { status: 404 } }));
    expect(r.msg).toBe("Player not found (BattleTag is case-sensitive)");
    expect(StatsApi.can_retry).toBe(false);
  });

  it("marks rate limiting as retryable", async () => {
    for (const status of [429, 503]) {
      const r = await run(respond({ "/summary": { status } }));
      expect(r.msg).toBe("Too many stats requests, try later");
      expect(StatsApi.can_retry).toBe(true);
    }
  });

  it("detects a private profile", async () => {
    const r = await run(respond({ "/summary": { status: 200, body: { username: "x", competitive: null } }, "/stats/summary": { status: 200, body: {} } }));
    expect(r.msg).toBe("Player has private profile");
    expect(StatsApi.private_profile).toBe(true);
  });

  it("reports network failures as retryable", async () => {
    const r = await run(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.msg).toBe("Stats API unreachable");
    expect(StatsApi.can_retry).toBe(true);
  });
});
