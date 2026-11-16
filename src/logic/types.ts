export interface TopHero {
  hero: string;
  playtime: number;
}

export interface Player {
  id: string;
  display_name: string;
  sr_by_class: Record<string, number>;
  playtime_by_class: Record<string, number>;
  level: number;
  classes: string[];
  top_heroes: TopHero[];
  last_updated: Date;
  private_profile: boolean;
  empty?: boolean;
  fake_id?: boolean;
  ne?: boolean;
  se?: boolean;
  ce?: boolean;
  [key: string]: unknown;
}

export type TeamSlots = Record<string, Player[]>;

export interface SettingsShape {
  slots_count: Record<string, number>;
  balancer_alg: string;
  adjust_sr: boolean;
  adjust_dps: number;
  adjust_tank: number;
  adjust_support: number;
  separate_otps: boolean;
  balance_priority: number;
  sr_calc_method: string;
  balance_priority_rolelock: number;
  platform: string;
  update_class: boolean;
  update_sr: boolean;
  update_edited_fields: boolean;
  update_picked: boolean;
  update_picked_maxage: number;
  [key: string]: unknown;
}

export interface ExportOptionsShape {
  format: string;
  include_sr: boolean;
  include_classes: boolean;
}
