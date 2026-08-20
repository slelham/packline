import { isDogId, type DogId } from "./characters";

const KEY = "packline-save";
const SAVE_VERSION = 2;

export type SaveData = {
  version: number;
  highScore: number;
  gamesPlayed: number;
  bestCombo: number;
  muted: boolean;
  character: DogId;
};

const defaults: SaveData = {
  version: SAVE_VERSION,
  highScore: 0,
  gamesPlayed: 0,
  bestCombo: 0,
  muted: false,
  character: "remy",
};

function migrate(raw: Partial<SaveData> & { version?: number }): SaveData {
  const merged = { ...defaults, ...raw, version: SAVE_VERSION };
  merged.highScore = Math.max(0, Number(merged.highScore) || 0);
  merged.gamesPlayed = Math.max(0, Number(merged.gamesPlayed) || 0);
  merged.bestCombo = Math.max(0, Number(merged.bestCombo) || 0);
  merged.muted = Boolean(merged.muted);
  merged.character = isDogId(merged.character) ? merged.character : "remy";
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
