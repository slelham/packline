export type MissionId = "hoops" | "tunnels" | "treats" | "combo" | "distance";

export type MissionDef = {
  id: MissionId;
  label: string;
  goal: number;
  reward: number;
};

export type MissionProgress = MissionDef & { progress: number; claimed: boolean };

export type MissionHud = {
  id: MissionId;
  label: string;
  progress: number;
  goal: number;
  reward: number;
  done: boolean;
};

const POOL: MissionDef[] = [
  { id: "hoops", label: "8 hoops", goal: 8, reward: 40 },
  { id: "tunnels", label: "4 tunnels", goal: 4, reward: 35 },
  { id: "treats", label: "15 treats", goal: 15, reward: 30 },
  { id: "combo", label: "25 treats", goal: 25, reward: 45 },
  { id: "distance", label: "500 meters", goal: 500, reward: 50 },
];

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rollDaily(seed: string): MissionProgress[] {
  const h = hash(seed);
  const order = POOL.map((_, i) => i).sort((a, b) => ((h >>> (a * 3)) & 7) - ((h >>> (b * 3)) & 7));
  const pick = order.slice(0, 3).map((i) => POOL[i]!);
  return pick.map((m) => ({ ...m, progress: 0, claimed: false }));
}

export function ensureMissions(day: string, existing: MissionProgress[]): MissionProgress[] {
  if (day === todayKey() && existing.length === 3) return existing;
  return rollDaily(todayKey());
}

export function toHud(list: MissionProgress[]): MissionHud[] {
  return list.map((m) => ({
    id: m.id,
    label: m.label,
    progress: Math.min(m.goal, m.progress),
    goal: m.goal,
    reward: m.reward,
    done: m.progress >= m.goal,
  }));
}
