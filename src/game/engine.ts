import { loadSprites, type ActionSheets, type SpriteBank } from "./assets";
import { GameAudio } from "./audio";
import { DOGS, type DogId } from "./characters";
import { Input } from "./input";
import { ensureMissions, todayKey, toHud, type MissionHud } from "./missions";
import { loadSave, writeSave, type SaveData } from "./save";

export type Phase = "boot" | "title" | "playing" | "dying" | "gameover";
export type Biome = "park" | "beach" | "show";
export type PowerKind = "shield" | "magnet" | "frenzy";

export type HudState = {
  phase: Phase;
  score: number;
  highScore: number;
  combo: number;
  speed: number;
  distance: number;
  bestCombo: number;
  newBest: boolean;
  muted: boolean;
  ready: boolean;
  lastRunCombo: number;
  lastRunThreads: number;
  lastRunTunnels: number;
  threads: number;
  tunnels: number;
  character: DogId;
  treats: number;
  runTreats: number;
  shield: number;
  magnet: number;
  frenzy: number;
  boost: number;
  canRevive: boolean;
  reviveCost: number;
  biome: Biome;
  missions: MissionHud[];
};

export type HudListener = (s: HudState) => void;

const BASE_SPEED = 300;
const MAX_SPEED = 860;
const GRAVITY = 2100;
const JUMP_VEL = -840;
const MAX_FALL = 1320;
const COYOTE = 0.16;
const JUMP_BUF = 0.14;
const SLIDE_TIME = 0.72;
const HITSTOP = 0.08;
const DIE_TIME = 0.78;
const PLAY_W = 1080;
const PLAY_H = 700;
const TUNNEL_GAP = 82;
const HOOP_H = 318;
const HOOP_W = 128;
const HOOP_HOLE_TOP = 286;
const HOOP_HOLE_H = 262;

type Kind = "hurdle" | "hoop" | "tunnel" | "weave" | "crate" | "hydrant" | "pipe" | "plat";

type Obstacle = {
  active: boolean;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  holeY: number;
  holeH: number;
  gap: number;
  scored: boolean;
  near: number;
  special: boolean;
};

type Coin = { active: boolean; x: number; y: number; r: number; skin: number };
type Pickup = { active: boolean; kind: PowerKind; x: number; y: number };
type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};
type Burst = { active: boolean; x: number; y: number; t: number; kind: "dust" | "impact" };
type Floater = { active: boolean; x: number; y: number; text: string; t: number };

type Prop = { x: number; w: number; h: number; shape: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return ox > 10 && oy > 8;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PacklineGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private parent: HTMLElement;
  private input: Input;
  private audio = new GameAudio();
  private sprites: SpriteBank | null = null;
  private save: SaveData;
  private onHud: HudListener;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private viewW = PLAY_W;
  private viewH = PLAY_H;
  private ground = PLAY_H - 118;
  private reduced = false;
  private running = false;
  private phase: Phase = "boot";
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private lastRunCombo = 0;
  private lastRunThreads = 0;
  private lastRunTunnels = 0;
  private threads = 0;
  private tunnels = 0;
  private inTunnel = false;
  private skyGrad: CanvasGradient | null = null;
  private skyH = 0;
  private distance = 0;
  private speed = BASE_SPEED;
  private newBest = false;
  private charId: DogId = "remy";
  private player = {
    x: 196,
    y: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    slideT: 0,
    coyote: 0,
    squash: 1,
    stretch: 1,
    anim: 0,
    landKick: 0,
    jumpStretch: 0,
    airJumps: 1,
  };
  private cat = {
    y: 0,
    sway: 0,
    side: 1,
    marked: -1,
  };
  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private floaters: Floater[] = [];
  private nextSpawn = 0;
  private lastKind: Kind | null = null;
  private hitstop = 0;
  private dieT = 0;
  private trauma = 0;
  private flash = 0;
  private scroll = 0;
  private farScroll = 0;
  private midScroll = 0;
  private dustTimer = 0;
  private far: Prop[] = [];
  private mid: Prop[] = [];
  private farW = 1;
  private midW = 1;
  private clouds: { x: number; y: number; w: number; a: number }[] = [];
  private hudDirty = true;
  private hudKey = "";
  private resizeObs: ResizeObserver | null = null;
  private startGrace = 0;
  private jumpBuf = 0;
  private titleT = 0;
  private runTreats = 0;
  private shieldT = 0;
  private magnetT = 0;
  private frenzyT = 0;
  private invulnT = 0;
  private boostT = 0;
  private usedRevive = false;
  private pickups: Pickup[] = [];
  private spawnCount = 0;
  private biome: Biome = "park";
  private lastBiome: Biome = "park";
  readonly reviveCost = 40;

  constructor(canvas: HTMLCanvasElement, onHud: HudListener) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.parent = canvas.parentElement ?? canvas;
    this.onHud = onHud;
    this.save = loadSave();
    this.save.missions = ensureMissions(this.save.day, this.save.missions);
    this.save.day = todayKey();
    this.charId = this.save.character;
    this.audio.setMuted(this.save.muted);
    this.input = new Input(this.canvas);
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.pool();
    this.buildPark();
    this.fit();
    this.player.y = this.ground;
    this.cat.y = this.ground;
    this.resizeObs = new ResizeObserver(() => this.fit());
    this.resizeObs.observe(this.parent);
    window.addEventListener("resize", this.fit);
    this.bindQa();
    this.phase = "title";
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.emitHud();
    void this.boot();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    this.resizeObs?.disconnect();
    window.removeEventListener("resize", this.fit);
    if (window.__controlsTest) delete window.__controlsTest;
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    this.audio.setMuted(this.save.muted);
    writeSave(this.save);
    this.hudDirty = true;
    this.emitHud();
  }

  startFromTitle() {
    if (this.phase === "playing" || this.phase === "dying") return;
    this.input.clear();
    this.audio.unlock();
    this.resetRun();
    this.phase = "playing";
    this.startGrace = 0.32;
    this.hudKey = "";
    this.emitHud();
  }

  restart() {
    if (this.phase === "playing" || this.phase === "dying") return;
    this.input.clear();
    this.audio.unlock();
    this.resetRun();
    this.phase = "playing";
    this.startGrace = 0.28;
    this.hudKey = "";
    this.emitHud();
  }

  returnToTitle() {
    this.audio.unlock();
    this.resetRun();
    this.phase = "title";
    this.hudKey = "";
    this.emitHud();
  }

  setCharacter(id: DogId) {
    this.charId = id;
    this.save.character = id;
    writeSave(this.save);
    this.hudKey = "";
    this.emitHud();
  }

  requestSlide() {
    this.audio.unlock();
    this.input.requestSlide();
  }

  releaseSlide() {
    this.input.releaseSlide();
  }

  requestJump() {
    this.audio.unlock();
    this.input.requestJump();
  }

  releaseJump() {
    this.input.releaseJump();
  }

  revive() {
    if (this.phase !== "gameover" || this.usedRevive) return false;
    if (this.save.treats < this.reviveCost) return false;
    this.save.treats -= this.reviveCost;
    this.usedRevive = true;
    writeSave(this.save);
    this.audio.unlock();
    this.audio.revive();
    this.phase = "playing";
    this.player.y = this.ground;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.sliding = false;
    this.cat.y = this.ground;
    this.cat.sway = 0;
    this.cat.side = 1;
    this.cat.marked = -1;
    this.invulnT = 2.1;
    this.shieldT = Math.max(this.shieldT, 2.1);
    this.startGrace = 0.35;
    this.flash = 0.28;
    this.trauma = 0.2;
    this.clearAhead();
    this.hudKey = "";
    this.emitHud();
    return true;
  }

  private clearAhead() {
    const cut = this.player.x + this.speed * 1.4;
    for (const o of this.obstacles) {
      if (o.active && o.x < cut) o.active = false;
    }
  }

  private dog() {
    return DOGS[this.charId];
  }

  private sheets(): ActionSheets | null {
    return this.sprites?.dogs[this.charId] ?? null;
  }

  private async boot() {
    try {
      this.sprites = await loadSprites();
    } catch {
      this.sprites = null;
    }
    this.hudDirty = true;
    this.emitHud();
  }

  private pool() {
    this.obstacles = Array.from({ length: 32 }, () => ({
      active: false,
      kind: "hurdle" as Kind,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      holeY: 0,
      holeH: 0,
      gap: 0,
      scored: false,
      near: 999,
      special: false,
    }));
    this.coins = Array.from({ length: 36 }, () => ({ active: false, x: 0, y: 0, r: 16, skin: 0 }));
    this.particles = Array.from({ length: 40 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 2,
      color: "#ece8dc",
    }));
    this.bursts = Array.from({ length: 8 }, () => ({ active: false, x: 0, y: 0, t: 0, kind: "dust" }));
    this.floaters = Array.from({ length: 12 }, () => ({ active: false, x: 0, y: 0, text: "", t: 0 }));
    this.pickups = Array.from({ length: 6 }, () => ({ active: false, kind: "shield", x: 0, y: 0 }));
  }

  private buildPark() {
    const hillRand = mulberry32(17);
    const treeRand = mulberry32(91);
    const pack = (rand: () => number, count: number, minW: number, maxW: number, minH: number, maxH: number, gap: number) => {
      const list: Prop[] = [];
      let x = 20;
      for (let i = 0; i < count; i++) {
        const w = minW + rand() * (maxW - minW);
        const h = minH + rand() * (maxH - minH);
        list.push({ x, w, h, shape: Math.floor(rand() * 3) });
        x += w + gap + rand() * gap;
      }
      return { list, width: x + 80 };
    };
    const f = pack(hillRand, 10, 160, 280, 48, 110, 8);
    const m = pack(treeRand, 14, 36, 74, 88, 170, 28);
    this.far = f.list;
    this.farW = f.width;
    this.mid = m.list;
    this.midW = m.width;
    const cloudRand = mulberry32(4);
    this.clouds = Array.from({ length: 7 }, () => ({
      x: cloudRand() * 1400,
      y: 0.08 + cloudRand() * 0.22,
      w: 50 + cloudRand() * 90,
      a: 0.18 + cloudRand() * 0.22,
    }));
  }

  private fit = () => {
    const rect = this.parent.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const aspect = w / h;
    if (aspect >= 1.25) {
      this.viewH = PLAY_H;
    } else {
      const band = 540;
      const frac = clamp(0.48 + aspect * 0.12, 0.52, 0.66);
      this.viewH = band / frac;
    }
    this.viewW = this.viewH * aspect;
    const prevGround = this.ground;
    this.ground = this.viewH - 90;
    this.player.x = clamp(this.viewW * 0.2, 72, 188);
    this.skyGrad = null;
    this.rebaseGround(prevGround);
  };

  private rebaseGround(prev: number) {
    const dy = this.ground - prev;
    if (this.player.grounded && this.phase !== "dying") this.player.y = this.ground;
    else this.player.y += dy;
    this.cat.y = this.ground;
    if (Math.abs(dy) < 0.5) return;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      this.sitObstacle(o);
    }
    for (const c of this.coins) if (c.active) c.y += dy;
    for (const u of this.pickups) if (u.active) u.y += dy;
    for (const n of this.particles) if (n.active) n.y += dy;
    for (const b of this.bursts) if (b.active) b.y += dy;
    for (const f of this.floaters) if (f.active) f.y += dy;
  }

  private sitObstacle(o: Obstacle) {
    const g = this.ground;
    if (o.kind === "tunnel") {
      o.h = 28;
      o.y = g - o.gap - o.h;
    } else if (o.kind === "pipe") {
      o.h = 22;
      o.y = g - o.gap;
    } else if (o.kind === "hoop") {
      o.h = HOOP_H;
      o.w = HOOP_W;
      o.y = g - o.h;
      o.holeY = g - HOOP_HOLE_TOP;
      o.holeH = HOOP_HOLE_H;
    } else if (o.kind === "plat") {
      o.h = 18;
      o.y = g - o.gap;
    } else {
      o.y = g - o.h;
    }
  }

  private jumpPeak() {
    const v = -JUMP_VEL * this.dog().jump;
    return (v * v) / (2 * GRAVITY);
  }

  private mustSlideTunnel() {
    return 80 * this.dog().hitH > TUNNEL_GAP - 8;
  }

  private loop = (t: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.acc += dt;
    const step = 1 / 60;
    while (this.acc >= step) {
      this.update(step);
      this.acc -= step;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.input.tick(dt);
    if (this.phase === "boot") return;

    if (this.phase === "title") {
      if (this.input.consumeJump()) this.startFromTitle();
      this.scrollTitle(dt);
      this.titleT += dt;
      this.player.anim += dt;
      this.decayJuice(dt);
      this.emitHud();
      return;
    }

    if (this.phase === "gameover") {
      this.decayJuice(dt);
      this.emitHud();
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.decayJuice(dt);
      this.emitHud();
      return;
    }

    if (this.phase === "dying") {
      this.dieT += dt;
      this.player.anim += dt;
      this.player.vy = Math.min(MAX_FALL, this.player.vy + GRAVITY * dt * 0.45);
      this.player.y = Math.min(this.ground + 8, this.player.y + this.player.vy * dt);
      this.scrollWorld(dt * 0.25);
      this.stepFx(dt);
      this.decayJuice(dt);
      if (this.dieT >= DIE_TIME) this.endRun();
      this.emitHud();
      return;
    }

    this.stepPlay(dt);
    this.emitHud();
  }

  private scrollTitle(dt: number) {
    this.speed = 150;
    this.scroll += this.speed * dt;
    this.farScroll += this.speed * 0.12 * dt;
    this.midScroll += this.speed * 0.38 * dt;
    this.stepFx(dt);
  }

  private resetRun() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.threads = 0;
    this.tunnels = 0;
    this.inTunnel = false;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this.newBest = false;
    this.player.y = this.ground;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.sliding = false;
    this.player.slideT = 0;
    this.player.coyote = 0;
    this.player.squash = 1;
    this.player.stretch = 1;
    this.player.anim = 0;
    this.player.landKick = 0;
    this.player.jumpStretch = 0;
    this.player.airJumps = 1;
    this.cat.y = this.ground;
    this.cat.sway = 0;
    this.cat.side = 1;
    this.cat.marked = -1;
    for (const o of this.obstacles) o.active = false;
    for (const c of this.coins) c.active = false;
    for (const p of this.particles) p.active = false;
    for (const b of this.bursts) b.active = false;
    for (const f of this.floaters) f.active = false;
    this.nextSpawn = this.viewW + Math.max(220, this.speed * 1.15);
    this.lastKind = null;
    this.hitstop = 0;
    this.startGrace = 0;
    this.jumpBuf = 0;
    this.dieT = 0;
    this.trauma = 0;
    this.flash = 0;
    this.dustTimer = 0;
    this.runTreats = 0;
    this.shieldT = 0;
    this.magnetT = 0;
    this.frenzyT = 0;
    this.invulnT = 0;
    this.boostT = 0;
    this.usedRevive = false;
    this.spawnCount = 0;
    this.biome = "park";
    this.lastBiome = "park";
    this.skyGrad = null;
    for (const u of this.pickups) u.active = false;
    this.hudDirty = true;
  }

  private progress() {
    return clamp(this.distance / 1400, 0, 1);
  }

  private stepPlay(dt: number) {
    const p = this.progress();
    this.speed = lerp(BASE_SPEED, MAX_SPEED, 1 - (1 - p) * (1 - p)) * this.dog().speed;
    if (this.frenzyT > 0) this.speed *= 1.12;
    if (this.boostT > 0) this.speed *= 1.42;
    this.distance += this.speed * dt * 0.12;
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.frenzyT = Math.max(0, this.frenzyT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.audio.tick(dt, true);
    this.updateBiome();

    this.scrollWorld(dt);
    this.spawnAhead();
    this.stepPlayer(dt);
    this.stepCat(dt);
    this.stepObstacles(dt);
    this.stepCoins();
    this.stepPickups();
    this.stepFx(dt);
    this.decayJuice(dt);
    this.bumpMissions();

    if (this.boostT > 0 && !this.reduced) {
      this.emitParticle(
        this.player.x - 8 + Math.random() * 20,
        this.player.y - 20 - Math.random() * 50,
        -80 - Math.random() * 60,
        -20 + Math.random() * 40,
        0.28,
        3 + Math.random() * 3,
        ["#f4e27a", "#5ec8c4", "#ece8dc", "#d4654a"][Math.floor(Math.random() * 4)]!,
      );
    }

    if (this.player.grounded && !this.player.sliding) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.2;
        this.emitParticle(this.player.x - 10, this.ground - 4, -40, -20, 0.22, 3, "#d2b07a");
      }
    }
  }

  private updateBiome() {
    const p = this.progress();
    const next: Biome = p < 0.34 ? "park" : p < 0.68 ? "beach" : "show";
    if (next !== this.biome) {
      this.biome = next;
      this.skyGrad = null;
      this.spawnFloater(this.player.x + 40, this.player.y - 90, next === "beach" ? "BEACH" : next === "show" ? "NIGHT SHOW" : "PARK");
    }
  }

  private scrollWorld(dt: number) {
    const dx = this.speed * dt;
    this.scroll += dx;
    this.farScroll += dx * 0.14;
    this.midScroll += dx * 0.42;
    for (const o of this.obstacles) if (o.active) o.x -= dx;
    for (const c of this.coins) if (c.active) c.x -= dx;
    for (const u of this.pickups) if (u.active) u.x -= dx;
    for (const b of this.bursts) if (b.active) b.x -= dx;
    this.nextSpawn -= dx;
  }

  private spawnAhead() {
    const p = this.progress();
    const timeGap = lerp(1.58, 0.68, p);
    let right = -Infinity;
    for (const o of this.obstacles) if (o.active) right = Math.max(right, o.x + o.w);
    const lead = this.speed * 2.2 + 120;
    const minGap = this.speed * timeGap + lerp(140, 32, p);
    const spawnX = Number.isFinite(right)
      ? right + minGap
      : Math.max(this.nextSpawn, this.viewW + 160);
    if (spawnX > this.viewW + lead) return;

    const kind = this.pickKind(p);
    if (kind === "plat") {
      const last = this.spawnPlatforms(spawnX);
      const span = last ? last.x + last.w - spawnX : 220;
      this.lastKind = "plat";
      this.nextSpawn = spawnX + Math.max(minGap, span + 110);
      this.spawnCount += 1;
      return;
    }
    const extra = kind === "tunnel" ? this.speed * 0.12 : 0;
    const first = this.placeObstacle(kind, spawnX + extra);
    this.lastKind = kind;
    let span = (first?.w ?? 80) + extra;
    if (p > 0.26 && first && Math.random() < lerp(0.14, 0.5, p)) {
      const follow: Kind = p > 0.7 && kind === "hurdle" ? "hurdle" : p > 0.55 && kind === "crate" ? "hydrant" : kind === "hoop" ? "hurdle" : "hoop";
      const gap = lerp(150, 64, p);
      const second = this.placeObstacle(follow, spawnX + extra + first.w + gap);
      if (second) span = second.x + second.w - spawnX;
      this.lastKind = follow;
    }
    this.nextSpawn = spawnX + extra + Math.max(minGap, span + 70);
    this.spawnCount += 1;
    if (first && this.spawnCount % 6 === 0) this.placePickup(spawnX + extra + 90);
    if (first) this.placeCoin(spawnX - minGap * 0.42, this.ground - lerp(36, 88, Math.random()));
  }

  private pickKind(p: number): Kind {
    const r = Math.random();
    if (this.lastKind === "plat") {
      if (r < 0.4) return "hoop";
      if (r < 0.7) return "hurdle";
      return "weave";
    }
    if (this.lastKind === "tunnel" || this.lastKind === "pipe") {
      if (r < 0.45) return "hoop";
      if (r < 0.7) return "hurdle";
      return p > 0.5 ? "crate" : "weave";
    }
    if (p > 0.14 && r < 0.18) return "plat";
    if (p < 0.1) return r < 0.58 ? "hurdle" : "hoop";
    if (p < 0.22) {
      if (r < 0.38) return "hoop";
      if (r < 0.72) return "hurdle";
      return "weave";
    }
    if (p < 0.38) {
      if (r < 0.28) return "tunnel";
      if (r < 0.5) return "hoop";
      if (r < 0.74) return "hurdle";
      if (r < 0.88) return "weave";
      return "hydrant";
    }
    if (p < 0.58) {
      if (r < 0.2) return "tunnel";
      if (r < 0.36) return "crate";
      if (r < 0.52) return "hydrant";
      if (r < 0.7) return "hoop";
      if (r < 0.86) return "hurdle";
      return "weave";
    }
    if (r < 0.16) return "pipe";
    if (r < 0.32) return "tunnel";
    if (r < 0.48) return "crate";
    if (r < 0.62) return "hydrant";
    if (r < 0.76) return "hoop";
    if (r < 0.9) return "hurdle";
    return "weave";
  }

  private placeObstacle(kind: Kind, x: number) {
    const o = this.obstacles.find((n) => !n.active);
    if (!o) return null;
    const p = this.progress();
    const g = this.ground;
    const peak = this.jumpPeak();
    const stand = 80 * this.dog().hitH;
    let w = 64;
    let h = Math.round(lerp(36, 58, p));
    let gap = 0;
    if (kind === "hoop") {
      w = HOOP_W;
      h = HOOP_H;
      gap = HOOP_HOLE_TOP;
    } else if (kind === "tunnel") {
      w = clamp(this.viewW * lerp(0.22, 0.34, p), 96, 150);
      h = 28;
      gap = TUNNEL_GAP;
    } else if (kind === "weave") {
      w = 36;
      h = 48;
    } else if (kind === "crate") {
      w = 58;
      h = 46;
    } else if (kind === "hydrant") {
      w = 32;
      h = 50;
    } else if (kind === "pipe") {
      w = clamp(this.viewW * 0.22, 90, 150);
      h = 24;
      gap = TUNNEL_GAP + 6;
    } else if (kind === "plat") {
      w = lerp(150, 210, Math.random());
      h = 18;
      gap = clamp(this.jumpPeak() * 0.4, 70, 108);
    }
    o.active = true;
    o.kind = kind;
    o.x = x;
    o.w = w;
    o.h = h;
    o.gap = gap;
    o.holeH = 0;
    o.scored = false;
    o.near = 999;
    o.special = false;
    o.holeY = 0;
    this.sitObstacle(o);

    if (kind === "hoop") {
      this.placeCoin(x + w * 0.5, o.holeY + o.holeH * 0.5);
    } else if (kind === "tunnel") {
      this.placeCoin(x + w * 0.5, g - o.gap - 36);
      this.placeCoin(x + w * 0.32, g - 26);
      this.placeCoin(x + w * 0.68, g - 26);
    } else if (kind !== "pipe" && kind !== "plat") {
      const n = 1 + Math.floor(Math.random() * 3);
      const lift = clamp(stand * 0.55 + peak * 0.18, 48, 92);
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        this.placeCoin(x + w * t, g - lift - Math.sin(t * Math.PI) * 22);
      }
    }
    return o;
  }

  private spawnPlatforms(x: number) {
    const p = this.progress();
    const peak = this.jumpPeak();
    const n = p > 0.48 ? 4 : 3;
    const rises: number[] = [];
    let rise = clamp(peak * 0.3, 54, 72);
    for (let i = 0; i < n; i++) {
      rises.push(rise);
      rise += clamp(peak * lerp(0.2, 0.28, p), 40, 62);
    }
    let cx = x;
    let last: Obstacle | null = null;
    for (let i = 0; i < n; i++) {
      const o = this.placeObstacle("plat", cx);
      if (!o) break;
      const t = i / Math.max(1, n - 1);
      o.w = lerp(148, 68, t);
      o.gap = rises[i]!;
      this.sitObstacle(o);
      if (i < n - 1) {
        this.placeCoin(o.x + o.w * 0.5, o.y - 22);
      }
      last = o;
      cx += o.w + lerp(48, 108, t * (0.55 + p * 0.5));
    }
    if (last) this.placeCoin(last.x + last.w * 0.72, last.y - 40, 22, 2);
    return last;
  }

  private placeCoin(x: number, y: number, r = 15, skin?: number) {
    const c = this.coins.find((n) => !n.active);
    if (!c) return;
    c.active = true;
    c.x = x;
    c.y = y;
    c.r = r;
    c.skin = skin ?? (Math.random() < 0.42 ? 1 : 0);
  }

  private placePickup(x: number) {
    const u = this.pickups.find((n) => !n.active);
    if (!u) return;
    const r = Math.random();
    u.active = true;
    u.kind = r < 0.38 ? "shield" : r < 0.72 ? "magnet" : "frenzy";
    const stand = 80 * this.dog().hitH;
    u.x = x;
    u.y = this.ground - clamp(stand * 0.7 + 24, 70, 110);
  }

  private bumpMissions() {
    const list = this.save.missions;
    let dirty = false;
    for (const m of list) {
      const before = m.progress;
      if (m.id === "hoops") m.progress = Math.max(m.progress, this.threads);
      if (m.id === "tunnels") m.progress = Math.max(m.progress, this.tunnels);
      if (m.id === "treats") m.progress = Math.max(m.progress, this.runTreats);
      if (m.id === "combo") m.progress = Math.max(m.progress, this.runTreats);
      if (m.id === "distance") m.progress = Math.max(m.progress, Math.floor(this.distance));
      if (before < m.goal && m.progress >= m.goal && !m.claimed) {
        m.claimed = true;
        this.save.treats += m.reward;
        this.audio.mission();
        this.spawnFloater(this.player.x, this.player.y - 110, `MISSION +${m.reward}`);
        dirty = true;
      }
    }
    if (dirty) writeSave(this.save);
  }

  private hitbox() {
    const p = this.player;
    const d = this.dog();
    if (p.sliding) {
      const h = 32 * d.hitH;
      const w = 70 * d.hitW;
      return { x: p.x - w * 0.38, y: this.ground - h, w, h };
    }
    const air = !p.grounded;
    const h = (air ? 50 : 68) * d.hitH;
    const w = 36 * d.hitW;
    return { x: p.x - w * 0.42, y: p.y - h + (air ? 6 : 2), w, h };
  }

  private stepPlayer(dt: number) {
    if (this.startGrace > 0) {
      this.startGrace = Math.max(0, this.startGrace - dt);
      this.input.clear();
    }
    const p = this.player;
    p.anim += dt;
    p.landKick = Math.max(0, p.landKick - dt);
    p.jumpStretch = Math.max(0, p.jumpStretch - dt);

    if (p.sliding) {
      p.slideT -= dt;
      if (this.input.slideHeld || (this.inTunnel && this.mustSlideTunnel())) p.slideT = Math.max(p.slideT, 0.14);
      if (p.slideT <= 0) p.sliding = false;
    }

    if (p.grounded) p.coyote = COYOTE;
    else p.coyote = Math.max(0, p.coyote - dt);

    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    const prevY = p.y;
    p.y += p.vy * dt;

    let floor = this.ground;
    if (p.vy >= -60) {
      for (const o of this.obstacles) {
        if (!o.active || o.kind !== "plat") continue;
        this.sitObstacle(o);
        const top = o.y;
        const over = p.x > o.x + 10 && p.x < o.x + o.w - 8;
        if (over && prevY <= top + 20 && p.y >= top - 3) floor = Math.min(floor, top);
      }
    }

    if (p.y >= floor) {
      if (!p.grounded) this.land();
      p.y = floor;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    const onFloor = p.grounded && p.y >= this.ground - 6;
    const tapSlide = this.input.consumeSlide();
    if (onFloor && (tapSlide || (this.input.slideHeld && !p.sliding))) {
      if (!p.sliding) this.audio.slide();
      p.sliding = true;
      p.slideT = SLIDE_TIME * this.dog().slide;
      this.emitParticle(p.x, this.ground - 6, -80, -10, 0.3, 5, "#c4a66a");
    }

    if (this.input.consumeJump()) this.jumpBuf = JUMP_BUF;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = JUMP_VEL * this.dog().jump;
      p.grounded = false;
      p.coyote = 0;
      p.airJumps = 1;
      this.jumpBuf = 0;
      p.sliding = false;
      p.jumpStretch = 0.16;
      p.squash = 0.78;
      this.audio.jump();
    } else if (this.jumpBuf > 0 && !p.grounded && p.airJumps > 0) {
      p.vy = JUMP_VEL * this.dog().jump * 0.9;
      p.airJumps = 0;
      this.jumpBuf = 0;
      p.sliding = false;
      p.jumpStretch = 0.14;
      p.squash = 0.82;
      this.audio.jump();
      this.emitParticle(p.x, p.y, -40, 40, 0.22, 4, "#ece8dc");
    }

    if (!p.grounded && !this.input.jumpHeld && p.vy < -420) {
      p.vy *= 0.78;
    }

    const targetSquash = p.grounded ? (p.landKick > 0 ? 0.82 : 1) : p.vy < 0 ? 1.16 : 1.04;
    const targetStretch = p.grounded ? (p.landKick > 0 ? 1.18 : 1) : p.vy < 0 ? 0.88 : 0.94;
    const k = 1 - Math.exp(-18 * dt);
    p.squash += (targetSquash - p.squash) * k;
    p.stretch += (targetStretch - p.stretch) * k;
  }

  private catLead() {
    return clamp(this.viewW * 0.36, 108, 188);
  }

  private catX() {
    return this.player.x + this.catLead() + Math.sin(this.player.anim * 8.2) * 6 + this.cat.sway * 16;
  }

  private stepCat(dt: number) {
    if (this.charId !== "osha") return;
    this.cat.y = this.ground;
    const x = this.player.x + this.catLead();
    let ahead: Obstacle | null = null;
    let best = Infinity;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      const dist = o.x - x;
      if (dist < -o.w - 12) continue;
      if (dist < best) {
        best = dist;
        ahead = o;
      }
    }

    let want = 0;
    if (ahead) {
      const local = x - ahead.x;
      const inside = local > -28 && local < ahead.w + 18;
      if (ahead.kind === "weave") {
        want = Math.sin((local / Math.max(24, ahead.w)) * Math.PI * 5) * 1.15;
      } else if (inside || (ahead.x - x < this.speed * 0.22 && ahead.x - x > -20)) {
        want = this.cat.side * 1.05;
      }
      if (local > ahead.w + 4 && this.cat.marked !== ahead.x) {
        this.cat.side *= -1;
        this.cat.marked = ahead.x;
      }
    }
    const k = 1 - Math.exp(-14 * dt);
    this.cat.sway += (want - this.cat.sway) * k;
  }

  private land() {
    const p = this.player;
    p.airJumps = 1;
    p.landKick = 0.12;
    p.squash = 0.76;
    p.stretch = 1.22;
    this.audio.land();
    this.spawnBurst(p.x, p.y, "dust");
    for (let i = 0; i < 4; i++) {
      this.emitParticle(p.x, p.y - 2, -60 + Math.random() * 80, -80 + Math.random() * 30, 0.3, 4, "#d8c08a");
    }
  }

  private collides(box: { x: number; y: number; w: number; h: number }, o: Obstacle) {
    const padX = o.kind === "hoop" ? o.w * 0.28 : o.kind === "weave" ? 8 : 12;
    const x = o.x + padX;
    const w = Math.max(16, o.w - padX * 2);
    if (o.kind === "plat") {
      if (box.y + box.h <= o.y + 12) return false;
      return aabb(box.x, box.y, box.w, box.h, o.x + 2, o.y, 14, o.h);
    }
    if (o.kind === "hoop" && o.holeH > 0) {
      const topH = Math.max(0, o.holeY - o.y - 8);
      const botY = o.holeY + o.holeH + 10;
      const botH = Math.max(0, o.y + o.h - botY - 4);
      const hitTop = topH > 8 && aabb(box.x, box.y, box.w, box.h, x, o.y, w, topH);
      const hitBot = botH > 6 && aabb(box.x, box.y, box.w, box.h, x, botY, w, botH);
      return hitTop || hitBot;
    }
    if (o.kind === "tunnel" || o.kind === "pipe") {
      if (this.player.sliding) return false;
      const roof = this.ground - o.gap - 18;
      if (box.y + box.h < roof + 12) return false;
      const padX = 8;
      return aabb(box.x, box.y, box.w, box.h, o.x + padX, roof, Math.max(20, o.w - padX * 2), this.ground - roof - 4);
    }
    const top = o.kind === "hurdle" || o.kind === "crate" || o.kind === "hydrant" ? 10 : 6;
    return aabb(box.x, box.y, box.w, box.h, x, o.y + top, w, Math.max(12, o.h - top - 4));
  }

  private stepObstacles(_dt: number) {
    const box = this.hitbox();
    this.inTunnel = false;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.x + o.w < -80) {
        o.active = false;
        continue;
      }
      this.sitObstacle(o);
      if (this.collides(box, o)) {
        if (o.kind === "plat") continue;
        if (this.boostT > 0) {
          this.smash(o);
          continue;
        }
        if (this.invulnT > 0) continue;
        if (this.shieldT > 0) {
          this.shieldT = 0;
          this.invulnT = 0.7;
          this.flash = 0.22;
          this.trauma = 0.28;
          this.audio.shield();
          this.spawnBurst(this.player.x + 20, this.player.y - 40, "impact");
          o.active = false;
          this.spawnFloater(box.x, box.y - 20, "SHIELD");
          continue;
        }
        this.die(o);
        return;
      }

      const overlapX = box.x < o.x + o.w && box.x + box.w > o.x;
      if (overlapX) {
        if (o.kind === "tunnel" || o.kind === "pipe") {
          if (this.player.sliding) {
            this.inTunnel = true;
            if (!o.special) {
              o.special = true;
              this.boostT = Math.max(this.boostT, 2.35);
              this.flash = Math.max(this.flash, 0.22);
              this.audio.boost();
              this.spawnFloater(box.x + 16, box.y - 18, "STAR");
              this.hudDirty = true;
            }
          }
          o.near = Math.min(o.near, this.player.sliding ? 0 : Math.abs(box.y + box.h - (this.ground - o.gap)));
        } else if (o.kind === "hoop") {
          const inHole = box.y >= o.holeY - 8 && box.y + box.h <= o.holeY + o.holeH + 8;
          if (inHole) o.special = true;
          o.near = Math.min(o.near, Math.abs(box.y + box.h - (o.holeY + o.holeH)));
        } else {
          o.near = Math.min(o.near, Math.abs(box.y - (o.y + o.h)));
        }
      }

      if (!o.scored && o.x + o.w < box.x) {
        o.scored = true;
        if (o.kind === "hoop") this.threads += 1;
        if (o.kind === "tunnel") this.tunnels += 1;
        this.hudDirty = true;
      }
    }
  }

  private stepCoins() {
    const box = this.hitbox();
    const px = box.x + box.w * 0.5;
    const py = box.y + box.h * 0.4;
    for (const c of this.coins) {
      if (!c.active) continue;
      if (c.x + c.r < -40) {
        c.active = false;
        continue;
      }
      if (this.magnetT > 0 || this.boostT > 0) {
        if (c.skin !== 2) {
          const mx = px - c.x;
          const my = py - c.y;
          const mag = Math.hypot(mx, my) || 1;
          const range = this.boostT > 0 ? 340 : 240;
          const pull = this.boostT > 0 ? 680 : 420;
          if (mag < range) {
            c.x += (mx / mag) * pull * (1 / 60);
            c.y += (my / mag) * pull * (1 / 60);
          }
        }
      }
      const cx = clamp(c.x, box.x, box.x + box.w);
      const cy = clamp(c.y, box.y, box.y + box.h);
      const dx = c.x - cx;
      const dy = c.y - cy;
      if (dx * dx + dy * dy < c.r * c.r) {
        c.active = false;
        const steak = c.skin === 2;
        if (!steak) this.runTreats += 1;
        const gain = steak ? 50 : this.boostT > 0 || this.frenzyT > 0 ? 2 : 1;
        this.score += gain;
        this.audio.coin();
        this.spawnFloater(c.x, c.y, steak ? "STEAK +50" : `+${gain}`);
        this.emitParticle(c.x, c.y, 0, -40, 0.4, steak ? 8 : 5, steak ? "#c45c56" : "#e8c07a");
        this.hudDirty = true;
      }
    }
  }

  private stepPickups() {
    const box = this.hitbox();
    for (const u of this.pickups) {
      if (!u.active) continue;
      if (u.x < -40) {
        u.active = false;
        continue;
      }
      if (aabb(box.x, box.y, box.w, box.h, u.x - 18, u.y - 18, 36, 36)) {
        u.active = false;
        this.grantPower(u.kind);
      }
    }
  }

  private grantPower(kind: PowerKind) {
    this.audio.power();
    this.flash = 0.16;
    if (kind === "shield") {
      this.shieldT = 8;
      this.spawnFloater(this.player.x, this.player.y - 80, "SHIELD");
    } else if (kind === "magnet") {
      this.magnetT = 7;
      this.spawnFloater(this.player.x, this.player.y - 80, "MAGNET");
    } else {
      this.frenzyT = 6;
      this.spawnFloater(this.player.x, this.player.y - 80, "FRENZY");
    }
  }

  private smash(o: Obstacle) {
    o.active = false;
    this.trauma = Math.max(this.trauma, 0.22);
    this.flash = Math.max(this.flash, 0.1);
    this.spawnFloater(o.x, o.y - 12, "SMASH");
    this.spawnBurst(o.x + o.w * 0.4, o.y + o.h * 0.3, "impact");
    for (let i = 0; i < 6; i++) {
      this.emitParticle(
        o.x + o.w * 0.4,
        o.y + o.h * 0.3,
        -140 + Math.random() * 220,
        -180 + Math.random() * 120,
        0.32,
        4,
        i % 2 ? "#f4e27a" : "#ece8dc",
      );
    }
  }

  private die(o: Obstacle) {
    this.phase = "dying";
    this.dieT = 0;
    this.hitstop = this.reduced ? 0.02 : HITSTOP;
    this.trauma = this.reduced ? 0.15 : 0.82;
    this.flash = 0.35;
    this.player.vy = -220;
    this.player.sliding = false;
    this.player.anim = 0;
    this.audio.crash();
    this.spawnBurst(this.player.x + 20, this.player.y - 40, "impact");
    for (let i = 0; i < 8; i++) {
      this.emitParticle(
        o.x + o.w * 0.3,
        o.y + o.h * 0.4,
        -120 + Math.random() * 80,
        -220 + Math.random() * 160,
        0.4,
        5,
        i % 2 ? "#5ec8c4" : "#ece8dc",
      );
    }
    this.hudDirty = true;
  }

  private endRun() {
    this.phase = "gameover";
    this.lastRunCombo = this.maxCombo;
    this.lastRunThreads = this.threads;
    this.lastRunTunnels = this.tunnels;
    this.save.gamesPlayed += 1;
    this.save.treats += this.runTreats;
    if (this.maxCombo > this.save.bestCombo) this.save.bestCombo = this.maxCombo;
    if (this.distance > this.save.bestDistance) this.save.bestDistance = this.distance;
    const rounded = Math.floor(this.score);
    if (rounded > this.save.highScore) {
      this.save.highScore = rounded;
      this.newBest = true;
    }
    this.bumpMissions();
    writeSave(this.save);
    this.hudDirty = true;
  }

  private emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    const p = this.particles.find((n) => !n.active);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx + (Math.random() - 0.5) * 40;
    p.vy = vy + (Math.random() - 0.5) * 40;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
  }

  private spawnBurst(x: number, y: number, kind: "dust" | "impact") {
    const b = this.bursts.find((n) => !n.active);
    if (!b) return;
    b.active = true;
    b.x = x;
    b.y = y;
    b.t = 0;
    b.kind = kind;
  }

  private spawnFloater(x: number, y: number, text: string) {
    const f = this.floaters.find((n) => !n.active);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.t = 0;
  }

  private stepFx(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      if (p.life <= 0) p.active = false;
    }
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.t += dt;
      if (b.t > 0.28) b.active = false;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.t += dt;
      f.y -= 48 * dt;
      if (f.t > 0.7) f.active = false;
    }
  }

  private decayJuice(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }

  private emitHud() {
    const snap = `${this.phase}|${Math.floor(this.score)}|${this.combo}|${Math.round(this.speed / 8)}|${this.save.muted}|${this.newBest}|${this.save.highScore}|${this.charId}|${this.threads}|${this.tunnels}|${this.runTreats}|${this.save.treats}|${Math.ceil(this.shieldT)}|${Math.ceil(this.magnetT)}|${Math.ceil(this.frenzyT)}|${Math.ceil(this.boostT)}|${this.biome}|${this.usedRevive}`;
    if (snap === this.hudKey) return;
    this.hudKey = snap;
    this.onHud({
      phase: this.phase,
      score: Math.floor(this.score),
      highScore: this.save.highScore,
      combo: this.combo,
      speed: this.speed,
      distance: this.distance,
      bestCombo: this.save.bestCombo,
      newBest: this.newBest,
      muted: this.save.muted,
      ready: this.phase !== "boot",
      lastRunCombo: this.lastRunCombo,
      lastRunThreads: this.lastRunThreads,
      lastRunTunnels: this.lastRunTunnels,
      threads: this.threads,
      tunnels: this.tunnels,
      character: this.charId,
      treats: this.save.treats,
      runTreats: this.runTreats,
      shield: this.shieldT,
      magnet: this.magnetT,
      frenzy: this.frenzyT,
      boost: this.boostT,
      canRevive: this.phase === "gameover" && !this.usedRevive && this.save.treats >= this.reviveCost,
      reviveCost: this.reviveCost,
      biome: this.biome,
      missions: toHud(this.save.missions),
    });
    this.hudDirty = false;
  }

  private draw() {
    const ctx = this.ctx;
    const { viewW, viewH } = this;
    ctx.setTransform(this.canvas.width / viewW, 0, 0, this.canvas.height / viewH, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.clearRect(0, 0, viewW, viewH);

    const shake = this.reduced ? 0 : this.trauma * this.trauma;
    const ox = shake ? (Math.random() * 2 - 1) * 18 * shake : 0;
    const oy = shake ? (Math.random() * 2 - 1) * 12 * shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    this.drawSky();
    this.drawClouds();
    this.drawHills();
    this.drawTrees();
    this.drawGround();
    this.drawCat("back");
    this.drawCoins();
    this.drawPickups();
    this.drawObstacles(false);
    this.drawTunnels(false);
    this.drawBursts();
    this.drawPlayer();
    this.drawCat("front");
    this.drawTunnels(true);
    this.drawObstacles(true);
    this.drawParticles();
    this.drawFloaters();
    if ((this.speed > 520 || this.boostT > 0) && !this.reduced) this.drawSpeedLines();
    this.drawVignette();

    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(236,232,220,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  private drawSky() {
    const ctx = this.ctx;
    if (!this.skyGrad || this.skyH !== this.viewH || this.lastBiome !== this.biome) {
      const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
      if (this.biome === "beach") {
        g.addColorStop(0, "#7ec4e8");
        g.addColorStop(0.42, "#f7d7a4");
        g.addColorStop(0.72, "#f3c98a");
        g.addColorStop(1, "#e8c07a");
      } else if (this.biome === "show") {
        g.addColorStop(0, "#1b2740");
        g.addColorStop(0.4, "#3a4a6a");
        g.addColorStop(0.72, "#6b5a48");
        g.addColorStop(1, "#2f4634");
      } else {
        g.addColorStop(0, "#6ea0d4");
        g.addColorStop(0.38, "#f2c27a");
        g.addColorStop(0.68, "#f6d5a0");
        g.addColorStop(0.86, "#b7d48a");
        g.addColorStop(1, "#6fa35c");
      }
      this.skyGrad = g;
      this.skyH = this.viewH;
      this.lastBiome = this.biome;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const sx = this.viewW * 0.8;
    const sy = this.viewH * 0.16;
    if (this.biome === "show") {
      ctx.fillStyle = "rgba(232, 236, 244, 0.85)";
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(232, 236, 244, 0.16)";
      ctx.beginPath();
      ctx.arc(sx, sy, 48, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(255, 210, 110, 0.28)";
      ctx.beginPath();
      ctx.arc(sx, sy, 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(sx, sy, 28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawClouds() {
    const ctx = this.ctx;
    const w = this.viewW;
    for (const c of this.clouds) {
      const x = ((c.x - this.farScroll * 0.05) % (w + 200) + (w + 200)) % (w + 200) - 80;
      const y = c.y * this.viewH;
      ctx.fillStyle = `rgba(255, 248, 232, ${c.a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, c.w * 0.55, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(x + c.w * 0.28, y - 6, c.w * 0.38, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x - c.w * 0.22, y - 4, c.w * 0.3, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHills() {
    const ctx = this.ctx;
    const base = this.ground - 8;
    const off = this.farScroll % this.farW;
    ctx.fillStyle = this.biome === "beach" ? "#d2b47a" : this.biome === "show" ? "#35543a" : "#6b9a58";
    for (const pass of [0, 1]) {
      const shift = -off + pass * this.farW;
      for (const h of this.far) {
        const x = h.x + shift;
        if (x + h.w < -40 || x > this.viewW + 40) continue;
        ctx.beginPath();
        ctx.ellipse(x + h.w * 0.5, base + 18, h.w * 0.55, h.h, 0, Math.PI, 0, true);
        ctx.fill();
      }
    }
    ctx.fillStyle = this.biome === "beach" ? "#c4a066" : this.biome === "show" ? "#2a4530" : "#5b8a4c";
    ctx.fillRect(0, base - 12, this.viewW, 20);
  }

  private drawTrees() {
    const ctx = this.ctx;
    const g = this.ground;
    const off = this.midScroll % this.midW;
    for (const pass of [0, 1]) {
      const shift = -off + pass * this.midW;
      for (const t of this.mid) {
        const x = t.x + shift;
        if (x + t.w < -20 || x > this.viewW + 20) continue;
        const trunkW = Math.max(6, t.w * 0.16);
        ctx.fillStyle = "#5a3a24";
        ctx.fillRect(x + t.w * 0.5 - trunkW * 0.5, g - t.h * 0.42, trunkW, t.h * 0.42);
        const cx = x + t.w * 0.5;
        const cy = g - t.h * 0.62;
        ctx.fillStyle = t.shape === 0 ? "#2f6b38" : t.shape === 1 ? "#3a7d40" : "#245c32";
        ctx.beginPath();
        if (t.shape === 2) {
          ctx.moveTo(cx, g - t.h);
          ctx.lineTo(cx + t.w * 0.48, g - t.h * 0.28);
          ctx.lineTo(cx - t.w * 0.48, g - t.h * 0.28);
          ctx.closePath();
        } else {
          ctx.ellipse(cx, cy, t.w * 0.48, t.h * 0.36, 0, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }

  private drawGround() {
    const ctx = this.ctx;
    const y = this.ground;
    ctx.fillStyle = "#3f7a44";
    ctx.fillRect(0, y, this.viewW, this.viewH - y);
    ctx.fillStyle = "#2f6236";
    ctx.fillRect(0, this.viewH - 22, this.viewW, 22);
    ctx.fillStyle = "#c4a56a";
    ctx.fillRect(0, y, this.viewW, 38);
    ctx.fillStyle = "#b39158";
    ctx.fillRect(0, y, this.viewW, 5);
    ctx.fillStyle = this.biome === "beach" ? "#e6c98a" : this.biome === "show" ? "#8a7458" : "#d8bc86";
    ctx.fillRect(0, y + 5, this.viewW, 2);
    const tile = 86;
    const start = -((this.scroll) % tile);
    ctx.strokeStyle = "rgba(90, 62, 28, 0.22)";
    ctx.lineWidth = 2;
    for (let x = start; x < this.viewW + tile; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + 22, y + 36);
      ctx.stroke();
    }
    ctx.fillStyle = this.biome === "beach" ? "#c9b06a" : this.biome === "show" ? "#3d6a42" : "#4d8a4a";
    const tuft = 28;
    const t0 = -((this.scroll * 0.7) % tuft);
    for (let x = t0; x < this.viewW + 20; x += tuft) {
      ctx.fillRect(x + 6, y - 5, 3, 7);
      ctx.fillRect(x + 12, y - 8, 2, 9);
    }
    ctx.fillStyle = "#6b4a28";
    ctx.globalAlpha = 0.55;
    const post = 52;
    const p0 = -((this.midScroll * 0.5) % post);
    for (let x = p0; x < this.viewW + 12; x += post) {
      ctx.fillRect(x, y - 26, 3, 26);
    }
    ctx.fillRect(0, y - 22, this.viewW, 2);
    ctx.globalAlpha = 1;
    if (!this.reduced) {
      const pawGap = 160;
      const pawStart = -((this.scroll * 0.88) % pawGap);
      ctx.fillStyle = "rgba(90, 58, 28, 0.28)";
      for (let x = pawStart; x < this.viewW + 40; x += pawGap) {
        ctx.fillRect(x + 22, y + 18, 11, 7);
        ctx.fillRect(x + 18, y + 12, 4, 4);
        ctx.fillRect(x + 30, y + 12, 4, 4);
      }
    }
  }

  private drawSpeedLines() {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(236,232,220,0.08)";
    ctx.lineWidth = 2;
    const off = (this.scroll * 0.35) % 70;
    for (let i = 0; i < 5; i++) {
      const x = this.viewW - off - i * 90;
      ctx.beginPath();
      ctx.moveTo(x, this.ground - 40 - i * 28);
      ctx.lineTo(x - 48, this.ground - 28 - i * 28);
      ctx.stroke();
    }
  }

  private drawObstacles(front: boolean) {
    const spr = this.sprites;
    const g = this.ground;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.kind === "tunnel") continue;
      const overlay = o.kind === "hoop" || o.kind === "pipe";
      if (overlay !== front) continue;
      if (o.x + o.w < -40 || o.x > this.viewW + 40) continue;
      this.sitObstacle(o);
      if (spr) {
        let img = spr.hurdle;
        let dw = o.w + 28;
        let dh = o.h + 22;
        let dx = o.x - 14;
        let dy = g - dh + 8;
        if (o.kind === "hoop") {
          img = spr.hoop;
          dw = 292;
          dh = 328;
          dx = o.x + o.w * 0.5 - dw * 0.5;
          dy = g - dh + 10;
        } else if (o.kind === "weave") {
          img = spr.weave;
          dw = 42;
          dh = o.h + 44;
          dx = o.x + o.w * 0.5 - 21;
          dy = g - dh + 6;
        } else if (o.kind === "crate") {
          img = spr.crate;
          dw = o.w + 18;
          dh = o.h + 20;
          dx = o.x - 9;
          dy = g - dh + 6;
        } else if (o.kind === "hydrant") {
          img = spr.hydrant;
          dw = o.w + 18;
          dh = o.h + 22;
          dx = o.x - 9;
          dy = g - dh + 4;
        } else if (o.kind === "pipe") {
          img = spr.tunnel;
          dw = o.w + 40;
          dh = 72;
          dx = o.x - 20;
          dy = g - dh + 8;
        } else if (o.kind === "plat") {
          img = spr.platform;
          dw = o.w + 18;
          dh = 42;
          dx = o.x - 9;
          dy = o.y - 10;
          this.ctx.fillStyle = "rgba(90, 62, 28, 0.55)";
          this.ctx.fillRect(o.x + 10, o.y + 22, 5, Math.max(4, g - o.y - 22));
          this.ctx.fillRect(o.x + o.w - 16, o.y + 22, 5, Math.max(4, g - o.y - 22));
        } else {
          img = spr.hurdle;
          dw = o.w + 36;
          dh = o.h + 30;
          dx = o.x - 18;
          dy = g - dh + 8;
        }
        this.ctx.drawImage(img, dx, dy, dw, dh);
      } else {
        this.ctx.fillStyle = "#ece8dc";
        this.ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }
  }

  private drawTunnels(front: boolean) {
    const ctx = this.ctx;
    const g = this.ground;
    for (const o of this.obstacles) {
      if (!o.active || o.kind !== "tunnel") continue;
      if (o.x + o.w < -40 || o.x > this.viewW + 40) continue;
      this.sitObstacle(o);
      const x = o.x;
      const w = o.w;
      const h = TUNNEL_GAP + 26;
      const top = g - h + 4;
      const cy = g - h * 0.5 + 2;
      const holeR = 20;
      const holeY = h * 0.48;
      if (!front) {
        ctx.fillStyle = "#3a1518";
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, h * 0.5);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = "#c45c56";
      ctx.beginPath();
      ctx.roundRect(x, top, w, h, h * 0.5);
      ctx.ellipse(x + 22, cy, holeR, holeY, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w - 22, cy, holeR, holeY, 0, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.fillStyle = "#d97870";
      ctx.beginPath();
      ctx.roundRect(x + 28, top + 7, w - 56, 12, 6);
      ctx.fill();
      ctx.strokeStyle = "#f0c4bc";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x + 22, cy, holeR, holeY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + w - 22, cy, holeR, holeY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawCoins() {
    const spr = this.sprites;
    const t = this.player.anim;
    for (const c of this.coins) {
      if (!c.active) continue;
      if (c.x < -30 || c.x > this.viewW + 30) continue;
      const bob = Math.sin(t * 6 + c.x * 0.02) * 4;
      if (spr) {
        if (c.skin === 2 && spr.steak.length) {
          const frame = spr.steak[Math.floor(t * 8) % spr.steak.length]!;
          this.ctx.drawImage(frame, c.x - 28, c.y + bob - 28, 56, 56);
        } else {
          const pack = c.skin === 1 ? spr.cookie : spr.coin;
          const frame = pack[Math.floor(t * 8) % pack.length]!;
          const w = c.skin === 1 ? 34 : 44;
          const h = c.skin === 1 ? 34 : 28;
          this.ctx.drawImage(frame, c.x - w * 0.5, c.y + bob - h * 0.5, w, h);
        }
      } else {
        this.ctx.fillStyle = c.skin === 2 ? "#c45c56" : "#d4a05a";
        this.ctx.beginPath();
        this.ctx.ellipse(c.x, c.y + bob, c.skin === 2 ? 18 : 16, c.skin === 2 ? 12 : 9, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawPickups() {
    const ctx = this.ctx;
    const t = this.player.anim;
    for (const u of this.pickups) {
      if (!u.active) continue;
      if (u.x < -30 || u.x > this.viewW + 30) continue;
      const bob = Math.sin(t * 5 + u.x * 0.03) * 6;
      const color = u.kind === "shield" ? "#5ec8c4" : u.kind === "magnet" ? "#e8c07a" : "#d4654a";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(u.x, u.y + bob, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(236,232,220,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(u.x, u.y + bob, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawCat(layer: "back" | "front") {
    if (this.charId !== "osha") return;
    if (this.phase === "boot") return;
    const behind = this.cat.sway > 0.12;
    if (layer === "back" && !behind) return;
    if (layer === "front" && behind) return;
    const spr = this.sprites;
    const ctx = this.ctx;
    const t = this.player.anim;
    const x = this.catX();
    const depth = Math.abs(this.cat.sway);
    const scale = 1 - depth * 0.28;
    const y = this.ground + depth * 8 + Math.sin(t * 14) * 1.2;
    ctx.save();
    ctx.globalAlpha = behind ? 0.92 : 1;
    ctx.fillStyle = "rgba(8,10,12,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, this.ground + 4 + depth * 6, 14 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    const frame = spr?.catRun[Math.floor(t * 13) % 4] ?? null;
    const h = 78 * scale;
    const w = 84 * scale;
    if (frame) {
      ctx.drawImage(frame, x - w * 0.5, y - h + 6, w, h);
    } else {
      ctx.fillStyle = "#d9843a";
      ctx.beginPath();
      ctx.ellipse(x, y - 18 * scale, 16 * scale, 12 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer() {
    const p = this.player;
    const sheets = this.sheets();
    const d = this.dog();
    const ctx = this.ctx;
    ctx.save();
    const tube = this.inTunnel
      ? this.obstacles.find((o) => o.active && o.kind === "tunnel" && p.x > o.x - 10 && p.x < o.x + o.w + 10)
      : undefined;
    if (tube) {
      ctx.beginPath();
      ctx.rect(tube.x + 6, this.ground - TUNNEL_GAP - 6, tube.w - 12, TUNNEL_GAP + 10);
      ctx.clip();
      ctx.filter = "brightness(0.72)";
    }
    ctx.fillStyle = "rgba(8,10,12,0.35)";
    ctx.beginPath();
    ctx.ellipse(p.x, this.ground + 4, (p.sliding ? 34 : 24) * d.scale, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    let frame: HTMLImageElement | null = null;
    if (sheets && this.phase === "title") {
      const stretch = sheets.stretch;
      const cyc = this.titleT % 7.2;
      if (stretch.length >= 4 && cyc >= 1.15 && cyc < 5.5) {
        if (cyc < 2.35) frame = stretch[0]!;
        else if (cyc < 3.4) frame = stretch[1]!;
        else if (cyc < 4.45) frame = stretch[2]!;
        else frame = stretch[3]!;
        p.squash = 1;
        p.stretch = 1;
      } else if (cyc >= 5.5 && cyc < 6.15) {
        frame = sheets.run[0]!;
        p.squash = 1 + Math.sin(this.titleT * 28) * 0.07;
        p.stretch = 2 - p.squash;
      }
    }
    if (sheets && !frame) {
      if (this.phase === "dying" || this.phase === "gameover") {
        const i = Math.min(3, Math.floor(this.dieT * 6));
        frame = sheets.hurt[i] ?? sheets.hurt[3]!;
      } else if (p.sliding) {
        const max = SLIDE_TIME * d.slide;
        const u = 1 - clamp(p.slideT / max, 0, 1);
        const i = u < 0.2 ? 0 : u < 0.7 ? 1 + Math.floor((u - 0.2) * 4) % 2 : 3;
        frame = sheets.slide[clamp(i, 0, 3)]!;
      } else if (!p.grounded) {
        const i = p.vy < -280 ? 1 : Math.abs(p.vy) < 140 ? 2 : 3;
        frame = sheets.jump[i]!;
      } else if (p.landKick > 0.06) {
        frame = sheets.jump[0]!;
      } else {
        frame = sheets.run[Math.floor(p.anim * 10) % 4]!;
      }
    }

    const h = (p.sliding ? 96 : 128) * p.squash * d.scale;
    const w = h * (p.sliding ? 1.22 : 1.08) * p.stretch;
    const star = this.boostT > 0;
    if (frame && star) {
      const trail = Math.min(3, Math.ceil(this.boostT * 1.4));
      for (let i = trail; i >= 1; i--) {
        ctx.save();
        ctx.globalAlpha = 0.18 / i;
        ctx.filter = `hue-rotate(${(p.anim * 480 + i * 50) % 360}deg) saturate(1.8)`;
        ctx.drawImage(frame, p.x - w * 0.5 - i * 16, p.y - h + 6, w, h);
        ctx.restore();
      }
      ctx.filter = `hue-rotate(${(p.anim * 720) % 360}deg) saturate(1.65) brightness(1.18)`;
    }
    if (frame) {
      ctx.drawImage(frame, p.x - w * 0.5, p.y - h + 6, w, h);
    } else {
      ctx.fillStyle = "#ece8dc";
      ctx.fillRect(p.x - w * 0.25, p.y - h, w * 0.5, h);
    }
    ctx.filter = "none";
    if (star) {
      ctx.strokeStyle = `hsla(${(p.anim * 280) % 360}, 80%, 70%, 0.7)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - h * 0.45, w * 0.62, h * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.shieldT > 0 || this.invulnT > 0) {
      ctx.strokeStyle = `rgba(94, 200, 196, ${0.45 + Math.sin(p.anim * 10) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - h * 0.45, w * 0.58, h * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBursts() {
    const spr = this.sprites;
    if (!spr) return;
    for (const b of this.bursts) {
      if (!b.active) continue;
      const frames = b.kind === "dust" ? spr.dust : spr.impact;
      const i = clamp(Math.floor(b.t / 0.07), 0, frames.length - 1);
      const img = frames[i]!;
      const s = b.kind === "dust" ? 76 : 112;
      this.ctx.drawImage(img, b.x - s / 2, b.y - s + (b.kind === "dust" ? 8 : 40), s, s);
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters() {
    const ctx = this.ctx;
    ctx.font = "700 16px Outfit, sans-serif";
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      if (!f.active) continue;
      ctx.globalAlpha = clamp(1 - f.t / 0.7, 0, 1);
      ctx.fillStyle = "#1e3318";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  private drawVignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.viewW * 0.4,
      this.viewH * 0.45,
      this.viewH * 0.2,
      this.viewW * 0.5,
      this.viewH * 0.5,
      this.viewW * 0.75,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(40, 28, 12, 0.18)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  private bindQa() {
    window.__controlsTest = {
      getPhase: () => this.phase,
      getY: () => this.player.y,
      getGrounded: () => this.player.grounded,
      getSliding: () => this.player.sliding,
      getSpeed: () => this.speed,
      getScore: () => this.score,
      getCharacter: () => this.charId,
      jump: () => this.input.requestJump(),
      slide: () => this.input.requestSlide(),
      start: () => {
        if (this.phase === "title") this.startFromTitle();
        else if (this.phase === "gameover") this.restart();
      },
    };
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getPhase: () => Phase;
      getY: () => number;
      getGrounded: () => boolean;
      getSliding: () => boolean;
      getSpeed: () => number;
      getScore: () => number;
      getCharacter: () => DogId;
      jump: () => void;
      slide: () => void;
      start: () => void;
    };
  }
}
