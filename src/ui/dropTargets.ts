import type { DropTarget } from "../logic/actions";

export function emptySlotId(container: "team1" | "team2", slotClass: string | undefined, index: number) {
  return `empty:${container}:${slotClass ?? ""}:${index}`;
}

export function toTarget(overId: string): DropTarget | null {
  if (overId == "trash") return { type: "trash" };
  if (overId.startsWith("player:")) return { type: "player", id: overId.slice("player:".length) };
  if (overId == "empty:lobby") return { type: "empty", container: "lobby" };
  if (overId.startsWith("empty:")) {
    const [, container, slot_class] = overId.split(":");
    if (container != "team1" && container != "team2") return null;
    return { type: "empty", container, slot_class: slot_class || undefined };
  }
  return null;
}
