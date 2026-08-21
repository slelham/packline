import { isDogId, type DogId } from "./characters";
import { todayKey, type MissionProgress } from "./missions";

const KEY = "packline-save";
const SAVE_VERSION = 4;

export type SaveData = {
  version: number;
  highScore: number;
  gamesPlayed: number;
  bestCombo: number;
  muted: boolean;
  character: DogId;
  treats: number;
  bestDistance: number;
  day: string;
  missions: MissionProgress[];
  displayName: string;
};

const defaults: SaveData = {
  version: SAVE_VERSION,
  highScore: 0,
  gamesPlayed: 0,
  bestCombo: 0,
  muted: false,
  character: "remy",
  treats: 0,
  bestDistance: 0,
  day: "",
  missions: [],
  displayName: "",
};

function migrate(raw: Partial<SaveData> & { version?: number }): SaveData {
  const merged = { ...defaults, ...raw, version: SAVE_VERSION };
  merged.highScore = Math.max(0, Number(merged.highScore) || 0);
  merged.gamesPlayed = Math.max(0, Number(merged.gamesPlayed) || 0);
  merged.bestCombo = Math.max(0, Number(merged.bestCombo) || 0);
  merged.treats = raw.treats == null ? 80 : Math.max(0, Number(raw.treats) || 0);
  merged.bestDistance = Math.max(0, Number(merged.bestDistance) || 0);
  merged.muted = Boolean(merged.muted);
  merged.character = isDogId(merged.character) ? merged.character : "remy";
  merged.day = typeof merged.day === "string" ? merged.day : "";
  merged.missions = Array.isArray(merged.missions) ? merged.missions : [];
  merged.displayName = typeof merged.displayName === "string" ? merged.displayName.slice(0, 16) : "";
  if (merged.day !== todayKey()) {
    merged.day = todayKey();
    merged.missions = [];
  }
  return merged;
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem("roofline-save");
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(data: SaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}
