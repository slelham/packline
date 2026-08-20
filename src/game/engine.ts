import { loadSprites, type ActionSheets, type SpriteBank } from "./assets";
import { GameAudio } from "./audio";
import { DOGS, type DogId } from "./characters";
import { Input } from "./input";
import { loadSave, writeSave, type SaveData } from "./save";

export type Phase = "boot" | "title" | "playing" | "dying" | "gameover";

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
};

export type HudListener = (s: HudState) => void;

const BASE_SPEED = 350;
const MAX_SPEED = 900;
const GRAVITY = 2480;
const JUMP_VEL = -860;
const MAX_FALL = 1480;
const COYOTE = 0.09;
const SLIDE_TIME = 0.55;
const HITSTOP = 0.08;
const DIE_TIME = 0.78;
const PLAY_W = 1080;
const PLAY_H = 700;
const TUNNEL_GAP = 76;
const HOOP_H = 318;
const HOOP_W = 128;
const HOOP_HOLE_TOP = 278;
const HOOP_HOLE_H = 232;

type Kind = "hurdle" | "hoop" | "tunnel" | "weave" | "crate" | "hydrant" | "pipe";

type Obstacle = {
  active: boolean;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  holeY: number;
  holeH: number;
  scored: boolean;
  near: number;
  special: boolean;
};

type Coin = { active: boolean; x: number; y: number; r: number };
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
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
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
  private titleT = 0;

  constructor(canvas: HTMLCanvasElement, onHud: HudListener) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.parent = canvas.parentElement ?? canvas;
    this.onHud = onHud;
    this.save = loadSave();
    this.charId = this.save.character;
    this.audio.setMuted(this.save.muted);
    this.input = new Input(this.canvas);
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.pool();
    this.buildPark();
    this.fit();
    this.player.y = this.ground;
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
    this.startGrace = 0.2;
    this.hudKey = "";
    this.emitHud();
  }

  restart() {
    if (this.phase === "playing" || this.phase === "dying") return;
    this.input.clear();
    this.audio.unlock();
    this.resetRun();
    this.phase = "playing";
    this.startGrace = 0.16;
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
    this.obstacles = Array.from({ length: 22 }, () => ({
      active: false,
      kind: "hurdle" as Kind,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      holeY: 0,
      holeH: 0,
      scored: false,
      near: 999,
      special: false,
    }));
    this.coins = Array.from({ length: 24 }, () => ({ active: false, x: 0, y: 0, r: 16 }));
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
    if (Math.abs(dy) < 0.5) return;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      this.sitObstacle(o);
    }
    for (const c of this.coins) if (c.active) c.y += dy;
    for (const n of this.particles) if (n.active) n.y += dy;
    for (const b of this.bursts) if (b.active) b.y += dy;
    for (const f of this.floaters) if (f.active) f.y += dy;
  }

  private sitObstacle(o: Obstacle) {
    const g = this.ground;
    if (o.kind === "tunnel") {
      o.h = 28;
      o.y = g - TUNNEL_GAP - o.h;
    } else if (o.kind === "pipe") {
      o.h = 22;
      o.y = g - 78;
    } else if (o.kind === "hoop") {
      o.h = HOOP_H;
      o.w = HOOP_W;
      o.y = g - o.h;
      o.holeY = g - HOOP_HOLE_TOP;
      o.holeH = HOOP_HOLE_H;
    } else {
      o.y = g - o.h;
    }
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
      if (this.input.consumeJump() || this.input.consumeSlide()) this.restart();
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
    for (const o of this.obstacles) o.active = false;
    for (const c of this.coins) c.active = false;
    for (const p of this.particles) p.active = false;
    for (const b of this.bursts) b.active = false;
    for (const f of this.floaters) f.active = false;
    this.nextSpawn = this.viewW + Math.max(140, this.speed * 0.85);
    this.lastKind = null;
    this.hitstop = 0;
    this.startGrace = 0;
    this.dieT = 0;
    this.trauma = 0;
    this.flash = 0;
    this.dustTimer = 0;
    this.hudDirty = true;
  }

  private progress() {
    return clamp(this.distance / 2400, 0, 1);
  }

  private stepPlay(dt: number) {
    const p = this.progress();
    this.speed = lerp(BASE_SPEED, MAX_SPEED, 1 - (1 - p) * (1 - p)) * this.dog().speed;
    this.distance += this.speed * dt * 0.12;
    this.score += this.speed * dt * 0.1 * (1 + this.combo * 0.06);

    this.scrollWorld(dt);
    this.spawnAhead();
    this.stepPlayer(dt);
    this.stepObstacles(dt);
    this.stepCoins();
    this.stepFx(dt);
    this.decayJuice(dt);

    if (this.player.grounded && !this.player.sliding) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.2;
        this.emitParticle(this.player.x - 10, this.ground - 4, -40, -20, 0.22, 3, "#d2b07a");
      }
    }
  }

  private scrollWorld(dt: number) {
    const dx = this.speed * dt;
    this.scroll += dx;
    this.farScroll += dx * 0.14;
    this.midScroll += dx * 0.42;
    for (const o of this.obstacles) if (o.active) o.x -= dx;
    for (const c of this.coins) if (c.active) c.x -= dx;
    for (const b of this.bursts) if (b.active) b.x -= dx;
    this.nextSpawn -= dx;
  }

  private spawnAhead() {
    const p = this.progress();
    const timeGap = lerp(1.32, 0.78, p);
    let right = -Infinity;
    for (const o of this.obstacles) if (o.active) right = Math.max(right, o.x + o.w);
    const lead = this.speed * 2.15 + 120;
    const minGap = this.speed * timeGap + lerp(90, 40, p);
    const spawnX = Number.isFinite(right)
      ? right + minGap
      : Math.max(this.nextSpawn, this.viewW + 120);
    if (spawnX > this.viewW + lead) return;

    const kind = this.pickKind(p);
    const extra = kind === "tunnel" ? this.speed * 0.1 : 0;
    const first = this.placeObstacle(kind, spawnX + extra);
    this.lastKind = kind;
    let span = (first?.w ?? 80) + extra;
    if (p > 0.48 && first && Math.random() < 0.34) {
      const follow: Kind = p > 0.72 && kind === "hurdle" ? "hurdle" : p > 0.6 && kind === "crate" ? "hydrant" : kind === "hoop" ? "hurdle" : "hoop";
      const gap = lerp(70, 48, p);
      const second = this.placeObstacle(follow, spawnX + extra + first.w + gap);
      if (second) span = second.x + second.w - spawnX;
      this.lastKind = follow;
    }
    this.nextSpawn = spawnX + extra + Math.max(minGap, span + 40);
  }

  private pickKind(p: number): Kind {
    const r = Math.random();
    if (this.lastKind === "tunnel" || this.lastKind === "pipe") {
      if (r < 0.45) return "hoop";
      if (r < 0.7) return "hurdle";
      return p > 0.5 ? "crate" : "weave";
    }
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
    let w = 72;
    let h = Math.round(lerp(44, 62, p));
    if (kind === "hoop") {
      w = HOOP_W;
      h = HOOP_H;
    } else if (kind === "tunnel") {
      w = clamp(this.viewW * lerp(0.42, 0.7, p), 160, 360);
      h = 28;
    } else if (kind === "weave") {
      w = 52;
      h = 70;
    } else if (kind === "crate") {
      w = 70;
      h = 58;
    } else if (kind === "hydrant") {
      w = 38;
      h = 64;
    } else if (kind === "pipe") {
      w = clamp(this.viewW * 0.28, 110, 180);
      h = 24;
    }
    o.active = true;
    o.kind = kind;
    o.x = x;
    o.w = w;
    o.h = h;
    o.scored = false;
    o.near = 999;
    o.special = false;
    o.holeY = 0;
    o.holeH = 0;
    this.sitObstacle(o);

    if (kind === "hoop") {
      this.placeCoin(x + w * 0.5, o.holeY + o.holeH * 0.45);
    } else if (kind !== "tunnel" && kind !== "pipe" && Math.random() < 0.55) {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        this.placeCoin(x + w * t, o.y - 54 - Math.sin(t * Math.PI) * 28);
      }
    }
    return o;
  }

  private placeCoin(x: number, y: number) {
    const c = this.coins.find((n) => !n.active);
    if (!c) return;
    c.active = true;
    c.x = x;
    c.y = y;
    c.r = 15;
  }

  private hitbox() {
    const p = this.player;
    const d = this.dog();
    if (p.sliding) {
      const h = 38 * d.hitH;
      const w = 78 * d.hitW;
      return { x: p.x - w * 0.4, y: this.ground - h, w, h };
    }
    const air = !p.grounded;
    const h = (air ? 58 : 80) * d.hitH;
    const w = 44 * d.hitW;
    return { x: p.x - w * 0.45, y: p.y - h, w, h };
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
    p.y += p.vy * dt;

    if (p.y >= this.ground) {
      if (!p.grounded) this.land();
      p.y = this.ground;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    const tapSlide = this.input.consumeSlide();
    if (p.grounded && (tapSlide || (this.input.slideHeld && !p.sliding))) {
      if (!p.sliding) this.audio.slide();
      p.sliding = true;
      p.slideT = SLIDE_TIME * this.dog().slide;
      this.emitParticle(p.x, this.ground - 6, -80, -10, 0.3, 5, "#c4a66a");
    }

    if ((p.grounded || p.coyote > 0) && this.input.consumeJump()) {
      p.vy = JUMP_VEL * this.dog().jump;
      p.grounded = false;
      p.coyote = 0;
      p.sliding = false;
      p.jumpStretch = 0.16;
      p.squash = 0.78;
      this.audio.jump();
    }

    if (!p.grounded && !this.input.jumpHeld && p.vy < -240) {
      p.vy *= 0.52;
    }

    const targetSquash = p.grounded ? (p.landKick > 0 ? 0.82 : 1) : p.vy < 0 ? 1.16 : 1.04;
    const targetStretch = p.grounded ? (p.landKick > 0 ? 1.18 : 1) : p.vy < 0 ? 0.88 : 0.94;
    const k = 1 - Math.exp(-18 * dt);
    p.squash += (targetSquash - p.squash) * k;
    p.stretch += (targetStretch - p.stretch) * k;
  }

  private land() {
    const p = this.player;
    p.landKick = 0.12;
    p.squash = 0.76;
    p.stretch = 1.22;
    this.audio.land();
    this.spawnBurst(p.x, this.ground, "dust");
    for (let i = 0; i < 4; i++) {
      this.emitParticle(p.x, this.ground - 2, -60 + Math.random() * 80, -80 + Math.random() * 30, 0.3, 4, "#d8c08a");
    }
  }

  private collides(box: { x: number; y: number; w: number; h: number }, o: Obstacle) {
    if (o.kind === "hoop" && o.holeH > 0) {
      const topH = o.holeY - o.y;
      const botY = o.holeY + o.holeH;
      const botH = o.y + o.h - botY;
      const hitTop = topH > 2 && aabb(box.x, box.y, box.w, box.h, o.x, o.y, o.w, topH);
      const hitBot = botH > 2 && aabb(box.x, box.y, box.w, box.h, o.x, botY, o.w, botH);
      return hitTop || hitBot;
    }
    return aabb(box.x, box.y, box.w, box.h, o.x, o.y, o.w, o.h);
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
        this.die(o);
        return;
      }

      const overlapX = box.x < o.x + o.w && box.x + box.w > o.x;
      if (overlapX) {
        if (o.kind === "tunnel") {
          this.inTunnel = true;
          const gap = o.y - (box.y + box.h);
          o.near = Math.min(o.near, Math.abs(gap));
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
        this.combo += 1;
        if (o.near < 20) this.combo += 1;
        let label = o.near < 20 ? `CLOSE x${this.combo}` : `x${this.combo}`;
        if (o.kind === "hoop") {
          this.threads += 1;
          this.combo += 1;
          this.score += 80;
          label = o.special ? `THREADED x${this.combo}` : `HOOP x${this.combo}`;
          this.flash = Math.max(this.flash, 0.12);
        } else if (o.kind === "tunnel") {
          this.tunnels += 1;
          this.combo += 1;
          this.score += 70;
          label = `TUNNEL x${this.combo}`;
        }
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const gain = Math.round(28 * this.combo * (o.near < 20 ? 1.4 : 1));
        this.score += gain;
        this.audio.combo(this.combo);
        this.spawnFloater(box.x + 20, box.y - 10, label);
        this.hudDirty = true;
      }
    }
  }

  private stepCoins() {
    const box = this.hitbox();
    for (const c of this.coins) {
      if (!c.active) continue;
      if (c.x + c.r < -40) {
        c.active = false;
        continue;
      }
      const cx = clamp(c.x, box.x, box.x + box.w);
      const cy = clamp(c.y, box.y, box.y + box.h);
      const dx = c.x - cx;
      const dy = c.y - cy;
      if (dx * dx + dy * dy < c.r * c.r) {
        c.active = false;
        const gain = Math.round(40 * (1 + this.combo * 0.08));
        this.score += gain;
        this.audio.coin();
        this.spawnFloater(c.x, c.y, `+${gain}`);
        this.emitParticle(c.x, c.y, 0, -40, 0.4, 5, "#5ec8c4");
        this.hudDirty = true;
      }
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
    if (this.maxCombo > this.save.bestCombo) this.save.bestCombo = this.maxCombo;
    const rounded = Math.floor(this.score);
    if (rounded > this.save.highScore) {
      this.save.highScore = rounded;
      this.newBest = true;
    }
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
    const snap = `${this.phase}|${Math.floor(this.score)}|${this.combo}|${Math.round(this.speed / 8)}|${this.save.muted}|${this.newBest}|${this.save.highScore}|${this.charId}|${this.threads}|${this.tunnels}`;
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
    this.drawCoins();
    this.drawObstacles(false);
    this.drawTunnels(false);
    this.drawBursts();
    this.drawPlayer();
    this.drawTunnels(true);
    this.drawObstacles(true);
    this.drawParticles();
    this.drawFloaters();
    if (this.speed > 520 && !this.reduced) this.drawSpeedLines();
    this.drawVignette();

    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(236,232,220,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  private drawSky() {
    const ctx = this.ctx;
    if (!this.skyGrad || this.skyH !== this.viewH) {
      const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
      g.addColorStop(0, "#6ea0d4");
      g.addColorStop(0.38, "#f2c27a");
      g.addColorStop(0.68, "#f6d5a0");
      g.addColorStop(0.86, "#b7d48a");
      g.addColorStop(1, "#6fa35c");
      this.skyGrad = g;
      this.skyH = this.viewH;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const sx = this.viewW * 0.8;
    const sy = this.viewH * 0.16;
    ctx.fillStyle = "rgba(255, 210, 110, 0.28)";
    ctx.beginPath();
    ctx.arc(sx, sy, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(sx, sy, 28, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = "#6b9a58";
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
    ctx.fillStyle = "#5b8a4c";
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
    ctx.fillStyle = "#d8bc86";
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
    ctx.fillStyle = "#4d8a4a";
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
          dw = o.w + 36;
          dh = o.h + 28;
          dx = o.x - 18;
          dy = g - dh + 6;
        } else if (o.kind === "crate") {
          img = spr.crate;
          dw = o.w + 16;
          dh = o.h + 18;
          dx = o.x - 8;
          dy = g - dh + 6;
        } else if (o.kind === "hydrant") {
          img = spr.hydrant;
          dw = o.w + 22;
          dh = o.h + 16;
          dx = o.x - 11;
          dy = g - dh + 4;
        } else if (o.kind === "pipe") {
          img = spr.pipe;
          dw = o.w + 24;
          dh = 32;
          dx = o.x - 12;
          dy = o.y - 6;
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
        const frame = spr.coin[Math.floor(t * 8) % spr.coin.length]!;
        this.ctx.drawImage(frame, c.x - 16, c.y + bob - 16, 32, 32);
      } else {
        this.ctx.fillStyle = "#c6e04a";
        this.ctx.beginPath();
        this.ctx.arc(c.x, c.y + bob, c.r, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
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
    if (frame) {
      ctx.drawImage(frame, p.x - w * 0.5, p.y - h + 6, w, h);
    } else {
      ctx.fillStyle = "#ece8dc";
      ctx.fillRect(p.x - w * 0.25, p.y - h, w * 0.5, h);
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
