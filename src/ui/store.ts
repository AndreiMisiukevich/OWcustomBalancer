import { useSyncExternalStore } from "react";
import { getVersion, notify, subscribe } from "../logic/state";
import type { Player } from "../logic/types";

export type DialogState =
  | { kind: "none" }
  | { kind: "import" }
  | { kind: "exportLobby" }
  | { kind: "exportTeams" }
  | { kind: "settings" }
  | { kind: "edit"; player: Player; nonce: number }
  | { kind: "statsUpdate"; scope: "all" | "active" }
  | { kind: "statsLog" }
  | { kind: "checkin" }
  | { kind: "info" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "warn" | "error" | "ok";
}

export const ui = {
  dialog: { kind: "none" } as DialogState,
  toasts: [] as Toast[],
  highlighted: new Map<string, number>(),
  scrollTo: null as string | null,
  adding: false,
  balance: { phase: "idle" as "idle" | "running" | "notfound", progress: 0, visible: false },
  balancePulse: 0,
  balanceStamp: false,
  stats: {
    active: false,
    status: "",
    index: 0,
    total: 0,
    errors: 0,
    log: "",
    editorLoading: false,
    editorResult: "",
  },
  dragging: false,
  dragPlayer: null as Player | null,
  addReset: 0,
};

let toastSeq = 0;

export function rerender() {
  notify();
}

export function useApp() {
  return useSyncExternalStore(subscribe, getVersion);
}

export function openDialog(d: DialogState) {
  ui.dialog = d;
  rerender();
}

export function closeDialog() {
  ui.dialog = { kind: "none" };
  rerender();
}

export function toast(text: string, tone: Toast["tone"] = "info", ttl = 3600) {
  const id = ++toastSeq;
  ui.toasts = [...ui.toasts, { id, text, tone }];
  rerender();
  setTimeout(() => {
    ui.toasts = ui.toasts.filter((t) => t.id !== id);
    rerender();
  }, ttl);
}

export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, danger = false) {
  openDialog({ kind: "confirm", title, message, confirmLabel, onConfirm, danger });
}

export function highlight(ids: string[], scroll = true) {
  const until = Date.now() + 2000;
  for (const id of ids) ui.highlighted.set(id, until);
  if (scroll && ids.length) ui.scrollTo = ids[ids.length - 1];
  rerender();
  setTimeout(() => {
    const now = Date.now();
    for (const [id, t] of ui.highlighted) if (t <= now) ui.highlighted.delete(id);
    rerender();
  }, 2050);
}
