import * as A from "../logic/actions";
import { find_player_by_id, format_player_name } from "../logic/common";
import { save_players_list } from "../logic/importExport";
import { record_match, undo_last_match } from "../logic/offrole";
import { StatsUpdater, StatsUpdaterState } from "../logic/statsUpdater";
import type { Player } from "../logic/types";
import { closeDialog, confirmAction, highlight, openDialog, rerender, toast, ui } from "./store";

let worker: Worker | null = null;
let balanceShowTimer: ReturnType<typeof setTimeout> | undefined;
let pendingRequest: string | null = null;

function requestKey() {
  return A.collect_balance_players()
    .map((p) => p.id)
    .sort()
    .join("\n");
}

function withCurrentPlayers(result: A.BalanceResult): A.BalanceResult {
  const current = (p: Player) => find_player_by_id(p.id) ?? p;
  const slots = (s: Record<string, Player[]>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.map(current)]));
  return { ...result, team1: result.team1.map(current), team2: result.team2.map(current), team1_slots: slots(result.team1_slots), team2_slots: slots(result.team2_slots) };
}

function workerUrl() {
  return `${import.meta.env.BASE_URL}balancer/balance_worker.js`;
}

function createWorker() {
  worker = new Worker(workerUrl());
  worker.onmessage = onWorkerMessage;
  worker.postMessage(["init"]);
}

export function onWorkerMessage(e: { data: unknown }) {
  if (!Array.isArray(e.data) || e.data.length < 2) return;
  const [type, payload] = e.data;
  if ((type == "finish" || type == "error") && pendingRequest !== requestKey()) {
    clearTimeout(balanceShowTimer);
    pendingRequest = null;
    ui.balance = { phase: "idle", progress: 0, visible: false };
    rerender();
    toast("Teams changed while balancing. Press Balance again.", "warn");
    return;
  }
  if (type == "progress") {
    ui.balance.progress = payload.current_progress;
    rerender();
  } else if (type == "finish") {
    clearTimeout(balanceShowTimer);
    pendingRequest = null;
    if (payload.is_successfull) {
      A.apply_balance_result(withCurrentPlayers(payload));
      ui.balance = { phase: "idle", progress: 100, visible: false };
      ui.balancePulse++;
      ui.balanceStamp = true;
      const pulse = ui.balancePulse;
      setTimeout(() => {
        if (ui.balancePulse == pulse) {
          ui.balanceStamp = false;
          rerender();
        }
      }, 1600);
    } else {
      ui.balance = { phase: "notfound", progress: ui.balance.progress, visible: true };
    }
    rerender();
  } else if (type == "error") {
    pendingRequest = null;
    clearTimeout(balanceShowTimer);
    ui.balance = { phase: "idle", progress: 0, visible: false };
    rerender();
    const partial = /reading 'classes'/.test(String(payload));
    toast(partial ? "Role lock needs both teams full. Fill the empty slots or switch role lock off." : "Balancer error: " + payload, "error", 6000);
  }
}

export function startBalanceRequest() {
  pendingRequest = requestKey();
  ui.balance = { phase: "running", progress: 0, visible: false };
  return A.collect_balance_players();
}

export function isBalancing() {
  return ui.balance.phase == "running";
}

export function balanceTeams() {
  if (isBalancing()) return;
  if (!worker) createWorker();
  const players = startBalanceRequest();
  worker!.postMessage(["settings", A.build_balancer_settings()]);
  worker!.postMessage(["balance", players]);
  clearTimeout(balanceShowTimer);
  balanceShowTimer = setTimeout(() => {
    if (ui.balance.phase == "running") {
      ui.balance.visible = true;
      rerender();
    }
  }, 220);
  rerender();
}

export function cancelBalance() {
  pendingRequest = null;
  clearTimeout(balanceShowTimer);
  worker?.terminate();
  worker = null;
  ui.balance = { phase: "idle", progress: 0, visible: false };
  rerender();
}

export function dismissBalance() {
  ui.balance = { phase: "idle", progress: 0, visible: false };
  rerender();
}

function drawStatus() {
  ui.stats.active = StatsUpdater.state == StatsUpdaterState.updating;
  ui.stats.index = StatsUpdater.currentIndex;
  ui.stats.total = StatsUpdater.totalQueueLength;
  ui.stats.status = ui.stats.active ? StatsUpdater.current_id : "";
  rerender();
}

function logError(msg: string) {
  ui.stats.log = (ui.stats.log + "\n" + msg).trim();
  ui.stats.errors = ui.stats.log.split("\n").length;
  rerender();
}

function editedPlayer(): Player | undefined {
  return ui.dialog.kind == "edit" ? ui.dialog.player : undefined;
}

export function initController() {
  A.init_state();

  StatsUpdater.onStart = drawStatus;
  StatsUpdater.onProgressChange = drawStatus;
  StatsUpdater.onComplete = () => {
    ui.stats.active = false;
    ui.stats.status = "complete";
    rerender();
    setTimeout(drawStatus, StatsUpdater.min_api_request_interval);
  };

  StatsUpdater.onPlayerUpdated = (player_id: string) => {
    const adding = A.runtime.player_being_added;
    if (adding !== undefined && player_id == adding.id) {
      A.place_new_player(adding);
      A.runtime.player_being_added = undefined;
      ui.adding = false;
      ui.addReset++;
      highlight([player_id]);
      toast(`${adding.display_name} added`, "ok", 2200);
      return;
    }
    const edited = editedPlayer();
    if (edited && edited.id == player_id) {
      ui.stats.editorLoading = false;
      openDialog({ kind: "edit", player: edited, nonce: Date.now() });
    }
    if (find_player_by_id(player_id) !== undefined) {
      save_players_list();
      highlight([player_id], false);
    }
  };

  StatsUpdater.onError = (player_id: string, msg: string, is_changed: boolean) => {
    logError(player_id + ": " + msg);
    const adding = A.runtime.player_being_added;
    if (adding !== undefined && adding.id == player_id) {
      A.runtime.player_being_added = undefined;
      ui.adding = false;
      rerender();
      confirmAction("Can't get player stats", `${msg}. Add ${format_player_name(player_id) || player_id} manually?`, "Add manually", () => {
        const p = A.add_player_manually(player_id);
        ui.addReset++;
        highlight([player_id]);
        openDialog({ kind: "edit", player: p, nonce: Date.now() });
      });
    }
    const edited = editedPlayer();
    if (edited && edited.id == player_id) {
      ui.stats.editorLoading = false;
      ui.stats.editorResult = msg;
      rerender();
    }
    if (is_changed) save_players_list();
  };

  StatsUpdater.onWarning = (player_id: string, msg: string) => {
    logError(player_id + ": " + msg);
    const edited = editedPlayer();
    if (edited && edited.id == player_id) {
      ui.stats.editorResult += msg;
      rerender();
    }
  };
}

export function addPlayer(raw: string) {
  const r = A.add_player_start(raw);
  if (r.status == "empty") {
    toast("Enter a BattleTag, e.g. Name#1234", "warn");
  } else if (r.status == "duplicate") {
    toast("Player already added", "warn");
    highlight([r.id]);
  } else {
    ui.adding = true;
    rerender();
  }
}

export function stopStatsUpdate() {
  StatsUpdater.stop(true);
  if (A.runtime.player_being_added !== undefined) {
    A.runtime.player_being_added = undefined;
    ui.adding = false;
  }
  ui.stats.editorLoading = false;
  drawStatus();
}

export function clearStatsLog() {
  ui.stats.log = "";
  ui.stats.errors = 0;
  closeDialog();
}

export function updatePlayerNow(player: Player) {
  A.update_player_stats_now(player);
  ui.stats.editorLoading = true;
  ui.stats.editorResult = "";
  rerender();
}

export function recordMatch() {
  const r = record_match();
  if (!r.ok) {
    toast(r.reason, "warn");
    return;
  }
  ui.lastRecordAt = Date.now();
  const names = r.off.map((p) => p.display_name || p.id);
  toast(names.length ? `Match ${r.matches} recorded. Off-role: ${names.join(", ")}` : `Match ${r.matches} recorded. Everyone was on their main role.`, "ok", 5000);
  rerender();
}

export function undoRecordedMatch() {
  if (undo_last_match()) toast("Last recorded match removed", "info");
  ui.lastRecordAt = 0;
  rerender();
}

export function moveByDoubleClick(id: string) {
  if (isBalancing()) return;
  const r = A.player_dblclick(id);
  if (r == "full") toast("Teams are full", "warn");
  rerender();
}

export function runAndRender(fn: () => unknown) {
  fn();
  rerender();
}
