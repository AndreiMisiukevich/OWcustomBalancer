export const class_names = ["tank", "dps", "support"] as const;
export type ClassName = (typeof class_names)[number];

export const class_titles: Record<ClassName, string> = {
  tank: "Tank",
  dps: "Damage",
  support: "Support",
};

export const hero_classes: Record<string, ClassName> = {
  "dmon": "tank",
  "domina": "tank",
  "doomfist": "tank",
  "dva": "tank",
  "hazard": "tank",
  "junker-queen": "tank",
  "mauga": "tank",
  "orisa": "tank",
  "ramattra": "tank",
  "reinhardt": "tank",
  "roadhog": "tank",
  "sigma": "tank",
  "winston": "tank",
  "wrecking-ball": "tank",
  "zarya": "tank",
  "anran": "dps",
  "ashe": "dps",
  "bastion": "dps",
  "cassidy": "dps",
  "echo": "dps",
  "emre": "dps",
  "freja": "dps",
  "genji": "dps",
  "hanzo": "dps",
  "junkrat": "dps",
  "mei": "dps",
  "pharah": "dps",
  "reaper": "dps",
  "shion": "dps",
  "sierra": "dps",
  "sojourn": "dps",
  "soldier-76": "dps",
  "symmetra": "dps",
  "torbjorn": "dps",
  "tracer": "dps",
  "vendetta": "dps",
  "venture": "dps",
  "widowmaker": "dps",
  "ana": "support",
  "baptiste": "support",
  "brigitte": "support",
  "doctrine": "support",
  "illari": "support",
  "jetpack-cat": "support",
  "juno": "support",
  "kiriko": "support",
  "lifeweaver": "support",
  "lucio": "support",
  "mercy": "support",
  "mizuki": "support",
  "moira": "support",
  "sombra": "support",
  "wuyang": "support",
  "zenyatta": "support",
};

export const hero_names: Record<string, string> = {
  "ana": "Ana",
  "anran": "Anran",
  "ashe": "Ashe",
  "baptiste": "Baptiste",
  "bastion": "Bastion",
  "brigitte": "Brigitte",
  "cassidy": "Cassidy",
  "dmon": "D.Mon",
  "doctrine": "Doctrine",
  "domina": "Domina",
  "doomfist": "Doomfist",
  "dva": "D.Va",
  "echo": "Echo",
  "emre": "Emre",
  "freja": "Freja",
  "genji": "Genji",
  "hanzo": "Hanzo",
  "hazard": "Hazard",
  "illari": "Illari",
  "jetpack-cat": "Jetpack Cat",
  "junker-queen": "Junker Queen",
  "junkrat": "Junkrat",
  "juno": "Juno",
  "kiriko": "Kiriko",
  "lifeweaver": "Lifeweaver",
  "lucio": "Lúcio",
  "mauga": "Mauga",
  "mei": "Mei",
  "mercy": "Mercy",
  "mizuki": "Mizuki",
  "moira": "Moira",
  "orisa": "Orisa",
  "pharah": "Pharah",
  "ramattra": "Ramattra",
  "reaper": "Reaper",
  "reinhardt": "Reinhardt",
  "roadhog": "Roadhog",
  "shion": "Shion",
  "sierra": "Sierra",
  "sigma": "Sigma",
  "sojourn": "Sojourn",
  "soldier-76": "Soldier: 76",
  "sombra": "Sombra",
  "symmetra": "Symmetra",
  "torbjorn": "Torbjörn",
  "tracer": "Tracer",
  "vendetta": "Vendetta",
  "venture": "Venture",
  "widowmaker": "Widowmaker",
  "winston": "Winston",
  "wrecking-ball": "Wrecking Ball",
  "wuyang": "Wuyang",
  "zarya": "Zarya",
  "zenyatta": "Zenyatta",
};

export interface RankTier {
  key: string;
  title: string;
  min: number;
  max: number;
  color: string;
  color2: string;
}

export const ow_ranks: RankTier[] = [
  { key: "unranked", title: "Unranked", min: 0, max: 0, color: "#5b6680", color2: "#2b3245" },
  { key: "bronze", title: "Bronze", min: 1, max: 999, color: "#d08a55", color2: "#6b3a1c" },
  { key: "silver", title: "Silver", min: 1000, max: 1499, color: "#d5dde8", color2: "#6a7586" },
  { key: "gold", title: "Gold", min: 1500, max: 1999, color: "#ffd166", color2: "#9a6b12" },
  { key: "platinum", title: "Platinum", min: 2000, max: 2499, color: "#a8f0ec", color2: "#3b8a8f" },
  { key: "emerald", title: "Emerald", min: 2500, max: 2999, color: "#5cf0a8", color2: "#0f7a4c" },
  { key: "diamond", title: "Diamond", min: 3000, max: 3499, color: "#8fb8ff", color2: "#2a4fb8" },
  { key: "master", title: "Master", min: 3500, max: 3999, color: "#f3b6ff", color2: "#8a3aa8" },
  { key: "grandmaster", title: "Grandmaster", min: 4000, max: 4499, color: "#c3a6ff", color2: "#4b2a9e" },
  { key: "champion", title: "Champion", min: 4500, max: 5000, color: "#ff9a6b", color2: "#b8233f" },
];

export const SR_MAX = 5000;
const TIER_STEP = 500;
const DIVISION_STEP = 100;

export function rank_tier(sr: number): RankTier {
  for (const tier of ow_ranks) {
    if (sr >= tier.min && sr <= tier.max) return tier;
  }
  return ow_ranks[0];
}

export function rank_division(sr: number): number {
  const tier = rank_tier(sr);
  if (tier.key === "unranked") return 0;
  const base = tier.key === "bronze" ? 500 : tier.min;
  const division = 5 - Math.floor((sr - base) / DIVISION_STEP);
  return Math.min(5, Math.max(1, division));
}

export function rank_label(sr: number): string {
  const tier = rank_tier(sr);
  if (tier.key === "unranked") return tier.title;
  return `${tier.title} ${rank_division(sr)}`;
}

export function sr_from_rank(tier_key: string, division: number): number {
  const index = ow_ranks.findIndex((t) => t.key === tier_key);
  if (index <= 0) return 0;
  const base = TIER_STEP * index;
  return base + (5 - division) * DIVISION_STEP + DIVISION_STEP / 2;
}

export const api_division_to_tier: Record<string, string> = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
  emerald: "emerald",
  diamond: "diamond",
  master: "master",
  grandmaster: "grandmaster",
  ultimate: "champion",
  champion: "champion",
};
