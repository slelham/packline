export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer = 0;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.34;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.07;
    this.musicGain.connect(this.master);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.34, this.ctx.currentTime, 0.04);
    }
  }

  tick(dt: number, playing: boolean) {
    if (!playing || this.muted || !this.ctx) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.46;
    this.plink();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.12, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.1, hp = 400) {
    if (!this.ctx || !this.master || this.muted) return;
    const n = this.ctx.sampleRate;
    const len = Math.floor(n * dur);
    const buf = this.ctx.createBuffer(1, len, n);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  private plink() {
    if (!this.ctx || !this.musicGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [196, 247, 294, 330, 392];
    const n = notes[Math.floor(Math.random() * notes.length)]!;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = n;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  jump() {
    this.tone(420, 0.09, "square", 0.07, 720);
    this.tone(840, 0.07, "triangle", 0.04, 1100);
  }

  land() {
    this.noise(0.08, 0.12, 180);
    this.tone(110, 0.1, "sine", 0.08, 60);
  }

  slide() {
    this.noise(0.16, 0.08, 900);
    this.tone(180, 0.12, "sawtooth", 0.03, 90);
  }

  boost() {
    this.tone(220, 0.1, "sawtooth", 0.07, 520);
    this.tone(440, 0.18, "square", 0.05, 880);
    this.noise(0.14, 0.07, 700);
  }

  coin() {
    this.tone(880, 0.08, "sine", 0.08, 1320);
    this.tone(1320, 0.1, "triangle", 0.05, 1760);
  }

  combo(n: number) {
    const base = 520 + Math.min(8, n) * 40;
    this.tone(base, 0.08, "square", 0.06, base * 1.4);
  }

  crash() {
    this.noise(0.28, 0.2, 120);
    this.tone(90, 0.32, "sawtooth", 0.12, 40);
    this.tone(180, 0.18, "square", 0.05, 70);
  }

  power() {
    this.tone(520, 0.12, "square", 0.08, 880);
    this.tone(780, 0.16, "triangle", 0.06, 1240);
  }

  shield() {
    this.tone(240, 0.16, "sine", 0.1, 140);
    this.noise(0.12, 0.08, 600);
  }

  revive() {
    this.tone(330, 0.18, "triangle", 0.1, 660);
    this.tone(495, 0.22, "sine", 0.08, 990);
  }

  mission() {
    this.tone(660, 0.1, "square", 0.07, 880);
    this.tone(880, 0.14, "triangle", 0.06, 1320);
  }
}
