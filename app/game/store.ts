// Tiny observable store that carries game state to the React HUD.
import { useSyncExternalStore } from "react";

export type ChoreId = "dishes" | "floors" | "plants" | "trash" | "bed" | "stove";

export type QueueItem = { uid: number; actionId: string; icon: string; label: string };

export type Toast = { id: number; text: string };

export type HudState = {
  phase: "loading" | "intro" | "playing";
  loadProgress: number;
  loadError: string | null;
  name: string;
  energy: number;
  fun: number;
  mood: number;
  moodLabel: string;
  moodIcon: string;
  activity: string;
  activityIcon: string;
  activityProgress: number;
  queue: QueueItem[];
  currentUid: number | null;
  dirt: Record<ChoreId, number>;
  cleanliness: number;
  stars: number;
  choresDone: number;
  clock: string;
  day: number;
  speed: number;
  wallsUp: boolean;
  follow: boolean;
  sound: boolean;
  pizzaCooldown: number;
  toasts: Toast[];
};

const initial: HudState = {
  phase: "loading",
  loadProgress: 0,
  loadError: null,
  name: "Roomie",
  energy: 0.8,
  fun: 0.7,
  mood: 0.75,
  moodLabel: "Content",
  moodIcon: "🙂",
  activity: "Lying in bed",
  activityIcon: "🛏️",
  activityProgress: 0,
  queue: [],
  currentUid: null,
  dirt: { dishes: 0.75, floors: 0.6, plants: 0.55, trash: 0.7, bed: 1, stove: 0.4 },
  cleanliness: 0.35,
  stars: 0,
  choresDone: 0,
  clock: "9:00 AM",
  day: 1,
  speed: 1,
  wallsUp: false,
  follow: false,
  sound: true,
  pizzaCooldown: 0,
  toasts: [],
};

let state = initial;
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<HudState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useHud() {
  return useSyncExternalStore(store.subscribe, store.get, () => initial);
}
