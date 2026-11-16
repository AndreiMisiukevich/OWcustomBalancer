import { class_names } from "./defines";
import { StatsApi } from "./statsApi";
import type { Player } from "./types";

export const StatsUpdaterState = {
  idle: 1,
  updating: 2,
  waiting: 3,
};

export const StatsUpdater = {
  queue: [] as Player[],
  current_retry: 0,
  state: StatsUpdaterState.idle,

  totalQueueLength: 0,
  update_fails: 0,
  currentIndex: 0,
  current_id: "",

  min_api_request_interval: 3000,
  max_retry: 2,
  update_edited_fields: true,
  update_sr: true,
  update_class: true,
  platform: "pc",

  onPlayerUpdated: undefined as undefined | ((player_id: string) => void),
  onComplete: undefined as undefined | (() => void),
  onStart: undefined as undefined | (() => void),
  onProgressChange: undefined as undefined | (() => void),
  onError: undefined as undefined | ((player_id: string, msg: string, is_changed: boolean) => void),
  onWarning: undefined as undefined | ((player_id: string, msg: string) => void),

  addToQueue(player_s: Player | Player[], stats_max_age = 0, high_priority = false) {
    const max_stats_age_date = new Date(Date.now() - stats_max_age * 24 * 3600 * 1000);
    let added_count = 0;
    if (Array.isArray(player_s)) {
      if (player_s.length == 0) return;
      let insert_at = 1;
      for (const p of player_s) {
        if (this.queue.indexOf(p) !== -1) continue;
        if (p.last_updated > max_stats_age_date) continue;
        if (high_priority) {
          this.queue.splice(insert_at, 0, p);
          insert_at++;
        } else {
          this.queue.push(p);
        }
        added_count++;
      }
    } else {
      const index_found = this.queue.indexOf(player_s);
      if (index_found !== -1 && !high_priority) return;
      if (player_s.last_updated > max_stats_age_date) return;
      if (high_priority && index_found !== -1) {
        if (index_found <= 1) return;
        this.queue.splice(index_found, 1);
        this.queue.splice(1, 0, player_s);
      } else if (high_priority) {
        this.queue.splice(1, 0, player_s);
        added_count++;
      } else {
        this.queue.push(player_s);
        added_count++;
      }
    }

    this.totalQueueLength += added_count;
    if (added_count == 0) return;

    if (this.state == StatsUpdaterState.idle) {
      this.currentIndex = 1;
      this.state = StatsUpdaterState.updating;
      this.updateNextPlayer();
      if (typeof this.onStart == "function") this.onStart.call(undefined);
    } else if (this.state == StatsUpdaterState.updating) {
      if (typeof this.onProgressChange == "function") this.onProgressChange.call(undefined);
    } else if (this.state == StatsUpdaterState.waiting) {
      this.update_fails = 0;
      this.currentIndex = 1;
      this.current_id = this.queue[0].id;
      this.state = StatsUpdaterState.updating;
      setTimeout(this.updateNextPlayer.bind(this), this.min_api_request_interval);
      if (typeof this.onStart == "function") this.onStart.call(undefined);
    }
  },

  removeFromQueue(player_id: string) {
    let index_found = -1;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].id == player_id) {
        index_found = i;
        break;
      }
    }
    if (index_found > 0) {
      this.queue.splice(index_found, 1);
      this.totalQueueLength--;
    }
  },

  stop(terminate = false) {
    if (terminate) {
      StatsApi.onSuccess = undefined;
      StatsApi.onFail = undefined;
      this.queue.splice(0);
      this.totalQueueLength = 0;
      this.state = StatsUpdaterState.waiting;
      setTimeout(this.resetState.bind(this), this.min_api_request_interval);
      if (typeof this.onComplete == "function") this.onComplete.call(undefined);
    } else if (this.queue.length > 1) {
      this.queue.splice(1);
    }
  },

  updateNextPlayer() {
    if (this.queue.length == 0) {
      if (typeof this.onComplete == "function") this.onComplete.call(undefined);
      this.state = StatsUpdaterState.waiting;
      setTimeout(this.resetState.bind(this), this.min_api_request_interval);
      return;
    }
    const player_struct = this.queue[0];
    StatsApi.id = player_struct.id;
    StatsApi.platform = this.platform;
    StatsApi.onSuccess = this.onApiSuccess.bind(this);
    StatsApi.onFail = this.onApiFail.bind(this);
    StatsApi.getStats();
    this.current_id = player_struct.id;
    if (typeof this.onProgressChange == "function") this.onProgressChange.call(undefined);
  },

  resetState() {
    if (this.state == StatsUpdaterState.waiting) {
      this.totalQueueLength = 0;
      this.update_fails = 0;
      this.currentIndex = 0;
      this.state = StatsUpdaterState.idle;
    }
  },

  applyStats(player: Player) {
    player.private_profile = false;
    if (StatsApi.level !== undefined) player.level = StatsApi.level;

    player.playtime_by_class = {};
    for (const class_name of Object.keys(StatsApi.playtime_by_class)) {
      player.playtime_by_class[class_name] = Math.round(StatsApi.playtime_by_class[class_name] * 100) / 100;
    }

    if (player.ne !== true || this.update_edited_fields) player.display_name = StatsApi.display_name;

    if (this.update_sr) {
      if (player.se !== true || this.update_edited_fields) player.sr_by_class = {};
      if (Object.keys(StatsApi.sr_by_class).length > 0) {
        if (player.se !== true || this.update_edited_fields) {
          for (const class_name of class_names) {
            if (StatsApi.sr_by_class[class_name] != undefined) player.sr_by_class[class_name] = StatsApi.sr_by_class[class_name];
          }
          player.se = false;
        }
      } else if (typeof this.onWarning == "function") {
        this.onWarning.call(undefined, StatsApi.id, "Player is unranked on all roles this season");
      }
    }

    if (this.update_class && Object.keys(StatsApi.playtime_by_class).length > 0) {
      if (player.ce !== true || this.update_edited_fields) {
        player.classes = [];
        let class_found = false;
        do {
          let top_playtime = 0;
          let top_class = "";
          class_found = false;
          for (const class_name of Object.keys(StatsApi.playtime_by_class)) {
            if (player.classes.indexOf(class_name) != -1) continue;
            let class_sr = player.sr_by_class[class_name];
            if (class_sr == undefined) class_sr = 0;
            if (class_sr == 0) continue;
            if (StatsApi.playtime_by_class[class_name] > top_playtime) {
              top_playtime = StatsApi.playtime_by_class[class_name];
              top_class = class_name;
            }
          }
          if (top_class != "") {
            class_found = true;
            player.classes.push(top_class);
          }
        } while (class_found);
        player.ce = false;
      }
    }

    player.top_heroes = StatsApi.top_heroes;
    player.last_updated = new Date();
    delete player.empty;
  },

  onApiSuccess() {
    const player = this.queue.shift()!;
    this.applyStats(player);
    this.current_retry = 0;

    if (this.queue.length > 0) {
      this.currentIndex++;
      setTimeout(this.updateNextPlayer.bind(this), this.min_api_request_interval);
    } else {
      this.state = StatsUpdaterState.waiting;
      this.totalQueueLength = 0;
      this.update_fails = 0;
      this.currentIndex = 0;
      if (typeof this.onComplete == "function") this.onComplete.call(undefined);
      setTimeout(this.resetState.bind(this), this.min_api_request_interval);
    }

    if (typeof this.onPlayerUpdated == "function") this.onPlayerUpdated.call(undefined, player.id);
  },

  onApiFail(msg: string) {
    let is_changed = false;
    if (StatsApi.can_retry == true && this.current_retry < this.max_retry) {
      this.current_retry++;
      setTimeout(this.updateNextPlayer.bind(this), this.min_api_request_interval);
    } else {
      this.update_fails++;
      const player = this.queue.shift()!;
      this.current_retry = 0;
      if (StatsApi.private_profile) {
        player.private_profile = true;
        is_changed = true;
      }
      if (typeof this.onError == "function") this.onError.call(undefined, StatsApi.id, msg, is_changed);
      if (this.queue.length > 0) {
        this.currentIndex++;
        setTimeout(this.updateNextPlayer.bind(this), this.min_api_request_interval);
      } else {
        this.state = StatsUpdaterState.waiting;
        this.totalQueueLength = 0;
        this.currentIndex = 0;
        if (typeof this.onComplete == "function") this.onComplete.call(undefined);
        setTimeout(this.resetState.bind(this), this.min_api_request_interval);
      }
    }
  },
};
