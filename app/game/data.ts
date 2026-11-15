// Where things are in the apartment (world metres, after scripts/build-world.js alignment)
// and what the roommate can be told to do there.
import type { ChoreId } from "./store";
import type { Pt } from "./nav";

export const BASE_PATH = "/apartment";

export type ActionId =
  | ChoreId
  | "nap"
  | "tv"
  | "keys"
  | "snack"
  | "pizza"
  | "walk"
  | "wander"
  | "party";

export type ActionDef = {
  id: ActionId;
  label: string;
  icon: string;
  kind: "chore" | "fun" | "move";
  doing: string;
};

export const ACTIONS: Record<ActionId, ActionDef> = {
  dishes: { id: "dishes", label: "Wash the dishes", icon: "🍽️", kind: "chore", doing: "Washing dishes" },
  floors: { id: "floors", label: "Vacuum", icon: "🧹", kind: "chore", doing: "Hunting dust bunnies" },
  plants: { id: "plants", label: "Water the plants", icon: "🪴", kind: "chore", doing: "Watering plants" },
  trash: { id: "trash", label: "Take out the trash", icon: "🗑️", kind: "chore", doing: "Taking out the trash" },
  bed: { id: "bed", label: "Make the bed", icon: "🛏️", kind: "chore", doing: "Making the bed" },
  stove: { id: "stove", label: "Scrub the stove", icon: "🍳", kind: "chore", doing: "Scrubbing the stove" },
  nap: { id: "nap", label: "Take a nap", icon: "😴", kind: "fun", doing: "Napping" },
  tv: { id: "tv", label: "Chill on the sofa", icon: "🛋️", kind: "fun", doing: "Chilling on the sofa" },
  keys: { id: "keys", label: "Jam on the keyboard", icon: "🎹", kind: "fun", doing: "Jamming" },
  snack: { id: "snack", label: "Raid the fridge", icon: "🥪", kind: "fun", doing: "Raiding the fridge" },
  pizza: { id: "pizza", label: "Pizza bribe", icon: "🍕", kind: "fun", doing: "Eating bribe pizza" },
  walk: { id: "walk", label: "Walk here", icon: "👣", kind: "move", doing: "Walking" },
  wander: { id: "wander", label: "Wander", icon: "🚶", kind: "move", doing: "Wandering about" },
  party: { id: "party", label: "Dance", icon: "🎉", kind: "fun", doing: "Tearing up the dance floor" },
};

export const CHORES: ChoreId[] = ["dishes", "floors", "plants", "trash", "bed", "stove"];
export const FUN: ActionId[] = ["nap", "tv", "keys", "snack"];

/** How fast each mess builds up, per second at 1x speed. */
export const DIRT_RATE: Record<ChoreId, number> = {
  dishes: 0.0055,
  floors: 0.005,
  plants: 0.004,
  trash: 0.0045,
  bed: 0,
  stove: 0.003,
};

export type Station = {
  id: string;
  pos: [number, number, number]; // where the floating marker sits
  icon: string;
  actions: ActionId[];
  chore?: ChoreId;
};

export const STATIONS: Station[] = [
  { id: "sink", pos: [0.93, 1.3, -1.9], icon: "🍽️", actions: ["dishes"], chore: "dishes" },
  { id: "stove", pos: [-0.44, 1.3, -1.9], icon: "🍳", actions: ["stove"], chore: "stove" },
  { id: "fridge", pos: [-1.36, 1.55, -2.1], icon: "🥪", actions: ["snack"] },
  { id: "bin", pos: [2.05, 0.95, -3.55], icon: "🗑️", actions: ["trash"], chore: "trash" },
  { id: "plants", pos: [-1.07, 1.35, 2.8], icon: "🪴", actions: ["plants"], chore: "plants" },
  { id: "plantsBay", pos: [-4.3, 1.45, 3.05], icon: "🪴", actions: ["plants"], chore: "plants" },
  { id: "rug", pos: [-4.6, 0.55, -0.9], icon: "🧹", actions: ["floors"], chore: "floors" },
  { id: "bed", pos: [7.1, 1.2, -0.72], icon: "🛏️", actions: ["bed", "nap"], chore: "bed" },
  { id: "sofa", pos: [-6.6, 1.2, 0.5], icon: "🛋️", actions: ["tv"] },
  { id: "keys", pos: [-6.96, 1.25, -3.45], icon: "🎹", actions: ["keys"] },
];

// Spots the roommate stands at (snapped to the nearest walkable cell at runtime).
export const SPOT = {
  sink: [0.93, -2.5] as Pt,
  stove: [-0.44, -2.5] as Pt,
  fridge: [-1.35, -2.8] as Pt,
  bin: [2.05, -3.05] as Pt,
  door: [-2.5, -2.0] as Pt,
  bedside: [8.3, -1.7] as Pt,
  sofa: [-5.75, 0.05] as Pt,
  keys: [-6.96, -2.95] as Pt,
};

/** The front door: on the kitchen's south wall, just right of the fridge as you face it. */
export const FRONT_DOOR: Pt = SPOT.door;

export const BIN_POS: [number, number, number] = [2.05, 0, -3.6];
export const DISH_POS: [number, number, number] = [0.32, 0.9, -1.98];

/** Plants to water: where to stand, and where the plant is. */
export const PLANTS: { stand: Pt; plant: [number, number, number] }[] = [
  { stand: [-3.85, 2.3], plant: [-4.25, 0.95, 3.0] },
  { stand: [-1.07, 2.3], plant: [-1.07, 0.95, 2.8] },
  { stand: [3.3, 2.4], plant: [3.3, 0.8, 2.88] },
  { stand: [9.3, 1.55], plant: [9.85, 0.6, 0.95] },
];

// The roommate's bed (rebuilt as a clean prop where the scan had him lying in it).
export const BED = { x0: 6.3, x1: 7.9, z0: -2.62, z1: -0.56, top: 0.56 };

/** Areas where dust bunnies like to gather: [x0, x1, z0, z1]. */
export const DUST_ZONES: [number, number, number, number][] = [
  [-7.6, -3.2, -3.4, 2.0],
  [-3.4, 5.6, 1.9, 2.9],
  [-3.0, 2.4, -3.7, -2.4],
  [2.4, 5.2, -3.3, -2.5],
  [8.0, 9.3, -3.4, -1.0],
];

export const LINES = {
  accept: [
    "Ugh. Fine.",
    "On it, boss.",
    "Didn't I JUST do this?",
    "You owe me one.",
    "Okay okay okay.",
    "Adding it to my resentments.",
    "Sure. Love that for me.",
  ],
  grumpy: ["This is a lot.", "I'm so tired.", "Can this wait?", "*long sigh*", "I live here too, you know."],
  refuse: ["I'm on strike.", "Absolutely not.", "My union says no.", "Feed me first.", "Nope. Nap time."],
  done: ["Spotless.", "Behold!", "Who's the best roommate?", "Nailed it.", "That was… fine, actually."],
  idle: ["Is it lunch yet?", "…", "Nice light in here.", "Hmm.", "What day is it?"],
  pizza: ["PIZZA?!", "You get me.", "All is forgiven."],
  nap: ["Five more minutes…", "Zzz…"],
  wake: ["I was resting my eyes.", "What year is it?"],
  dust: ["Got you!", "Gotcha.", "Begone, fluff."],
};

export const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
