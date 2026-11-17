import { describe, expect, it } from "vitest";
import { loadWorkerBalancer, readRepoFile, seededRandom } from "./legacy";

const CLASSES = ["tank", "dps", "support"];
const HEROES = ["ana", "mercy", "genji", "tracer", "reinhardt", "dva", "kiriko", "sojourn"];

function makePlayers(count: number, seed: number, opts: { maxClasses?: number; onlyClass?: string; otp?: boolean } = {}) {
  const rnd = seededRandom(seed);
  const players = [];
  for (let i = 0; i < count; i++) {
    const pool = CLASSES.slice();
    const classes: string[] = [];
    const n = opts.onlyClass ? 1 : 1 + Math.floor(rnd() * (opts.maxClasses ?? 2));
    for (let c = 0; c < n; c++) {
      classes.push(opts.onlyClass ?? pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    const sr_by_class: Record<string, number> = {};
    const playtime_by_class: Record<string, number> = {};
    for (const c of classes) {
      sr_by_class[c] = 800 + Math.floor(rnd() * 3800);
      playtime_by_class[c] = Math.round(rnd() * 300) / 10;
    }
    const top_heroes = opts.otp && i % 3 === 0 ? [{ hero: HEROES[i % 2], playtime: 50 }] : [{ hero: HEROES[i % HEROES.length], playtime: 10 }, { hero: HEROES[(i + 1) % HEROES.length], playtime: 8 }];
    players.push({
      id: `p${String(i).padStart(2, "0")}-${seed}`,
      display_name: `p${i}`,
      sr_by_class,
      playtime_by_class,
      level: i * 10,
      classes,
      top_heroes,
      last_updated: new Date(0).toISOString(),
      private_profile: false,
    });
  }
  return players;
}

const BASE = {
  slots_count: { tank: 2, dps: 2, support: 2 },
  algorithm: "rolelockfallback",
  separate_otps: true,
  adjust_sr: false,
  adjust_sr_by_class: { tank: 100, dps: 110, support: 90 },
  balance_priority_classic: 50,
  classic_sr_calc_method: "main",
  balance_priority_rolelock: 50,
};

function run(dir: "legacy" | "public/balancer", settings: object, players: object[], seed: number, rounds = 1) {
  const ctx = loadWorkerBalancer(dir, seededRandom(seed));
  const B = ctx.Balancer;
  for (const [k, v] of Object.entries(settings)) {
    if (Object.prototype.hasOwnProperty.call(B, k)) B[k] = JSON.parse(JSON.stringify(v));
  }
  const ids = (arr: { id: string }[]) => arr.map((p) => p.id);
  const out = [];
  for (let r = 0; r < rounds; r++) {
    B.players = JSON.parse(JSON.stringify(players));
    B.balanceTeams();
    const slots = (s: Record<string, { id: string }[]>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, ids(v)]));
    out.push({
      is_successfull: B.is_successfull,
      is_rolelock: B.is_rolelock,
      team1: ids(B.team1),
      team2: ids(B.team2),
      team1_slots: slots(B.team1_slots),
      team2_slots: slots(B.team2_slots),
    });
  }
  return out;
}

const CASES: [string, object, object[], number?][] = [
  ["classic 6v6", { ...BASE, algorithm: "classic" }, makePlayers(12, 1)],
  ["rolelock 6v6 2-2-2", { ...BASE, algorithm: "rolelock" }, makePlayers(12, 2)],
  ["fallback to classic when role lock impossible", BASE, makePlayers(12, 3, { onlyClass: "dps" })],
  ["rolelock 5v5 1-2-2", { ...BASE, algorithm: "rolelock", slots_count: { tank: 1, dps: 2, support: 2 } }, makePlayers(10, 4)],
  ["fallback 5v5 1-2-2 with 3-class players", { ...BASE, slots_count: { tank: 1, dps: 2, support: 2 } }, makePlayers(10, 5, { maxClasses: 3 })],
  ["separate one-tricks", { ...BASE, algorithm: "classic" }, makePlayers(12, 6, { otp: true })],
  ["adjust SR by class, classic", { ...BASE, algorithm: "classic", adjust_sr: true }, makePlayers(12, 7)],
  ["adjust SR by class, rolelock", { ...BASE, algorithm: "rolelock", adjust_sr: true, slots_count: { tank: 1, dps: 2, support: 2 } }, makePlayers(10, 8)],
  ["sr method max", { ...BASE, algorithm: "classic", classic_sr_calc_method: "max" }, makePlayers(12, 9)],
  ["sr method average", { ...BASE, algorithm: "classic", classic_sr_calc_method: "average" }, makePlayers(12, 10)],
  ["sr method weighted", { ...BASE, algorithm: "classic", classic_sr_calc_method: "weighted" }, makePlayers(12, 11)],
  ["priority 0 classic", { ...BASE, algorithm: "classic", balance_priority_classic: 0 }, makePlayers(12, 12)],
  ["priority 100 rolelock", { ...BASE, algorithm: "rolelock", balance_priority_rolelock: 100, slots_count: { tank: 1, dps: 2, support: 2 } }, makePlayers(10, 13)],
  ["not enough players", BASE, makePlayers(5, 14)],
  ["3v3 custom slots", { ...BASE, slots_count: { tank: 1, dps: 1, support: 1 } }, makePlayers(6, 15)],
];

describe("balancer worker files", () => {
  it("keep the worker, helpers and definitions byte-identical to the original", () => {
    for (const f of ["balance_worker.js", "common.js", "ow_defines.js"]) {
      expect(readRepoFile(`public/balancer/${f}`).equals(readRepoFile(`legacy/${f}`)), f).toBe(true);
    }
  });
});

function offroleCase(history: Record<string, number>, rotation: number, seed: number) {
  const p = (id: string, classes: string[], sr: Record<string, number>) => ({ id, display_name: id, classes, sr_by_class: sr, playtime_by_class: {}, top_heroes: [], level: 0, last_updated: "1970-01-01T00:00:00.000Z", private_profile: false });
  const players = [
    p("t-tank", ["tank"], { tank: 2500 }),
    p("a-flex", ["dps", "tank"], { dps: 2500, tank: 2500 }),
    p("b-flex", ["dps", "tank"], { dps: 2500, tank: 2500 }),
    p("d1", ["dps"], { dps: 2400 }),
    p("d2", ["dps"], { dps: 2600 }),
    p("d3", ["dps"], { dps: 2500 }),
    p("s1", ["support"], { support: 2450 }),
    p("s2", ["support"], { support: 2550 }),
    p("s3", ["support"], { support: 2500 }),
    p("s4", ["support"], { support: 2500 }),
  ];
  const settings = { ...BASE, algorithm: "rolelock", slots_count: { tank: 1, dps: 2, support: 2 }, offrole_rotation: rotation, offrole_history: history };
  const [r] = run("public/balancer", settings, players, seed);
  return [...r.team1_slots.tank, ...r.team2_slots.tank].find((id) => id != "t-tank");
}

function roleGapCase(roleBalance: number, seed: number) {
  const p = (id: string, classes: string[], sr: Record<string, number>) => ({ id, display_name: id, classes, sr_by_class: sr, playtime_by_class: {}, top_heroes: [], level: 0, last_updated: "1970-01-01T00:00:00.000Z", private_profile: false });
  const players = [
    p("tank-2500", ["tank"], { tank: 2500 }),
    p("tank-4000", ["tank", "dps"], { tank: 4000, dps: 2700 }),
    p("flex-2700", ["dps", "tank"], { dps: 4000, tank: 2700 }),
    p("d1", ["dps"], { dps: 2500 }),
    p("d2", ["dps"], { dps: 2500 }),
    p("d3", ["dps"], { dps: 2500 }),
    p("s1", ["support"], { support: 2500 }),
    p("s2", ["support"], { support: 2500 }),
    p("s3", ["support"], { support: 2500 }),
    p("s4", ["support"], { support: 2500 }),
  ];
  const settings = { ...BASE, algorithm: "rolelock", balance_priority_rolelock: 0, slots_count: { tank: 1, dps: 2, support: 2 }, role_balance: roleBalance };
  const [r] = run("public/balancer", settings, players, seed);
  return [...r.team1_slots.tank, ...r.team2_slots.tank].sort();
}

describe("even out each role", () => {
  it("pairs tanks of similar rank when enabled", () => {
    for (let seed = 1; seed <= 15; seed++) expect(roleGapCase(50, seed), `seed ${seed}`).toEqual(["flex-2700", "tank-2500"]);
  });

  it("is ignored when disabled, leaving the uneven tank pair possible", () => {
    const pairs = new Set(Array.from({ length: 25 }, (_, i) => roleGapCase(0, i + 1).join("+")));
    expect(pairs.has("tank-2500+tank-4000")).toBe(true);
  });
});

describe("off-role rotation", () => {
  it("sends the player who has not been on an off-role yet", () => {
    for (let seed = 1; seed <= 25; seed++) {
      expect(offroleCase({ "a-flex": 2 }, 1, seed), `seed ${seed}`).toBe("b-flex");
      expect(offroleCase({ "b-flex": 1 }, 1, seed), `seed ${seed}`).toBe("a-flex");
    }
  });

  it("with rotation off, picks either flex player as before", () => {
    const picked = new Set(Array.from({ length: 25 }, (_, i) => offroleCase({ "a-flex": 2 }, 0, i + 1)));
    expect(picked).toEqual(new Set(["a-flex", "b-flex"]));
  });
});

describe("balancer partial teams", () => {
  it("throws in role lock with fewer than two full teams, same as the original", () => {
    const players = makePlayers(7, 16);
    expect(() => run("public/balancer", BASE, players, 42)).toThrow(/reading .classes./);
    expect(() => run("legacy", BASE, players, 42)).toThrow(/reading .classes./);
  });
});

describe("new balancer options at their defaults", () => {
  for (const [name, settings, players] of CASES) {
    it(`match the original with rotation on but no recorded matches: ${name}`, () => {
      const withDefaults = { ...settings, offrole_rotation: 1, offrole_history: {}, role_balance: 0 };
      expect(run("public/balancer", withDefaults, players, 42, 3)).toEqual(run("legacy", settings, players, 42, 3));
    });
  }
});

describe("balancer golden results", () => {
  for (const [name, settings, players] of CASES) {
    it(name, () => {
      const result = run("public/balancer", settings, players, 42, 3);
      expect(result).toEqual(run("legacy", settings, players, 42, 3));
      expect(result).toMatchSnapshot();
    });
  }
});
